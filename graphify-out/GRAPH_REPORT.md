# Graph Report - /tmp/dashboards  (2026-04-30)

## Corpus Check
- Corpus is ~9,047 words - fits in a single context window. You may not need a graph.

## Summary
- 117 nodes · 139 edges · 19 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_UX Helpers (Impersonation + Tooltips)|UX Helpers (Impersonation + Tooltips)]]
- [[_COMMUNITY_Dashboard Pages & Role Bindings|Dashboard Pages & Role Bindings]]
- [[_COMMUNITY_Stack & Deployment|Stack & Deployment]]
- [[_COMMUNITY_Access Guard Internals|Access Guard Internals]]
- [[_COMMUNITY_Filter Persistence (Date Range)|Filter Persistence (Date Range)]]
- [[_COMMUNITY_PWA Bootstrap & Install Hint|PWA Bootstrap & Install Hint]]
- [[_COMMUNITY_Admin Panel & Navigation|Admin Panel & Navigation]]
- [[_COMMUNITY_Changelog & Release Process|Changelog & Release Process]]
- [[_COMMUNITY_Changelog Modal Logic|Changelog Modal Logic]]
- [[_COMMUNITY_Theme Controller|Theme Controller]]
- [[_COMMUNITY_Permissions API|Permissions API]]
- [[_COMMUNITY_Shared Styling Rules|Shared Styling Rules]]
- [[_COMMUNITY_Skeleton Loaders|Skeleton Loaders]]
- [[_COMMUNITY_Service Worker|Service Worker]]
- [[_COMMUNITY_Date Picker Compatibility|Date Picker Compatibility]]
- [[_COMMUNITY_Nav Picker Rendering|Nav Picker Rendering]]
- [[_COMMUNITY_Income Access|Income Access]]
- [[_COMMUNITY_Agent Guide Doc|Agent Guide Doc]]
- [[_COMMUNITY_Forgot Password Helper|Forgot Password Helper]]

## God Nodes (most connected - your core abstractions)
1. `permissions.js (RBAC source of truth)` - 8 edges
2. `Ridley Academy Multi-Dashboard PWA` - 7 edges
3. `enforce()` - 6 edges
4. `Role: sales_manager` - 5 edges
5. `effOf()` - 4 edges
6. `effective()` - 4 edges
7. `apply()` - 4 edges
8. `restoreDateRange()` - 4 edges
9. `maybeShow()` - 4 edges
10. `pwa.js (SW registration + version check)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `sales-dashboard (README title)` --references--> `index.html (Sales Dashboard)`  [INFERRED]
  README.md → AGENTS.md
- `version.txt: v53 changelog-entries-v51-v52 (2026-04-30)` --references--> `changelog.js (What's-new modal)`  [EXTRACTED]
  version.txt → AGENTS.md
- `version.txt: v53 changelog-entries-v51-v52 (2026-04-30)` --implements--> `version.txt (PWA cache-bust trigger)`  [EXTRACTED]
  version.txt → AGENTS.md

## Hyperedges (group relationships)
- **Centralised RBAC system** — agents_permissions_js, agents_access_guard_js, agents_nav_menu_js, agents_impersonation [EXTRACTED 0.95]
- **PWA release + cache-bust pipeline** — agents_version_txt, agents_changelog_js, agents_pwa_js, agents_sw_js, agents_nuclear_version_check [EXTRACTED 0.95]
- **Shared scripts loaded on every dashboard** — agents_permissions_js, agents_access_guard_js, agents_loading_states_js, agents_pwa_js, agents_theme_js, agents_changelog_js, agents_ux_js, agents_filters_js, agents_nav_menu_js, agents_forgot_password_js [EXTRACTED 1.00]

## Communities

### Community 0 - "UX Helpers (Impersonation + Tooltips)"
Cohesion: 0.25
Nodes (6): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), renderImpersonationBanner(), watchKPIs()

### Community 1 - "Dashboard Pages & Role Bindings"
Cohesion: 0.25
Nodes (11): calls.html (Calls), declarations.html (Declarations), index.html (Sales Dashboard), meta-ads.html (Meta Ads), performance.html (VSL/Funnel), Role: calls, Role: marketing, Role: rep (+3 more)

