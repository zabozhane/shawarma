import express from 'express';
import { config, LANGS } from './config.js';
import { query } from './db.js';
import {
  issueLoginCode, verifyLoginCode, customerMiddleware, logoutCustomer,
  loginAdmin, logoutAdmin, adminMiddleware, ownerOnly, hashPassword,
} from './auth.js';
import { bus, sendMail, notifyStaff } from './notify.js';
import { message } from './messages.js';
import {
  ACTIVE, availability, createOrder, loadOrder, publicOrder, staffAction, cancelByCustomer,
} from './orders.js';
import { getSettings, updateSettings, SELLER_KEYS } from './settings.js';
import bcrypt from 'bcryptjs';

export const api = express.Router();

const lang = (v) => (LANGS.includes(v) ? v : 'ru');
const id = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const fail = (res, error, status = 400) => res.status(status).json({ error });

// Живые обновления (Server-Sent Events): клиенту о его заказах, ларьку обо всех
function stream(req, res, filter) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  const send = (type) => (payload) => {
    if (filter(type, payload)) res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const onOrder = send('order');
  const onStaff = send('staff');
  bus.on('order', onOrder);
  bus.on('staff', onStaff);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('order', onOrder);
    bus.off('staff', onStaff);
  });
}

// ---------- Клиент ----------

api.use(customerMiddleware);

api.get('/menu', async (_req, res) => {
  const { rows: categories } = await query('SELECT id, names, counts_in_limit AS "countsInLimit" FROM categories ORDER BY sort, id');
  const { rows: items } = await query(
    `SELECT id, category_id AS "categoryId", names, descriptions, price, available
       FROM menu_items WHERE NOT archived ORDER BY sort, id`);
  const settings = await getSettings();
  res.json({ categories, items, maxPerOrder: settings.maxPerOrder, openFrom: settings.openFrom, openTo: settings.openTo, timezone: config.timezone });
});

api.get('/availability', async (req, res) => {
  res.json(await availability(Number(req.query.units) || 1));
});

async function activeOrderOf(customerId) {
  const { rows } = await query(
    'SELECT id FROM orders WHERE customer_id = $1 AND status = ANY($2) ORDER BY created_at DESC LIMIT 1', [customerId, ACTIVE]);
  return rows[0] ? publicOrder(await loadOrder(rows[0].id), await getSettings()) : null;
}

const publicCustomer = (c) => c && ({
  name: c.name, email: c.email, lang: c.lang, emailNotifications: c.email_notifications, bannedUntil: c.banned_until,
});

api.get('/me', async (req, res) => {
  res.json({
    customer: publicCustomer(req.customer),
    activeOrder: req.customer ? await activeOrderOf(req.customer.id) : null,
    vapidPublicKey: config.vapid.publicKey,
  });
});

api.post('/auth/request', async (req, res) => {
  const r = await issueLoginCode(req.body?.email);
  if (r.error) return fail(res, r.error, r.error === 'too_soon' || r.error === 'too_many' ? 429 : 400);
  const msg = message(lang(req.body?.lang), 'code', { code: r.code });
  await sendMail(r.email, msg.title, msg.body);
  res.json({ ok: true });
});

api.post('/auth/verify', async (req, res) => {
  const r = await verifyLoginCode(res, { ...req.body, lang: lang(req.body?.lang) });
  if (r.error) return fail(res, r.error);
  res.json({ customer: publicCustomer(r.customer) });
});

api.post('/auth/logout', async (req, res) => {
  await logoutCustomer(req, res);
  res.json({ ok: true });
});

function needCustomer(req, res, next) {
  if (!req.customer) return fail(res, 'login_required', 401);
  next();
}

api.patch('/me', needCustomer, async (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : req.customer.name;
  const l = b.lang ? lang(b.lang) : req.customer.lang;
  const mail = typeof b.emailNotifications === 'boolean' ? b.emailNotifications : req.customer.email_notifications;
  const { rows } = await query(
    'UPDATE customers SET name = $2, lang = $3, email_notifications = $4 WHERE id = $1 RETURNING *', [req.customer.id, name, l, mail]);
  res.json({ customer: publicCustomer(rows[0]) });
});

