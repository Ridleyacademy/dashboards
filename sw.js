// Service worker — Ridley Academy Dashboards
// Bumped on every meaningful deploy. The version string is the cache namespace —
// bumping invalidates all old caches automatically.
const CACHE_NAME = 'ridley-v551-orgboard-light-black';

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
  '/students.js',
  '/masterclass.html',
  '/masterclass.js',
  '/ms-alerts.html',
  '/coach.js',
  '/email-automations.js',
  '/access.html',
  '/access.js',
  '/weekly-stats.html',
  '/weekly-stats.js',
  '/weekly-stats-entry.html',
  '/weekly-stats-entry.js',
  '/org-board.html',
  '/targets.html',
  '/targets-widget.js',
  '/org-board.js',
  '/policies.html',
  '/policies.js',
  '/collections.html',
  '/refunds.html',
  '/support.html',
  '/daily-reports.html',
  '/messages.html',
  '/subscriptions.html',
  '/ux.js',
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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

// Final fallback so respondWith ALWAYS gets a Response — Safari crashes the
// page with "FetchEvent.respondWith received an error: Returned response is
// null" if the handler ever resolves to undefined (e.g. Private Browsing where
// the cache APIs return nothing, or a fetch error with no cached fallback).
const OFFLINE_RESPONSE = () => new Response(
  '<!doctype html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;color:#666;"><h1>Offline</h1><p>Could not load this page. Check your connection and try again.</p></body></html>',
  { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/html' } }
);

async function safeMatch(req) {
  try { return await caches.match(req); } catch { return null; }
}

// Network-first with a "slow network" fallback. Behaviour:
//   1. Kick off the real network fetch in parallel.
//   2. After timeoutMs, try cache. If cached → use it (snappy).
//   3. If no cache → KEEP waiting for the network (don't bail to Offline).
//   4. Only return OFFLINE_RESPONSE when the network has actually FAILED.
// This avoids the "Offline" screen on first-load after a service-worker
// upgrade, when the fresh cache is still empty and the network is slow but
// alive.
function networkFirst(req, cacheName, timeoutMs = 4000) {
  const networkPromise = fetch(req).then((res) => {
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => null);

  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (done) return; done = true; resolve(res); };

    // Whenever network completes, prefer it (it's the most authoritative).
    networkPromise.then((res) => { if (res) finish(res); });

    // After the timeout, opportunistically use cache — but only if we still
    // have nothing fresh. If cache is also empty, KEEP waiting for the network
    // rather than showing Offline.
    setTimeout(async () => {
      if (done) return;
      const cached = await safeMatch(req);
      if (cached) { finish(cached); return; }
      // No cache, no network yet. Wait for the network to settle.
      const res = await networkPromise;
      if (res) { finish(res); return; }
      // Network truly failed and we have no cache. Try /home.html as a last
      // shell before giving up.
      const home = await safeMatch('/home.html');
      finish(home || OFFLINE_RESPONSE());
    }, timeoutMs);
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache live Supabase / edge function calls.
  if (isApiRequest(url)) return;

  // Never intercept the student class-link page (/j/) — it must always be fresh and resolve
  // without the SW in the path (a stale SW was hanging the redirect in some browsers).
  if (url.origin === location.origin && url.pathname.startsWith('/j/')) return;

  // HTML — network first with short timeout, fall back to cache offline.
  if (isHTML(request)) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Static same-origin assets — stale-while-revalidate for instant load.
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await safeMatch(request);
      try {
        const res = await fetch(request);
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
        }
        // Prefer fresh; fall back to cached; never return undefined.
        return res || cached || OFFLINE_RESPONSE();
      } catch (_) {
        return cached || OFFLINE_RESPONSE();
      }
    })());
  }
});
