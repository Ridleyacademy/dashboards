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

  // Force a SW update check whenever the app becomes visible (e.g. user reopens
  // it from the iOS home screen). Combined with controllerchange above, this
  // makes a re-launch behave like a hard refresh.
  async function checkForUpdates() {
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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
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

  // Show button if installable on iOS (no event, but it can be installed via Share)
  function maybeShowInstallButton() {
    if (isStandalone) {
      document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = 'none');
      return;
    }
    if (isIOS) {
      // iOS Safari: show button always (manual install via Share)
      document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = '');
    } else if (deferredPrompt) {
      document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = '');
    } else {
      // Wait for beforeinstallprompt
      document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = 'none');
    }
  }

  function showIOSModal() {
    if (document.getElementById('pwaIOSModal')) return;
    const m = document.createElement('div');
    m.id = 'pwaIOSModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.85);backdrop-filter:blur(8px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:24px;';
    m.innerHTML = `
      <div style="background:#13141f;border:1px solid #1f2438;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;color:#eaecf8;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:54px;height:54px;background:#000;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:#AC1818;">RA</div>
          <div style="font-size:1.05rem;font-weight:800;letter-spacing:-0.02em;">Install Ridley</div>
          <div style="font-size:0.78rem;color:#7880a8;margin-top:4px;">Two-tap install — works offline.</div>
        </div>
        <ol style="list-style:none;padding:0;margin:0 0 20px;">
          <li style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #1f2438;">
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(107,158,255,0.18);color:#6b9eff;font-size:0.78rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
            <div style="font-size:0.84rem;line-height:1.45;">Tap the <span style="display:inline-block;vertical-align:middle;font-size:1.05rem;">⎙</span> <strong>Share</strong> button at the bottom of Safari.</div>
          </li>
          <li style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #1f2438;">
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(107,158,255,0.18);color:#6b9eff;font-size:0.78rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
            <div style="font-size:0.84rem;line-height:1.45;">Scroll and pick <strong>"Add to Home Screen"</strong>.</div>
          </li>
          <li style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;">
            <div style="width:24px;height:24px;border-radius:50%;background:rgba(52,211,153,0.18);color:#34d399;font-size:0.78rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
            <div style="font-size:0.84rem;line-height:1.45;">Tap <strong>Add</strong> in the top right. Done!</div>
          </li>
        </ol>
        <button id="pwaIOSClose" style="width:100%;background:linear-gradient(135deg,#AC1818,#7a0e0e);color:#fff;border:none;border-radius:12px;padding:13px;font-weight:700;font-size:0.92rem;cursor:pointer;">Got it</button>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    m.querySelector('#pwaIOSClose').addEventListener('click', () => m.remove());
  }

  window.showInstallPrompt = function () {
    if (isStandalone) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        document.querySelectorAll('[data-pwa-install]').forEach(el => el.style.display = 'none');
      });
    } else if (isIOS) {
      showIOSModal();
    } else {
      // Edge case: no prompt yet, not iOS — show generic instruction
      alert('Use your browser menu to install this app to your device.');
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
