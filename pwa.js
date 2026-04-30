// PWA bootstrap.
// - Registers the service worker
// - Exposes window.showInstallPrompt() — call this from a button on home.html
// - Auto-shows install button (#pwaInstallBtn) only when actually installable
(function () {
  let swRegistration = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');
      } catch (e) {
        console.warn('[PWA] SW register failed:', e);
      }
    });

    // When the new SW takes over (after skipWaiting + claim), reload once to
    // pick up fresh code & assets.
    let _reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_reloading) return;
      _reloading = true;
      window.location.reload();
    });
  }

  // Nuclear version check: bypasses SW entirely by going to the network
  // directly with cache:no-store. If the server's version.txt differs from
  // what we last loaded, wipe ALL caches + unregister SWs + hard reload.
  async function nuclearVersionCheck() {
    try {
      // Bypass SW with a Request that has cache: 'reload' AND a query string.
      // This forces a network round-trip on the most stubborn iOS Safari builds.
      const url = '/version.txt?_cb=' + Date.now() + Math.random().toString(36).slice(2);
      const res = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'cache-control': 'no-cache, no-store, must-revalidate', pragma: 'no-cache' },
      });
      if (!res.ok) return;
      const remote = (await res.text()).trim();
      const local  = localStorage.getItem('app-version') || '';
      console.log('[PWA] version local=', local, ' remote=', remote);
      if (!local) {
        localStorage.setItem('app-version', remote);
        return;
      }
      if (remote && remote !== local) {
        console.log('[PWA] version mismatch — purging caches & reloading');
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (_) {}
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch (_) {}
        localStorage.setItem('app-version', remote);
        // Hard reload bypassing browser cache
        window.location.replace(window.location.pathname + '?_v=' + Date.now());
      }
    } catch (e) {
      console.warn('[PWA] version check failed:', e);
    }
  }

  // Force a SW update check whenever the app becomes visible (e.g. user reopens
  // it from the iOS home screen). Combined with controllerchange above, this
  // makes a re-launch behave like a hard refresh.
  async function checkForUpdates() {
    nuclearVersionCheck(); // independent, runs in parallel
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = swRegistration || await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch (_) {}
  }
  window.addEventListener('pageshow', (e) => {
    // bfcache restore — be safe and check
    if (e.persisted) checkForUpdates();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  // Also do an initial check ~3s after load, in case there's a freshly deployed SW
  setTimeout(checkForUpdates, 3000);

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  // iOS Safari only — exclude Chrome/Firefox/Edge/etc on iOS (they can't install PWAs anyway)
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA)/.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  let deferredPrompt = null;

  // Capture Android/Desktop install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = '');
  });

  // Only show install button on iOS Safari (mobile). Other browsers either
  // don't support installation (iOS Chrome/FF) or have native install UI we
  // don't need to duplicate.
  function maybeShowInstallButton() {
    const show = !isStandalone && isIOSSafari;
    document.querySelectorAll('[data-pwa-install]').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  }

  // Minimal hint pointing at Safari's Share button. iOS does not expose any
  // API to trigger "Add to Home Screen" programmatically, and navigator.share
  // only shows third-party share targets (not the AHS option). So this is as
  // small as it gets: one-line tooltip pointing down at Safari's share button.
  function showIOSHint() {
    if (document.getElementById('pwaIOSHint')) return;
    const m = document.createElement('div');
    m.id = 'pwaIOSHint';
    m.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);background:#13141f;border:1px solid #1f2438;border-radius:14px;padding:12px 16px;color:#eaecf8;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:0.86rem;font-weight:600;line-height:1.35;z-index:10001;box-shadow:0 16px 40px rgba(0,0,0,0.55);max-width:88vw;text-align:center;';
    m.innerHTML = 'Tap <svg style="vertical-align:-3px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b9eff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share, then <strong>Add to Home Screen</strong> ↓';
    document.body.appendChild(m);
    setTimeout(() => { m.style.transition = 'opacity .4s'; m.style.opacity = '0'; setTimeout(() => m.remove(), 400); }, 5000);
    m.addEventListener('click', () => m.remove());
  }

  window.showInstallPrompt = function () {
    if (isStandalone) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = 'none');
      });
      return;
    }
    if (isIOSSafari) showIOSHint();
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pwa-install]')) {
      e.preventDefault();
      window.showInstallPrompt();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeShowInstallButton);
  } else {
    maybeShowInstallButton();
  }
})();
