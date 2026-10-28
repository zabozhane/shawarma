// Заказы: оформление, смена статусов, отмена, напоминания
import { config } from './config.js';
import { query, tx } from './db.js';
import { notifyCustomer, notifyStaff, formatTime } from './notify.js';
import { orderBlocker, needsManualConfirm, banAfterStrikes, strikeWindowStart, countUnits } from './rules.js';
import { getSettings } from './settings.js';
import { asap, planFor, timeOptions, localParts } from './slots.js';

const MIN = 60_000;
export const ACTIVE = ['new', 'accepted', 'cooking', 'ready'];
const HOLDS_KITCHEN = ['new', 'accepted', 'cooking'];

async function kitchenContext(db, now) {
  const settings = await getSettings();
  const { rows } = await db.query(
    `SELECT s.slot_start, sum(s.units)::int AS units
       FROM order_slots s JOIN orders o ON o.id = s.order_id
      WHERE o.status = ANY($1) AND s.slot_start >= $2
      GROUP BY s.slot_start`,
    [HOLDS_KITCHEN, new Date(now - 60 * MIN)]);
  const used = new Map(rows.map((r) => [new Date(r.slot_start).getTime(), r.units]));
  return { now, used, settings, tz: config.timezone };
}

// Ожидание и варианты времени для заказа из units шаурм
export async function availability(units) {
  const now = Date.now();
  const ctx = await kitchenContext({ query }, now);
  const n = Math.max(1, Math.min(units || 1, ctx.settings.maxPerOrder));
  const { asap: best, options } = timeOptions(n, ctx);
  return {
    accepting: ctx.settings.accepting,
    waitMinutes: best ? Math.round((best.readyAt - now) / MIN) : null,
    asap: best ? new Date(best.readyAt) : null,
    options: options.map((o) => ({ readyAt: new Date(o.readyAt), available: o.available })),
  };
}

export async function loadOrder(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const { rows: items } = await db.query('SELECT item_id AS "itemId", names, qty, price, counted FROM order_items WHERE order_id = $1 ORDER BY id', [id]);
  return { ...rows[0], items };
}

export function publicOrder(o, settings) {
  return {
    id: o.id,
    number: o.number,
    name: o.name,
    status: o.status,
    flagged: o.flagged,
    total: o.total,
    readyAt: o.ready_at,
    startAt: o.start_at,
    createdAt: o.created_at,
    readyMarkedAt: o.ready_marked_at,
    canCancel: ['new', 'accepted'].includes(o.status) && Date.now() < new Date(o.start_at).getTime(),
    canNoShow: o.status === 'ready' && settings
      && Date.now() - new Date(o.ready_marked_at).getTime() >= settings.noShowAfterMinutes * MIN,
    items: o.items,
  };
}

async function noShowCounts(db, settings, customerId, deviceId, now) {
  const since = strikeWindowStart(settings, now);
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE customer_id = $1)::int AS by_customer,
            count(*) FILTER (WHERE device_id = $2)::int AS by_device
       FROM orders WHERE status = 'no_show' AND updated_at >= $3`, [customerId, deviceId, since]);
  return rows[0];
}

export async function createOrder({ customer, deviceId, lines: rawLines, readyAt, lang }) {
  const now = Date.now();
  const result = await tx(async (db) => {
    // Один заказ за раз: номер заказа и места на кухне раздаются без гонок
    await db.query('SELECT pg_advisory_xact_lock(4242)');
    const ctx = await kitchenContext(db, now);
    const { settings } = ctx;

    const wanted = new Map();
    for (const l of rawLines || []) {
      const id = Number(l.itemId), qty = Number(l.qty);
      if (Number.isInteger(id) && Number.isInteger(qty) && qty > 0 && qty <= 20) wanted.set(id, (wanted.get(id) || 0) + qty);
    }
    const { rows: items } = await db.query(
      `SELECT m.id, m.names, m.price, m.available AND NOT m.archived AS available, c.counts_in_limit
         FROM menu_items m JOIN categories c ON c.id = m.category_id WHERE m.id = ANY($1)`, [[...wanted.keys()]]);
    if (items.length !== wanted.size) return { error: 'unavailable' };
    const lines = items.map((it) => ({ ...it, qty: wanted.get(it.id), counted: it.counts_in_limit }));

    const { rows: active } = await db.query(
      'SELECT 1 FROM orders WHERE customer_id = $1 AND status = ANY($2) LIMIT 1', [customer.id, ACTIVE]);
    const blocker = orderBlocker({ settings, lines, customer, hasActiveOrder: active.length > 0, now });
    if (blocker) return { error: blocker };

    const units = countUnits(lines);
    let plan;
    if (units === 0) {
      // Только напитки: кухню не занимают, будут готовы к ближайшему времени
      const t = asap(1, { ...ctx, used: new Map() });
      plan = t && { readyAt: t.readyAt, startAt: t.readyAt - 2 * MIN, slots: [] };
    } else {
      const target = readyAt ? new Date(readyAt).getTime() : null;
      plan = target ? planFor(target, units, ctx) : asap(units, ctx);
    }
    if (!plan) return { error: 'no_slots' };

    const strikes = await noShowCounts(db, settings, customer.id, deviceId, now);
    const flagged = needsManualConfirm({ settings, customerNoShows: strikes.by_customer, deviceNoShows: strikes.by_device });
    const day = localParts(now, config.timezone).date;
    const { rows: num } = await db.query('SELECT coalesce(max(number), 0) + 1 AS n FROM orders WHERE day = $1', [day]);
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const { rows: [order] } = await db.query(
      `INSERT INTO orders (day, number, customer_id, device_id, name, lang, status, flagged, total, units, ready_at, start_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [day, num[0].n, customer.id, deviceId, customer.name, lang || customer.lang, flagged ? 'new' : 'accepted',
        flagged, total, units, new Date(plan.readyAt), new Date(plan.startAt)]);
    for (const l of lines) {
      await db.query('INSERT INTO order_items (order_id, item_id, names, qty, price, counted) VALUES ($1,$2,$3,$4,$5,$6)',
        [order.id, l.id, l.names, l.qty, l.price, l.counted]);
    }
    for (const s of plan.slots) {
      await db.query('INSERT INTO order_slots (order_id, slot_start, units) VALUES ($1,$2,$3)', [order.id, new Date(s.start), s.units]);
    }
    return { order };
  });
  if (result.error) return result;
  const order = await loadOrder(result.order.id);
  const what = order.items.map((i) => `${i.names.ru} × ${i.qty}`).join(', ');
  // Уведомления не задерживают ответ клиенту
  notifyStaff(`Новый заказ №${order.number}`, `${order.name || 'Без имени'} · к ${formatTime(order.ready_at)} · ${what}`, order.id)
    .catch((e) => console.error('notify failed:', e));
  notifyCustomer(order, order.status === 'accepted' ? 'accepted' : null).catch((e) => console.error('notify failed:', e));
  return { order };
}

