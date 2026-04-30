# Ridley Academy Dashboards — Agent Guide

You are an AI agent working on this codebase. Read this whole file before
making changes. It captures intent, conventions, and gotchas that aren't
obvious from the code alone.

---

## What this is

A multi-dashboard Supabase-backed analytics PWA for Ridley Academy. Pure
static HTML + JS deployed via Cloudflare Pages from this repo
(github.com/Ridleyacademy/dashboards). Lives at **ridleyacademy.team**.

There is **no local build step, no bundler, no node_modules**. You edit HTML
+ JS files directly and push. Cloudflare deploys in ~30s.

The user works browser-only — they don't run a dev server. **All testing is
"push and refresh"**. So every change needs to be safe in production on the
first try.

---

## Stack

- **Hosting:** Cloudflare Pages, auto-deploy from `main`
- **Auth + DB:** Supabase (project ref `pojqljrhhtnigyrtzdzz`)
- **Edge functions:** Deno, in Supabase. Source-of-truth lives in the
  Supabase dashboard, not this repo. Names: `dashboard`, `meta-ads`,
  `calls`, `income`, `declarations`, `invite`, `admin-api`
- **Client libs (CDN, no install):** `@supabase/supabase-js@2`, `chart.js@4`
- **PWA:** custom service worker (`sw.js`) + `manifest.json`. Installable on
  iOS via Add to Home Screen.

---

## Pages

| File | Title | Required role(s) |
|---|---|---|
| `home.html`         | Home / Admin Panel        | anyone signed in |
| `index.html`        | Sales Dashboard           | `sales`, `sales_manager` |
| `meta-ads.html`     | Meta Ads                  | `marketing` |
| `performance.html`  | VSL / Funnel Performance  | `marketing`, `sales`, `sales_manager` |
| `income.html`       | Income                    | `finance` |
| `calls.html`        | Calls                     | `calls`, `sales_manager`, `rep` |
| `declarations.html` | Declarations              | `rep`, `sales_manager` |

`is_admin: true` overrides every check.

**Role definitions and the access matrix live in `permissions.js` — that is
the single source of truth.** Don't duplicate the logic anywhere else.

---

## Shared scripts (loaded on every dashboard)

| File | What it does | Load order |
|---|---|---|
| `permissions.js` | Single source of truth for RBAC. Exposes `window.RidleyPerms`. | HEAD, after supabase-js |
| `access-guard.js` | Page-level redirects + picker filtering | end of body |
| `loading-states.js` | Skeleton placeholders on `.kpi-value`, `.kpi-sub` | end of body |
| `pwa.js` | Service-worker registration, version-check reload, iOS install hint | end of body |
| `theme.js` | Light / Dark / Auto theme cycle | end of body |
| `changelog.js` | "What's new" modal | end of body |
| `ux.js` | Pull-to-refresh, haptics, KPI tooltips, impersonation banner | end of body |
| `filters.js` | Cross-page persistence: date range, rep selector, product tab | end of body |
| `nav-menu.js` | Renders the dashboard picker dropdown | end of body |
| `forgot-password.js` | "Forgot password?" link in login | end of body |

**Always load `permissions.js` in `<head>` (after supabase-js) so inline
page scripts can use `window.RidleyPerms` at parse time.** Loading it at end
of body breaks pages.

`mobile.css` is the shared stylesheet — topbar uniformity, skeleton CSS,
mobile breakpoints, PWA-standalone hide rules. Edit this for any
cross-page CSS change.

---

## The permission system (read this carefully)

### Where it's stored

In Supabase: `auth.users.raw_app_meta_data`, e.g.

```json
{ "is_admin": false, "permissions": ["sales", "calls"] }
```

This field is **only writable by the service role**, so users can't
escalate themselves.

### Available roles

`sales`, `marketing`, `finance`, `calls`, `rep`, `sales_manager`

Plus the boolean `is_admin: true` which is a separate, all-overriding flag.

### The single source of truth

`permissions.js` defines:

```js
const PAGES = [
  { href: 'home.html',         id: null,           roles: '*' },
  { href: 'index.html',        id: 'sales',        roles: ['sales','sales_manager'] },
  { href: 'meta-ads.html',     id: 'meta',         roles: ['marketing'] },
  { href: 'performance.html',  id: 'performance',  roles: ['marketing','sales','sales_manager'] },
  { href: 'income.html',       id: 'income',       roles: ['finance'] },
  { href: 'calls.html',        id: 'calls',        roles: ['calls','sales_manager','rep'] },
  { href: 'declarations.html', id: 'declarations', roles: ['rep','sales_manager'] },
];
```

