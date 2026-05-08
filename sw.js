// Service worker — Ridley Academy Dashboards
// Bumped on every meaningful deploy. The version string is the cache namespace —
// bumping invalidates all old caches automatically.
const CACHE_NAME = 'ridley-v28-refunded-badge';

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

// ── Web Push ────────────────────────────────────────────────────────────
// Push payload is a JSON envelope:
//   { title, body, link_url?, kind?, alert_id?, student_id? }
// We display a system notification and, on click, open / focus the link.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { title: 'Notification', body: event.data ? event.data.text() : '' }; }
    catch (__) { data = { title: 'Notification', body: '' }; }
  }
  const title = data.title || 'Notification';
  const opts = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.alert_id ? ('alert-' + data.alert_id + '-' + (data.kind || '')) : undefined,
    renotify: !!data.alert_id,
    data: { link_url: data.link_url || '/', kind: data.kind || null, alert_id: data.alert_id || null, student_id: data.student_id || null },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link_url) || '/';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // If a window is already on the target, focus it.
    for (const c of all) {
      try {
        const u = new URL(c.url);
        if (u.origin === self.location.origin && (u.pathname === new URL(target).pathname)) {
          await c.focus();
          // Pass the link so the page can route to the alert without a reload.
          c.postMessage({ type: 'open-link', link });
          return;
        }
      } catch (_) {}
    }
    // Otherwise: focus any window and navigate, or open a new one.
    if (all.length && all[0].navigate) {
      try { await all[0].focus(); await all[0].navigate(target); return; } catch (_) {}
    }
    await self.clients.openWindow(target);
  })());
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
