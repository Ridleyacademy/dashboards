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
| `students.html`     | Mentorship CRM            | `mentorship`, `sales_manager` |

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

`sales`, `marketing`, `finance`, `calls`, `rep`, `sales_manager`, `mentorship`

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

### Init-time preset restoration (v57+)

Each page's first `drApplyPreset(...)` (or `applyPreset(...)` on
declarations) **reads `localStorage['ridley:dateRange:v2']` directly**
to decide which preset to apply. This avoids the race where filters.js
firing a button click after the page's `onAuthed → loadData()` could
result in two competing fetches and the wrong response winning.

If you add a new dashboard, follow this pattern at the top of the
date-picker init:

```js
(function(){
  var __p = 'this-week';
  try {
    var __s = JSON.parse(localStorage.getItem('ridley:dateRange:v2') || 'null');
    if (__s && __s.preset && ['this-week','last-week','mtd','last-30'].indexOf(__s.preset) >= 0) __p = __s.preset;
  } catch (_) {}
  drApplyPreset(__p, false);
})();
```

Don't replace the body with a single `drApplyPreset(saved, false)` —
unknown saved values must fall back to `this-week` (e.g. `'all'` is only
valid on declarations). Keep the whitelist.

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

## Topbar uniformity (the user cares about this a lot, repeat offender)

Every dashboard topbar must look identical: logo, brand title, then on a
**second line** the buttons in this exact order — daterange, refresh,
theme, picker, user pill, sign-out.

The CSS that enforces this lives in `mobile.css`:
- `.topbar { flex-wrap: wrap; }`
- `.topbar-brand { width: calc(100% - 60px) !important; }` forces row break
- Button `order` properties: daterange(10) refresh(20) theme(30) picker(40) user-pill(50) signout(60)

If buttons start moving across pages, you broke this. Don't override
`order` or `flex-shrink` on any topbar button without thinking.

**Logo + user-pill avatar gradient must be identical on every page**
(v76+). The unified gradient is enforced in `mobile.css`:
```css
.topbar-logo, .user-pill-av {
  background: linear-gradient(135deg, #6b9eff, #a78bfa) !important;
}
```
Don't add a per-page `background:` override on either of these
selectors — your override will lose to the `!important` and the user
will get annoyed (again) that the new dashboard has a different
header.

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

### "New sales only" rule (v15+)

GI and the Overall Revenue leaderboard count **new sales only**:

- **Sales Log Status**: exclude `'Rebill'`. **Keep** `'Cash'`, `'PP'`, and
  null/empty (treated as new sales). This is in `EXCLUDED_SALE_STATUSES`.
- **Declaration `type`**: exclude `'Rebill'`. Keep `'Sale'` and `'PP'`.
  This is in `EXCLUDED_DECL_TYPES`.

The user's decision: **PP installments count as new sales** for the GI /
leaderboard. Don't second-guess this — it was a deliberate call. If
they later want PP excluded, just add `'PP'` to both Sets.

Mirror constraints in the Sales Dashboard SQL (`get_daily_stats`):
- `lead_sales` and `lead_first_close` filter
  `coalesce(trim(s."Status"), '') <> 'Rebill'`
- `declared_extra` filters `coalesce(trim(sd.type), '') <> 'Rebill'`

## Sales-check Maybe rules (v13 of declarations fn)

The `declarations` fn computes `sales_check` ('Yes' / 'Maybe' / 'No' /
'Pending') for every declaration on the fly when `?api=log` is called.
Maybe is now used for two distinct cases:

1. **Near match** — email matches a Sales Log row but date or price are
   off (within 3 days / $5). Reason format: `Closest sale: …`.
2. **Type mismatch** — email + date + price are an EXACT match but the
   declaration's `type` field doesn't match the Sales Log Status's
   derived type (`Cash`/null → `Sale`, `PP` → `PP`, `Rebill` → `Rebill`).
   Reason: `Type mismatch: declared as X but sale was Y (status=Z)`.

If a declaration has no `type` set, type-mismatch detection is skipped
(no false positives on legacy data).

3. **Cross-rep duplicate** (v13+) — when 2+ declarations share
   `(date_closed, lower(email), sale_amount)` (i.e. multiple reps claim
   the same sale), the **earliest by `created_at`** keeps its check
   unchanged but gets a side-note `Also declared by X (this is the
   earliest entry)`. **Every later claim** is downgraded to `Maybe`
   with reason `Duplicate declaration: also declared by X (earlier
   entry kept as the original)`. Reasons compose with type-mismatch
   when both apply, separated by ` · `. The response also carries
   `duplicate_count` per row.

The auto-assign preview surfaces a parallel signal: each preview item
carries `salesLogDuplicate: boolean` true if another Sales Log row in
the scan range has the same `(date, lower(email), price)`. The modal
flags those rows, leaves them **unchecked by default in the auto-matched
section**, and shows a count in the header. Skipped if it's two
unrelated buyers paying the same amount on the same day — they'll
share the key but it's still worth a manual look.

