// AI Tinkery Library — service worker.
// Strategy: network-first for shell + activities.json so updates are never stale.
// Fall back to cache only when offline.

const CACHE_NAME = 'ai-tinkery-library-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/activities.json',
  '/manifest.json',
  '/images/robot-logo.jpg',
  '/images/stanford-logo.jpg',
  '/images/apple-touch-icon.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Never cache API calls.
  if (request.url.includes('/api/')) return;

  // Network-first for HTML + activities.json so content is fresh.
  const url = new URL(request.url);
  const isShell = request.mode === 'navigate' ||
                  url.pathname === '/' ||
                  url.pathname.endsWith('.html') ||
                  url.pathname === '/activities.json';

  if (isShell) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (images, icons).
  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone));
      return res;
    }))
  );
});