It exposes:

- `RidleyPerms.canOpen(href, user)` — boolean, used for redirects + nav filter
- `RidleyPerms.effective(user)` — `{ is_admin, permissions, email, impersonated }`
- `RidleyPerms.AVAILABLE_PERMS` — list shown in the admin permission picker

### Adding / changing a role

1. **Edit `permissions.js` only.** Add the role to `AVAILABLE_PERMS` and to
   any page's `roles` array.
2. Don't edit per-page guards. They all call `RidleyPerms.canOpen()`.
3. The admin permission picker auto-updates from `AVAILABLE_PERMS`.

### Impersonation

Admins can "View as" any user from the home admin Users panel. This stores
`{id, email, is_admin, permissions}` in `localStorage` under `impersonate-user`.

`RidleyPerms.effective(user)` transparently honours this, so all UI
permission checks reflect the impersonated user. **The JWT is unchanged**,
so server-side queries still return admin-visible data — impersonation is
UI-only and good for previewing menu visibility / page redirects, not for
testing data filtering.

---

## Persisted state (localStorage keys)

| Key | Set by | Notes |
|---|---|---|
| `theme` | theme.js | `light` / `dark` / `auto` |
| `app-version` | pwa.js | last seen `version.txt` value |
| `changelog-seen` | changelog.js | last acknowledged release |
| `impersonate-user` | home.html / ux.js | `{id,email,is_admin,permissions}` |
| `pwa-ios-hint-shown-v4` | pwa.js | iOS install hint shown once |
| `pwa-standalone` (class on `<html>`) | pwa.js | runtime flag, hides install UI |
| `ridley:dateRange:v2` | filters.js | `{preset}` or `{from,to}` |
| `ridley:filter:calls:rep` | filters.js | rep selector value |
| `ridley:filter:declarations:rep` | filters.js | rep filter value |
| `ridley:filter:income:product` | filters.js | active product tab |
| `ridley:income:monthlyTarget` | income.html | forecast zone target |

Don't introduce new keys without prefixing them `ridley:` so they're easy
to clear in bulk later.

---

## Date pickers — the gotcha

Six dashboards use `.dr-preset[data-preset="last-30"]` with `drApplyPreset(...)`.
Declarations uses `.dr-preset-item[data-p="last30"]` with `applyPreset(...)`.

**`filters.js` works on both** by event-delegating button clicks and looking
up either selector when restoring. Don't try to wrap `drApplyPreset` — that
silently no-ops on declarations.

Restoration happens BEFORE auth resolves, so the click triggers the page's
own handler whose `if (currentSession) loadData()` no-ops, and the eventual
`onAuthed()` fires `loadData()` once with the restored preset already
active. **Do not break that timing**, it prevents a double-fetch race that
caused mismatched data on Calls.

Default preset is **This Week (Thu–Wed)** on every dashboard.

---

## Release process (DO NOT SKIP)

Every change needs five things, in this order:

1. **Read `CLAUDE.md` and the relevant section of this file** before
   touching code. The pitfalls list at the bottom exists because each
   one was a real bug.
2. **Code changes** — edit the relevant files.
3. **Bump `version.txt`** — format `YYYY-MM-DDTHH:MM:SSZ-v<N>-<short-slug>`.
   This triggers the PWA cache-bust on next launch. Pick a new `v<N>`
   greater than the last one.
4. **Add an entry to `changelog.js`** at the top of the `ENTRIES` array.
   The version field must be unique. Tag entries by audience:
   - omit `roles` → everyone
   - `roles: ['finance']` → only users with that role (or admin)
   - `adminOnly: true` → only admins
   Split a release into multiple entries if different parts target
   different audiences (see v50a/v50b).
5. **Commit + push** to `main`. Three things happen automatically:
   - Cloudflare deploys in ~30s
   - The PWA detects the new version and force-reloads
   - The git `post-commit` hook re-runs AST extraction on changed `.js`
     files and rebuilds `graphify-out/graph.json` + `GRAPH_REPORT.md`

If you skip step 4, users won't be told what changed.

If you skip step 3, the PWA serves stale cached assets and users see old
behaviour. The `version.txt` mismatch is the only thing that triggers
`nuclearVersionCheck()` in `pwa.js` to purge caches.

