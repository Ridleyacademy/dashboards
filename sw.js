// Service worker — Ridley Academy Dashboards
// Strategy:
//   - HTML pages: network-first (always show fresh UI; fall back to cache offline)
//   - Static assets (CSS, JS, icons): stale-while-revalidate (instant load, refresh in background)
//   - Supabase API + edge function calls: never cached (always live)

const CACHE_NAME = 'ridley-v3';
const PRECACHE = [
  '/',
  '/home.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/skeletons.css',
  '/forgot-password.js',
  '/access-guard.js',
  '/loading-states.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.hostname.includes('supabase.co') || url.pathname.includes('/functions/v1/');
}

function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase / edge function calls
  if (isApiRequest(url)) return;

  // HTML — network first, fall back to cache
  if (isHTML(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/home.html')))
    );
    return;
  }

  // Static assets — stale-while-revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
