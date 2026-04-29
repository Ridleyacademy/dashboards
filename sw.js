// Service worker — Ridley Academy Dashboards
// Bumped on every meaningful deploy. The version string is the cache namespace —
// bumping invalidates all old caches automatically.
const CACHE_NAME = 'ridley-v8-no-version-cache';

// Files to pre-cache on install (offline shell).
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
  '/mobile.css',
  '/forgot-password.js',
  '/access-guard.js',
  '/loading-states.js',
  '/pwa.js',
];

self.addEventListener('install', (event) => {
  // Activate as soon as install completes, replacing any old SW.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Drop every cache that isn't the current version.
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      // Take control of all open clients NOW so the next request uses this SW.
      self.clients.claim(),
    ])
  );
});

// Allow the page to ping the SW to skip waiting (used by the manual update flow).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
  // Never cache: Supabase, edge functions, and the version-check file.
  // The version file MUST always be fresh — it's how we detect new deploys.
  return url.hostname.includes('supabase.co')
    || url.pathname.includes('/functions/v1/')
    || url.pathname.endsWith('/version.txt')
    || url.pathname === '/version.txt';
}
function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

// Network-first with a 3-second timeout, then fall back to cache.
function networkFirst(req, cacheName, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let resolved = false;
    const fail = () => {
      if (resolved) return;
      resolved = true;
      caches.match(req).then((cached) =>
        resolve(cached || caches.match('/home.html'))
      );
    };
    const timer = setTimeout(fail, timeoutMs);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (resolved) return;
        resolved = true;
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(req, copy));
        }
        resolve(res);
      })
      .catch(() => fail());
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache live Supabase / edge function calls.
  if (isApiRequest(url)) return;

  // HTML — network first with short timeout, fall back to cache offline.
  if (isHTML(request)) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Static same-origin assets — stale-while-revalidate for instant load.
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
