// Shared UX enhancements:
// 1. Pull-to-refresh on mobile (drag down from top to reload)
// 2. Haptic feedback wrapper (works on Android via navigator.vibrate;
//    iOS Safari does NOT expose haptics to web — silently no-ops there)
(function () {
  // ---------- Haptics ----------
  // window.haptic('tap' | 'medium' | 'success') — call from any handler.
  // Android Chrome supports navigator.vibrate; iOS Safari ignores it.
  // We try anyway so Android users get the feel.
  window.haptic = function (kind) {
    if (!navigator.vibrate) return;
    try {
      switch (kind) {
        case 'medium':  navigator.vibrate(20); break;
        case 'success': navigator.vibrate([10, 40, 10]); break;
        case 'tap':
        default:        navigator.vibrate(10);
      }
    } catch (_) {}
  };

  // Auto-fire a tap haptic on any button / picker / nav-link tap. Cheap.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [role="button"], .tbtn, .nav-menu-link, .nav-dropdown-item, [data-haptic]');
    if (t) window.haptic('tap');
  }, { passive: true });

  // ---------- Pull-to-refresh ----------
  // Only inside the installed PWA (avoid fighting Safari's native bounce).
  // Activates when the user is at the very top of the page and drags down.
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (!isStandalone) return;

  const THRESHOLD = 70;   // px to trigger refresh
  const MAX_PULL  = 120;  // px max indicator stretch
  let startY = 0;
  let pulling = false;
  let pullDistance = 0;

  // Indicator element
  const ind = document.createElement('div');
  ind.id = 'pwaPullRefresh';
  ind.style.cssText = `
    position:fixed;top:-50px;left:50%;transform:translate(-50%, 0);
    width:42px;height:42px;border-radius:50%;
    background:#13141f;border:1px solid #1f2438;
    display:flex;align-items:center;justify-content:center;
    z-index:10002;pointer-events:none;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);
    transition:opacity .2s;
    opacity:0;
  `;
  ind.innerHTML = `<svg id="pwaPullSpinner" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b9eff" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 4 21 10 15 10"/></svg>`;
  document.body.appendChild(ind);

  const spinner = ind.querySelector('#pwaPullSpinner');

  function setIndicator(distance, refreshing) {
    const pct = Math.min(distance / THRESHOLD, 1);
    const y = Math.min(distance * 0.5, MAX_PULL * 0.5);
    ind.style.opacity = String(Math.min(distance / 30, 1));
    ind.style.transform = `translate(-50%, ${y}px) rotate(${distance * 2}deg)`;
    spinner.style.stroke = pct >= 1 ? '#34d399' : '#6b9eff';
    if (refreshing) {
      ind.style.animation = 'pwaSpin 0.8s linear infinite';
    } else {
      ind.style.animation = '';
    }
  }

  // Spinner keyframes
  const kf = document.createElement('style');
  kf.textContent = '@keyframes pwaSpin { to { transform: translate(-50%, 35px) rotate(360deg); } }';
  document.head.appendChild(kf);

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0) { pulling = false; return; }
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    pulling = true;
    pullDistance = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    if (window.scrollY > 0) { pulling = false; ind.style.opacity = '0'; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { ind.style.opacity = '0'; return; }
    pullDistance = Math.min(dy, MAX_PULL);
    setIndicator(pullDistance, false);
    // Prevent rubber-banding while pulling — only when clearly downward
    if (dy > 8 && e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (pullDistance >= THRESHOLD) {
      // Trigger refresh
      window.haptic('success');
      setIndicator(THRESHOLD, true);
      // Tiny delay so the user sees the spinner before reload
      setTimeout(() => window.location.reload(), 150);
    } else {
      // Snap back
      ind.style.transition = 'transform .25s ease, opacity .25s ease';
      ind.style.transform = 'translate(-50%, 0)';
      ind.style.opacity = '0';
      setTimeout(() => { ind.style.transition = ''; }, 260);
    }
    pullDistance = 0;
  }, { passive: true });
})();
