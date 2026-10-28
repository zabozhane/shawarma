import { DEFAULT_SETTINGS } from './config.js';
import { query } from './db.js';

let cache = null;

export async function getSettings() {
  if (!cache) {
    const { rows } = await query("SELECT value FROM settings WHERE key = 'shop'");
    cache = { ...DEFAULT_SETTINGS, ...(rows[0]?.value || {}) };
  }
  return cache;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const int = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;

// Что владелец может менять и в каких пределах
const RULES = {
  maxPerOrder: int(1, 20),
  slotMinutes: (v) => [5, 10, 15, 20, 30].includes(v),
  capacityPerSlot: int(1, 50),
  onlinePerSlotPeak: int(0, 50),
  onlinePerSlotOffPeak: int(0, 50),
  peakHours: (v) => Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && int(0, 24)(p[0]) && int(0, 24)(p[1]) && p[0] < p[1]),
  minPrepMinutes: int(0, 120),
  delayMinutes: int(0, 240),
  accepting: (v) => typeof v === 'boolean',
  openFrom: (v) => TIME_RE.test(v),
  openTo: (v) => TIME_RE.test(v),
  noShowAfterMinutes: int(5, 240),
  reminderAfterMinutes: int(1, 120),
  manualConfirm: (v) => ['all', 'flagged', 'none'].includes(v),
  banStrikes: int(1, 20),
  strikeWindowDays: int(1, 365),
  banDays: int(1, 365),
};

// Продавцу можно только ставить паузу и сдвигать время
export const SELLER_KEYS = ['accepting', 'delayMinutes'];

export async function updateSettings(patch, allowedKeys = Object.keys(RULES)) {
  const current = await getSettings();
  const next = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    if (!allowedKeys.includes(key)) return { error: `forbidden:${key}` };
    if (!RULES[key]?.(value)) return { error: `invalid:${key}` };
    next[key] = value;
  }
  await query(
    "INSERT INTO settings (key, value) VALUES ('shop', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [next]);
  cache = next;
  return { settings: next };
}