### Updating the graph manually

The post-commit hook covers code-only changes. For doc / HTML / image
changes (or to refresh the Obsidian vault and wiki), run from the repo:

```
/graphify /tmp/dashboards --update
```

Then if the Obsidian vault layout changed, regenerate it:

```
$(cat graphify-out/.graphify_python) -c "..."  # see ARCHITECTURE notes
```

The vault is at `/Users/help/Documents/Obsidian/RidleyDashboards/`.

---

## Adding a new dashboard

1. Create `<name>.html`. Copy `meta-ads.html` as template — it's the
   simplest dashboard with the right topbar layout and shared script
   loads.
2. Add the page to `permissions.js` `PAGES` array with required roles.
3. Add a board card to the `BOARDS` array in `home.html`.
4. Add a picker entry to `nav-menu.js` `ITEMS` array.
5. Add an `apple-mobile-web-app-title` meta tag (= "Ridleyacademy" on
   every page).
6. Update `version.txt` and `changelog.js` per the release process above.

**Don't put a `<script>` permission check inline.** Just call
`window.RidleyPerms.canOpen('<name>.html', session.user)` in your
`onAuthed()`.

---

## Topbar uniformity (the user cares about this a lot)

Every dashboard topbar must look identical: logo, brand title, then on a
**second line** the buttons in this exact order — daterange, refresh,
theme, picker, user pill, sign-out.

The CSS that enforces this lives in `mobile.css`:
- `.topbar { flex-wrap: wrap; }`
- `.topbar-brand { width: calc(100% - 60px) !important; }` forces row break
- Button `order` properties: daterange(10) refresh(20) theme(30) picker(40) user-pill(50) signout(60)

If buttons start moving across pages, you broke this. Don't override
`order` or `flex-shrink` on any topbar button without thinking.

---

## Service worker + version check

`sw.js` does network-first for HTML, stale-while-revalidate for assets,
and **explicitly excludes `/version.txt`** from caching. That exclusion is
load-bearing — the version check fetches `/version.txt` with
`cache: 'no-store'` AND a query string AND the SW skips it.

`pwa.js` runs `nuclearVersionCheck()` on visibility-change and ~3s after
load. If the remote `version.txt` differs from `localStorage.app-version`,
it purges all caches, unregisters SWs, and hard-reloads with a cache-busting
query string.

**Reloads are deferred while a modal is open** (`window.__changelogModalOpen`).
Don't race the user's reading.

---

## PWA install on iOS

iOS doesn't expose Add-to-Home-Screen via any web API. The closest you can
do is point the user at Safari's Share button. This is honest scope —
don't promise "one-tap install" on iOS, it doesn't exist.