api.delete('/me', needCustomer, async (req, res) => {
  await query('DELETE FROM customers WHERE id = $1', [req.customer.id]);
  await logoutCustomer(req, res);
  res.json({ ok: true });
});

api.get('/orders', needCustomer, async (req, res) => {
  const { rows } = await query('SELECT id FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20', [req.customer.id]);
  const settings = await getSettings();
  res.json({ orders: await Promise.all(rows.map(async (r) => publicOrder(await loadOrder(r.id), settings))) });
});

api.post('/orders', needCustomer, async (req, res) => {
  const r = await createOrder({
    customer: req.customer, deviceId: req.deviceId, lines: req.body?.lines, readyAt: req.body?.readyAt, lang: lang(req.body?.lang),
  });
  if (r.error) return fail(res, r.error, 409);
  res.status(201).json({ order: publicOrder(r.order, await getSettings()) });
});

api.get('/orders/:id', needCustomer, async (req, res) => {
  const o = await loadOrder(id(req.params.id));
  if (!o || o.customer_id !== req.customer.id) return fail(res, 'not_found', 404);
  res.json({ order: publicOrder(o, await getSettings()) });
});

api.post('/orders/:id/cancel', needCustomer, async (req, res) => {
  const r = await cancelByCustomer(id(req.params.id), req.customer);
  if (r.error) return fail(res, r.error, 409);
  res.json({ ok: true });
});

function validSubscription(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';
}

api.post('/push/subscribe', needCustomer, async (req, res) => {
  const s = req.body?.subscription;
  if (!validSubscription(s)) return fail(res, 'bad_subscription');
  await query(
    `INSERT INTO push_subscriptions (endpoint, keys, customer_id) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET keys = $2, customer_id = $3, admin_id = NULL`,
    [s.endpoint, { p256dh: s.keys.p256dh, auth: s.keys.auth }, req.customer.id]);
  res.json({ ok: true });
});

api.post('/push/unsubscribe', async (req, res) => {
  if (typeof req.body?.endpoint === 'string') await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [req.body.endpoint]);
  res.json({ ok: true });
});

api.get('/stream', needCustomer, (req, res) => {
  const me = req.customer.id;
  stream(req, res, (type, p) => type === 'order' && p.customerId === me);
});

// ---------- Админка ----------

const admin = express.Router();
api.use('/admin', admin);

admin.post('/login', async (req, res) => {
  const r = await loginAdmin(res, req.body || {});
  if (r.lockedNow) notifyStaff('Подбор пароля в админку', `5 неверных паролей для логина «${req.body?.login}». Вход закрыт на 15 минут.`).catch(() => {});
  if (r.error) return fail(res, r.error, 401);
  res.json({ admin: { login: r.admin.login, name: r.admin.name, role: r.admin.role } });
});

admin.post('/logout', async (req, res) => {
  await logoutAdmin(req, res);
  res.json({ ok: true });
});

admin.use(adminMiddleware);

admin.get('/me', async (req, res) => {
  res.json({ admin: req.admin, vapidPublicKey: config.vapid.publicKey, timezone: config.timezone });
});

admin.put('/me/password', async (req, res) => {
  const { current, next } = req.body || {};
  const { rows } = await query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id]);
  if (!(await bcrypt.compare(String(current || ''), rows[0].password_hash))) return fail(res, 'bad_password');
  if (typeof next !== 'string' || next.length < 8) return fail(res, 'weak_password');
  await query('UPDATE admins SET password_hash = $2 WHERE id = $1', [req.admin.id, await hashPassword(next)]);
  res.json({ ok: true });
});

admin.get('/orders', async (_req, res) => {
  const settings = await getSettings();
  const { rows } = await query(
    `SELECT o.id, (SELECT count(*)::int FROM orders x
                    WHERE x.status = 'no_show' AND (x.customer_id = o.customer_id OR x.device_id = o.device_id)) AS no_shows,
            c.email
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.status = ANY($1) OR o.updated_at > now() - interval '3 hours'
      ORDER BY o.ready_at`, [ACTIVE]);
  const orders = await Promise.all(rows.map(async (r) => {
    const o = await loadOrder(r.id);
    return { ...publicOrder(o, settings), lang: o.lang, email: r.email, noShows: r.no_shows };
  }));
  res.json({ orders });
});

