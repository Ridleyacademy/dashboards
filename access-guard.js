// Shared client-side access guard.
// Requires global `supa`. Defensive: never blocks the page loading; only filters/redirects.
(function () {
  if (typeof supa === 'undefined') { console.warn('[access-guard] supa not found, skipping'); return; }

  const PAGES = [
    { href: 'home.html',         perms: null },
    { href: 'index.html',        perms: ['sales', 'sales_manager'] },
    { href: 'meta-ads.html',     perms: ['marketing'] },
    { href: 'performance.html',  perms: ['marketing'] },
    { href: 'income.html',       perms: ['finance', 'sales_manager'] },
    { href: 'calls.html',        perms: ['calls', 'sales_manager', 'rep'] },
    { href: 'declarations.html', perms: ['rep', 'sales_manager'] },
  ];

  function permsOf(user) { return user?.app_metadata?.permissions || []; }
  function isAdmin(user) { return user?.app_metadata?.is_admin === true; }

  function canAccess(pageDef, user) {
    if (!user) return false;
    if (isAdmin(user)) return true;
    if (!pageDef || pageDef.perms === null) return true;
    const have = permsOf(user);
    return pageDef.perms.some(p => have.includes(p));
  }

  function currentPageFile() {
    const path = (window.location.pathname || '').split('/').pop();
    return path && path.endsWith('.html') ? path : 'home.html';
  }

  let didRedirect = false;
  let didFilter = false;

  async function enforce() {
    try {
      const { data: { session } } = await supa.auth.getSession();
      const user = session?.user;
      if (!user) return; // login flow handles unauth

      const file = currentPageFile();
      const def  = PAGES.find(p => p.href === file);

      // Page-level guard — only redirect once
      if (!didRedirect && def && !canAccess(def, user)) {
        didRedirect = true;
        console.log('[access-guard] redirecting from', file);
        window.location.replace('home.html?denied=' + encodeURIComponent(file));
        return;
      }

      // Hide nav-dropdown links the user can't access — only run once
      if (!didFilter) {
        didFilter = true;
        const items = document.querySelectorAll('.nav-dropdown-item, .nav-drop-item, [data-nav-link]');
        items.forEach(el => {
          const href = (el.getAttribute('href') || '').split('/').pop();
          const d = PAGES.find(p => p.href === href);
          if (d && !canAccess(d, user)) el.style.display = 'none';
        });
      }
    } catch (e) {
      console.warn('[access-guard] enforce failed:', e);
    }
  }

  // Run as soon as DOM is interactive AND on every auth state change.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforce);
  } else {
    enforce();
  }
  try {
    supa.auth.onAuthStateChange(() => enforce());
  } catch (e) {
    console.warn('[access-guard] could not subscribe to auth changes:', e);
  }

  // Show notice on home if redirected from a forbidden page
  const params = new URLSearchParams(window.location.search);
  const denied = params.get('denied');
  if (denied && currentPageFile() === 'home.html') {
    const showNotice = () => {
      const notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1d2e;border:1px solid #f87171;color:#f87171;padding:12px 20px;border-radius:10px;font-size:0.84rem;font-weight:600;z-index:10000;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90%;text-align:center;';
      notice.innerHTML = `🔒 You don't have access to <strong>${denied.replace('.html','')}</strong>. Contact an admin if you think this is a mistake.`;
      document.body.appendChild(notice);
      setTimeout(() => { notice.style.transition = 'opacity 0.5s'; notice.style.opacity = '0'; setTimeout(() => notice.remove(), 500); }, 6000);
      history.replaceState({}, '', window.location.pathname);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(showNotice, 500));
    } else {
      setTimeout(showNotice, 500);
    }
  }
})();