The install hint:
- Auto-shows once per device on iOS Safari (NOT iOS Chrome/Firefox — those
  can't install PWAs at all)
- Hidden in standalone mode (already-installed)
- Bottom-right of the screen with bouncing arrow toward Safari's `⋯` button
- Hint key is `pwa-ios-hint-shown-v4`. Bump it if you change the hint text
  so existing users see the new copy.
- App's home-screen name is **"Ridleyacademy"** (set in `manifest.json`
  AND every page's `<meta name="apple-mobile-web-app-title">`).

---

## Common pitfalls

1. **Don't load `permissions.js` at end of body.** Inline scripts in `<body>`
   need `window.RidleyPerms` defined at parse time. Always load it in
   `<head>` after supabase-js.
2. **Don't use `position: fixed` for popovers inside the topbar or any
   ancestor with `transform` / `backdrop-filter`.** Those create new
   containing blocks and reframe `position: fixed` to the ancestor instead
   of the viewport. The `.perm-select-menu` works around this by **portaling
   itself to `document.body` on first open**. Apply the same pattern for any
   new popover.
3. **Don't add new "fetch failed" alerts.** Use inline contextual messages
   with retry buttons.
4. **Don't write a permission check in HTML.** Always go through
   `RidleyPerms.canOpen()`.
5. **Don't access `session.user.app_metadata` directly for UI decisions.**
   Use `RidleyPerms.effective(session.user)` so impersonation works.
6. **iOS Safari does not expose `navigator.vibrate`**. Haptics in `ux.js`
   work on Android only; on iOS they silently no-op. Don't rely on them
   for important UX feedback.
7. **`navigator.share()` on iOS does NOT include "Add to Home Screen"**.
   It's only third-party share targets. Don't use it as a PWA install path.

---

## Calls dashboard sales attribution (read before touching the calls fn)

The `calls` edge function aggregates sales from **two sources** for Gross
Income and the Overall Revenue leaderboard. Don't break this:

1. **Sales Log via Affiliate match.** Each `Sales Log` row whose
   `Affiliate` is in some rep's `rep_mappings.sales_affiliates[]` is
   attributed to that rep. This is the primary path.
2. **Verified declarations as fallback (v13+).** For each row in
   `sales_declarations` with `sales_check = 'Yes'` whose underlying sale
   was NOT already attributed via path 1, the GI is credited to the
   declaring rep (`rep_name`).

Dedup key is `${date}|${email}|${price}`. Path 1 populates a
`matchedSaleKeys` set; path 2 skips anything already in it. This means
**a sale is counted once**, regardless of which path catches it.

Why two paths? Some Sales Log rows arrive without an `Affiliate` value, or
with one that isn't in any rep's affiliate list. Those sales are real but
the system can't auto-attribute them. The rep declares the sale, an admin
verifies it (`sales_check = 'Yes'` — set automatically by the
`declarations` function when email + date + price match exactly), and the
calls function picks it up via path 2.

Each rep's stats include `declarationCredits` (count) and
`declarationCreditsGI` (€) so the UI can show how much of a rep's GI
came from declarations vs the affiliate path.

**Rebills are excluded** in both paths. Don't add them.

If you change the dedup key or the date filter for declarations, audit
both paths together — they have to use the same key shape and the same
date semantics or you'll get double-counts or gaps.

## Sales dashboard GI attribution (read before touching get_daily_stats)

The Sales Dashboard's daily GI comes from the SQL function
`public.get_daily_stats` (in Supabase, called by the `dashboard` edge
function via `?api=data`). Two-path attribution like the Calls function,
but along a different dimension:

1. **Lead-cohort path:** For each VSL lead in the date range, all Sales
   Log rows with the same email count toward GI on the lead's cohort
   day. Affiliate is NOT considered here.
2. **Declared-extra path (v2 migration):** Verified declarations
   (`sales_check = 'Yes'`) whose buyer email is **not** in the VSL lead
   cohort get credited to the GI on `date_closed`. Dedupe key is
   `(date_closed, lower(trim(email)), sale_amount)`.

Why two paths? Some sales come from buyers who never went through the
VSL funnel (direct purchases, manual closes), so their email isn't in
`VSL leads data`. The lead-cohort path can't see them. Verified
declarations fill that gap.

Important constraints to preserve in any future change:

- **Dedup is by email**, not by Sales Log id. The lead-cohort path joins
  by email; the declared-extra path uses NOT EXISTS in `lead_cohort`.
  Keep these consistent.
- **Rebills excluded** in the declared-extra path (already excluded by
  the lead-centric path's nature — there's nothing to refund credit for
  a rebill).
- **Funnel filter blocks declared-extra** entirely. Declarations have no
  funnel attribution, so when a user filters by Funnel = "Artistic",
  including funnel-agnostic declarations would skew the metric.
- **Final SELECT uses `all_dates` UNION** (per_day_agg ∪ gi_agg ∪
  closes_agg) instead of joining only off `per_day_agg`. This is needed
  so dates that have ONLY declared GI (no leads) still appear in the
  output. Don't revert to `from per_day_agg`.

If you regenerate the function, base it on the migration
`get_daily_stats_v2_credit_verified_declarations` — that's the canonical
form.

## Edge function conventions

All edge functions:
1. Verify JWT via `supabase.auth.getUser()`
2. Read the user's `app_metadata` from the JWT (no extra DB call)
3. Check `is_admin` and/or required permission
4. Use `Deno.env.get(...)` for any secret (Meta token, service role key, etc.)
5. Return JSON with `Access-Control-Allow-Origin: *`

Edge function source-of-truth lives in the Supabase dashboard, not this
repo. Track changes in `changelog.js` like normal.

---

## When in doubt

Ask the user. They prefer being asked over a wrong fix. Things they
particularly care about, based on past sessions:

- **Topbar buttons must not move across dashboards.** Repeat offender.
- **Mobile experience parity** with desktop — same features on iOS PWA.
- **Honest scope** — say "iOS doesn't allow this" instead of inventing a
  workaround that won't work.
- **Single source of truth** — they explicitly asked for the perm system
  to be centralised after seeing duplicated logic.
- **Don't promise behaviour you can't verify.** They will catch it.