admin.post('/orders/:id/:action', async (req, res) => {
  const r = await staffAction(id(req.params.id), req.params.action, req.admin);
  if (r.error) return fail(res, r.error, r.error === 'owner_only' ? 403 : 409);
  res.json({ ok: true });
});

admin.get('/load', async (_req, res) => {
  const settings = await getSettings();
  res.json({ ...(await availability(1)), delayMinutes: settings.delayMinutes });
});

admin.get('/settings', async (_req, res) => res.json({ settings: await getSettings() }));

admin.put('/settings', async (req, res) => {
  const keys = req.admin.role === 'owner' ? undefined : SELLER_KEYS;
  const r = await updateSettings(req.body, keys);
  if (r.error) return fail(res, r.error);
  bus.emit('staff', { settings: true });
  res.json(r);
});

admin.get('/stats', async (_req, res) => {
  const { rows } = await query(
    `SELECT count(*)::int AS orders,
            count(*) FILTER (WHERE status = 'picked_up')::int AS picked,
            count(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
            count(*) FILTER (WHERE status IN ('cancelled','rejected'))::int AS cancelled,
            coalesce(sum(total) FILTER (WHERE status = 'picked_up'), 0)::int AS revenue
       FROM orders WHERE created_at > now() - make_interval(days => $1)`, [1]);
  const { rows: week } = await query(
    `SELECT count(*)::int AS orders, count(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
            coalesce(sum(total) FILTER (WHERE status = 'picked_up'), 0)::int AS revenue
       FROM orders WHERE created_at > now() - interval '7 days'`);
  res.json({ today: rows[0], week: week[0] });
});

// Меню
admin.get('/menu', async (_req, res) => {
  const { rows: categories } = await query('SELECT id, names, counts_in_limit AS "countsInLimit", sort FROM categories ORDER BY sort, id');
  const { rows: items } = await query(
    'SELECT id, category_id AS "categoryId", names, descriptions, price, available, sort FROM menu_items WHERE NOT archived ORDER BY sort, id');
  res.json({ categories, items, langs: LANGS });
});

function cleanTexts(obj, required) {
  const out = {};
  for (const l of LANGS) {
    const v = typeof obj?.[l] === 'string' ? obj[l].trim().slice(0, 120) : '';
    if (v) out[l] = v;
  }
  if (required && !out.ru) return null;
  return out;
}

async function saveItem(req, res, itemId) {
  const b = req.body || {};
  const names = cleanTexts(b.names, true);
  const descriptions = cleanTexts(b.descriptions, false);
  const price = Number(b.price);
  const categoryId = id(b.categoryId);
  if (!names) return fail(res, 'name_required');
  if (!Number.isInteger(price) || price < 0 || price > 100000) return fail(res, 'bad_price');
  const { rows: cat } = await query('SELECT 1 FROM categories WHERE id = $1', [categoryId]);
  if (!cat[0]) return fail(res, 'bad_category');
  const available = b.available !== false;
  if (itemId) {
    const { rowCount } = await query(
      'UPDATE menu_items SET names = $2, descriptions = $3, price = $4, category_id = $5, available = $6 WHERE id = $1 AND NOT archived',
      [itemId, names, descriptions, price, categoryId, available]);
    if (!rowCount) return fail(res, 'not_found', 404);
  } else {
    await query(
      'INSERT INTO menu_items (names, descriptions, price, category_id, available, sort) VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(sort), 0) + 1 FROM menu_items))',
      [names, descriptions, price, categoryId, available]);
  }
  res.json({ ok: true });
}

