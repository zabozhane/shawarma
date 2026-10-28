import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { migrate } from './db.js';
import { seed } from './seed.js';
import { initPush } from './notify.js';
import { deviceMiddleware } from './auth.js';
import { api } from './api.js';
import { runReminders } from './orders.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// Изменять данные можно только JSON-запросами: обычная форма с чужого сайта сюда не пройдёт
app.use('/api', (req, res, next) => {
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
  if (!['GET', 'HEAD'].includes(req.method) && hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'json_required' });
  }
  next();
});
app.use('/api', express.json({ limit: '100kb' }), deviceMiddleware, api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use('/api', (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// Собранный фронтенд: клиентский сайт и админка
const dist = path.join(import.meta.dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(path.join(dist, 'admin.html')));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

await migrate();
await seed();
await initPush();
setInterval(() => runReminders().catch((e) => console.error('reminders:', e)), 60_000);

app.listen(config.port, () => console.log(`Шаурма работает: http://localhost:${config.port} (админка: /admin)`));
