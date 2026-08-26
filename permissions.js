// Single source of truth for the RBAC system.
// Loaded BEFORE access-guard.js on every page. Exposes window.RidleyPerms.
//
// Adding a new role or page = edit ONLY this file. Per-page guards just call
// RidleyPerms.canOpen(href, user) and trust the result.
(function () {
  const AVAILABLE_PERMS = ['sales', 'marketing', 'finance', 'calls', 'rep', 'sales_manager', 'mentorship', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep', 'weekly_stats', 'collector', 'collections', 'treasury_ic', 'refunds_view', 'support', 'subscriptions', 'daily_reports'];

  // Page → which roles grant access. `is_admin: true` always wins.
  // `roles: '*'` means anyone signed in.
  const PAGES = [
    { href: 'home.html',         id: null,           roles: '*' },
    // Internal messaging (DMs + groups) — available to every logged-in user.
    { href: 'messages.html',     id: 'messages',     roles: '*' },
    { href: 'index.html',        id: 'sales',        roles: ['sales', 'sales_manager'] },
    { href: 'meta-ads.html',     id: 'meta',         roles: ['marketing'] },
    { href: 'performance.html',  id: 'performance',  roles: ['marketing', 'sales', 'sales_manager'] },
    { href: 'income.html',       id: 'income',       roles: ['finance'] },
    { href: 'calls.html',        id: 'calls',        roles: ['calls', 'sales_manager', 'rep'] },
    // Booked Calls — Calendly bookings + source attribution. Same audience as
    // calls.html so nobody needs reconfiguring; granular keys layer on top.
    { href: 'calendly.html',     id: 'calendly',     roles: ['calls', 'sales_manager', 'rep'], granular: ['calendly.view', 'calendly.view_others'] },
    { href: 'declarations.html', id: 'declarations', roles: ['rep', 'sales_manager', 'declarations'], granular: ['declarations.view', 'declarations.view_all'] },
    // Collections dashboard — chasing missed/disputed rebills. Lives in a
    // separate table so it never mixes into rep declaration stats. Gated by
    // the new `collector` role (legacy bucket) or collections.view granular.
    { href: 'collections.html', id: 'collections', roles: ['collector', 'collections'], granular: 'collections.view' },
    // Refunds dashboard — logging refunds salvaged + refunds done. Its own
    // table, completely separate from collections. Treasury I/C + Delivery I/C
    // (and admins) can enter/edit; `refunds_view` is a read-only tier.
    { href: 'refunds.html', id: 'refunds', roles: ['treasury_ic', 'delivery_ic', 'refunds_view', 'refunds'], granular: 'refunds.view' },
    // Support dashboard — customer support ticket log. Gated by the `support`
    // role (granular support.view) — its own table, separate from everything else.
    { href: 'support.html', id: 'support', roles: ['support'], granular: 'support.view' },
    // Subscription management — payment-plan / rebill status + stopped subs.
    // Support can manage it (the support role grants subscriptions.*); also a
    // standalone `subscriptions` bucket for non-support users.
    { href: 'subscriptions.html', id: 'subscriptions', roles: ['subscriptions', 'support'], granular: 'subscriptions.view' },
    // Daily Reports — assignees submit a daily report; admins/managers assign,
    // review, and reply. Access is granted per-person on assignment
    // (daily_reports.view), plus the daily_reports role / admins.
    { href: 'daily-reports.html', id: 'daily_reports', roles: ['daily_reports'], granular: 'daily_reports.view' },
    { href: 'students.html',     id: 'students',     roles: ['students', 'mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], granular: 'students.view' },
    { href: 'masterclass.html',  id: 'masterclass',  roles: ['mentorship', 'sales_manager', 'ms_ic', 'delivery_ic', 'ms_rep', 'rep'], granular: 'masterclass.view' },
    // MS Alerts/Turn-overs analytics — managers only (no ms_rep/coach).
    { href: 'ms-alerts.html',    id: 'ms_analytics', roles: ['mentorship', 'sales_manager', 'ms_ic', 'delivery_ic'], granular: 'ms_analytics.view' },
    // Coach Dashboard: only true editors. Primary gate is the GRANULAR
    // `coach.edit` permission. Legacy fallback includes `coach` /
    // `ms_ic` / `delivery_ic` for users whose JWT predates the
    // permissions_v2 backfill. The `coach` legacy key IS auto-derived
    // from the read-only `coach.view`, so the `excludesRoles` veto
    // blocks anyone who ALSO has `rep` or `ms_rep` (chicca-style users
    // who only got `coach.view` via the ms_rep bundle). Admins pass.
    { href: 'coach.html',        id: 'coach',        roles: ['coach', 'ms_ic', 'delivery_ic'], excludesRoles: ['rep', 'ms_rep'], granular: 'coach.edit' },
    { href: 'email-automations.html', id: 'email_automations', roles: [], adminOnly: true },
    { href: 'access.html',       id: 'access',       roles: [], adminOnly: true, granular: 'users.manage' },
    // Weekly Stats dashboard — Staff Meeting view. Primary gate is the
    // granular `weekly_stats.view`; legacy `weekly_stats` role works too.
    { href: 'weekly-stats.html', id: 'weekly_stats', roles: ['weekly_stats'], granular: 'weekly_stats.view' },
    // Weekly Stats data entry — same gate as the view (edit permission is
    // checked server-side; the page renders read-only for viewers).
    { href: 'weekly-stats-entry.html', id: 'weekly_stats_entry', roles: ['weekly_stats'], granular: 'weekly_stats.view' },
    // Org Board — anyone signed in can VIEW the org structure (roles:'*').
    // Editing is gated in-page + server-side by org.edit_structure /
    // org.assign_holders / org.edit_policies.
    { href: 'org-board.html', id: 'org', roles: '*', granular: 'org.view' },
    // Targets — ClickUp-style tasks (own dashboard + on the org board). Everyone.
    { href: 'targets.html', id: 'targets', roles: '*' },
    // Policies & Orders repository — anyone who can see the org (org.view); edit gated by org.edit_policies in-page.
    // Also hosts "To Study" (?view=study) — your personal reading list of policies concerning you.
    { href: 'policies.html', id: 'policies', roles: '*', granular: 'org.view' },
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
    const granularKeys = Array.isArray(def.granular) ? def.granular : (def.granular ? [def.granular] : []);
    const granularHit = granularKeys.length > 0
      && Array.isArray(eff.permissions_v2)
      && granularKeys.some(k => eff.permissions_v2.includes(k));
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
