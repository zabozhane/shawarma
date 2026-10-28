// Вход клиента по коду из письма и вход сотрудников по логину и паролю
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { query } from './db.js';
import { isDisposableEmail } from './disposable.js';

const DAY = 86_400_000;
const CUSTOMER_COOKIE = 'sid';
const ADMIN_COOKIE = 'aid';
const DEVICE_COOKIE = 'did';

export const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashCode = (email, code) =>
  crypto.createHmac('sha256', config.sessionSecret).update(`${email}:${code}`).digest('hex');

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAgeMs) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (config.cookieSecure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Каждому телефону выдаём постоянный id, чтобы помнить незабранные заказы с него
export function deviceMiddleware(req, res, next) {
  const cookies = parseCookies(req);
  req.cookies = cookies;
  req.deviceId = cookies[DEVICE_COOKIE];
  if (!req.deviceId || req.deviceId.length > 64) {
    req.deviceId = newToken();
    setCookie(res, DEVICE_COOKIE, req.deviceId, 3650 * DAY);
  }
  next();
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Шаг 1: выдать код. Возвращает код ошибки или { code } для отправки письмом.
export async function issueLoginCode(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 200) return { error: 'bad_email' };
  if (isDisposableEmail(email)) return { error: 'disposable_email' };
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '60 seconds') AS recent,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour
       FROM login_codes WHERE email = $1`, [email]);
  if (rows[0].recent > 0) return { error: 'too_soon' };
  if (rows[0].hour >= 5) return { error: 'too_many' };
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await query("INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [email, hashCode(email, code)]);
  return { email, code };
}

// Шаг 2: проверить код и войти. Новый клиент создаётся здесь же.
export async function verifyLoginCode(res, { email: rawEmail, code, name, lang }) {
  const email = normalizeEmail(rawEmail);
  const { rows } = await query(
    'SELECT id, code_hash, attempts FROM login_codes WHERE email = $1 AND NOT used AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [email]);
  const row = rows[0];
  if (!row) return { error: 'code_expired' };
  if (row.attempts >= 5) return { error: 'code_expired' };
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashCode(email, String(code || '').trim())));
  if (!ok) {
    await query('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return { error: 'bad_code' };
  }
  await query('UPDATE login_codes SET used = true WHERE id = $1', [row.id]);
  const cleanName = String(name || '').trim().slice(0, 40);
  const { rows: c } = await query(
    `INSERT INTO customers (email, name, lang) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = CASE WHEN $2 <> '' THEN $2 ELSE customers.name END
     RETURNING *`, [email, cleanName, lang || 'ru']);
  const token = newToken();
  await query("INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES ($1, $2, now() + interval '90 days')", [token, c[0].id]);
  setCookie(res, CUSTOMER_COOKIE, token, 90 * DAY);
  return { customer: c[0] };
}

export async function customerMiddleware(req, _res, next) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (token) {
    const { rows } = await query(
      'SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id WHERE s.token = $1 AND s.expires_at > now()', [token]);
    req.customer = rows[0] || null;
  }
  next();
}

export async function logoutCustomer(req, res) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (token) await query('DELETE FROM customer_sessions WHERE token = $1', [token]);
  setCookie(res, CUSTOMER_COOKIE, '', 0);
}

// --- Сотрудники ---

// Защита от подбора пароля: 5 ошибок подряд блокируют логин на 15 минут
const failures = new Map();

export async function loginAdmin(res, { login, password }) {
  const key = String(login || '').trim().toLowerCase();
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.at < 15 * 60_000) return { error: 'locked' };
  const { rows } = await query('SELECT * FROM admins WHERE lower(login) = $1', [key]);
  const admin = rows[0];
  const ok = admin && (await bcrypt.compare(String(password || ''), admin.password_hash));
  if (!ok) {
    const count = f && Date.now() - f.at < 15 * 60_000 ? f.count + 1 : 1;
    failures.set(key, { count, at: Date.now() });
    return { error: count >= 5 ? 'locked' : 'bad_login', lockedNow: count === 5 };
  }
  failures.delete(key);
  const token = newToken();
  await query("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, now() + interval '30 days')", [token, admin.id]);
  setCookie(res, ADMIN_COOKIE, token, 30 * DAY);
  return { admin };
}

export async function logoutAdmin(req, res) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (token) await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
  setCookie(res, ADMIN_COOKIE, '', 0);
}

export async function adminMiddleware(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (token) {
    const { rows } = await query(
      'SELECT a.id, a.login, a.name, a.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = $1 AND s.expires_at > now()', [token]);
    req.admin = rows[0] || null;
  }
  if (!req.admin) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function ownerOnly(req, res, next) {
  if (req.admin?.role !== 'owner') return res.status(403).json({ error: 'owner_only' });
  next();
}

export const hashPassword = (password) => bcrypt.hash(password, 10);
