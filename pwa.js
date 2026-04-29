// PWA bootstrap — registers service worker + shows iOS install hint.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] sw register failed:', err);
      });
    });
  }

  // iOS Safari can't trigger installs programmatically — show a one-time tip
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const tipKey = 'pwa-ios-tip-dismissed';

  if (isIOS && !isStandalone && !localStorage.getItem(tipKey)) {
    setTimeout(() => {
      const tip = document.createElement('div');
      tip.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:#1a1d2e;border:1px solid #1f2438;color:#eaecf8;' +
        'padding:14px 18px;border-radius:14px;font-size:0.84rem;' +
        'z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:90%;' +
        'display:flex;align-items:center;gap:12px;';
      tip.innerHTML =
        '<div style="font-size:1.6rem;">📲</div>' +
        '<div style="flex:1;line-height:1.4;">' +
        '<div style="font-weight:700;margin-bottom:2px;">Install Ridley</div>' +
        '<div style="color:#7880a8;font-size:0.78rem;">Tap <span style="display:inline-block;vertical-align:middle;">⎙</span> Share, then "Add to Home Screen".</div>' +
        '</div>' +
        '<button id="pwaTipClose" style="background:transparent;border:none;color:#7880a8;font-size:1.4rem;cursor:pointer;line-height:1;padding:0 4px;">×</button>';
      document.body.appendChild(tip);
      tip.querySelector('#pwaTipClose').onclick = () => {
        tip.remove();
        localStorage.setItem(tipKey, '1');
      };
      // Auto-dismiss after 12s
      setTimeout(() => {
        if (tip.parentNode) tip.remove();
      }, 12000);
    }, 3500);
  }

  // Desktop / Android — capture beforeinstallprompt and surface a button if present in DOM
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = 'inline-flex';
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#pwaInstallBtn');
    if (!btn || !deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
      btn.style.display = 'none';
    });
  });
})();
