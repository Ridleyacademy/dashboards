// Shared client-side access guard.
// Requires global `supa`. Defensive: never blocks the page loading; only filters/redirects.
(function () {
  if (typeof supa === 'undefined') { console.warn('[access-guard] supa not found, skipping'); return; }

  const PAGES = [
    { href: 'home.html',         perms: null,                                       id: null },
    { href: 'index.html',        perms: ['sales', 'sales_manager'],                 id: 'sales' },
    { href: 'meta-ads.html',     perms: ['marketing'],                              id: 'meta' },
    { href: 'performance.html',  perms: ['marketing'],                              id: 'performance' },
    { href: 'income.html',       perms: ['finance', 'sales_manager'],               id: 'income' },
    { href: 'calls.html',        perms: ['calls', 'sales_manager', 'rep'],          id: 'calls' },
    { href: 'declarations.html', perms: ['rep', 'sales_manager'],                   id: 'declarations' },
  ];

  // Cached archive list (Set of dashboard ids). Loaded lazily.
  let archivedIds = null;
  async function getArchivedIds(token) {
    if (archivedIds !== null) return archivedIds;
    try {
      const SUPABASE_URL = supa.supabaseUrl || (typeof window !== 'undefined' && window.SUPABASE_URL);
      const url = (SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/admin-api?api=dashboard-archive';
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { archivedIds = new Set(); return archivedIds; }
      const j = await r.json();
      archivedIds = new Set(j.archived || []);
    } catch (e) {
      console.warn('[access-guard] could not load archive list:', e);
      archivedIds = new Set();
    }
    return archivedIds;
  }

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

      const userIsAdmin = isAdmin(user);
      const archived = await getArchivedIds(session.access_token);

      const file = currentPageFile();
      const def  = PAGES.find(p => p.href === file);

      // Page-level guard — only redirect once.
      // Block if: missing perms, OR (archived AND not admin)
      if (!didRedirect && def) {
        const archivedBlock = !userIsAdmin && def.id && archived.has(def.id);
        if (!canAccess(def, user) || archivedBlock) {
          didRedirect = true;
          const reason = archivedBlock ? 'archived' : 'denied';
          console.log('[access-guard] redirecting from', file, 'reason:', reason);
          window.location.replace('home.html?' + reason + '=' + encodeURIComponent(file));
          return;
        }
      }

      // Filter nav items.
      // Archived dashboards are hidden from the picker for EVERYONE (including admins)
      // so the picker only shows currently-active boards. Admins manage archived
      // boards from the home page.
      // We re-run repeatedly via a MutationObserver below — because the shared
      // nav-menu.js injects items async, the first pass may run before items exist.
      const filterNow = () => {
        const items = document.querySelectorAll('.nav-dropdown-item, .nav-drop-item, .nav-menu-link, [data-nav-link]');
        items.forEach(el => {
          const href = (el.getAttribute('href') || '').split('/').pop();
          const d = PAGES.find(p => p.href === href);
          if (!d) return;
          const noPerm = !canAccess(d, user);
          const archivedHide = d.id && archived.has(d.id);
          if (noPerm || archivedHide) el.style.display = 'none';
        });
      };
      filterNow();
      // Also watch the dropdown menus for late-injected items
      if (!didFilter) {
        didFilter = true;
        const menus = document.querySelectorAll('#navDropMenu, #navDropdownMenu, .nav-dropdown-menu');
        menus.forEach(menu => {
          const obs = new MutationObserver(() => filterNow());
          obs.observe(menu, { childList: true, subtree: true });
          // Auto-disconnect after 5s
          setTimeout(() => obs.disconnect(), 5000);
        });
      }
    } catch (e) {
      console.warn('[access-guard] enforce failed:', e);
    }
  }

  // Run once when DOM is ready AND once after a short delay (gives the page's own
  // auth flow time to hydrate the session). Don't subscribe to onAuthStateChange
  // because it can race with the page's own auth handlers.
  function runWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        enforce();
        setTimeout(enforce, 1500); // catch the post-hydration session
      });
    } else {
      enforce();
      setTimeout(enforce, 1500);
    }
  }
  runWhenReady();

  // Show notice on home if redirected from a forbidden / archived page
  const params = new URLSearchParams(window.location.search);
  const denied   = params.get('denied');
  const archivedFrom = params.get('archived');
  if ((denied || archivedFrom) && currentPageFile() === 'home.html') {
    const showNotice = () => {
      const which = archivedFrom || denied;
      const isArch = !!archivedFrom;
      const notice = document.createElement('div');
      const color = isArch ? '#fbbf24' : '#f87171';
      notice.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1d2e;border:1px solid ${color};color:${color};padding:12px 20px;border-radius:10px;font-size:0.84rem;font-weight:600;z-index:10000;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90%;text-align:center;`;
      notice.innerHTML = isArch
        ? `📦 <strong>${which.replace('.html','')}</strong> is currently archived.`
        : `🔒 You don't have access to <strong>${which.replace('.html','')}</strong>. Contact an admin if you think this is a mistake.`;
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
