// Shared UX enhancements:
// 1. Pull-to-refresh on mobile (drag down from top to reload)
// 2. Haptic feedback wrapper (works on Android via navigator.vibrate;
//    iOS Safari does NOT expose haptics to web — silently no-ops there)
// 3. KPI tooltips — small "?" next to every recognised KPI label, with
//    hover (desktop) / tap (mobile) tooltip explaining what it measures
// 4. Impersonation banner — when admin "View as <user>" is active, a banner
//    is pinned across the top of every page with an Exit button
(function () {
  // ---------- KPI tooltips ----------
  // Mapping of KPI label text → plain-language definition.
  const KPI_TIPS = {
    // Sales dashboard
    'Cash Sales':       'Revenue from one-time payments in the selected period.',
    'Rebills':          'Revenue from recurring subscription renewals.',
    'Payment Plans':    'Revenue from instalment plan payments.',
    'Total Revenue':    'Cash + Rebills + Payment Plans combined.',
    // Calls
    'Total Calls':      'Every call recorded by the dialer in this period.',
    'Contacts':         'Calls that lasted at least 2 minutes — i.e. someone actually picked up.',
    'Interviews':       'Calls that were tagged as a structured sales interview.',
    'Close Rate':       'Sales divided by interviews — % of interviews that converted.',
    'Total Talk Time':  'Sum of every connected call duration.',
    'Avg Call Duration':'Average length of a connected call.',
    // Income
    'Gross Income':     'Revenue collected before refunds, fees, or chargebacks.',
    'Total Sales':      'Number of transactions in the period.',
    // Declarations
    'Total Declarations':'Every declaration row submitted in this period.',
    'Verified':         'Declarations matched against an actual transaction.',
    'Not Verified':     'Declarations with no matching transaction yet — needs review.',
    // Meta Ads
    'Total Spend':      'Total euros spent across all campaigns in the date range.',
    'Impressions':      'Times your ads were shown — does not require a click.',
    'Clicks':           'Total link clicks across all campaigns.',
    'Avg CTR':          'Click-through rate: clicks ÷ impressions, averaged across campaigns.',
    'Avg CPM':          'Cost per 1,000 impressions, averaged across campaigns.',
    'Avg CPC':          'Cost per click, averaged across campaigns.',
  };

  function injectTooltipStyles() {
    if (document.getElementById('uxTooltipStyles')) return;
    const st = document.createElement('style');
    st.id = 'uxTooltipStyles';
    st.textContent = `
      .kpi-label[data-tip] { position: relative; display: inline-flex; align-items: center; gap: 4px; }
      .ux-tip-icon {
        display: inline-flex; align-items: center; justify-content: center;
        width: 13px; height: 13px; border-radius: 50%;
        background: rgba(120,128,168,0.18); color: #7880a8;
        font-size: 9px; font-weight: 800; cursor: help;
        flex-shrink: 0;
      }
      .ux-tip-icon:hover { background: rgba(107,158,255,0.25); color: #6b9eff; }
      .ux-tip-popover {
        position: fixed; z-index: 10003; max-width: 240px;
        background: #13141f; border: 1px solid #1f2438; border-radius: 10px;
        padding: 9px 12px; color: #eaecf8;
        font-size: 0.78rem; font-weight: 500; line-height: 1.4;
        box-shadow: 0 12px 30px rgba(0,0,0,0.5);
        pointer-events: none; opacity: 0; transition: opacity .12s;
      }
      .ux-tip-popover.visible { opacity: 1; }
    `;
    document.head.appendChild(st);
  }

  let tipEl = null;
  function showTip(anchor, text) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'ux-tip-popover';
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = text;
    const r = anchor.getBoundingClientRect();
    // Position above the icon, clamped to viewport
    tipEl.style.visibility = 'hidden';
    tipEl.classList.add('visible');
    const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let left = r.left + r.width/2 - tw/2;
    let top  = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
    tipEl.style.visibility = '';
  }
  function hideTip() {
    if (tipEl) tipEl.classList.remove('visible');
  }

  function decorateKPIs() {
    document.querySelectorAll('.kpi-label').forEach(el => {
      if (el.querySelector('.ux-tip-icon')) return;
      // Use the trimmed text content as the lookup key (ignore inner spans)
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      const tip = KPI_TIPS[text];
      if (!tip) return;
      el.setAttribute('data-tip', tip);
      const icon = document.createElement('span');
      icon.className = 'ux-tip-icon';
      icon.textContent = '?';
      icon.setAttribute('aria-label', tip);
      el.appendChild(icon);
      icon.addEventListener('mouseenter', () => showTip(icon, tip));
      icon.addEventListener('mouseleave', hideTip);
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        showTip(icon, tip);
        // auto-hide on mobile
        clearTimeout(icon._tipTimer);
        icon._tipTimer = setTimeout(hideTip, 3500);
      });
    });
  }

  // Run now and on mutations (KPIs are sometimes injected late by JS)
  function watchKPIs() {
    injectTooltipStyles();
    decorateKPIs();
    const obs = new MutationObserver(() => decorateKPIs());
    obs.observe(document.body, { childList: true, subtree: true });
    // Tap anywhere outside hides tip
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ux-tip-icon')) hideTip();
    });
  }

  // ---------- Impersonation banner ----------
  // The actual permission/admin override is handled in access-guard.js. Here
  // we just render the persistent banner across the top of every page.
  function getImpersonation() {
    try {
      const raw = localStorage.getItem('impersonate-user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function clearImpersonation() {
    localStorage.removeItem('impersonate-user');
    window.location.reload();
  }
  window.uxImpersonate = function (user) {
    // user: { id, email, is_admin, permissions }
    localStorage.setItem('impersonate-user', JSON.stringify(user));
    // Send to home so the user sees the right starting context
    window.location.href = 'home.html';
  };
  window.uxClearImpersonation = clearImpersonation;

  function applyImpersonationToUI(imp) {
    // Overwrite any obvious "current user" UI bits so every page reflects the
    // impersonated identity, not the real admin. We poll briefly because some
    // dashboards set these values asynchronously after auth resolves.
    const targets = ['userEmail', 'userPillEmail', 'userPill', 'currentUserEmail', 'firstName', 'userName'];
    const initials = (imp.email[0] || 'U').toUpperCase();
    let tries = 0;
    const tick = () => {
      targets.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'firstName') {
          const name = imp.email.split('@')[0].split(/[._]/)[0];
          el.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        } else {
          el.textContent = imp.email;
        }
      });
      const av = document.getElementById('userAvatar');
      if (av) av.textContent = initials;
      tries++;
      if (tries < 20) setTimeout(tick, 250);
    };
    tick();
  }

  function renderImpersonationBanner() {
    const imp = getImpersonation();
    if (!imp) return;
    applyImpersonationToUI(imp);
    if (document.getElementById('uxImpBanner')) return;
    const b = document.createElement('div');
    b.id = 'uxImpBanner';
    b.style.cssText = 'position:sticky;top:0;left:0;right:0;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b0c14;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:0.82rem;font-weight:700;padding:8px 14px;z-index:10004;display:flex;align-items:center;justify-content:center;gap:14px;box-shadow:0 4px 12px rgba(0,0,0,0.25);';
    b.innerHTML = `
      <span>👁 Viewing as <strong>${imp.email}</strong>${imp.is_admin ? ' (admin)' : (imp.permissions?.length ? ` · ${imp.permissions.join(', ')}` : '')}</span>
      <button id="uxImpExit" style="background:#0b0c14;color:#fbbf24;border:none;border-radius:8px;padding:5px 12px;font-weight:800;font-size:0.74rem;cursor:pointer;">Exit</button>
    `;
    // Insert at very top of body
    document.body.insertBefore(b, document.body.firstChild);
    document.getElementById('uxImpExit').addEventListener('click', clearImpersonation);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { watchKPIs(); renderImpersonationBanner(); });
  } else {
    watchKPIs();
    renderImpersonationBanner();
  }

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
