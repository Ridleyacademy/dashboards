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

  // iOS has no programmatic install API — the closest we can do is open the
  // native Share sheet, which contains "Add to Home Screen". User taps once.
  window.showInstallPrompt = async function () {
    if (isStandalone) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = 'none');
      });
      return;
    }
    if (isIOSSafari && navigator.share) {
      try {
        await navigator.share({ title: 'Ridleyacademy', url: window.location.origin + '/home.html' });
      } catch (_) { /* user cancelled — fine */ }
    }
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
