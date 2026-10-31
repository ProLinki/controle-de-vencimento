const CACHE_NAME = 'mercadinho-belo-v1';
const ASSETS = ['./index.html', './style.css', './script.js', './manifest.json', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'https://cdn-icons-png.flaticon.com/512/869/869064.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(cached => { if (cached) return cached; return fetch(e.request).catch(() => { if (e.request.destination === 'document') return caches.match('./index.html'); }) }) }); });