// Single source of truth for the RBAC system.
// Loaded BEFORE access-guard.js on every page. Exposes window.RidleyPerms.
//
// Adding a new role or page = edit ONLY this file. Per-page guards just call
// RidleyPerms.canOpen(href, user) and trust the result.
(function () {
  const AVAILABLE_PERMS = ['sales', 'marketing', 'finance', 'calls', 'rep', 'sales_manager', 'mentorship', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'];

  // Page → which roles grant access. `is_admin: true` always wins.
  // `roles: '*'` means anyone signed in.
  const PAGES = [
    { href: 'home.html',         id: null,           roles: '*' },
    { href: 'index.html',        id: 'sales',        roles: ['sales', 'sales_manager'] },
    { href: 'meta-ads.html',     id: 'meta',         roles: ['marketing'] },
    { href: 'performance.html',  id: 'performance',  roles: ['marketing', 'sales', 'sales_manager'] },
    { href: 'income.html',       id: 'income',       roles: ['finance'] },
    { href: 'calls.html',        id: 'calls',        roles: ['calls', 'sales_manager', 'rep'] },
    { href: 'declarations.html', id: 'declarations', roles: ['rep', 'sales_manager'] },
    { href: 'students.html',     id: 'students',     roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'] },
    { href: 'coach.html',        id: 'coach',        roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'] },
    { href: 'email-automations.html', id: 'email_automations', roles: [], adminOnly: true },
  ];

  // Resolve impersonation: when an admin "Views as" another user, all UI
  // permission checks should reflect THAT user. Server-side calls still use
  // the real JWT so this is preview-only.
  function impersonation() {
    try {
      const raw = localStorage.getItem('impersonate-user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  // effective(user) returns the identity that should drive UI checks.
  // Pass session.user; we'll layer impersonation on top.
  function effective(user) {
    const imp = impersonation();
    if (imp) {
      return {
        impersonated: true,
        email:        imp.email || '',
        is_admin:     imp.is_admin === true,
        permissions:  imp.permissions || [],
      };
    }
    return {
      impersonated: false,
      email:        user?.email || '',
      is_admin:     user?.app_metadata?.is_admin === true,
      permissions:  user?.app_metadata?.permissions || [],
    };
  }

  function pageDef(href) {
    const file = (href || '').split('/').pop();
    return PAGES.find(p => p.href === file) || null;
  }

  function canOpen(href, user) {
    const eff = effective(user);
    if (eff.is_admin) return true;
    const def = pageDef(href);
    if (!def) return false;
    if (def.roles === '*') return true;
    return def.roles.some(r => eff.permissions.includes(r));
  }

  // Convenience for code that already has an effective() object
  function canOpenWith(href, eff) {
    if (eff.is_admin) return true;
    const def = pageDef(href);
    if (!def) return false;
    if (def.roles === '*') return true;
    return def.roles.some(r => eff.permissions.includes(r));
  }

  window.RidleyPerms = {
    AVAILABLE_PERMS,
    PAGES,
    effective,
    canOpen,
    canOpenWith,
    pageDef,
  };
})();