### Community 2 - "Stack & Deployment"
Cohesion: 0.2
Nodes (10): chart.js@4 (CDN), Cloudflare Pages (auto-deploy from main), Supabase Edge Functions (Deno), manifest.json (PWA manifest), Ridley Academy Multi-Dashboard PWA, Rationale: browser-only push-and-refresh workflow, Rationale: SW excludes /version.txt from cache, Supabase (project pojqljrhhtnigyrtzdzz) (+2 more)

### Community 3 - "Access Guard Internals"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 4 - "Filter Persistence (Date Range)"
Cohesion: 0.36
Nodes (6): findPresetButton(), init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 5 - "PWA Bootstrap & Install Hint"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 6 - "Admin Panel & Navigation"
Cohesion: 0.25
Nodes (9): access-guard.js, home.html (Home / Admin Panel), Admin impersonation (View as), is_admin override flag, nav-menu.js (dashboard picker), permissions.js (RBAC source of truth), Rationale: load permissions.js in <head>, Rationale: centralised RBAC single source of truth (+1 more)

### Community 7 - "Changelog & Release Process"
Cohesion: 0.32
Nodes (8): changelog.js (What's-new modal), iOS Add-to-Home-Screen hint, nuclearVersionCheck(), pwa.js (SW registration + version check), Rationale: honest scope for iOS PWA limitations, 4-step Release Process, version.txt (PWA cache-bust trigger), version.txt: v53 changelog-entries-v51-v52 (2026-04-30)

### Community 8 - "Changelog Modal Logic"
Cohesion: 0.43
Nodes (4): getEffectiveUser(), maybeShow(), pickEntriesSince(), show()

### Community 9 - "Theme Controller"
Cohesion: 0.67
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 10 - "Permissions API"
Cohesion: 0.6
Nodes (5): canOpen(), canOpenWith(), effective(), impersonation(), pageDef()

### Community 11 - "Shared Styling Rules"
Cohesion: 0.4
Nodes (5): loading-states.js, mobile.css (shared stylesheet), Rationale: portal popovers to body to escape transform/backdrop ancestors, theme.js (Light/Dark/Auto), Topbar uniformity rule

### Community 12 - "Skeleton Loaders"
Cohesion: 0.5
Nodes (0): 

### Community 13 - "Service Worker"
Cohesion: 0.5
Nodes (0): 

### Community 14 - "Date Picker Compatibility"
Cohesion: 0.67
Nodes (3): Date picker dual-selector gotcha, filters.js (cross-page persistence), Rationale: filter restoration before auth resolves

### Community 15 - "Nav Picker Rendering"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Income Access"
Cohesion: 1.0
Nodes (2): income.html (Income), Role: finance

### Community 17 - "Agent Guide Doc"
Cohesion: 1.0
Nodes (1): Ridley Academy Dashboards Agent Guide

### Community 18 - "Forgot Password Helper"
Cohesion: 1.0
Nodes (1): forgot-password.js

## Knowledge Gaps
- **24 isolated node(s):** `sales-dashboard (README title)`, `Ridley Academy Dashboards Agent Guide`, `Cloudflare Pages (auto-deploy from main)`, `@supabase/supabase-js@2 (CDN)`, `chart.js@4 (CDN)` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Nav Picker Rendering`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Income Access`** (2 nodes): `income.html (Income)`, `Role: finance`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Agent Guide Doc`** (1 nodes): `Ridley Academy Dashboards Agent Guide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Forgot Password Helper`** (1 nodes): `forgot-password.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `permissions.js (RBAC source of truth)` connect `Admin Panel & Navigation` to `Stack & Deployment`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `sw.js (Service Worker)` connect `Stack & Deployment` to `Changelog & Release Process`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `permissions.js (RBAC source of truth)` (e.g. with `nav-menu.js (dashboard picker)` and `Supabase Edge Functions (Deno)`) actually correct?**
  _`permissions.js (RBAC source of truth)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `sales-dashboard (README title)`, `Ridley Academy Dashboards Agent Guide`, `Cloudflare Pages (auto-deploy from main)` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._