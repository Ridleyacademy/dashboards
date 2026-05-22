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
    // Coach Dashboard: only true editors. Primary gate is the GRANULAR
    // `coach.edit` permission. Legacy fallback for `ms_ic` / `delivery_ic`
    // — those role keys are only present in legacy `permissions` when the
    // user is actually assigned that role in the Access dashboard, so
    // they're safe to trust (unlike the legacy `coach` key which is
    // auto-derived from `coach.view`). Admins always pass.
    { href: 'coach.html',        id: 'coach',        roles: ['ms_ic', 'delivery_ic'], granular: 'coach.edit' },
    { href: 'email-automations.html', id: 'email_automations', roles: [], adminOnly: true },
    { href: 'access.html',       id: 'access',       roles: [], adminOnly: true, granular: 'users.manage' },
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
      // Granular dotted-key permissions (e.g. 'students.edit', 'users.manage').
      // Populated by the new Access & Org dashboard; legacy `permissions` is
      // kept in sync so all existing page checks below keep working unchanged.
      permissions_v2: user?.app_metadata?.permissions_v2 || [],
    };
  }
  // Granular check used by newer code paths. Always treats is_admin as a wildcard.
  function hasGranular(key, user) {
    const eff = effective(user);
    if (eff.is_admin) return true;
    return Array.isArray(eff.permissions_v2) && eff.permissions_v2.includes(key);
  }

  function pageDef(href) {
    const file = (href || '').split('/').pop();
    return PAGES.find(p => p.href === file) || null;
  }

  // `excludesRoles` veto: any role listed there denies access even if the
  // user matches one of `roles`. Used so a coach who is ALSO a rep is
  // treated as a rep on rep-restricted boards.
  function _passesExclude(def, eff) {
    if (!def.excludesRoles || !def.excludesRoles.length) return true;
    return !def.excludesRoles.some(r => eff.permissions.includes(r));
  }

  // Shared logic: a page def can specify `granular` (the GRANULAR key from
  // permissions_v2) and/or `roles` (legacy bucket names). When BOTH are
  // set, the user passes if EITHER matches — that lets us treat the
  // granular key as the primary gate while still accepting trusted legacy
  // roles as a fallback for users whose JWT predates the permissions_v2
  // backfill. `excludesRoles` is always a veto.
  function _passesAccess(def, eff) {
    if (def.adminOnly) return false; // admin short-circuit handled by callers
    if (!_passesExclude(def, eff)) return false;
    if (def.roles === '*') return true;
    const granularHit = def.granular
      && Array.isArray(eff.permissions_v2)
      && eff.permissions_v2.includes(def.granular);
    const roleHit = Array.isArray(def.roles)
      && def.roles.length > 0
      && def.roles.some(r => eff.permissions.includes(r));
    return granularHit || roleHit;
  }

  function canOpen(href, user) {
    const eff = effective(user);
    if (eff.is_admin) return true;
    const def = pageDef(href);
    if (!def) return false;
    return _passesAccess(def, eff);
  }

  // Convenience for code that already has an effective() object
  function canOpenWith(href, eff) {
    if (eff.is_admin) return true;
    const def = pageDef(href);
    if (!def) return false;
    return _passesAccess(def, eff);
  }

  window.RidleyPerms = {
    AVAILABLE_PERMS,
    PAGES,
    effective,
    canOpen,
    canOpenWith,
    pageDef,
    hasGranular,
  };
})();