`buildSalesIndex` now stores Status alongside Date/Email/Price so
`evaluate()` can do the comparison without a second query.

`computeSingleCheck()` (used on insert/update so the dashboard can
echo the new check immediately) takes an optional `declType` parameter
and applies the same rule.

## Bulk auto-assign from Sales Log (v10 of declarations fn)

Two-step preview/commit flow with three endpoints, all **admin only**:

- `POST /declarations?api=auto-assign-preview&from=…&to=…[&rep=…][&product=…]`
  Scans Sales Log in scope. Returns:
  - `autoMatched: [...]` — sales whose `Affiliate` maps to a rep AND no
    matching declaration exists. Each item carries `suggestedRep`. The
    UI pre-checks these.
  - `unmapped: [...]` — sales without a rep-mapped affiliate. Each item
    carries `existingRep` (null, or the rep that has already declared
    the same email+date+amount under another rep). The UI surfaces
    these for manual rep assignment.
  - `alreadyDeclared: [...]` — sales whose declaration already exists
    (under the auto-matched rep, or under wantRep if filter active).
    Each carries `existingDeclId`, `existingRep`, `existingType`,
    `existingCheck`, and `typeMismatch` (true when Sales Log Status's
    derived type ≠ existing decl's type — e.g. Status='PP' but decl
    type='Rebill'). The UI shows a collapsed read-only section, and
    auto-expands when any mismatches exist.
  - `allReps: [...]` — full list of `rep_mappings.calls_name` for the
    manual-assign dropdown.
  - `skippedMissing` — count of sales skipped for missing required fields.
- `POST /declarations?api=auto-assign-commit` body:
  `{ assignments: [{ rep_name, date, email, name, product, price, status, platform, source }] }`
  Inserts each assignment with the standard dedup check
  `(rep_name, date_closed, sale_amount, lower(email))`. Source is
  either `'matched'` or `'manual'`; the latter sets a different note
  string `'Auto-assigned by admin from Sales Log (manual rep selection)'`
  so the audit log can tell apart.
- `POST /declarations?api=auto-assign` (legacy) — kept for backward
  compat. Equivalent to preview + commit on autoMatched only. Skips
  unmapped sales without surfacing them.

The Declarations dashboard's button now uses preview → modal → commit.
Don't revert it back to a one-shot confirm.

- Honours optional `rep` (matched against `rep_mappings.calls_name`) and
  `product` (exact `Sales Log.Product` match) filters.
- Same dedup key + skip rules as the per-row auto-create in the income
  function: rep_name + date + amount + email; missing email/date/price
  excluded; unmapped affiliates excluded. **Rebills ARE included** (v9+):
  they get a `type='Rebill'` declaration. Safe because the calls
  aggregation excludes `type=Rebill` from GI/leaderboard server-side.
- Note: `'Auto-assigned by admin from Sales Log'` (different from the
  income fn's `'Auto-created by system from Sales Log (verified
  affiliate match)'` so admins can tell apart batch vs per-row inserts
  in the audit log).
- Each batch is logged via `activity_log` with action
  `declaration.auto_assign` and full counts + 10 sample inserts.
- The declarations dashboard's button only appears when `is_admin`.

## Income edits auto-create rep declarations (v9 of income fn)

When the Income dashboard updates or inserts a Sales Log row, the
`income` edge function checks if the row's `Affiliate` matches a rep
via `rep_mappings.sales_affiliates`. If so, AND no matching declaration
exists yet for that rep+date+amount+email, it inserts a verified
declaration on the rep's behalf:

```ts
{
  rep_name:    <looked up from affiliate>,
  date_closed: sale.Date.slice(0, 10),
  email:       sale.Email,
  sale_amount: sale.Price,
  product:     sale.Product,
  type:        statusToDeclType(sale.Status),  // Cash→Sale, PP→PP, Rebill→Rebill
  sales_check: 'Yes',
  note:        'Auto-created by system from Sales Log (verified affiliate match)',
  user_id:     null,
}
```

Skipped when:
- Affiliate is empty or unmapped
- Email / Date / Price missing
- A declaration already exists matching `(rep_name, date_closed, sale_amount, email)`

Rebills ARE included (v10+) — they get `type='Rebill'` declarations.
Safe because the calls aggregation already excludes `type=Rebill` from
GI/leaderboard.

Errors during the declaration insert are caught and **never fail the
outer Sales Log update**. The income function returns
`{ ok: true, declarationCreated, declarationReason }` so the client can
verify what happened. The note string is the canonical marker for
auto-created declarations — keep it stable so admins can filter the
audit log by it.

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
`get_daily_stats_v3_exclude_rebills_only` — that's the canonical form.
It enforces both the verified-declaration credit AND the new-sales-only
filter (Rebill excluded; PP kept).

## Auth flow checklist (every page that has a login form)

When adding/touching auth on any dashboard page, ensure ALL of these are
present. They prevent the "stuck on the spinner forever" class of bugs:

