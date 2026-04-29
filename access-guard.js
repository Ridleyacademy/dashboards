// Shared client-side access guard.
// Requires a global `supa` Supabase client.
// - Hides nav-dropdown items for pages the user can't access.
// - Redirects to home if user lands on a page they don't have permission for.
(function () {
  if (typeof supa === 'undefined') { console.warn('[access-guard] supa not found'); return; }

  // Define which permissions can access each page. Admins always pass.
  // null = anyone signed in.
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
    const path = window.location.pathname.split('/').pop() || '';
    return path || 'home.html';
  }

  async function enforce() {
    const { data: { session } } = await supa.auth.getSession();
    const user = session?.user;
    if (!user) return; // not signed in — page's own login flow handles it

    const file = currentPageFile();
    const def  = PAGES.find(p => p.href === file);

    // Page-level guard
    if (def && !canAccess(def, user)) {
      // Redirect to home with a "denied" flag so home can show a notice
      window.location.replace('home.html?denied=' + encodeURIComponent(file));
      return;
    }

    // Hide nav-dropdown links the user can't access
    const items = document.querySelectorAll('.nav-dropdown-item, .nav-drop-item, [data-nav-link]');
    items.forEach(el => {
      const href = (el.getAttribute('href') || '').split('/').pop();
      const d = PAGES.find(p => p.href === href);
      if (d && !canAccess(d, user)) el.style.display = 'none';
    });
  }

  enforce();
  // Re-run when auth state changes (e.g. after invite link sign-in)
  supa.auth.onAuthStateChange(() => enforce());

  // Show a small banner on home if redirected here from a forbidden page
  const params = new URLSearchParams(window.location.search);
  const denied = params.get('denied');
  if (denied && currentPageFile() === 'home.html') {
    setTimeout(() => {
      const notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1d2e;border:1px solid #f87171;color:#f87171;padding:12px 20px;border-radius:10px;font-size:0.84rem;font-weight:600;z-index:10000;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90%;text-align:center;';
      notice.innerHTML = `🔒 You don't have access to <strong>${denied.replace('.html','')}</strong>. Contact an admin if you think this is a mistake.`;
      document.body.appendChild(notice);
      setTimeout(() => { notice.style.transition = 'opacity 0.5s'; notice.style.opacity = '0'; setTimeout(() => notice.remove(), 500); }, 6000);
      // Clean URL
      history.replaceState({}, '', window.location.pathname);
    }, 800);
  }
})();
