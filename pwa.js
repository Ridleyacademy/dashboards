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

  // Tag <html> so CSS can hide install UI even on iOS where the
  // display-mode:standalone media query doesn't always match.
  if (isStandalone) {
    document.documentElement.classList.add('pwa-standalone');
  }

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

  // Animated arrow pointing at Safari's Share button (bottom toolbar on
  // iPhone, top on iPad). iOS exposes no API to trigger "Add to Home Screen"
  // programmatically, so visual guidance is the best we can do.
  // iPad shows the URL bar / share at the top; iPhone at the bottom.
  function isIPad() {
    return /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function showIOSHint() {
    if (document.getElementById('pwaIOSHint')) return;
    const top = isIPad();
    const m = document.createElement('div');
    m.id = 'pwaIOSHint';
    // Inject keyframes once
    if (!document.getElementById('pwaHintKf')) {
      const st = document.createElement('style');
      st.id = 'pwaHintKf';
      st.textContent = `
        @keyframes pwaBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(${top ? '-' : ''}10px); } }
        @keyframes pwaFadeIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        #pwaIOSHint { animation: pwaFadeIn .25s ease-out both; transform-origin: bottom right; }
        #pwaIOSHint .pwa-arrow { animation: pwaBounce 1s ease-in-out infinite; }
      `;
      document.head.appendChild(st);
    }
    // iPhone: bouncing arrow anchored bottom-right pointing at the "⋯" / "AA" menu
    //         in Safari's bottom toolbar.
    // iPad:   anchored top-right pointing at the share/menu icon in the top bar.
    if (top) {
      m.style.cssText = `position:fixed;top:14px;right:14px;background:#13141f;border:1px solid #6b9eff;border-radius:16px;padding:14px 16px;color:#eaecf8;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:0.88rem;font-weight:600;line-height:1.35;z-index:10001;box-shadow:0 20px 50px rgba(0,0,0,0.6);max-width:90vw;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;`;
    } else {
      m.style.cssText = `position:fixed;bottom:14px;right:14px;background:#13141f;border:1px solid #6b9eff;border-radius:16px;padding:14px 16px;color:#eaecf8;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:0.88rem;font-weight:600;line-height:1.35;z-index:10001;box-shadow:0 20px 50px rgba(0,0,0,0.6);max-width:90vw;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;`;
    }
    // Arrow direction: down on iPhone (points at "⋯" in bottom-right toolbar),
    // up on iPad (points at share icon in top-right).
    const arrowSVG = top
      ? '<svg class="pwa-arrow" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#6b9eff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
      : '<svg class="pwa-arrow" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#6b9eff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
    const shareIcon = '<svg style="vertical-align:-3px;margin-left:2px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b9eff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
    const text = `<div style="text-align:right">Tap <strong style="color:#6b9eff">⋯</strong> → <strong style="color:#6b9eff">Share</strong>${shareIcon} → scroll down → <strong>Add to Home Screen</strong></div>`;
    m.innerHTML = top ? `${text}${arrowSVG}` : `${text}${arrowSVG}`;
    document.body.appendChild(m);
    const dismiss = () => { m.style.transition = 'opacity .35s'; m.style.opacity = '0'; setTimeout(() => m.remove(), 350); };
    setTimeout(dismiss, 7000);
    m.addEventListener('click', dismiss);
  }

  // Auto-show the hint once on first iOS Safari visit so users don't even need
  // to find the Install button.
  const HINT_KEY = 'pwa-ios-hint-shown-v4';
  function maybeAutoShowHint() {
    if (isStandalone) return;
    if (!isIOSSafari) return;
    if (localStorage.getItem(HINT_KEY)) return;
    // Wait a beat so the page settles first
    setTimeout(() => {
      showIOSHint();
      localStorage.setItem(HINT_KEY, '1');
    }, 1500);
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

  function init() {
    maybeShowInstallButton();
    maybeAutoShowHint();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
