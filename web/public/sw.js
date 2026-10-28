// Сервис-воркер: показывает пуш-уведомления и открывает сайт по нажатию
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Шаурма', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Шаурма', {
    body: data.body,
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: Boolean(data.staff),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = all.find((c) => new URL(c.url).pathname === url);
    if (same) return same.focus();
    return self.clients.openWindow(url);
  })());
});