admin.post('/menu/items', ownerOnly, (req, res) => saveItem(req, res, 0));
admin.put('/menu/items/:id', ownerOnly, (req, res) => saveItem(req, res, id(req.params.id)));
admin.delete('/menu/items/:id', ownerOnly, async (req, res) => {
  await query('UPDATE menu_items SET archived = true WHERE id = $1', [id(req.params.id)]);
  res.json({ ok: true });
});
// Стоп-лист может вести и продавец
admin.patch('/menu/items/:id/available', async (req, res) => {
  await query('UPDATE menu_items SET available = $2 WHERE id = $1', [id(req.params.id), req.body?.available === true]);
  res.json({ ok: true });
});
admin.put('/menu/categories/:id', ownerOnly, async (req, res) => {
  const names = cleanTexts(req.body?.names, true);
  if (!names) return fail(res, 'name_required');
  await query('UPDATE categories SET names = $2, counts_in_limit = $3 WHERE id = $1',
    [id(req.params.id), names, req.body?.countsInLimit === true]);
  res.json({ ok: true });
});

// Клиенты
admin.get('/customers', ownerOnly, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT c.id, c.email, c.name, c.lang, c.banned_until AS "bannedUntil", c.created_at AS "createdAt",
            count(o.id)::int AS orders,
            count(o.id) FILTER (WHERE o.status = 'picked_up')::int AS picked,
            count(o.id) FILTER (WHERE o.status = 'no_show')::int AS "noShows"
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      WHERE $1 = '' OR c.email LIKE '%' || $1 || '%' OR lower(c.name) LIKE '%' || $1 || '%'
      GROUP BY c.id ORDER BY count(o.id) FILTER (WHERE o.status = 'no_show') DESC, c.created_at DESC LIMIT 200`, [q]);
  res.json({ customers: rows });
});

admin.post('/customers/:id/ban', ownerOnly, async (req, res) => {
  const days = Number(req.body?.days);
  const until = Number.isInteger(days) && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  await query('UPDATE customers SET banned_until = $2 WHERE id = $1', [id(req.params.id), until]);
  res.json({ ok: true });
});

admin.get('/customers/:id/orders', ownerOnly, async (req, res) => {
  const { rows } = await query(
    "SELECT id, number, status, total, ready_at AS \"readyAt\" FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50",
    [id(req.params.id)]);
  res.json({ orders: rows });
});

// Сотрудники
admin.get('/staff', ownerOnly, async (_req, res) => {
  const { rows } = await query('SELECT id, login, name, role, created_at AS "createdAt" FROM admins ORDER BY id');
  res.json({ staff: rows });
});

admin.post('/staff', ownerOnly, async (req, res) => {
  const { login, name, password, role } = req.body || {};
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(String(login || ''))) return fail(res, 'bad_login');
  if (typeof password !== 'string' || password.length < 8) return fail(res, 'weak_password');
  if (!['owner', 'seller'].includes(role)) return fail(res, 'bad_role');
  const { rows } = await query('SELECT 1 FROM admins WHERE lower(login) = lower($1)', [login]);
  if (rows[0]) return fail(res, 'login_taken');
  await query('INSERT INTO admins (login, name, password_hash, role) VALUES ($1, $2, $3, $4)',
    [login, String(name || '').slice(0, 40), await hashPassword(password), role]);
  res.json({ ok: true });
});

admin.put('/staff/:id/password', ownerOnly, async (req, res) => {
  const p = req.body?.password;
  if (typeof p !== 'string' || p.length < 8) return fail(res, 'weak_password');
  await query('UPDATE admins SET password_hash = $2 WHERE id = $1', [id(req.params.id), await hashPassword(p)]);
  await query('DELETE FROM admin_sessions WHERE admin_id = $1', [id(req.params.id)]);
  res.json({ ok: true });
});

admin.delete('/staff/:id', ownerOnly, async (req, res) => {
  const target = id(req.params.id);
  if (target === req.admin.id) return fail(res, 'cannot_delete_self');
  await query('DELETE FROM admins WHERE id = $1', [target]);
  res.json({ ok: true });
});

admin.post('/push/subscribe', async (req, res) => {
  const s = req.body?.subscription;
  if (!validSubscription(s)) return fail(res, 'bad_subscription');
  await query(
    `INSERT INTO push_subscriptions (endpoint, keys, admin_id) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET keys = $2, admin_id = $3, customer_id = NULL`,
    [s.endpoint, { p256dh: s.keys.p256dh, auth: s.keys.auth }, req.admin.id]);
  res.json({ ok: true });
});

admin.get('/stream', (req, res) => stream(req, res, () => true));
