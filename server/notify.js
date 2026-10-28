// Письма, пуш-уведомления и живые обновления (SSE) для клиента и админки
import { EventEmitter } from 'node:events';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { config } from './config.js';
import { query } from './db.js';
import { message } from './messages.js';
import { localParts } from './slots.js';

export const bus = new EventEmitter();
bus.setMaxListeners(1000);

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export async function sendMail(to, subject, text) {
  if (!transport) {
    console.log(`[почта не настроена] → ${to}: ${subject}\n${text}`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
  } catch (err) {
    console.error('mail failed:', err.message);
  }
}

// Ключи для пуша берём из окружения, а если их нет, создаём один раз и храним в базе
export async function initPush() {
  let { publicKey, privateKey } = config.vapid;
  if (!publicKey || !privateKey) {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'vapid'");
    if (rows[0]) ({ publicKey, privateKey } = rows[0].value);
    else {
      ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
      await query("INSERT INTO settings (key, value) VALUES ('vapid', $1)", [{ publicKey, privateKey }]);
    }
  }
  webpush.setVapidDetails(config.vapid.subject, publicKey, privateKey);
  config.vapid.publicKey = publicKey;
}

async function pushTo(where, params, payload) {
  const { rows } = await query(`SELECT id, endpoint, keys FROM push_subscriptions WHERE ${where}`, params);
  let delivered = 0;
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
      delivered++;
    } catch (err) {
      // Подписка устарела: браузер её отозвал
      if (err.statusCode === 404 || err.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
    }
  }));
  return delivered;
}

export const formatTime = (date) => {
  const { hour, minute } = localParts(new Date(date).getTime(), config.timezone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// Сообщение клиенту о его заказе: пуш, а если пуш не дошёл, письмо
export async function notifyCustomer(order, type) {
  bus.emit('order', { id: order.id, customerId: order.customer_id });
  if (!type || !order.customer_id) return;
  const msg = message(order.lang, type, { n: order.number, time: formatTime(order.ready_at) });
  const delivered = await pushTo('customer_id = $1', [order.customer_id], { ...msg, url: `/order/${order.id}`, tag: `order-${order.id}` });
  if (delivered) return;
  const { rows } = await query('SELECT email, email_notifications FROM customers WHERE id = $1', [order.customer_id]);
  if (rows[0]?.email_notifications) await sendMail(rows[0].email, msg.title, `${msg.body}\n\n${config.publicUrl}/order/${order.id}`);
}

// Сообщение сотрудникам ларька
export async function notifyStaff(title, body, orderId) {
  bus.emit('staff', { title, body, orderId });
  await pushTo('admin_id IS NOT NULL', [], { title, body, url: '/admin', tag: orderId ? `staff-${orderId}` : undefined, staff: true });
}
