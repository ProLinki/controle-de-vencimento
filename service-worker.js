const CACHE = 'mercadinho-v41';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(cached => cached || new Response('', { status: 504, statusText: 'Offline' })))
  );
});

// Push server-side: exibe notificação recebida
self.addEventListener('push', (e) => {
  let data = { title: 'Mercadinho Belo', body: 'Você tem itens vencidos.' };
  try { if (e.data) data = e.data.json(); } catch (err) { try { data.body = e.data.text(); } catch (e2) {} }
  e.waitUntil((async () => {
    try {
      await self.registration.showNotification(data.title || 'Mercadinho Belo', {
        body: data.body || '',
        icon: 'https://cdn-icons-png.flaticon.com/512/869/869064.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/869/869064.png',
        tag: 'mercadinho-push',
        renotify: true,
        data: { url: './index.html' }
      });
    } catch (err) {
      console.error('showNotification falhou:', err);
    }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow('./index.html');
    })
  );
});
