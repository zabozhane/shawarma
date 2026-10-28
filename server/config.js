// Настройки из переменных окружения. Всё, что владелец меняет сам, лежит в таблице settings.
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@localhost:5432/shawarma',
  publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  timezone: env.TZ_SHOP || 'Europe/Moscow',
  sessionSecret: env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: env.COOKIE_SECURE === 'true',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Шаурма <no-reply@localhost>',
  },
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:admin@localhost',
  },
  // Первый владелец создаётся при старте, если в базе нет ни одного сотрудника
  ownerLogin: env.ADMIN_LOGIN || 'owner',
  ownerPassword: env.ADMIN_PASSWORD || 'shawarma',
};

export const LANGS = ['ru', 'en', 'zh', 'ko', 'az', 'uz', 'tg', 'tr', 'kk'];

export const DEFAULT_SETTINGS = {
  maxPerOrder: 2,
  slotMinutes: 10,
  capacityPerSlot: 2,
  onlinePerSlotPeak: 1,
  onlinePerSlotOffPeak: 2,
  peakHours: [[12, 15], [18, 21]],
  minPrepMinutes: 10,
  delayMinutes: 0,
  accepting: true,
  openFrom: '10:00',
  openTo: '23:00',
  noShowAfterMinutes: 30,
  reminderAfterMinutes: 15,
  manualConfirm: 'flagged',
  banStrikes: 3,
  strikeWindowDays: 60,
  banDays: 30,
};