// Какие переходы статусов доступны сотрудникам
const TRANSITIONS = {
  accept: { from: ['new'], to: 'accepted', notify: 'accepted' },
  reject: { from: ['new', 'accepted'], to: 'rejected', notify: 'rejected', free: true },
  cook: { from: ['accepted'], to: 'cooking' },
  ready: { from: ['accepted', 'cooking'], to: 'ready', notify: 'ready' },
  pickup: { from: ['ready'], to: 'picked_up' },
  no_show: { from: ['ready'], to: 'no_show' },
  delay: { from: ['new', 'accepted', 'cooking'], to: null, notify: 'delayed' },
  clear_no_show: { from: ['no_show'], to: 'cancelled', ownerOnly: true },
};

export async function staffAction(orderId, action, admin) {
  const t = TRANSITIONS[action];
  if (!t) return { error: 'bad_action' };
  if (t.ownerOnly && admin.role !== 'owner') return { error: 'owner_only' };
  const settings = await getSettings();
  const res = await tx(async (db) => {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) return { error: 'not_found' };
    if (!t.from.includes(o.status)) return { error: 'bad_status' };
    if (action === 'no_show' && Date.now() - new Date(o.ready_marked_at).getTime() < settings.noShowAfterMinutes * MIN) {
      return { error: 'too_early' };
    }
    if (action === 'delay') {
      await db.query(
        "UPDATE orders SET ready_at = ready_at + interval '10 minutes', start_at = start_at + interval '10 minutes', updated_at = now() WHERE id = $1", [o.id]);
      return { order: o };
    }
    await db.query(
      `UPDATE orders SET status = $2, updated_at = now(),
              ready_marked_at = CASE WHEN $2 = 'ready' THEN now() ELSE ready_marked_at END
        WHERE id = $1`, [o.id, t.to]);
    if (t.free) await db.query('DELETE FROM order_slots WHERE order_id = $1', [o.id]);
    if (o.customer_id && (action === 'no_show' || action === 'clear_no_show')) {
      const now = Date.now();
      const { rows: s } = await db.query(
        "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status = 'no_show' AND updated_at >= $2",
        [o.customer_id, strikeWindowStart(settings, now)]);
      const banUntil = banAfterStrikes({ settings, strikes: s[0].n, now });
      if (banUntil) await db.query('UPDATE customers SET banned_until = $2 WHERE id = $1', [o.customer_id, banUntil]);
      else if (action === 'clear_no_show') await db.query('UPDATE customers SET banned_until = NULL WHERE id = $1', [o.customer_id]);
    }
    return { order: o };
  });
  if (res.error) return res;
  const order = await loadOrder(orderId);
  await notifyCustomer(order, t.notify || null);
  return { order };
}

export async function cancelByCustomer(orderId, customer) {
  const res = await tx(async (db) => {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2 FOR UPDATE', [orderId, customer.id]);
    const o = rows[0];
    if (!o) return { error: 'not_found' };
    if (!publicOrder(o).canCancel) return { error: 'cannot_cancel' };
    await db.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [o.id]);
    await db.query('DELETE FROM order_slots WHERE order_id = $1', [o.id]);
    return { order: o };
  });
  if (res.error) return res;
  await notifyStaff(`Клиент отменил заказ №${res.order.number}`, 'Готовить не нужно.', res.order.id);
  await notifyCustomer(res.order, null);
  return res;
}

// Раз в минуту: напомнить клиенту о готовом заказе и сказать продавцу, что заказ давно ждёт
export async function runReminders() {
  const s = await getSettings();
  const { rows: remind } = await query(
    `UPDATE orders SET reminder_sent = true WHERE status = 'ready' AND NOT reminder_sent
       AND ready_marked_at < now() - make_interval(mins => $1) RETURNING *`, [s.reminderAfterMinutes]);
  for (const o of remind) await notifyCustomer(o, 'reminder');
  const { rows: stale } = await query(
    `UPDATE orders SET staff_alert_sent = true WHERE status = 'ready' AND NOT staff_alert_sent
       AND ready_marked_at < now() - make_interval(mins => $1) RETURNING *`, [s.noShowAfterMinutes]);
  for (const o of stale) await notifyStaff(`Заказ №${o.number} ждёт ${s.noShowAfterMinutes} мин`, 'Можно отметить «Не забрали».', o.id);
}