1. **Detect invite/recovery from BOTH hash and query**:
   ```js
   const _hashParams  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
   const _queryParams = new URLSearchParams(window.location.search);
   const _type = _hashParams.get('type') || _queryParams.get('type') || '';
   const isInviteLink   = _type === 'invite' || _type === 'signup';
   const isRecoveryLink = _type === 'recovery';
   ```
   Hash-only detection misses PKCE invites (`?code=…&type=invite`).

2. **8-second safety net** on the loading state, **12-second** on
   set-password. If the state hasn't advanced past `loading`, force
   `login`:
   ```js
   const _safety = setTimeout(() => {
     if (document.body.dataset.state === 'loading') setState('login');
   }, 8000);
   ```

3. **Try/catch around `await supa.auth.getSession()`**. Clear the safety
   timer in both `try` and `catch`. The function can throw if the local
   session token is malformed (rare but real).

4. **Set-password form** if the page is part of the invite-redirect
   chain. Currently `home.html` and `index.html` have one. Submit handler
   calls `supa.auth.updateUser({ password })` then `onAuthed(session)`.

5. **`onAuthStateChange` registered AFTER the safety net** — fires on
   every refresh + the initial token exchange — so the page recovers if
   getSession resolved to null but a session shows up later via PKCE.

The invite edge function's `redirectTo` is `https://ridleyacademy.team/home`
(NOT `/`). Going to `/` would land on `index.html` (Sales dashboard) —
if the invitee can't open Sales, they'd hit "denied" right after
setting their password. Home is universal.

## Invite + set-password flow (v70+)

Supabase invite emails redirect to `https://ridleyacademy.team/home`
with one of two URL formats depending on the Supabase server's flow
type:

- **Legacy implicit:** `/home#access_token=…&refresh_token=…&type=invite`
- **Newer PKCE:**      `/home?code=…&type=invite`

`home.html` (and `index.html` as a fallback) detect invite/recovery
from **both** hash and query:

```js
const _hashParams  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const _queryParams = new URLSearchParams(window.location.search);
const _type = _hashParams.get('type') || _queryParams.get('type') || '';
const isInviteLink   = _type === 'invite' || _type === 'signup';
const isRecoveryLink = _type === 'recovery';
```

When detected, `setState('set-password')` immediately. `supabase-js`
finishes the PKCE/implicit token exchange asynchronously; on success
`onAuthStateChange` fires with the new session. The set-password form
remains visible until the user submits — the form's submit handler
calls `supa.auth.updateUser({ password })` then `onAuthed(session)`.

Both pages have a 12s safety net so the boot screen never hangs
forever.

The invite edge function's `redirectTo` is `https://ridleyacademy.team/home`
(NOT `/`). Going to `/` would land on `index.html` (Sales dashboard) —
if the invitee can't open Sales, they'd hit "denied" right after
setting their password. Home is universal.

If you change the redirect URL, update the Supabase Auth settings'
allowed redirect URLs list to include the new path.

## Audit log + sessions (v13 of admin-api fn)

**`?api=activity` (admin only, GET)** now supports server-side filters:
`actor` (substring match on `actor_email`), `action` (exact),
`target` (substring of `target_type` / `target_id`), `from`/`to`
(`YYYY-MM-DD`, applied to `ts`), `q` (free-text across actor_email +
target + action + target_type), and `limit` (default 200, max 500).
The home admin panel's filter inputs send these directly — don't move
the filtering back to the client; the table can be huge.

**`?api=sessions` (admin only, GET)** lists every user with their
presence state. Returns `{ rows: [{ id, email, is_admin, permissions,
last_sign_in_at, created_at, last_seen, user_agent, is_live }],
liveCount, generated_at }`. Sorted live-first, then by most recent
presence.

**Presence is heartbeat-driven.** Every dashboard page calls
`public.touch_user_presence()` every ~60s while visible (in `ux.js`).
The RPC upserts the caller's row in `public.user_presence` setting
`last_seen = now()`. The sessions endpoint joins this — `is_live` is
true when `last_seen` is within 90s. This is a **real** signal (not a
heuristic on `last_sign_in_at`).

Tradeoffs / gotchas:
- A user who closes the tab without signing out stops pinging; within
  90s they drop off the live list.
- A user with a stale tab they never open won't show as live — correct.
- Heartbeat fires on visibility change too, so just switching back to
  the tab updates presence immediately.
- `force-logout` deletes the user's presence row so they drop off live
  instantly (in addition to revoking refresh tokens).
- The Sessions tab UI auto-refreshes every 30s while it's the active
  admin tab.

**`?api=force-logout` (admin only, POST `{ userId }`)** calls the
Postgres function `public.force_logout_user(uuid)` which deletes the
user's rows from `auth.refresh_tokens`. Honest scope: their existing
**access token** stays valid until expiry (~1 h). They can't get a new
one, so the app boots them within the hour, sooner if they reload.
For an immediate kick, you'd need server-side JWT-blacklist machinery
that doesn't exist here today.

The Postgres function is `SECURITY DEFINER` and only `service_role`
has `EXECUTE` on it. The edge function reaches it via `supa.rpc()`.

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
