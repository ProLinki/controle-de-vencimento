const CACHE = 'mercadinho-static-v117';
const STATIC_ASSETS = ['./', './index.html', './style.css', './script.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Nunca armazenar respostas autenticadas, Supabase, APIs ou dados de funcionarios/estoque.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!STATIC_ASSETS.some(asset => url.pathname === new URL(asset, self.location.origin).pathname)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || new Response('', { status: 504, statusText: 'Offline' }))));
});
self.addEventListener('push', event => {
  let data = { title: 'Mercadinho Belo', body: 'Existem lotes que precisam de atencao.' };
  try { if (event.data) data = event.data.json(); } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Mercadinho Belo', {
    body: data.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'mercadinho-validade', renotify: true,
    data: { url: data.url || './index.html' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) if ('focus' in client) return client.focus();
    return self.clients.openWindow(event.notification.data?.url || './index.html');
  }));
});
