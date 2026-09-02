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
  `calls`, `income`, `declarations`, `invite`, `admin-api`, `students`
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
| `students.html`     | Mentorship CRM            | `mentorship`, `sales_manager`, `coach` |
| `org-board.html`    | Org Board                 | anyone signed in (`roles:'*'`; edit gated by `org.*` keys) |
| `targets.html`      | Targets (tasks)           | anyone signed in (`roles:'*'`) |
| `webinars.html`     | Webinar Registrations     | `marketing`, `sales_manager`, `mentorship` (granular `webinars.view`) |

> This table is a curated subset, not exhaustive — other registered pages
> (`weekly-stats.html`, `messages.html`, `refunds.html`, `support.html`,
> `subscriptions.html`, `collections.html`, `daily-reports.html`, `coach.html`,
> `ms-alerts.html`, …) exist too. `permissions.js` `PAGES` is the real list.

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

`sales`, `marketing`, `finance`, `calls`, `rep`, `sales_manager`, `mentorship`, `coach`

Plus the boolean `is_admin: true` which is a separate, all-overriding flag.

The `coach` permission (v94+) gates Mentorship CRM access for individual
coaches AND drives the Coach picker in students.html (users tagged with
`coach` show up in the dropdown). The students edge fn's `?api=coaches`
returns this list.

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
  { href: 'students.html',     id: 'students',     roles: ['mentorship','sales_manager','coach'] },
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

## Button icons / emoji (the user cares about this — do not use random emoji)

Every button glyph must be a **restrained, monochrome line/symbol** that
literally depicts the action, in the same family as the ones already in the
UI. Look at the neighbouring buttons and match their style before you pick.
The established vocabulary (reuse these; don't invent lookalikes):

- ⚠ alert · ↪ turn-over / hand-off · ✆ contact / call · ▤ overview / grid
- 📋 logs · ＋ add / new · ✎ edit · ⇄ reassign · ⇉ bulk / apply-to-many · ✓ done / resolved

**Never use decorative or "energy/flair" emoji** — no ⚡, 🔥, 🚀, ✨, 🎉, 💥,
🎯, or similar. They read as toy-like and clash with the rest of the system.
(⚡ slipped into two older Declarations changelog entries and the first cut of
the Masterclass "Bulk actions" button — the button was corrected to ⇉ in v477;
the historical changelog lines are left as-is since they're a frozen log.)

If no existing glyph fits, pick a plain Unicode symbol/arrow that shows the
*action*, keep it monochrome, and prefer the same weight as its neighbours —
never a full-color pictographic emoji.

---

## Masterclass CRM — CSV re-import & engagement tracking (v481+)

The "Import CSV" button (Queues bar, edit-gated) re-uploads the Kajabi export to
keep the CRM current. Flow: browser parses the file (semicolon-delimited,
windows-1252, **day-first `DD/MM/YYYY HH:MM` dates** → ISO), maps columns to
normalized rows, and POSTs to `masterclass?api=import` in 500-row batches. The
endpoint calls the guarded `mc_import_batch(_rows jsonb)` RPC (SECURITY DEFINER,
service_role only) which merges **set-based, matched on `lower(email)`**:

- **Enrich, never replace.** Activity (`last_activity_at`, `last_sign_in_at`,
  `sign_in_count`) is refreshed via `greatest(...)`; other CSV fields only fill
  blanks; tags/products are **unioned**. CRM-owned fields (rep, status,
  dead_file/verified, notes) are never touched. New emails are inserted.
- **`started_at`** (a "Masterclass Starter") is stamped only on the
  **no-activity → activity transition**, so the ~27,944 already-active students
  are never counted (their start predates tracking) and only newly-active
  students register going forward. Do NOT backfill `started_at` from historical
  `last_activity_at` — that would flood the stat.
- **Week = current Thu–Wed** (`weekStartDate()`), matching weekly-stats. Overview
  exposes `starters_total` / `started_week` / `active_week`; list `view=starters`
  and `view=active` filter to them.

The email index (`mc_students_email_idx`) is **non-unique** (known duplicates),
so the RPC updates all rows sharing an email. Migrations:
`masterclass_started_at`, `masterclass_import_batch_rpc`.

**Light re-imports (diff, v483+).** Kajabi always dumps all ~28k rows, so the
client first GETs `masterclass?api=activity-index` — a compact
`{ lower(email): "sign_in_count|last_activity_ms|last_sign_in_ms" }` map — and
uploads only rows that are **new** (email absent) or **changed** (signature
differs). The client `rowSig()` must stay byte-identical to the server's index
format (epoch ms via `Date.parse`; empty string when a date is absent), or
unchanged rows stop matching and get needlessly re-sent. If the index fetch
fails, the client falls back to sending everything.

**Parse guards (v485+).** Some Kajabi rows carry free-text survey answers
(custom_5/6/7) with embedded line breaks/quotes that desync the column split.
Two guards keep garbage out: `parseCsv` drops any record whose field count ≠
header count (`malformed`), and `normalizeCsvRow` requires a valid email
(`EMAIL_RE`) — a misaligned row lands a name in the email cell and is rejected.
Skipped rows are surfaced in the preview ("skipped (no/invalid email or
unparseable)"). Affected students are almost always already present under their
correct row, so skipping loses nothing. (A v484 import created 23 such junk rows
— name-in-email, email-in-phone — which were deleted; they were the only
invalid-email rows in the table.)

---

## Masterclass CRM — weekly stats history (v487+)

`masterclass_stats_weekly` (one row per Thu–Wed `week_start`, ~52/yr) retains the
Overview metrics over time so the snapshot-overwrite model (activity stored as
current columns, not per-week history) doesn't lose the past. Populated by
`mc_snapshot_week(_week date default current-week)` — SECURITY DEFINER,
service_role only — which **upserts the current week only** (past weeks freeze
once they pass; we never recompute them since `last_activity_at` is overwritten).
Triggers: the `masterclass?api=snapshot-week` POST called by the client right
after a CSV import, plus a daily `pg_cron` job `mc-weekly-snapshot` (06:30 UTC).
Read via `?api=stats-history` (GET); shown as the "Weekly history" table in the
Overview pane. Migration: `masterclass_stats_weekly`.

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

**Rebills are excluded from GI** in both paths — never add them to `grossIncome`
or the product buckets. As of v57 they ARE tallied into a separate per-rep
`rebill` bucket + `overall.totalGiRebill`/`totalSalesRebill` purely for display
(the "Rebills" KPI box on the Sales Reps page); the new-sales GI stays
rebill-free. The product breakdown reconciles as
Experience (`nashville` bucket) matches **multiple product names** via
`EXPERIENCE_PRODUCTS` (`'A Luxury Music Retreat in Nashville'` + `'CW Experience'`) —
add new Experience SKUs there. Most Experience sales are phone-sold with a blank
Affiliate, so they only count once a rep declares them and the declaration is
verified (`sales_check='Yes'`); unverified/`No`/`Maybe` declarations are excluded.
GI = masterclass + mentorship + nashville + **other** (the `other` bucket —
non-PMC/MS/Experience products — was the reason the old breakdown didn't sum to
the total; the UI now shows an "Other" chip). The page (calls.html) is titled
**"Sales Reps"** (the `calls` id/permission/route are unchanged).

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

## First-name + activation gate (v95+)

Every authenticated user must have `user_metadata.first_name` set before
they can reach any dashboard. `home.html`'s `onAuthed()` enforces this —
if first_name is missing it bumps the user to the Activate Account screen
and refuses to render the app.

Two modes on that screen:

- **New invitee (activated ≠ true):** first name + new password + confirm.
  Submit writes `{ password, data: { first_name, activated: true } }`.
- **Legacy user (activated = true but first_name missing):** first-name-only.
  Password fields are hidden, only `first_name` is written. No password reset.

The legacy/new distinction is `user_metadata.activated === true`.
**Don't fall back to `last_sign_in_at` for this** — Supabase sets
`last_sign_in_at` the moment a magic-link is clicked, so a brand-new
invitee already has it set. Using it caused new invitees to see the
legacy (no-password) flow and bypass password creation. The fix in v96
was the explicit `activated` flag plus a one-shot SQL backfill setting
`activated = true` for every existing user with non-null
`last_sign_in_at`.

The invite edge function (`invite` v14+) accepts an optional
`first_name` field which seeds `user_metadata` before the user activates,
so it's pre-filled on the Activate screen. The admin-api `?api=users` /
`?api=set-permissions` (v16+) also read/write `first_name` so admins
can edit it from the Manage Users panel.

## Mentorship CRM (students.html + students edge fn)

A standalone CRM for the Super Mentorship program. Models the original
"SUPER MENTORSHIP ROUTING FORM" Google Sheet plus the per-coach working
tracker. Lives at `/students.html` and is gated by `mentorship`,
`sales_manager`, or `coach` permission (or admin).

### Tables

| Table | Notes |
|---|---|
| `mentorship_students` | One row per student. ~40 columns covering identity, purchase, onboarding, coach progress, lifecycle, and admin fields. RLS on, service-role-only access. |
| `mentorship_pauses` | Multiple pauses per student. `(start_date, end_date?)` — null end_date means ongoing. CHECK end_date >= start_date. CASCADE on student delete. |
| `mentorship_resigns` | Resigns add months to course duration. `(resign_date, months_added > 0, amount?, notes)`. |
| `mentorship_alerts` | Service alerts. Open/resolved with `resolution_note`, `resolved_by`, `resolved_at`. |
| `mentorship_wins` | Per-student wins log. `(text, win_date?, created_by, created_by_email)`. |
| `mentorship_coach_notes` | Coach session notes. Same shape as wins. |
| `mentorship_rep_notes` | Notes from REGs / sales reps. Migrated from old `kat_notes` + `reg_notes` columns on first deploy. |
| `mentorship_ic_notes` | Initial-call notes. |
| `mentorship_turnovers` | Hand-offs to a rep. `(rep_name, note?, turnover_date?, result?, result_at, result_by, result_by_email)`. Backfilled from old `reg_assigned` column. |

Old per-student columns `reg_notes`, `kat_notes`, `notes` (Coaching),
`first_coach_assignment`, the Turnover-to-REG triplet, and the
`winning_student` boolean are **all deprecated** but kept in the schema
for back-compat with the FIELDS allowlist. The UI no longer surfaces
them and any data they held was migrated to the appropriate log tables
during the v82–v92 migrations. Don't add UI for them.

### Lifecycle (computed server-side, never stored)

`computeLifecycle(student, pauses, resigns)` derives:

- `effective_end_date` = `student_onboarded_date + (months_count + Σ resigns.months_added)` + `Σ paused_days` + `active_pause_elapsed`
- `derived_status` ∈ `Active` | `Expiring soon` | `Expired` | `Paused` | `Not onboarded`
- `days_left` (negative when expired)
- `paused_days_total`, `active_pause_id`, `resign_months_added`, `total_months`

Both `?api=list` and `?api=get` return these computed fields. The
sidebar status dot, the header badges, and the Coach overview pills all
key off `derived_status`. **Don't add a manual "expired" checkbox** —
the v80 migration deliberately removed it.

### Coach progress fields (v97+)

A separate "Coach" section on the profile (between Onboarding and
Lifecycle) holds 9 fields the coach updates frequently:
`level`, `masterclass_level`, `current_module`, `coach_status` (All
good / Needs attention), `last_assignment_sent`, `last_assignment_received`,
`last_zoom_date`, `concern`, `goal`. These are surfaced in the Coach
overview table and drive the "Stale" filter (onboarded students with
no `last_assignment_received` in 30+ days).

### Logs (the 📋 button)

A single Logs button at the top of each profile opens a chooser modal
with 5 cards: Wins / Coach notes / Rep notes / I-C notes / Turnovers.
Each card opens its own history modal. Counts on each card are live.
The combined badge on the Logs button = sum of all 5 log counts.

The frontend uses a generic `_renderNoteList(kind)` helper for rep +
i/c notes (DRY). Wins, coach-notes, and turnovers each have their own
implementation because their schema differs (wins have just `text`,
turnovers have `rep_name + note + result`).

### Sidebar filters + Coach overview (v98+)

Above the search input there's a chip row: **All / Mine / Stale /
Duplicates / No video** with live counts, plus a **📊 Overview** toggle.

- **Mine** filters by `coach` matching the user's first_name OR email
  (case-insensitive, both compared). Coach-only users (no admin /
  mentorship / sales_manager) **default to Mine** on login.
- **Stale** = onboarded, not Expired/Paused, `last_assignment_received`
  null OR >30 days ago. New / not-onboarded students never count as
  stale (would be noise).
- **Duplicates** = students sharing the same lowercased email OR name
  with another student. Detected client-side; flagged with a `⎘ dup`
  badge in both sidebar rows AND overview rows.
- **No video** (v400) = onboarded (`student_onboarded_date` set) AND no
  video on file (`video_url`/`video_submitted_date` both empty) — the same
  "has video" signal as the advanced Filters panel (`_isNoVideoOnboarded`).
  A clip may still exist in Dropbox unlinked; this flags the DB gap.
- **Overview** swaps the profile pane for a dashboard table (sortable
  visually but actually sorted stalest-first). Click any row to drop
  back to that student's profile. Honors all chip + search + date
  filters concurrently.

`renderProfile()` resets `card.className` back to `profile-card` so
returning from overview mode doesn't leak the `overview-pane` class.

### Unsaved-changes guard

`profileDirty` flag flips on any field input/change inside the profile
card. `openStudent` and the sign-out button intercept it and show a
3-way modal (Save / Leave without saving / Cancel). `beforeunload` adds
the browser-native warning on hard reload / tab close. `saveStudent()`
returns bool so the modal's "Save" path can chain correctly.

The guard explicitly **does NOT** prompt when re-loading the same
student (after a save, after a pause/resign/win/note/turnover/alert
mutation). Only navigation to a different student trips it.

### Collapsible sections

Every section in the profile is a `<details>` element. Open/closed
state is persisted to localStorage key `crm-collapsed-sections` (a
JSON-encoded Set of section titles). The `_section()` helper accepts
an optional `titleHtml` arg so sections with HTML in the title (e.g.,
the Resigns "+X months total" chip) don't break the `data-section`
attribute. **Don't put raw HTML directly into the title arg** — pass
the plain key as title and the rich HTML as titleHtml.

### Edge function (`students`)

Endpoints (all gated to admin / mentorship / sales_manager / coach):

| Endpoint | Method | Purpose |
|---|---|---|
| `?api=list` | GET | All students with computed lifecycle + log counts |
| `?api=get&id=` | GET | Single student + all child collections |
| `?api=upsert` | POST | Insert or update a student row |
| `?api=delete` | POST | Delete a student (CASCADEs to child tables) |
| `?api=add-pause` / `update-pause` / `delete-pause` | POST | Pauses CRUD |
| `?api=add-resign` / `update-resign` / `delete-resign` | POST | Resigns CRUD |
| `?api=add-alert` / `resolve-alert` / `delete-alert` | POST | Alerts |
| `?api=add-win` / `update-win` / `delete-win` | POST | Wins |
| `?api=add-coach-note` / `delete-coach-note` | POST | Coach notes |
| `?api=add-rep-note` / `delete-rep-note` | POST | Rep notes |
| `?api=add-ic-note` / `delete-ic-note` | POST | I/C notes |
| `?api=add-turnover` / `set-turnover-result` / `delete-turnover` | POST | Turnovers (with result tracking) |
| `?api=mentors` | GET | List of `rep_mappings.calls_name` (legacy mentor picker) |
| `?api=coaches` | GET | Users with `coach` permission OR is_admin (drives Coach datalist) |

`FIELDS` allowlist gates which student columns can be written via
upsert. Adding a new column? Add it to FIELDS, plus DATE_FIELDS or
BOOL_FIELDS if needed.

**Multiple emails / phones (v400).** Identity's Email + Phone are repeatable
(`type:'multi'` fields in `SECTIONS`, rendered by `_addMultiRow`). The FIRST
value is the primary — it stays in the `email`/`phone` columns, so dedup,
search, Zoom invites and system emails are unchanged. Extras live in
`metadata.alternate_emails` / `metadata.alternate_phones` (JSON string arrays)
and are **merged** onto existing `metadata` on save (nothing else is lost). No
edge-fn change was needed (metadata already passes through upsert). The Videos
finder builds its Dropbox query from ALL of a student's emails (primary + alternates).

The Coach picker on the profile is a **datalist** input (free text +
autocomplete from `?api=coaches`). Users without an account can still
be entered as coaches — just type their name. Don't revert to a
`<select>`.

## Org Board + Targets — the task system (org-board.html, targets.html)

The **Org Board** (`org-board.html` / `org-board.js`) is a standalone dashboard
(moved out of the Access admin tab in v492/493) that renders the whole org tree
— divisions ▸ departments ▸ posts ▸ exec posts, with holders — as a layered,
zoomable chart with connector lines and full drag-and-drop (reparent posts,
move departments across divisions, reorder), edit-gated by the `org.*` keys.
`org-board.js` is **built by concatenation** — do not edit it directly:

```
cat org-board-boot.js org-core.js org-extras.js > org-board.js
```

Everyone can open the board and click **"My Post"** to see their own post's
purpose, senior, orders/policies, stats (via `weekly-stats ?api=stats-for-user`),
and their assigned tasks. The board reads org data from the **`access-control`**
edge fn (unchanged) and stats from `weekly-stats` scoped endpoints.

### Targets (ClickUp-style tasks)

`targets.html` is the standalone task dashboard; the **detail popup, board list,
and all task UI live in `targets-widget.js`** — a shared, self-contained module
(injects its own `.tw-*` CSS) reused by both `targets.html` and the org board's
My Post panel. The host page must set `window.session`, `window.TG_DIRECTORY`
(`[{id,first_name,email}]`), `window.TG_POSTS` (`[{id,name}]`), and
`window.SUPABASE_URL`. Public API: `Targets.renderBoard(el, opts)`,
`Targets.openDetail(id, opts)`, `Targets.openNew(defaults)`. `opts.filterPost`
filters the list; `opts.postId` is only the default post for NEW tasks.

**Backend:** the `org-targets` edge fn (verify_jwt:true) — see Part II. Data:
`org_targets` (post_id nullable = standalone or post-bound; status
todo/in_progress/done/cancelled, priority, start/due dates, estimate, tags[],
assignee_ids uuid[], parent_target_id for subtasks) plus `org_target_comments`
(kind = 'comment' | 'activity'), `org_target_checklist`, `org_target_attachments`,
`org_target_watchers`. All RLS-on with **0 policies** (service-role via the edge
fn — intentional; the security advisor flags this as INFO, ignore it).

Key behaviours, and the traps that already bit us:

- **Optimistic UI everywhere** — status/checklist/comment/assignee changes update
  the DOM instantly and only revert on server error. The detail modal never full-
  reloads on an edit; it refreshes the board once on close.
- **Attachments: stream the RAW file body, never base64-in-JSON.** The upload
  endpoint takes the file as the POST body (`?api=attachment-upload&target_id=&filename=`,
  mime from Content-Type) and streams it to a Dropbox upload session — same recipe
  as the `chat` fn. An earlier base64-in-JSON version failed on the edge runtime.
  Files render via a public Dropbox shared link (`?raw=1` inline, `?dl=1` download);
  clicking one opens the in-app lightbox (`_openLightbox`, ported from
  `messages-widget.js`) — image zoom, inline video, PDF-via-blob.
- **Activity log** = `org_target_comments` rows with `kind='activity'`, auto-written
  by the `update` endpoint on status/assignee/due/priority/title changes; rendered
  as compact muted lines interleaved with human comments.
- **Watchers/followers** (`org_target_watchers`): ☆ Watch toggle in the modal;
  notifications target **watchers ∪ assignees** (creators auto-follow). @mentions,
  assignment, comment, status-change, overdue and due-today all fan out through the
  standard `notify()` (insert `notifications` + `push-subscribe?api=dispatch`).
- Deep link `targets.html?task=<id>` opens that task directly.

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


---

# PART II — Backend & Operations

> Everything below documents the **Supabase backend** (56 edge functions, the database, cron jobs, and operational procedures). Part I (above) covers the frontend. This half is the source of truth for how the server side actually works — read the relevant system section before touching any edge function.
>
> **Edge-function source lives in Supabase, not this repo.** A byte-exact local mirror is kept at `/tmp/dashx/edge-functions/<slug>.ts` for reference and for the knowledge graph (see *Knowledge graph* below). Do not commit that mirror (one file, `typeform-help.ts`, contains a hardcoded secret).

## Backend index

- **CRM & sales fns** — students, declarations, calls, income, dashboard
- **Zoom system** — zoom-meetings, zoom-scheduler, zoom-webhook, zoom-room-migrate, zoom-inspect, ics-download, check-pause-endings (+ zoom-test/audit/roomtest)
- **Email pipeline** — dispatch-event → email_outbox → email-drainer → Resend; queue-watchdog; email-automations; resend-webhook
- **Backend RBAC (permissions_v2) + Auth** — access-control, admin-api, invite, activate, student-intake
- **Finance & Support** — refunds, collections, support, subscriptions, double-payment-detector, fanbasis-*
- **Analytics & coach** — weekly-stats, coach-hours, meta-ads, sync-meta-ads, sync-accel-calls
- **Ingest, integrations & notifications** — ingest-*, survey-intake, dropbox-*, push-subscribe, typeform-help, kajabi-probe, bulk-import-mentorship
- **Org Board & Targets (tasks)** — org-targets (task CRUD + comments/checklist/attachments/watchers/activity), targets-reminders (daily overdue + due-today cron); org tree served by access-control, stats by weekly-stats `stats-for-*`
- **Operations reference** — cron jobs, database tables, secrets, deploy + verify procedure, knowledge graph
## Zoom system

The Zoom subsystem runs the Mentorship CRM's recurring class scheduling, invites, reminders, and attendance recording. It is built around a **one-room-per-coach** model.

**One room per coach.** Each coach owns a single recurring type-8 Zoom meeting ("room") = one Zoom meeting id + one shared general join link + passcode `123`. Every class the coach runs is its own row in `mentorship_zoom_sessions` that *shares that room's `zoom_meeting_id`, `join_url`, and `start_url`* — there is no new Zoom meeting per class. A student is registered against the room **once** (`POST /meetings/{id}/registrants`, `auto_approve:true`) and gets a **unique personal `join_url`** that works for every occurrence; that personal link is stored per-student in the row's `registrants[]`.

**DB drives reminders, not Zoom's recurrence.** Each session row carries an `occurrences[]` array (synced from Zoom but owned by us). Each occurrence has `start_time`, `duration_minutes`, `status`, optional per-day `roster:[emails]`, and per-kind delivery bookkeeping (`<kind>_sent_at`, `<kind>_delivered[]`, `<kind>_done_at`, `send_log[]`). Invites and reminders fire off these DB occurrences, completely independent of Zoom's own recurrence/notifications (Zoom's `registrants_email_notification`/`registrants_confirmation_email` are disabled). This is why the actual Zoom recurrence time is irrelevant — the personal link works whenever the coach opens the room.

**Rolling 2-occurrence window.** A cron (`zoom-room-migrate?action=roll`) trims every scheduled recurring room's Zoom recurrence to its next 2 occurrences, re-anchored to the next upcoming class each run. This keeps the public registration page short and — critically — keeps the room from ever expiring, while never changing the meeting id (so personal join links survive).

**All Zoom wall-clock times are pinned to America/New_York (ET).** Functions send a *naive* ET wall-clock `start_time` (`YYYY-MM-DDTHH:mm:ss`, no `Z`) together with `timezone=America/New_York`. Sending a UTC `...Z` time with a non-UTC timezone makes Zoom misread the clock (the cause of a prior 4PM→5PM/9PM drift). Recurrence weekday (`weekly_days`, Sun=1..Sat=7) / `monthly_day` are derived from the ET calendar day.

**Data flow.**
1. Coach/admin UI → **zoom-meetings** (`api=create`/`add-students`/`update`/`reschedule`/`cancel`/`remove-student`/`resend-failed-emails`) → Zoom API + `mentorship_zoom_sessions`. `create` sends the immediate first-occurrence invite.
2. **zoom-scheduler** (pg_cron, every 15 min) walks recurring rooms' `occurrences[]` and sends per-occurrence invites + 24h/1h/going-live reminders via **dispatch-event**.
3. **zoom-webhook** (`meeting.ended`) fetches participants and records attendance into `mentorship_zoom_attendance` + `mentorship_activity_log`.

Emails are not sent directly — every send is a `dispatchEvent()` POST to **dispatch-event** (`X-Dispatch-Secret`) with an `event_key` (`zoom_invite`, `zoom_meeting_reminder_24h`, `zoom_meeting_reminder_1h`, `zoom_meeting_going_live`, `zoom_rescheduled`, `zoom_cancelled`, `zoom_room_welcome`, `zoom_kind_total_failure`), `override_to`/`student_id`, rendered `vars`, and an `.ics` attachment. `triggered_by` is a structured prefix used for dedup and reminder cancellation.

### zoom-meetings.ts (v41+; header comments cite v35–v45)
Primary coach/admin scheduling API. **Trigger:** user JWT (`Authorization` required; `verify_jwt` effectively on — every request calls `supaUser.auth.getUser()`). **Authorization (additive RBAC):**
- `canSchedule` = admin / `ms_ic` / `delivery_ic` / `mentorship` / `coach`. Each scheduling action also accepts a granular `permissions_v2` key via `zoomAllowed(key)`.
- `create` → `zoom.create`; `reschedule` → `zoom.reschedule`; `cancel` → `zoom.cancel`. (Pre-v39 these were open to any authenticated user.)
- `canManageZoom` = privileged (admin/IC/mentorship) **or** `permissions_v2` `zoom.manage`. Gates `update`, `remove-student`, `resend-failed-emails`, `get-settings`, `sync-occurrences`, `inspect`, on-behalf scheduling (`host_user_id`).

**Actions (`?api=`):** `inspect` (also secret-gated via `X-Dispatch-Secret`), `get-settings`, `sync-occurrences`, `test-email`, `debug`, `list`, `list-all`, `create`, `add-students`, `reschedule`, `update`, `remove-student`, `cancel`, `resend-failed-emails`.

**Tables:** reads/writes `mentorship_zoom_sessions`; reads `mentorship_students`; reads/updates `email_automation_sends` (reminder cancellation). **External:** Zoom API (S2S OAuth, token cached + 401/4711/124 retry), dispatch-event, Resend (`DELETE /emails/{id}` to cancel queued reminders).

Key behaviors:
- **`create` — one-room reuse (v41/v45, fail-safe):** for a *recurring* class where the host coach already has a scheduled `is_recurring` room, it adds the class to that existing room instead of creating a new meeting: picks the coach's most-common room `zoom_meeting_id`, best-effort PATCHes the room's `weekly_days` to include this class's ET weekday (non-fatal — the daily roll re-anchors), registers each student once, sends the immediate invite, and inserts a new session row sharing the room's id/link with a single seeded occurrence whose `invite_delivered[]` is stamped. **Any error falls through to the legacy new-meeting path** (worst case = a separate room) — reuse can never break scheduling. Bypass with `advanced.force_new_room:true`. Non-recurring → always a type-2 one-off. Legacy path also schedules `scheduleClassReminders` (24h/1h/live via dispatch-event `delay_minutes_override`) and, for recurring, refetches Zoom occurrences and persists `occurrences[]` with occurrence[0] invite-stamped.
- **`add-students` — recurring-room aware (v37):** for `is_recurring` rows it finds the soonest *future* available occurrence (not the possibly-stale `scheduled_start_time`), registers + sends the immediate invite for that occurrence only, and stamps that occurrence's `invite_delivered[]` so zoom-scheduler won't double-invite. It does **not** call `scheduleClassReminders` (the scheduler owns reminders + all later-occurrence invites). Non-recurring rows keep legacy behavior (immediate invite + scheduled reminders).
- **`reschedule` (v35/v38):** PATCHes Zoom start/duration in ET; if the meeting is type-8 it re-sends its existing `recurrence`. Cancels queued Resend reminders, then re-sends `zoom_rescheduled` to each registrant. **Guards `scheduleClassReminders` with `!row.is_recurring`** — recurring rooms' reminders are scheduler-owned, so it never double-schedules.
- **`update`:** admin/manage only. Diffs topic/start/duration/recurrence/advanced settings, PATCHes Zoom (always pinning `timezone=ET`), re-syncs `occurrences[]` from Zoom (sets/clears `is_recurring`), and on material change notifies registrants (`zoom_rescheduled`). Reminder re-scheduling and Resend cancellation are again gated to non-recurring.
- **`remove-student`:** cancels the Zoom registrant and (non-recurring only) deletes that student's still-queued Resend reminders.
- **`cancel`:** cancels queued reminders, `DELETE`s the Zoom meeting, sets row `status='cancelled'`, emails `zoom_cancelled`.
- **`resend-failed-emails`:** re-sends `zoom_invite` to registrants where `email_sent===false` or a rate/429 error, plus reschedules reminders.
- **`list` / `list-all`:** `list-all` merges DB rows with live per-user upcoming Zoom meetings. Both null out `start_url` for callers who are neither privileged nor the matching `host_email`.
- **`loadOrAdoptMeeting`:** loads a row by `id`/`zoom_meeting_id`, or **adopts** an unknown Zoom meeting into a new row.
- **Gotchas:** Zoom passcode comes from `advanced.custom_passcode` (sliced to 10 chars); `buildZoomSettings` defaults waiting_room on, registration_type 1, encryption enhanced; `splitName` substitutes `'.'` for empty name parts.

### zoom-scheduler.ts (v9)
Per-occurrence invite/reminder cron. **Trigger:** pg_cron every 15 min via pg_net; **secret-gated** (`X-Dispatch-Secret`), `verify_jwt:false`. Body `{}` or `{ session_id, dry_run }`.

**Tables:** reads `mentorship_zoom_sessions` (`is_recurring=true`, `status='scheduled'`), writes back `occurrences[]`; uses `zoom_scheduler_runs` as a mutex. **External:** dispatch-event only (no direct Zoom calls).

Logic per (occurrence, kind ∈ `invite`/`reminder_24h`/`reminder_1h`/`reminder_live`):
- **Firing windows (hours before start):** invite `T-96h..T-0` (no lower floor — fires right up to start even if created <4d out), 24h `T-25h..T-22h`, 1h `T-75m..T-45m`, going-live `T-5m..T+10m`.
- **Per-occurrence per-kind delivered[] dedup + retry-until-delivered:** each kind keeps `<kind>_delivered[]` (emails actually sent) and `<kind>_done_at` (set only once *every* eligible recipient is covered). Each tick (re)sends ONLY to recipients still missing, so a rate-limited/partial send is retried next tick. Sends pace at `SEND_GAP_MS=120ms`.
- **Roster scoping (v9):** if an occurrence carries `roster:[emails]`, only those registrants are invited/reminded for that day; no roster = whole room (back-compat). Skips the occurrence if its roster is empty.
- **Sequential drain + self-heal:** processes sessions/occurrences/kinds in order. Past the deadline (`<T-0`, or `<T+30m` for going-live) with anyone unreached → marks done but LOGs the unreached emails as a `gave_up` `send_log` entry (never a silent drop); if it reached **nobody**, fires a `zoom_kind_total_failure` admin alert. A transition guard treats old occurrences (stamp set but no `delivered[]`) as done so it doesn't re-blast.
- **Eager-stamp lock:** before sending, eagerly writes `<kind>_sent_at` so a crash mid-send doesn't lose the fact it started; after sending it re-reads the row, merges `newly_delivered` into `<kind>_delivered[]`, and sets `<kind>_done_at` if all covered. Concurrency is guarded by a single mutex row in `zoom_scheduler_runs` (unique partial index on `finished_at IS NULL`); `zoom_scheduler_clear_stale` RPC clears stuck runs at the start of each tick.

### zoom-webhook.ts (v10)
Records attendance from Zoom Server-to-Server webhooks. **Trigger:** Zoom webhook POST; verified by HMAC-SHA256 of `v0:{ts}:{body}` against `ZOOM_WEBHOOK_SECRET_TOKEN` (`x-zm-signature`). Handles `endpoint.url_validation` handshake and `meeting.ended` (all others ignored). `verify_jwt:false`.

On `meeting.ended`: fetches participants (`/past_meetings/{uuid}/participants`, paginated, double-encoding `uuid`), matches by email to `mentorship_students` (exact then `ilike`), then a **name-matching fallback (v10)** credits guest joiners with no email to a *unique* normalized-name student (preferring the meeting's registrants as candidates; never re-matching an already-matched student). Upserts the `meeting.ended` session row into `mentorship_zoom_sessions` (on `zoom_meeting_uuid`, `status='completed'`, `participants_raw`, `matched_student_ids`), upserts attendance into `mentorship_zoom_attendance` (on `student_id,session_id`, `ignoreDuplicates` → idempotent on retries), and logs only *newly*-attended students into `mentorship_activity_log` (`kind='zoom'`). A DB trigger on the activity log keeps `mentorship_students.last_zoom_date` in sync. Also writes an audit row to `activity_log`. **External:** Zoom API (token cached).

### zoom-room-migrate.ts (v8)
Secret-gated ops tool for the one-room model + the **rolling-window cron**. **Trigger:** `X-Dispatch-Secret`, `verify_jwt:false`; `?action=`. **Tables:** `mentorship_zoom_sessions`, `mentorship_students`, `email_outbox`, `email_automation_sends`. **External:** Zoom API, dispatch-event.

Actions:
- **`consolidate` / `consolidate-golive` / `consolidate-undo` (generalized, `&host=<zoom_host_email>`):** collapse ALL of a coach's scheduled recurring meetings into one shared room, each class kept as its own dashboard row (notes marker `room-consolidate:<host>`). Staged like Rex: `consolidate[&dry=1]` builds the room (passcode `123`, weekly_days = union of slot ET weekdays, anchored to earliest upcoming occurrence, cloud recording), registers every distinct student once, and creates **DRAFT** rows (`status='draft'` → hidden from scheduler/dashboard, NO emails, old rooms untouched; guards against double-build). `consolidate-golive` flips drafts to `scheduled`, emails `zoom_room_welcome` (paced 1.1s/send to avoid Resend 429s), and retires (deletes) the coach's other recurring meetings. `consolidate-undo` deletes the draft room + rows. `consolidate-resend` re-sends the welcome only to students lacking one in `email_outbox`.
- **`roll` (rolling-window cron; v7):** trims **every** scheduled recurring room to its next 2 occurrences (`end_times:2`, re-anchored to the next upcoming class), preserving each meeting's real recurrence (`weekly_days`/monthly spec — never guesses, skips if unreadable). Only the Zoom recurrence changes — same meeting id, so join links and DB `occurrences[]` are untouched. Supports `?zid=<id>` (single room) and `?dry=1` (preview).
- **`set-recording[&value=cloud|local|none][&zid=ID]`:** PATCHes `auto_recording` on room meetings (default cloud).
- **Original Rex one-off migration** (hardcoded `HOST=Rex@…`, three `SOURCES` zids): `dry` (report distinct students + per-day rosters + anchor, no writes), `run` (create room + register + draft rows, no emails), `undo` (delete room + draft rows by `notes='rex-room-migration'`), `golive` (flip drafts live + send welcomes + delete the 3 sources), `resend-welcome` (welcome to students missing a sent automation_id 29 send).

### zoom-inspect.ts (v5)
Standalone ops auditor for a single Zoom meeting. **Trigger:** `X-Dispatch-Secret`, `verify_jwt:false`; not linked from any dashboard. Body `{ id }` (session row) or `{ zoom_meeting_id }`. Returns the DB row + Zoom meeting incl. recurrence, `occurrences` (`show_previous_occurrences=true`), and key settings. Optional one-shot ops PATCHes: `set_auto_recording` (cloud/local/none), `set_start_time` with optional `set_timezone` (IANA zone, e.g. to fix a meeting whose occurrences drifted from a wrong timezone — re-sends recurrence for type-8). **External:** Zoom API.

### ics-download.ts
Public endpoint (no auth, `verify_jwt:false`) that builds and serves a downloadable `.ics` VCALENDAR from URL params (`summary`, `description`, `location`, `start`, `end`, `uid`) with a `-PT15M` VALARM. Backs the "Apple Calendar" button in invite emails; all Zoom functions reference it as `ICS_BASE` (`/functions/v1/ics-download`). 5-minute cache. **Tables/external:** none.

### check-pause-endings.ts (v6)
Not a Zoom function — a cron that notifies when a mentorship pause ends. **Trigger:** `Authorization: Bearer <SERVICE_ROLE_KEY>` (not a user JWT). **Tables:** reads `mentorship_pauses` (`end_date<=today`, `end_notified_at IS NULL`), `mentorship_students`; writes `notifications`, `mentorship_pauses.end_notified_at`, `activity_log`. Sends in-app + web-push (`push-subscribe?api=dispatch`) to MS-ICs + the student's coach, and the student-facing `pause_ended` email via dispatch-event. Supports `?pause_id=` for a single pause. **External:** dispatch-event, push-subscribe.

### zoom-test-send.ts (v12)
Throwaway test harness: sends a sample invite email **directly via Resend** (not dispatch-event) to the hardcoded `ange.bibou@gmail.com` with a preview Zoom link, full HTML template, calendar buttons, and `.ics` attachment. No auth gating (no secret/JWT check), no Zoom or DB calls. Hardcodes the project Supabase URL for `ICS_BASE`. Dev-only; not part of the production pipeline.

### zoom-user-audit.ts
One-off audit (no auth gating). Lists active Zoom users (license tier from `type`: 2=Licensed, 1=Basic) and cross-references them with app users and `pending_invites` by `zoom_host_email`, reporting which mappings exist and whether the Zoom user actually exists. **Tables:** `auth.users` (admin list), `pending_invites`. **External:** Zoom API.

### zoom-roomtest.ts
Throwaway, secret-gated (`X-Dispatch-Secret`, `verify_jwt:false`) end-to-end test of the one-room system using `ange.bibou+roomtest{n}@gmail.com` plus addresses (all mail redirected to `ange.bibou@gmail.com`). Actions: `provision` (ONE Zoom room + 3 separate dashboard rows with per-day rosters sharing the link, sends invites), `setpass&pwd=123` (set passcode, re-register, refresh links, re-send), `trim&n=2` (cap Zoom recurrence occurrences), `testpass&pwd=123` (create+delete a meeting to check Zoom accepts a passcode), `cleanup` (delete test meetings + rows, matched by `topic LIKE 'TEST ROOM — Model A%'`). Mirrors zoom-meetings' Zoom/ICS/dispatch helpers. **External:** Zoom API, dispatch-event.
## Email pipeline

The email system is a **durable queue**, not a fan of direct senders. The flow is:

```
caller ──(X-Dispatch-Secret)──> dispatch-event ──INSERT──> email_outbox (table)
                                                                  │
                              pg_cron (every 1 min) ──> email-drainer ──> Resend API
                                                                  │            │
                              pg_cron (own tick) ──> queue-watchdog          (webhook)
                                                                  │            ▼
                                                          (direct alert)  resend-webhook
                                                                            └─> email_automation_sends + email_suppressions + activity_log
```

**Key invariants:**

- **`dispatch-event` never calls Resend.** It resolves recipients, renders the template from `email_automations`, suppression-checks, and **enqueues rows into `public.email_outbox`** with a status of `queued` and a `priority`. It returns immediately. The legacy response field `sent` is now the count of rows *accepted/queued* (kept for backward compatibility), not actually delivered.
- **`email-drainer` is the SOLE Resend caller for queued mail.** It runs on a 1-minute pg_cron tick, claims batches from the outbox via RPC, and is **paced to ~1.6 sends/sec** through a shared token bucket implemented by the `claim_resend_slot` RPC backed by the `resend_pacing` table. By construction it should never hit Resend's 429. It honors `scheduled_at` (delays), retries retryable failures with exponential backoff, respects `priority`, and reclaims stuck batches.
- **`queue-watchdog` runs on its OWN independent pg_cron tick** so it still fires if the drainer is broken. It reads the drainer's heartbeat from `system_heartbeats` and the outbox state, and on trouble sends a **direct Resend alert** (bypassing the queue, so the warning can't get stuck behind the very problem it reports). Throttled to one alert per 30 min.
- **`resend-webhook`** receives Resend delivery/open/click/bounce/complaint events, updates `email_automation_sends`, auto-adds bounces/complaints to `email_suppressions`, and writes `activity_log` entries.
- **`email_automations`** is the template/trigger table (event automations, manual broadcasts, reusable templates); **`email_automation_sends`** is the per-recipient send log used for stats and history.

### KNOWN RATE-LIMIT GOTCHA

The whole point of the drainer's token bucket is to never trip Resend's rate limit. The remaining hole is **upstream, in `dispatch-event`**: it calls `auth.admin.listUsers({ perPage: 1000 })` on **every** dispatch to build a user index for recipient resolution and to look up the coach email — even when the caller already passed an explicit `override_to`. This inflates the per-send cost and, more importantly, large bursts (Zoom consolidation go-lives, the scheduler firing many reminders under load) can trip **Resend's** rate limit on the listUsers-adjacent / dispatch path -> some sends fail and **retry until the burst clears**. The recommended-but-not-yet-implemented fix is to **skip `buildUserIndex`/`listUsers` when `override_to` is set** (recipients are already known, so the index is dead weight).

---

### dispatch-event

- **Version:** v11 (ENQUEUE-ONLY since v10; v11 adds the priority lane).
- **Purpose:** Single entry point for triggering an automation. Resolves recipients, renders subject/HTML/text/from/reply-to from the matching `email_automations` row, suppression-checks each recipient, and **inserts rows into `email_outbox`**. Does **not** send.
- **Trigger / auth:** POST only, **secret-gated via `X-Dispatch-Secret`** header matched against env `DISPATCH_EVENT_SECRET`. No JWT (no `verify_jwt`); 401 if secret missing/mismatched. CORS allows the `x-dispatch-secret` header.
- **Request body:** `event_key` (required), optional `student_id`, `override_to` (comma-separated emails — bypasses recipient resolution), `vars` (override/extra template vars), `delay_minutes_override`, `priority`, `triggered_by`, `attachments`.
- **Recipient resolution (`resolveRecipientEmails`):** `specific_email` (comma split), `student` (student.email), `coach` (resolve coach name/email against user index), `ms_ic`/`delivery_ic` (users whose `app_metadata.permissions` includes the kind), `all_admins` (`app_metadata.is_admin === true`). `default` falls back to `student`.
- **Priority:** body `priority` if finite, else `1` for URGENT_EVENTS (`zoom_meeting_going_live`, `zoom_meeting_reminder_1h`, `zoom_invite`, `account_invite`), else `5`. Lower = drained first.
- **Delay:** `delay_minutes_override` (>=0) or the automation's `delay_minutes`; produces a future `scheduled_at` ISO timestamp on the outbox row.
- **Templating:** `{{var}}` / `{{var|fallback}}` rendering (`firstNameOrBlank` special-cased to a leading space). HTML wrapped in branded shell (`applyShell`) with preheader injection unless already a full document. Branding hard-coded: Ridley Academy, from `mentorship@ridleyacademy.team`, accent `#DC2626`.
- **Tables read:** `email_automations` (the enabled, non-template, `trigger_type='event'` row for `event_key`), `mentorship_students` (if `student_id`), `email_suppressions` (per recipient via `isSuppressed`). **Written:** `email_outbox` (the queued rows), `email_automation_sends` (a `failed`/`suppressed` log row per suppressed recipient), `email_automations` (bumps `send_count` + `last_sent_at` by queued count).
- **External services:** Supabase Auth Admin (`listUsers`) for recipient/coach resolution. No Resend.
- **Gotchas:** the `listUsers` cost described above (called even when `override_to` is set). Skips with `{ ok: true, skipped: 'no_automation' }` if no enabled automation matches `event_key`; `skipped: 'no_recipients'` if resolution yields nothing — callers (e.g. `send-email`) branch on these.

### email-drainer

- **Version:** v2.
- **Purpose:** The sole Resend sender for queued mail. Drains `email_outbox`, paced + retried + reclaimed, and stamps a heartbeat.
- **Trigger / auth:** Invoked by **pg_cron every 1 minute**. POST, **secret-gated via `X-Dispatch-Secret`** (`DISPATCH_EVENT_SECRET`); no JWT. Runs up to `MAX_RUN_MS = 55s`, batch size `BATCH = 80`.
- **Pacing:** `awaitSlot` calls the `claim_resend_slot` RPC before every send and sleeps the returned wait (shared token bucket / `resend_pacing` table, ~1.6/s). On RPC error it sleeps 250ms and proceeds.
- **Claim / reclaim:** `reclaim_stuck_emails` RPC at start (frees rows stuck in `sending`); `claim_email_batch(p_limit)` RPC to atomically claim a priority/schedule-ordered batch (sets `claimed_at`, status `sending`).
- **Send:** `postResend` POSTs to `https://api.resend.com/emails` with `from`/`to`/`reply_to`/`subject`/`html`/`text`, `tracking_settings.open_tracking + click_tracking = true`, optional `attachments`, and `scheduled_at` (passed through to Resend if still in the future).
- **Retry logic:** `429` or `>=500` are retryable. If retryable and `attempts < max_attempts`, row goes back to `queued` with `next_attempt_at = now + backoffMs(attempts)` (exponential, base 30s, cap 30 min, +jitter). Otherwise status `failed`. Success sets `status='sent'`, `resend_id`, `sent_at`.
- **Tables read:** `email_outbox` (via RPCs; plus an overdue count query). **Written:** `email_outbox` (status transitions sent/queued/failed), `email_automation_sends` (insert a `sent` or `failed` log row when the outbox row has an `automation_id`, with `via:'outbox'` metadata), `system_heartbeats` (upsert `name='email-drainer'` with run stats on **every** clean run — this is what queue-watchdog reads).
- **External services:** Resend (sends + an inline admin alert email on permanent failures, to `mentorship@ridleyacademy.team`). Supabase RPCs.
- **Gotchas:** the inline failure alert is sent **directly via Resend, not through the queue** (so an alert about the queue isn't trapped in the queue). queue-watchdog is the independent backstop. The drainer counts "overdue" rows for its alert but does not act on them beyond reporting.

### queue-watchdog

- **Version:** v2 ("overdue" now only counts rows that are actually DUE — `scheduled_at` null or past — so future-scheduled reminders are no longer false-flagged).
- **Purpose:** Independent health monitor for the email queue. Detects a silent drainer, a backed-up queue, stuck mid-send rows, or recent permanent failures, and alerts.
- **Trigger / auth:** Its **own** pg_cron tick, separate from the drainer (survives the drainer being broken). POST, **secret-gated via `X-Dispatch-Secret`** (`DISPATCH_EVENT_SECRET`); no JWT.
- **Checks:** (1) drainer heartbeat fresh? `system_heartbeats.email-drainer.last_run_at` older than `DRAINER_STALE_MIN = 6` min = stalled. (2) overdue: `email_outbox` rows `status='queued'` with `next_attempt_at` past `OVERDUE_MIN = 15` min AND (`scheduled_at` null or already past). (3) recent permanent failures: `status='failed'` created in the last hour. (4) stuck sending: `status='sending'` with `claimed_at` older than 10 min.
- **Alerting:** if not healthy and the last alert (tracked in `system_heartbeats` under `name='queue-watchdog-alert'`) is older than `ALERT_THROTTLE_MIN = 30` min, sends a **direct Resend** alert to `mentorship@ridleyacademy.team` listing the problems. Throttle row is only written on a successful send.
- **Tables read:** `system_heartbeats` (drainer + last-alert rows), `email_outbox` (three count queries). **Written:** `system_heartbeats` (upsert `queue-watchdog` run record always; `queue-watchdog-alert` on alert).
- **External services:** Resend (direct alert, bypasses the queue). No Auth Admin.
- **Gotchas:** alerts are throttled to once per 30 min, so a persistent outage produces at most 2 mails/hour. Healthy = drainer fresh AND zero overdue/recentFailed/stuckSending.

### email-automations

- **Version:** v14 (per-route granular `permissions_v2` gate, replacing the single `is_admin` check).
- **Purpose:** The admin/dashboard CRUD + send API for automations, templates, snippets, suppressions, stats/history, plus test-fire, send-test, and broadcasts. Defines the canonical `AVAILABLE_EVENTS` catalog (event keys, labels, recipient kind, available template vars, live/planned status) and `RECIPIENT_KINDS`.
- **Trigger / auth:** Dashboard-facing. **JWT required** (`Authorization: Bearer <user JWT>`, validated via `auth.getUser` on an anon client); then a **granular permission gate** keyed by the `?api=` action via `PERM_BY_API`: `email_automations.view` (read APIs), `.edit` (create/update/duplicate/snippets/suppressions), `.test_fire`, `.broadcast`, `.delete`. Admins (`app_metadata.is_admin === true`) pass everything as a wildcard. Permissions read from `app_metadata.permissions_v2`.
- **APIs (`?api=`):** GET — `available-events`, `recipient-kinds`, `list` (automations|templates), `get`, `templates-list`, `stats`, `history-by-email`, `snippets-list`, `suppressions-list`, `sends`. POST — `create`, `update`, `duplicate`, `delete`, `snippets-create|update|delete`, `suppressions-add|remove`, `send-test`, `test-fire`, `send-broadcast`.
- **`test-fire`** does NOT send directly — it POSTs to **`dispatch-event`** (with `X-Dispatch-Secret`, an `override_to`, and a resolved/sample `student_id`) so the test exercises the real queue path. Requires the automation be an enabled `event` trigger.
- **`send-test` and `send-broadcast`** send **directly via Resend** (`sendOne`) — they bypass the outbox queue. send-test renders with a large built-in `sample` var set and prefixes `[TEST]`. send-broadcast loops `student_ids`, resolves per-student recipients (incl. coach lookup via Auth Admin `listUsers`), suppression-checks, renders, sends, and logs each. Broadcasts allowed only for `manual` (non-system, non-template) automations.
- **Tables read/written:** `email_automations` (CRUD, dedupe via `validateUniqueEventKey`, `send_count`/`last_sent_at` bump on broadcast), `email_automation_sends` (insert send logs; read for `stats`/`history-by-email`/`sends`), `email_snippets` (CRUD), `email_suppressions` (list/add/remove + suppression checks), `mentorship_students` (broadcast/test-fire recipient data).
- **External services:** Resend (send-test, send-broadcast directly), Supabase Auth Admin (`listUsers` for coach/IC/admin resolution in broadcasts — same listUsers cost pattern), and an internal HTTP call to `dispatch-event` (test-fire).
- **Gotchas:** broadcast/send-test bypass the durable queue, so they are NOT paced by the drainer's token bucket — a large broadcast can itself trip Resend's rate limit independently of the dispatch path. System automations (`is_system=true`) can't be deleted (disable instead) and have locked trigger/recipient fields.

### send-email

- **Version:** v6 (routes staff notification emails through `dispatch-event`).
- **Purpose:** Turn a batch of in-app `notifications` (for a given `alert_id` + `kind`) into emails. For each recipient it builds vars from notification metadata and calls **`dispatch-event` once per recipient** (with `override_to` + `vars`), then logs the outcome. Falls back to **denomailer SMTP** only when dispatch-event has no automation for that kind.
- **Trigger / auth:** POST, **service-role only** — `Authorization` must equal `Bearer <SUPABASE_SERVICE_ROLE_KEY>` exactly. No JWT-user path. Body: `alert_id` + `kind` (both required).
- **Flow:** fetches `notifications` rows matching `alert_id` + `kind`, resolves user emails/first names via Auth Admin `listUsers`, calls `dispatchEvent` per recipient. If the FIRST dispatch returns `skipped='no_automation'`, it **aborts the dispatch loop and switches to SMTP fallback** for all notifications (resets counters). SMTP needs `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` (port default 587, TLS); otherwise it records failures and returns.
- **Tables read:** `notifications` (by alert_id + kind). **Written:** `notification_dispatch_log` (one row per notification: sent/failed/suppressed, channel `email`). Does NOT write the outbox or sends log directly — dispatch-event owns that.
- **External services:** internal HTTP to `dispatch-event` (primary), denomailer SMTP (fallback), Supabase Auth Admin (`listUsers`). Resend only transitively via dispatch-event → drainer.
- **Gotchas:** the `dispatchEvent` helper treats `(j.sent || 0) > 0` as success — since dispatch-event's `sent` now means *queued*, a "sent" log row here means **accepted into the queue**, not actually delivered. Suppressed recipients are detected by the `suppressed:`-prefixed error string returned from dispatch-event.

### send-email-direct

- **Version:** v1.
- **Purpose:** Send an **arbitrary** subject + plain-text body to a list of users by ID. Used for non-alert notifications that don't fit the alert/turnover schema (e.g. survey-received from Zapier intake).
- **Trigger / auth:** POST, **service-role only** (`Authorization` must equal `Bearer <SUPABASE_SERVICE_ROLE_KEY>`). Body: `user_ids` (array), `title` (required), `body`, `link_url` (appended as a dashboard link line).
- **Flow:** resolves emails via Auth Admin `listUsers`, sends each via **denomailer SMTP** directly. No templating, no shell branding, no suppression check, no queue.
- **Tables:** none read/written beyond Auth Admin user lookup.
- **External services:** denomailer SMTP (needs `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, port default 587, TLS, from `SMTP_FROM`), Supabase Auth Admin.
- **Gotchas:** **completely bypasses Resend, the outbox queue, suppressions, and the sends log** — it is a raw SMTP escape hatch. No pacing or retry; failures are only counted in the response.

### resend-webhook

- **Version:** v2.
- **Purpose:** Ingest Resend send-event webhooks and reconcile them into the sends log, suppressions, and audit feed.
- **Trigger / auth:** POST from Resend. Optional shared-secret gate: if `RESEND_WEBHOOK_SECRET` env is set, requires `?secret=` query param or `x-webhook-secret` header to match (else open). Matches the event's `email_id` against `email_automation_sends.resend_id`.
- **Event handling:** `email.delivered` → sets `delivered_at` (logs activity only on first delivery). `email.opened` → `bump_send_open` RPC (logs only first open). `email.clicked` → `bump_send_click` RPC + captures link (logs only first click). `email.bounced` → sets `bounced_at`, `status='failed'`, `bounce_reason`, **upserts `email_suppressions`** (source `bounce`) — always logged. `email.complained` → sets `complained_at`, **upserts `email_suppressions`** (source `complaint`) — always logged.
- **Tables read:** `email_automation_sends` (pre-fetch by `resend_id` to decide first-time vs repeat). **Written:** `email_automation_sends` (delivered/bounced/complained timestamps + status; opens/clicks via RPC), `email_suppressions` (bounce/complaint upserts), `activity_log` (one row per actionable event; opens/clicks only first-time, delivered once, bounce/complaint always).
- **External services:** none outbound (pure ingest). Supabase RPCs `bump_send_open` / `bump_send_click`.
- **Gotchas:** opens/clicks are deliberately logged to `activity_log` only the FIRST time per send to avoid drowning the feed in tracker pixel pings (the counters still bump every time via RPC). Bounces and complaints feed straight into `email_suppressions`, which dispatch-event/broadcasts then honor on future sends.
## Backend RBAC (permissions_v2) + Auth

The **frontend** permission system (`permissions.js`, documented elsewhere in this file) decides what UI a user sees. This section covers the **backend enforcement** that actually gates the edge functions — the frontend is advisory; these checks are authoritative.

### The model

- **Granular permission keys** live in `app_metadata.permissions_v2`, a string array baked into the user's JWT (`app_metadata.permissions_v2`). Because it rides in the JWT, edge functions read it straight off the verified user with no DB roundtrip. The full catalogue of keys is the `app_permissions` table (columns include `sort_order`).
- **Legacy permissions** still live in `app_metadata.permissions` (an older flat array, e.g. `coach`, `ms_ic`, `delivery_ic`). Most functions keep their legacy role/`is_admin` check AND additively honour a `permissions_v2` key — see the enforcement pattern below.
- **`is_admin`** (`app_metadata.is_admin === true`) is a global superuser short-circuit: it passes every gate. Only a true admin may set `is_admin` on another user.
- **Roles**: `app_roles` (id, slug, name, color, sort_order, `is_system`) bundle keys via `app_role_permissions` (role_id → permission_key). Users get roles through `app_user_roles` (user_id, role_id, assigned_by) and per-user overrides through `app_user_permission_grants` (user_id, permission_key, `effect` = `'grant'` | `'revoke'`, granted_by). The effective `permissions_v2` array is materialized onto the JWT by the `recompute_user_permissions(p_user_id)` RPC, which is re-run after every role/grant/admin change (and explicitly when a user is left with zero roles/grants).
- **Org model** (Hubbard-style org board): `org_divisions` → `org_departments` → `org_posts`, plus a parallel `org_executive_posts` layer. Posts/exec-posts carry `purpose`, `valuable_final_product`, `default_role_id`, `senior_post_id`. Holders are tracked in `org_post_holders` and `org_executive_post_holders` with an open/closed window via `ended_at IS NULL` (assigning a new post-holder auto-closes the prior one). Exec posts map to divisions via `org_executive_post_divisions`. Posts/depts/divisions can carry org-chart `head_user_id` / `head_default_role_id`.
- **Policies**: `org_policies` (scope_type = global/division/department/post, scope_id, kind, title, body, expires_at) cascade down the org tree (a post inherits its department's and division's policies). Edit rights are scoped: only an admin OR a user listed in `org_division_policy_editors` for the relevant division may create/update/delete policies for that scope (`canEditPolicyForScope`, resolved via `org_scope_division_id` RPC).

### The enforcement pattern (additive)

Every gated edge function keeps its **legacy check AND additively allows a granular key**, so existing access is never narrowed:

```js
const canX = isPrivileged || permsV2.includes('students.add_win');
```

`isPrivileged` is typically `is_admin` (and/or a coarse legacy role). The granular key only ever **adds** access. In `access-control.ts` this is formalized: a per-action `gate(key)` passes if the caller holds `users.manage` (superset) OR the action's specific key (admins short-circuit via `is_admin`), returning a 403 `Response` or `null`.

### Granular keys and what they gate (across all edge fns)

- **students.\*** — `students.add_win`, plus other `students.*` capabilities gating student CRUD/wins on the students functions.
- **zoom.\*** — `zoom.create`, `zoom.reschedule`, `zoom.cancel`, `zoom.manage` gate the zoom-meetings function.
- **income.\*** — gate income/declaration edits.
- **calls.\*** — gate calls-log capabilities.
- **declarations.\*** — gate income declarations.
- **collections.reassign** — gate reassigning collections.
- **coach-hours** — gate coach-hours editing.
- **alerts.view_all** — see all alerts (not just own).
- **turnovers.view_all** — see all turnovers (not just own).
- **access-control.ts entry keys**: `users.manage` (superset), `roles.view/create/edit/delete`, `org.view/edit_structure/edit_policies/assign_holders`, `users.view/view_pending/delete`.
- **admin-api.ts**: `audit.view`, `users.view_sessions`, `users.force_logout`, `admin.archive_dashboard`, `users.set_permissions`, `users.delete`, `users.manage_rep_mappings`.
- **invite.ts**: `users.view_pending`, `users.resend_invite`, `users.revoke_invite`, `users.edit_pending`, `users.invite`, `users.bulk_invite`.

### Auth verification (security)

All authenticated edge fns verify the bearer token by calling `supabaseUser.auth.getUser()` against a client created with the caller's `Authorization` header (anon key). The resolved `user.app_metadata` is the source of truth for `is_admin` / `permissions_v2` — never the raw JWT payload. **`admin-api.ts` in particular** was a security fix: it parses the JWT only for the `actor` label, but gates on the verified `getUser()` result (`verifiedUser`); without a verified user it returns 403.

### Audit log / sessions / presence

- **`activity_log`** (actor_id, actor_email, action, target_type, target_id, details jsonb, ts) — every mutating action across these functions inserts a row (best-effort, swallowed on failure). Diffs are computed with `diffObj` and embedded in `details` (before/after, added/removed lists). Readable via admin-api `?api=activity` (admin or `audit.view`), with filters: action, actor, target, from/to dates, free-text `q`; capped at 500 rows.
- **`user_presence`** (user_id, last_seen, user_agent) — drives the live-session view. A user is "live" if `last_seen` is within 90s.
- **Sessions / force-logout** — admin-api `?api=sessions` joins `auth.users` with `user_presence`. `force-logout` calls the `force_logout_user(p_user_id)` RPC and deletes the presence row; you cannot force-logout yourself.

---

### `access-control.ts` — roles, permissions & org structure (v12)

**Purpose**: the RBAC/org-board admin API — manages roles, per-user role/grant assignment, admin flag, suspend/delete, the full org tree (divisions/departments/posts/exec-posts/holders), policies + policy editors, and rep-mappings.

**Trigger / verify_jwt**: invoked from the dashboard with the user's bearer token; `verify_jwt` effectively on — rejects non-`Bearer` / unresolvable users with 401. **Top gate**: caller must hold at least one `ENTRY_KEYS` key (`users.manage`, `roles.*`, `org.*`, `users.view/view_pending/delete`) or be admin, else 403. Per-action `gate(key)` then applies (passes on `users.manage` OR the key).

**Actions** (`?api=…`, all POST unless noted):
- Catalog/users: `catalog` (GET; needs `roles.view`), `users` (GET; aggregates auth users + roles + grants + post/exec-post holders + legacy & v2 perms + suspended state), `user-set-roles`, `user-set-grants` (grant/revoke arrays), `user-set-admin` (writes `is_admin`), `user-recompute`.
- User lifecycle: `delete-user` (needs `users.manage` or `users.delete`; cannot self-delete), `suspend-user` / `reactivate-user` (**admin-only**; uses `ban_duration` `876000h`/`none` + `app_metadata.suspended`).
- Roles: `role-create/update/delete` (`roles.create/edit/delete`; system roles can't be deleted and keep their slug).
- Org structure (`org.edit_structure`): `division-/department-/post-/exec-post-` `create/update/delete`, `post-duplicate`, `exec-post-duplicate`, `reorder`. Reads (`org.view`): `divisions`, `departments`, `posts`, `post-holders`, `exec-posts`, `exec-post-holders`.
- Holders (`org.assign_holders`): `post-add-holder` / `post-remove-holder` (auto-closes prior holder on add), `exec-post-add-holder` / `exec-post-remove-holder`.
- Policies: `policies` / `policies-for-scope` (GET; the latter resolves the division→dept→post chain and marks `inherited_from`), `policy-create/update/delete` (needs `org.edit_policies` AND `canEditPolicyForScope`). Policy editors: `division-editors` (GET), `division-editor-add` / `division-editor-remove` (**admin-only**).
- Rep mappings: `rep-mappings` (GET), `set-rep-mapping`, `delete-rep-mapping`.

**Tables**: reads/writes `app_permissions`, `app_roles`, `app_role_permissions`, `app_user_roles`, `app_user_permission_grants`, `org_divisions`, `org_departments`, `org_posts`, `org_post_holders`, `org_executive_posts`, `org_executive_post_divisions`, `org_executive_post_holders`, `org_division_policy_editors`, `org_policies`, `rep_mappings`, `activity_log`. RPCs: `recompute_user_permissions`, `org_scope_division_id`.

**Gotchas**: `delete-user` (v12) first clears all RBAC + org links AND nulls **NO-ACTION FKs** (`mentorship_activity_log.created_by`, `mentorship_zoom_sessions.created_by`, `rep_mappings.user_id`) or the `auth.users` delete fails. Every mutation logs to `activity_log` with field-level diffs. `recompute_user_permissions` is re-run after role/grant changes incl. the empty-set case.

### `admin-api.ts` — users, audit, sessions, dashboards, rep-mappings (v17)

**Purpose**: legacy-permissions user admin + audit log viewer + live sessions + dashboard archive + rep-mappings. Stores `zoom_host_email` on `app_metadata` (so it lands in the JWT for `zoom-meetings` to read without a DB hit) — added in v17.

**Trigger / verify_jwt**: bearer token; `?api=dashboard-archive` (GET) is **public** (placed before the auth check) — everything else requires a verified `getUser()` (403 otherwise). **Security fix**: gates on `verifiedUser.app_metadata`, not the parsed JWT (which is used only for the actor label).

**Endpoints** (`?api=…`):
- `dashboard-archive` (GET, public) — list archived dashboard IDs.
- `activity` (GET; admin or `audit.view`) — filterable audit log, ≤500 rows.
- `sessions` (GET; admin or `users.view_sessions`) — users + presence, `is_live` (≤90s), `liveCount`.
- `force-logout` (POST; admin or `users.force_logout`) — `force_logout_user` RPC + delete presence; no self.
- `archive-dashboard` / `unarchive-dashboard` (POST; admin or `admin.archive_dashboard`).
- `users` (GET; **admin-only**) — full user list w/ legacy `permissions`, `is_admin`, `zoom_host_email`.
- `set-permissions` (POST; admin or `users.set_permissions`) — writes legacy `permissions`, optional `first_name`, `zoom_host_email`. **Escalation guard**: a non-admin caller cannot change `is_admin` — the target's existing flag is preserved and incoming `is_admin` is ignored.
- `delete-user` (POST; admin or `users.delete`) — nulls `rep_mappings.user_id` then deletes; no self.
- `rep-mappings` (GET; admin-only), `set-rep-mapping` / `delete-rep-mapping` / `unassigned-names` (admin or `users.manage_rep_mappings`). `unassigned-names` paginates `"Calls Log"` (Rep) and `"Sales Log"` (Affiliate) in 1000-row pages, excluding a `NON_REP` denylist.

**Tables**: `auth.users` (admin API), `activity_log`, `user_presence`, `dashboard_archive`, `rep_mappings`, `"Calls Log"`, `"Sales Log"`. RPC: `force_logout_user`.

**Gotchas**: this fn writes the **legacy** `app_metadata.permissions` (not `permissions_v2`) — granular keys are managed by `access-control.ts`. Most reads still surface legacy `permissions`. `pgQuote` is used to escape free-text filters in `.or()` clauses.

### `invite.ts` — invite + pending-invite management (v21)

**Purpose**: create/list/resend/revoke/update pending invites. Stores invite details (email, first_name, permissions, is_admin, zoom_host_email, token) in `pending_invites`; the activation flow (`activate.ts`) consumes them. Invite email is sent via a single `dispatchEvent()` call to `dispatch-event` with `event_key=account_invite`, `override_to=invitee` (v21 routed it through dispatch-event instead of direct send).

**Trigger / verify_jwt**: bearer token, verified via `getUser()` (401 otherwise). Per-action gate: `list`→`users.view_pending`, `resend`→`users.resend_invite`, `revoke`→`users.revoke_invite`, `update`→`users.edit_pending`, create (default)→`users.invite` or `users.bulk_invite` (admin passes all).

**Actions**: `list` (GET), `revoke`, `update` (patch first_name/permissions/is_admin/zoom_host_email), `resend` (regenerates email from stored token, bumps `last_email_sent_at`), default create (validates email, rejects if a real account already exists → 409, generates a 32-byte URL-safe `token`, upserts `pending_invites` on `email`, sends email, logs `user.invite`).

**Tables**: `pending_invites` (upsert/select/update/delete), `auth.users` (listUsers dedupe), `activity_log`. External: `dispatch-event` (needs `DISPATCH_EVENT_SECRET`).

**Gotchas**: **Privilege-escalation guard** — `is_admin` on an invite/update is only honoured if the **caller** is a true admin (`is_admin = isAdmin && body.is_admin === true`; update forces `false` for non-admins). The activation URL is `https://ridleyacademy.team/activate?token=…`. A failed email after a saved invite returns 500 but the pending row persists.

### `activate.ts` — token-based account creation (v1)

**Purpose**: the public first-name + password activation gate that converts a `pending_invite` into a real `auth.users` account. **No JWT required** — the random invite `token` proves inbox control.

**Trigger / verify_jwt**: `verify_jwt = false` (public). Uses the service-role key directly.
- **GET** `?token=…` — returns `{email, first_name}` for the pending invite, or 404 if used/revoked.
- **POST** `{token, password, first_name?}` — validates password ≥ 8 chars; rejects if an account with that email already exists (cleans up the dangling invite, 409); creates the user with `email_confirm: true` (skips email confirmation since the token already proved inbox control), applies `is_admin` / `permissions` / `zoom_host_email` **from the invite**, sets `user_metadata.first_name` and **`user_metadata.activated: true`**; deletes the pending invite; logs `user.activate`.

**Tables**: `pending_invites` (select/delete), `auth.users` (createUser/listUsers), `activity_log`.

**Gotchas**: writes the legacy `permissions` array from the invite (not `permissions_v2`); `recompute_user_permissions` is not called here, so role-derived `permissions_v2` is materialized later (e.g. when roles are assigned via access-control). The `activated: true` flag in `user_metadata` is the activation marker the frontend gates on. `first_name` from the activation form overrides the invite's `first_name`.

### `student-intake.ts` — public student intake webhook (v17)

**Purpose**: the public intake endpoint (Zapier/Typeform → Supabase) that upserts `mentorship_students` and fires survey-received notifications. Not part of the user/RBAC system — auth here is a **shared-secret webhook**, not a JWT.

**Trigger / verify_jwt**: `verify_jwt = false`; authenticated by an `x-intake-secret` header matched against `INTAKE_SECRET` (401 on mismatch, 500 if unconfigured). POST only.

**Behaviour**: normalizes a wide range of field aliases (email/name/phone/product/dates/coach/reg/survey/video/community/gdrive URLs), unwraps a single `{data: "<json>"}` envelope, parses dates (ISO + M/D/Y). Upserts into `mentorship_students` by case-insensitive email: on existing it **only fills empty fields** (never overwrites non-empty), on new it inserts with `status='Active'`, `months_count` default 12. Logs `mentorship.intake.{inserted|updated}` (actor `zapier-intake@system`). If a new survey URL is set OR `event === 'survey_received'`, it resolves recipients (`resolveCoachAndIcs`: non-admin users whose legacy `permissions` include `ms_ic` / `delivery_ic`, or `coach` matching the student's coach by first_name/email), then fans out in-app `notifications`, web-push (via `push-subscribe?api=dispatch`), and survey emails (via `dispatch-event` `event_key=survey_received`), and writes `notification_dispatch_log` rows.

**Tables**: `mentorship_students` (select/insert/update), `activity_log`, `notifications`, `notification_dispatch_log`. External: `push-subscribe`, `dispatch-event` (needs `DISPATCH_EVENT_SECRET`).

**Gotchas**: recipient resolution reads **legacy** `app_metadata.permissions` (`ms_ic`, `delivery_ic`, `coach`), not `permissions_v2`. Update path is intentionally non-destructive (empty-only fill). All notification side-effects are best-effort (warnings, never fail the request).
# Finance & Support

The finance and support systems share a single ingestion source — **Fanbasis**, the payment
processor — and a web of cross-writes between boards. The flow:

- **`fanbasis-embed`** mints embedded checkout sessions (browser-facing): client requests a
  session secret + product price + applied discount, with arbitrary metadata forwarded to
  Fanbasis so it persists onto the session and re-arrives later via webhook.
- **`fanbasis-webhook`** ingests payment events: it HMAC-verifies the payload, logs every event
  (verified or not) to `fanbasis_webhooks_raw`, and upserts paid transactions into the
  `"Sales Log"` table (Status = Cash / PP / Rebill). `"Sales Log"` is the canonical sales source
  that nearly every downstream finance board reconciles against.
- **`refunds`** is an org-wide refund/dispute ledger (`refunds` + append-only `refund_events`),
  gated on treasury/refunds perms.
- **`collections`** is rebill-recovery declarations (`collections` table), parallel to
  sales_declarations but isolated; it reconciles each row against `"Sales Log"` and has an
  admin-only auto-assign tool that attributes Sales-Log charges to reps via `rep_mappings`.
- **`support`** is the customer-support ticket board (`support_tickets` + `support_events`). It
  **auto cross-writes to the `refunds` board** by customer email: refund-type and dispute-type
  tickets push/update a matching `refunds` record (creating one if none exists).
- **`subscriptions`** is the subscription / payment-plan board (`subscriptions` +
  `subscription_events`), fed manually by support, seeded from support tickets, or pushed by the
  stopped-subscription webhook.
- **`subscription-stopped-webhook`** is a token-gated inbound endpoint that upserts a STOPPED
  subscription onto the `subscriptions` board.
- **`double-payment-detector`** is a pg_cron job (every 15 min) that scans `"Sales Log"` for
  duplicate charges and auto-creates a **`Double Payment` `support_tickets` row** per
  (email, day), then emails the support inbox.

**Cross-write summary:** Fanbasis → `Sales Log` (webhook); `Sales Log` → `collections`
(auto-assign) and → `support_tickets` (double-payment detector); `support_tickets` → `refunds`
(refund/dispute sync); stopped-webhook → `subscriptions`.

All six dashboard functions share the same shape: hand-rolled `parseJwt` (no signature check on
the JWT — they trust Supabase's gateway `verify_jwt`), permission gate off `app_metadata`
(`is_admin`, legacy `permissions`, granular `permissions_v2`), and a service-role Supabase client.
The two inbound webhooks and the cron detector run `verify_jwt:false` and authenticate via their
own secrets.

---

### fanbasis-embed

**Purpose:** Browser-facing checkout bootstrap. Mints a Fanbasis embedded-checkout session secret
and returns product price/details plus optional discount info; forwards sanitized client metadata
to Fanbasis so it survives onto the session and the later payment webhook (e.g. affiliate `aff`).

**Trigger / verify_jwt:** Public HTTP (`GET` or `POST`), `verify_jwt:false`. No bearer auth;
guarded instead by a **strict CORS origin allowlist** (`ALLOWED_ORIGINS`: ridleyacademy.com/.net,
sing-ridleyacademy.com, live.ridleyacademy.com, with/without `www`). Non-allowlisted origin → 403
`forbidden_origin`.

**Inputs:** `product_id` (required, must match `^[A-Za-z0-9]{4,16}$`), `coupon` (optional,
`^[A-Za-z0-9_-]{1,32}$` or silently dropped), `metadata`. GET reads metadata from `meta_<key>=`
query params; POST from a `metadata` object. `sanitizeMetadata` enforces max 20 keys, key pattern
`^[A-Za-z0-9_.-]{1,40}$`, string/number/bool values truncated to 500 chars.

**External services (Fanbasis public-api, `https://www.fanbasis.com/public-api`):** runs three
calls in parallel — `POST /checkout-sessions/embedded` (mint secret), `GET
/checkout-sessions/{product_id}` (price/subscription details), and `lookupDiscount` →
`GET /discount-codes?code=` (matched by code + product membership in `services`, expiry-checked).
Returns `{ secret, creator_id: "ridley-academy", product_id, details, discount, metadata }`.

**Tables:** none (pure Fanbasis proxy).

**Gotchas:** Auth key is `FANBASIS_API_KEY` env (sent as `x-api-key`); missing → 500
`server_not_configured`. `CREATOR_HANDLE` is hardcoded `"ridley-academy"`. Upstream failures
surface as 502 (`upstream_unreachable` / `upstream_session_error` / `missing_secret`). Details
fetch failing is non-fatal (`details: null`). No version header.

---

### fanbasis-webhook

**Purpose:** Ingests Fanbasis payment events, verifies signature, logs every payload to
`fanbasis_webhooks_raw`, and upserts paid transactions into `"Sales Log"`.

**Trigger / verify_jwt:** Inbound webhook, `POST` only (else 405), `verify_jwt:false`.
Authenticated by **HMAC-SHA256** of the raw body against `FANBASIS_WEBHOOK_SECRET`, compared
(constant-time `safeEqual`) to the `x-webhook-signature` header (`normalizeSig` strips a
`prefix=` up to index 10).

**Tables written:** `fanbasis_webhooks_raw` (always — even on bad signature; columns
`event_type`, `event_id`, `signature_ok`, `payload`, later patched with `notes` on error and
`sales_log_id` on success); `"Sales Log"` (upsert on `fanbasis_transaction_id` conflict, or plain
insert when no tx id).

**Logic:**
- Event type resolved from `payload.type` / `data.event_type` / `payload.event_type` / headers
  (`x-webhook-event`, `x-event-type`); falls back to `subscription.canceled` (if cancel
  reason/status present) or `"unknown"`.
- **Paid events** that map to a Sales Log row: `payment.succeeded`, `product.purchased`,
  `subscription.created`, `subscription.renewed`. Others log raw and stop.
- **Status mapping** (`deriveStatus`): `Cash` = one-time full payment; `PP` = first payment of a
  plan; `Rebill` = recurring payment. `subscription.created`→PP, `subscription.renewed`→Rebill;
  otherwise inferred via `auto_renew_count` / `period_number`.
- **Price** tried in order: `total_price`/`product_price` → `unit_price`×`quantity` → `amount` →
  `amount_cents`/`total_cents` (divided by 100 only if > 1000).
- **Product normalization** (case-insensitive substring, in order): `masterclass`/`bundle` →
  "The Complete Piano Masterclass Bundle"; `mentorship` → "Private Mentorship"; `experience` →
  "Experience"; else raw title.
- **Affiliate** extracted from many candidate paths (`api_metadata.data.embed_checkout.aff`,
  `additional_params.*`, `metadata.*`, etc.) — this is how `fanbasis-embed` metadata flows back
  for collections auto-assign.

**Gotchas:** If `WEBHOOK_SECRET` is set and signature invalid → returns 401 `invalid_signature`
**after** the raw row is already logged (`signature_ok:false`). If `WEBHOOK_SECRET` is empty,
signature is not enforced (open ingestion). Handler errors are swallowed into the raw row's
`notes` and still return `{ ok:true }` 200. No version header. `Platform` hardcoded `"fanbasis"`.

---

### refunds

**Purpose:** Org-wide refund + dispute ledger. Every viewer sees every row (not per-rep). No
Sales-Log "sales-check" and no auto-assign; rows logged as entered.

**Trigger / verify_jwt:** Dashboard HTTP, `verify_jwt:true` (parses bearer JWT). CORS `*`.

**Perm gate:** `canEdit` = `is_admin` OR legacy `treasury_ic`/`delivery_ic` OR
`refunds.edit`/`refunds.manage`. `canView` = `canEdit` OR legacy `refunds_view` OR
`refunds.view` (read-only). No view → 403.

**Record types (`RECORD_TYPES`):** `request`, `approved`, `disapproved`, `processed`,
`dispute_started`, `dispute_won`, `dispute_lost`. Back-compat: incoming `salvaged`→`disapproved`,
`refunded`→`approved` (via `normType`).

**Endpoints:** `GET ?api=log` (all rows + `canEdit`); `GET ?api=events&refund_id=N` (timeline);
`POST ?api=insert`; `POST ?api=update` (records `status_change` event when record_type changes;
note column is NOT edited here); `POST ?api=add-note` (append-only `refund_events` note, also
mirrors latest into `refunds.note`); `POST ?api=delete`. Write endpoints require `canEdit`.

**Tables:** `refunds`, `refund_events` (events: `created` / `status_change` / `note`),
`activity_log` (`refund.create|update|delete`).

**Gotchas:** This is the cross-write **target** of the `support` board — support tickets can
create/update `refunds` rows out-of-band (entered_by/created_by_email = the support user or
`"support"`). No version header.

---

### collections

**Purpose:** Rebill-recovery declarations, stored in `collections` (kept separate from
`sales_declarations`). Reconciles each row against `"Sales Log"` and supports an admin auto-assign
tool that attributes Sales-Log charges to reps.

**Trigger / verify_jwt:** Dashboard HTTP, `verify_jwt:true`. CORS `*`.

**Perm gate (three tiers + reassign):**
- `canView` (read own) = admin / legacy `collector`|`collections` / `collections.view|edit|manage`.
- `canEdit` (write own) = admin / legacy roles / `collections.edit|manage`.
- `canSeeAll` (all rows + auto-assign) = admin / legacy roles / `collections.manage`.
- `canReassign` (attribute a row to another collector) = admin / `collections.reassign`.

Non-manage users are row-scoped: matched on `rep_mappings.calls_name` (`rep_name`) first, falling
back to `user_id`.

**Endpoints:** `GET ?api=log` (rows with computed `sales_check` + duplicate detection);
`GET ?api=reps` (manage only); `POST ?api=insert`/`update`/`delete`;
`POST ?api=auto-assign-preview` and `?api=auto-assign-commit` (both **manage-only**).

**Sales-check logic:** `Yes` (exact date|email|price match in `"Sales Log"`), `Maybe` (near match
≤3 days / ≤$5, or type mismatch — declared type vs `statusToDeclType(status)`), `No`, or `Pending`
(missing fields). On `log`, duplicate same (date,email,price) rows are detected: earliest kept as
original, later ones downgraded to `Maybe` with a "Duplicate collection" reason.

**Auto-assign:** `preview` pages `"Sales Log"` over a date range, maps `Affiliate` → rep via
`rep_mappings.sales_affiliates`, and buckets rows into `autoMatched` / `unmapped` /
`alreadyDeclared` (also flags `salesLogDuplicate`). `commit` inserts the accepted assignments into
`collections` (`sales_check:'Yes'`, `note:'Auto-assigned by admin…'`, `user_id:null`), skipping
existing (rep,date,amount,email) dupes.

**Tables:** `collections`, `rep_mappings` (read), `"Sales Log"` (read), `activity_log`
(`collection.create|update|delete|auto_assign`).

**Gotchas:** Collector identity prefers a human display name (`user_metadata.first_name/full_name`)
over email. Update/delete are re-scoped by rep_name/user_id for non-managers. No version header.

---

### support

**Purpose:** Customer-support ticket board with append-only event timeline. Auto cross-writes
refund/dispute tickets to the `refunds` board by customer email.

**Trigger / verify_jwt:** Dashboard HTTP, `verify_jwt:true`. CORS `*`.

**Perm gate:** `canEdit` = admin / legacy `support` / `support.edit|manage`. `canView` =
`canEdit` OR `support.view` (read-only).

**Ticket types (`TICKET_TYPES`):** `Minor`, `Refund Request`, `Refund`, `Refunded`, `Critical`,
`Damaging`, `Other comms`, `Double Payment`, `Dispute Started/Won/Lost` (ticket_type field
tolerates free text). **Statuses:** `Pending` / `Active` / `Solved` (default `Pending`).

**Endpoints:** `GET ?api=log` (paged, `MAX 8000`, returns `capped`); `GET ?api=events&ticket_id=N`;
`POST ?api=insert`/`update`/`add-note`/`delete`. Writes require `canEdit`.

**Refund cross-write (`refundTargetFor` → `syncRefund`):** maps ticket type to a `refunds`
record_type — `Refund Request`→`request`, `Refund`→`approved`, `Refunded`→`processed`,
`Dispute Started/Won/Lost`→`dispute_*`. On insert, fires if the type maps. On update, fires only
when the mapped target **differs from** `support_tickets.refund_sync_state` (so each transition
fires once). `syncRefund` updates the customer's latest `refunds` row by email (logging a
`status_change` `refund_event`) or creates a new `refunds` + `refund_events` row if none exists;
then stamps `refund_sync_state` / `refund_synced_at` on the ticket and logs an info note.

**Tables:** `support_tickets`, `support_events` (`created`/`status_change`/`note`),
`refunds` + `refund_events` (cross-write target).

**Gotchas:** No `activity_log` writes here (unlike refunds/collections). Free-text ticket_type is
accepted, so only the mapped types trigger refund sync. No version header.

---

### subscriptions

**Purpose:** Subscription / payment-plan management board with append-only timeline. Records are
entered by support, seeded from support tickets, or pushed by `subscription-stopped-webhook`.

**Trigger / verify_jwt:** Dashboard HTTP, `verify_jwt:true`. CORS `*`.

**Perm gate:** `canEdit` = admin / legacy `support`|`subscriptions` /
`support.edit|manage` / `subscriptions.edit|manage`. `canView` = `canEdit` OR
`subscriptions.view` OR `support.view`.

**Statuses (`STATUSES`):** `active` / `paused` / `stopped` / `completed` (default `active`).

**Fields:** name, email, product, `plan_amount`, `rebills_count`, `total_paid`, `started_at`,
status, `stopped_at`, `stopped_reason`, `external_id`.

**Endpoints:** `GET ?api=log` (latest 5000 by `updated_at`); `GET
?api=events&subscription_id=N`; `POST ?api=insert` (sets `source:'manual'`); `?api=update`
(records `status_change` event on status change); `?api=add-note`; `?api=delete`.

**Tables:** `subscriptions`, `subscription_events` (`created`/`status_change`/`note`).

**Gotchas:** No `activity_log`. Dashboard-entered rows are `source:'manual'`; webhook-entered rows
are `source:'webhook'`. No version header.

---

### subscription-stopped-webhook

**Purpose:** Inbound endpoint that records a STOPPED (or other-status) subscription onto the
`subscriptions` board. Wire any upstream system to POST when a subscription stops.

**Trigger / verify_jwt:** Inbound webhook, `POST` only (else 405), `verify_jwt:false`.
**Auth:** secret token via header `X-Webhook-Token` or `?token=`, validated against vault secret
`subscription_webhook_secret` through the SECURITY DEFINER RPC
`verify_subscription_webhook_token(t)`. Missing token → 401, RPC error → 500, invalid → 401.

**Body (JSON):** all optional except **one of `email`/`external_id`** required —
`{ email, name, product, plan_amount, rebills_count, total_paid, started_at, stopped_at,
reason, external_id, status }`. `status` defaults to `stopped`; when stopped and no `stopped_at`,
defaults to today's date.

**Behaviour (upsert):** finds existing subscription by `external_id` first, else by
`email` (+`product` if given), newest first. If found → updates status/stop info, logging a
`status_change` `subscription_event` only when status actually changed. If not → inserts a new row
(`source:'webhook'`, `entered_by_email:'webhook'`) plus a `created` event and optional reason note.

**Tables:** `subscriptions`, `subscription_events` (`created_by_email:'webhook'`).

**Gotchas:** Shares the `subscriptions` board with the dashboard `subscriptions` function; the
`source` column distinguishes origin. No version header.

---

### double-payment-detector

**Purpose:** Scans `"Sales Log"` for duplicate charges and auto-opens a `Double Payment`
`support_tickets` row per offending (email, day), then emails the support inbox.

**Trigger / verify_jwt:** Cron-driven, `verify_jwt:false`. **Called by pg_cron every 15 min**
with header `X-Dispatch-Secret: <vault.dispatch_event_secret>`, compared against env
`DISPATCH_EVENT_SECRET` (empty env or mismatch → 401). `POST`/`OPTIONS`.

**Rule:** a double payment = the **same price charged ≥2 times to the same email + same name on
the same calendar day**. Different amounts the same day are legitimate separate purchases and are
NOT flagged. Scans the trailing `LOOKBACK_DAYS = 3` of `"Sales Log"` to catch late inserts.

**Behaviour:** groups recent sales by (email,name,day), finds same-price duplicate sets, and for
each with **no existing** `Double Payment` ticket for that (email, day) inserts a
`support_tickets` row (`status:'Pending'`, `entered_by_email:'auto:double-payment'`) plus two
`support_events` (`created` + detail `note`). Idempotent — one ticket per (email, day); re-runs
skip already-ticketed days.

**External services:** **Resend** (`https://api.resend.com/emails`, `RESEND_API_KEY`) — sends a
summary email to `support@ridleyacademy.team` from `mentorship@ridleyacademy.team` only when new
tickets were created, with a link to `https://ridleyacademy.team/support.html`.

**Tables:** `"Sales Log"` (read), `support_tickets` + `support_events` (write), `activity_log`
(`support.double_payment_detected`).

**Gotchas:** Hardcoded constants — `SUPPORT_EMAIL`, `FROM_EMAIL`, `APP_URL` (typeform-help-style
hardcoding). Note these inserted `Double Payment` tickets do NOT trigger the `support` function's
refund cross-write (`Double Payment` is not in `refundTargetFor`). Missing `RESEND_API_KEY` →
tickets still created, email skipped. Returns `{ ok, scanned, dupe_groups, created, emailed }`.
No version header.
## CRM & sales edge functions

Five edge functions back the Mentorship CRM and the Sales/Calls/Declarations/Income dashboards: `students` (Mentorship CRM), `declarations` (rep self-reported sales + sales-check), `calls` (Calls dashboard with rep sales joins), `income` (Sales Log finance view), and `dashboard` (top-of-funnel sales-dashboard RPC proxy). All run on `Deno.serve`, return CORS headers, route on a `?api=…` query param, and use the service-role key to bypass RLS — so authorization is entirely in-function. Every fn gates on the **legacy `permissions` role array** plus, additively, **granular `permissions_v2` keys** (admin via `app_metadata.is_admin` always passes). For the underlying business rules (calls attribution, declarations Maybe-checks, income/auto-declaration semantics, `get_daily_stats`, the students CRM lifecycle and table model) see the existing "Business rules" section — this section documents only the edge-function mechanics.

### `reassign-turnover` (v1)
Standalone fn (NOT in `students`) that hands a `mentorship_turnovers` row to a different rep. `verify_jwt`, gated to **admin / `ms_ic` / `delivery_ic` only**. POST `{ turnoverId, rep_name }` → updates `rep_name`, swaps the old rep for the new in `notified_user_ids` (keeps leads/coach), and notifies the new rep (in-app `notifications` row + `turnover_opened` email via dispatch-event). Old/new reps resolved by matching `rep_name` to a user's first_name/email. Frontend: a small "⇄ reassign" button next to the rep name in the student's Turnovers history (students.js, gated by `canReassignTurnover`). Kept standalone because re-emitting the ~82KB `students` fn for an MCP inline deploy is too risky.

### `rep-contacts` (v1) — Rep Area
Standalone fn backing the rep-facing CRM layer. New tables `mentorship_rep_contacts` (contact log → last-contact + recently-contacted) + `mentorship_rep_status_log` (append-only status history; current = latest). **`mentorship_students` is NEVER written** by this feature — snapshot `mentorship_students_backup_20260624` is the revert point. `verify_jwt`. Roles: **VIEW** (rep status, filters, full contact log) = admin/rep/sales_manager/ms_ic/delivery_ic; **EDIT** (log contact, set status) = admin/rep/ms_ic/delivery_ic; **coaches** = their own students' contacts only. Endpoints: `rep-data` (per-student current status + last_contact_date + recently_contacted ≤7d), `status-log` (history), `contacts` (scoped log), `add-contact`, `set-status` (status ∈ Hot/Warm/Cold/Qualified/Not qualified/Needs help/Do not contact). Frontend (students.js): "Contacts" top button + modal, profile **Rep Area** (status dropdown + history + last contact + Log contact), row rep-status badge + "📞 7d" tag, and rep_status/recently_contacted filters — all gated to rep-view roles via the `repDataMap` loaded once per session.

### `students` (v80)
Mentorship CRM: student profiles, lifecycle derivation, and all sub-entities (pauses, resigns, alerts, wins, notes, turnovers, surveys, activity log, notifications).

- **Trigger / verify_jwt:** decodes the JWT manually (`parseJwt`, no signature verification); rejects missing/garbage token with 401. View access requires `is_admin` OR legacy `students`/`mentorship`/`sales_manager`/`coach`/`ms_ic`/`delivery_ic`/`ms_rep` OR `permissions_v2: students.view`.
- **Write gating (layered):**
  - `canEditProfile` = admin OR `permissions_v2: students.edit` OR (non-rep AND `coach`/`ms_ic`/`delivery_ic`).
  - **MS-rep-only** users (legacy `ms_rep` without mentorship/sales_manager/coach/ic) are restricted to `MS_REP_ALLOWED_WRITE` (resigns, alerts + comments, notification reads, rep-notes, turnover result/comments).
  - `canEditRepOnly` (admin OR `sales_manager`+`ms_rep`) is required for `update-rep`; non-editors otherwise get `REP_EDIT_ALLOWED_WRITE` = the MS-rep set plus `update-rep`.
  - **Granular per-action `permissions_v2` keys** (`GRANULAR_WRITE`) are purely additive on top of `canEditProfile`: `students.add_win` → add/update/delete-win; `students.add_note` → add/delete coach/ic notes; `students.pause` → add/update/delete-pause; `students.delete` → delete. A role can hold one action without full edit rights.
  - Alert/turnover-comment deletes additionally restrict non-admin/non-editors to their own comments (`created_by === userId`).
- **api actions / endpoint groups:**
  - *list/profile* (GET): `list` (all students + computed lifecycle + per-student counts), `get?id=` (full profile with pauses/resigns/alerts+comments/wins/notes/turnovers+comments/surveys/activity-log, name-resolved via cached directory), plus `reps`/`mentors`/`coaches` lookup lists.
  - *save* (POST): `upsert` (insert/update across the `FIELDS` whitelist with `normalizeValue` coercion + diff logging), `delete`.
  - *logs* (GET/POST): `activity-log`, `add-activity`, `delete-activity`; `surveys`, `survey?id=`, `add-survey-link`, `delete-survey`.
  - *pauses:* `add-pause`/`update-pause`/`delete-pause`. *resigns:* `add-resign`/`update-resign`/`delete-resign`.
  - *alerts:* `add-alert`, `add-alert-comment`, `resolve-alert` (requires resolution note), `delete-alert`, `delete-alert-comment`.
  - *wins:* `add-win`/`update-win`/`delete-win`.
  - *notes:* `add-/delete-coach-note`, `add-/delete-rep-note`, `add-/delete-ic-note` (shared `noteEndpoint` helper).
  - *turnovers:* `add-turnover`, `add-turnover-comment`, `set-turnover-result`, `delete-turnover`, `delete-turnover-comment`.
  - *notifications:* `my-notifications`, `mark-notification-read`, `mark-all-notifications-read`.
  - `rep-reassign` = `update-rep`; bulk assignment is done via repeated `upsert`/`update-rep` from the client (no dedicated bulk endpoint).
- **Tables read/written:** `mentorship_students`, `mentorship_pauses`, `mentorship_resigns`, `mentorship_alerts`, `mentorship_alert_comments`, `mentorship_wins`, `mentorship_coach_notes`, `mentorship_rep_notes`, `mentorship_ic_notes`, `mentorship_turnovers`, `mentorship_turnover_comments`, `mentorship_survey_responses`, `mentorship_activity_log`, `notifications`, `notification_dispatch_log`, `activity_log` (audit). Reads `auth.users` (admin listUsers) for the directory.
- **Gotchas:**
  - Alerts/turnovers fan out on 3 channels: in-app `notifications` rows, transactional email via `dispatch-event` (`X-Dispatch-Secret` = `DISPATCH_EVENT_SECRET`; silently skipped if unset), and web-push via `push-subscribe?api=dispatch`. Failures are logged-and-swallowed, never blocking the write.
  - Recipient resolution = `ms_ic`/`delivery_ic` users + (optionally, when `tag_coach`) the student's coach matched by first_name/email; admins are excluded from recipients.
  - Directory is a warm-instance cache with 5-min TTL (`getDirectory`) — newly created/renamed users may not resolve for up to 5 minutes.
  - `list`/`get` return a `capabilities` object the UI uses to show/hide controls.

### `declarations` (v13)
Rep self-reported sales ("declarations") cross-checked against the `Sales Log`, plus an admin auto-assign flow.

- **Trigger / verify_jwt:** manual `parseJwt` (no signature check), 401 on missing token. View requires admin OR legacy `rep`/`sales_manager` OR `permissions_v2: sales.view`/`declarations.view`/`sales.view_others`.
- **Scope:** `canSeeAll` (admin OR `sales_manager` OR `permissions_v2: sales.view_others`) sees every rep; otherwise the user is scoped to their own `rep_mappings.calls_name` (resolved by `user_id`). `log`/`update`/`delete` filter on `rep_name` for non-`canSeeAll` users; if a rep has no mapping, `log` returns empty with an error note.
- **api actions:** `log` (default GET; list with live sales-check + cross-rep duplicate detection), `reps` (canSeeAll only), `insert`/`update`/`delete` (POST; recompute `sales_check` via `computeSingleCheck` on write), `auto-assign-preview` and `auto-assign-commit` (both POST, gated **admin OR `permissions_v2: sales.auto_assign`**).
- **Tables read/written:** writes `sales_declarations`; reads `Sales Log` (for checks/preview), `rep_mappings` (rep scoping + affiliate→rep map), `activity_log` (audit).
- **Gotchas:** `Sales Log` reads are paginated 1000/page; `buildSalesIndex` widens the date window ±3 days. `sales_check` is recomputed server-side on every insert/update — client-supplied check values are ignored. Auto-assign-commit re-checks for an existing `(rep_name,date_closed,sale_amount,email)` declaration and skips dupes; inserted rows are forced `sales_check='Yes'`. Preview also flags `salesLogDuplicate` (possible double-charge) per row.

### `calls` (v18)
Calls dashboard: aggregates the `Calls Log` and joins rep sales (from `Sales Log` + credited `Yes` declarations) into per-rep/daily/overall stats.

- **Trigger / verify_jwt:** manual `parseJwt`, 401 on missing token. View requires admin OR legacy `calls`/`sales_manager`/`rep` OR `permissions_v2: calls.view`/`calls.view_others`. Read-only fn (no writes / no POST actions).
- **Scope:** a pure `rep` user (no calls/sales_manager/admin and no `calls.view_others`) is locked to their own `rep_mappings.calls_name`; missing mapping → 403. Others may pass `?rep=` to filter. `salesRepFilter` is always lowercased (v18 fix) so case mismatch can't drop rows.
- **api actions:** `stats` (default; `{ overall, daily, byRep, … }`), `log` (latest ≤2000 `Calls Log` rows in range). `?from`/`?to` default to last 30 days.
- **Tables read:** `Calls Log`, `Sales Log` (paginated, joined by affiliate→rep), `sales_declarations` (only `sales_check='Yes'`), `rep_mappings`. No writes.
- **Gotchas:** `Rebill` sale statuses and declaration types are excluded; declarations are credited only if not already matched to a Sales Log row (`matchedSaleKeys` dedupe by `date|email|price`). Contact = duration ≥120s, interview = ≥600s. See business-rules section for the full attribution model.

### `income` (v—; header: "supabase/functions/income/index.ts")
Finance view over the raw `Sales Log` (revenue by sale/rebill/PP, daily, per-product) plus CRUD on Sales Log rows.

- **Trigger / verify_jwt:** **real JWT verification** — builds an anon client with the caller's Authorization header and calls `auth.getUser()` (unlike students/declarations/calls which only decode). View requires admin OR legacy `finance` OR any `permissions_v2: income.view`/`income.create`/`income.edit`/`income.delete`.
- **Write gating:** `insert` needs admin/`finance`/`income.create`; `update` needs `income.edit`; `delete` needs `income.delete` — each checked per-action.
- **api actions:** `stats` (overall + daily + byProduct), `log` (≤2000 rows), `insert`/`update`/`delete` (POST). `?from`/`?to` default last-30-days; `?products=` (exact, intersected with `REAL_PRODUCTS`) and `?ilike=` (comma-separated substring match applied in JS post-fetch).
- **Tables read/written:** reads & writes `Sales Log`. Insert/update restrict columns to the `ALLOWED` whitelist (`Date,Name,Email,Product,Price,Status,Affiliate,Platform`). No `activity_log` audit on these writes (gotcha).
- **Gotchas:** only `REAL_PRODUCTS` are ever counted (test SKUs filtered out). `Status` classified by `classify()` — `Cash`/null → sale, `Rebill` → rebill, `PP` → pp.

### `dashboard` (v—)
Top-of-funnel sales dashboard backend; thin proxy over Postgres RPCs.

- **Trigger / verify_jwt:** `verifyJwt()` does **real** verification via anon client + `auth.getUser()`; returns boolean, 401 on failure. There is **no role/permission gate** beyond being a valid authenticated user.
- **api actions:** `reps` (RPC `get_rep_list`), `data` (RPCs `get_daily_stats` + `get_leads_for_range` in parallel, returns `{ daily, leads, … }`). Any other path → 302 redirect to the GitHub Pages dashboard.
- **Params:** `?from`/`?to` (validated `YYYY-MM-DD`, default last 30 days, ET timezone via `Intl.DateTimeFormat`), `?funnel` (only `Artistic`/`Artisticv2` accepted, else null), `?rep`.
- **Tables read:** none directly — all data via the three RPCs (service-role). No writes.
- **Gotchas:** dates computed in `America/New_York`; `funnel` is whitelisted server-side. `get_daily_stats` semantics live in the business-rules section.
## Analytics & coach edge functions

This group powers the Staff-Meeting KPI dashboard, Meta ad reporting, the Accelerator call feed, and the coach work-hours feature.

**`weekly-stats`** backs the Staff-Meeting weekly KPI dashboard. Each metric is either **manual** (values typed/imported into the `weekly_stats` table) or **derived** (computed live at request time from the Sales Log / mentorship tables via a `derived_sql_id` dispatcher). Manual rows always override derived values for the same period, so a derived series can be hand-corrected per period. Weeks are **Thu–Wed buckets anchored on the Wednesday** end-date: `weekAnchor()` rolls any date forward to the next Wednesday (`(3 - dow + 7) % 7`) and uses that ISO date as `period_start`; monthly buckets use the first of the month. The metric catalog lives in `weekly_stats_metrics`. A `write_weekly_active_snapshot` cron (external to this file) is expected to persist point-in-time active-student snapshots.

**`meta-ads`** serves Meta ad spend/insights to the dashboard, reading from the `meta_ads_*` tables that **`sync-meta-ads`** populates. `sync-meta-ads` is a read-only (GET-only) mirror of the Meta Marketing API into Supabase and is cron-capable (service-role or shared-secret auth). **`sync-accel-calls`** runs on a cron (every minute) to pull recent calls from the Accelerator (`accelonline.io`) API into the Calls Log. **`coach-hours`** backs the coach work-hours feature, storing self-reported hours in `coach_work_hours`.

### `weekly-stats` (v36)

- **Purpose**: serve the weekly/monthly KPI dashboard — metric catalog, computed/manual time-series, period-over-period snapshots — and CRUD for manual values and metric definitions.
- **Metric→user assignment (v36)**: `weekly_stats_metrics.assigned_user_ids uuid[]` tags a metric to one or more users for an **ownership/filter** purpose only — the value stays a single shared number per period. The dashboard shows an "Assigned to" picker (next to the division tabs) that filters the grid client-side to one user's metrics (or "Unassigned"); it's an optional lens, not an access restriction (everyone with view still sees all). Assignees render as initials chips on cards and are edited in the drilldown editor.
- **Trigger / auth**: HTTP, `verify_jwt` effectively enforced in-code. Requires a `Bearer` user JWT; the token is parsed manually (`parseJwt`, no signature verification) to read `app_metadata`. No service-role bypass for callers (the function itself uses the service-role key for DB access).
- **Permission gates** (from `app_metadata`): view = `is_admin` OR legacy `permissions` includes `weekly_stats` OR `permissions_v2` includes `weekly_stats.view` (no view → 403). edit = `is_admin` OR `weekly_stats.edit`. import = `is_admin` OR `weekly_stats.import` OR `weekly_stats.edit`. Read endpoints need view; `upsert`/`delete`/`reorder`/`update-metric`/`create-metric` need edit; `bulk-import` needs import.
- **API actions** (`?api=`, default `catalog`):
  - `catalog` (GET): active rows from `weekly_stats_metrics` (`key,label,division,unit,source,sort_order,description,is_active,in_staff_meeting,invert_chart,show_point_labels,extra_tabs`) plus a `capabilities` block.
  - `series` (GET): `period=weekly|monthly`, `from`/`to` (defaults: 91d weekly / 180d monthly back to today), optional `division` (CSV, matched against `division` + `extra_tabs`) and `metric` (CSV of keys) filters. Weekly requests skip metrics whose division is `monthly`. For each metric: derived base series (if `source='derived'` + `derived_sql_id`) merged with manual override rows from `weekly_stats`.
  - `snapshot` (GET): `period_type`, `period_start` (YYYY-MM-DD required) → current vs previous period value per metric (prev = −7d weekly / −1mo monthly).
  - `upsert` (POST, edit): one `weekly_stats` row, `onConflict: metric_key,period_type,period_start`; validates `metric_key` exists; stamps `created_by`/`created_by_email`.
  - `bulk-import` (POST, import): `{ rows: [...] }`, **max 500 rows**; per-row validation, returns upserted/skipped + per-row `errors`.
  - `delete` (POST, edit): by `id` or by (`metric_key`+`period_type`+`period_start`).
  - `reorder` (POST, edit): `{ ordered_keys }` → rewrites `sort_order` starting at 100, step 10.
  - `update-metric` (POST, edit): patch `label`/`division`/`invert_chart`/`show_point_labels`/`source`/`derived_sql_id`/`extra_tabs` on a metric.
  - `create-metric` (POST, edit): create a `manual` metric; derives a unique slug `key` from `key`/`label`, `division` ∈ D2/D3/D4/D5/monthly, `unit` ∈ count/usd/pct.
  - `assignees` (GET, view): lists users with weekly-stats access (`is_admin` OR `weekly_stats`/`weekly_stats.view|edit|import`) as `{id,name,email}` for the assignment picker (uses `auth.admin.listUsers`).
  - `assign` (POST, edit): `{ key (or metric_key), user_ids: [uuid] }` → sets `weekly_stats_metrics.assigned_user_ids` (validates uuids; metric must exist). `catalog` now also returns `assigned_user_ids`.
- **Tables read**: `weekly_stats_metrics`, `weekly_stats`, `sales_declarations`, `collections`, `mentorship_students`, `mentorship_wins`, `mentorship_resigns`, `mentorship_pauses`, `mentorship_turnovers`, `refund_events`, `refunds`, `Sales Log` (quoted, mixed-case cols `Date`/`Product`/`Status`). RPC: `compute_active_mentorship_stats_both`.
- **Tables written**: `weekly_stats` (upsert/bulk-import/delete), `weekly_stats_metrics` (reorder/update-metric/create-metric).
- **Derived metrics (`derived_sql_id` dispatcher)**: `% active` overall (`active_mentorship_students_pct`) and per-coach (`pct_active_<coach>` → maps maddison→Madison, carlos, rex, dan, ricardo) via the RPC at end-of-period (clamped to today); per-coach `success_stories_<coach>` (count `mentorship_wins` on that coach's students by `win_date`); a 14-key refund board `rb_<status>_<count|amount>` over 7 statuses (request/approved/disapproved/processed/dispute_started/dispute_won/dispute_lost) from `refund_events`(+`refunds.sale_amount` for amounts); GI metrics from `sales_declarations` (`phone_sales_total_gi`, `phone_sales_recurrent_gi` where type=Rebill, `mentorship_gi_overall`, `masterclass_gi_phone`, `experience_gi_phone`); `recovered_failed_rebills` (collections); `ms_students_not_onboarded`, `active_mentorship_students` (7-day-activity window, honors pauses/resigns/months_count), `active_masterclass_students`, `students_onboarded`, `students_completed_mentorship`, `mentorship_resigns_weekly|monthly`, `mentorship_wins`, `total_refunds_monthly`, `resigns_turned_over`, `masterclass_purchasers` (Sales Log, excludes REBILL).
- **Gotchas**: JWT is decoded, **not cryptographically verified** — relies on the gateway's `verify_jwt`. Active-student math is heavy (loads full roster + resigns + pauses, recomputes per period in JS); per-coach maps are hardcoded and use the misspelling `maddison`→`Madison`. Monthly manual values fall back to summing weekly rows into months when no monthly row exists. `Sales Log` is the legacy quoted table with capitalized columns; mentorship tables are snake_case.

### `webinar-analytics` (v1; `verify_jwt:true`) — Webinar Registrations dashboard
Read-only analytics for the AXL-native webinar funnel (ridleyacademy.net/register, built as an AXL site page — source in `~/Desktop/ridley-landing-pages/pages/webinar-axl/`). Gate: admin / `webinars.view` / legacy marketing, sales_manager, mentorship. `?api=webinars` (list, names via AXL API), `?api=summary&w=<webinarId>` (counts only: per day, by utm_source/medium, via-link share, attendance), `POST ?api=sync&w=` (pull attendance from AXL `webinar-user` — needs the AXL API key to have the Webinar-participants right; today it returns a clear refusal). Data comes from `public.webinar_registrations`, filled by the PUBLIC fn `axl-webinar-link` (`verify_jwt:false`): the AXL page scenario POSTs `{contactId, webinarId, link}` with header `X-Webhook-Key` = `app_secrets.axl_webinar_link_webhook` → rows in `webinar_links` + `webinar_registrations`; the thank-you page POSTs `{action:'report', utm_*, referrer, viaLink}` (only accepted when a `webinar_links` row exists). `axl-contact-prefill` (public) returns firstName/email/phone for an AXL contact id so the page can pre-fill for `?a_c=` visitors. All three reuse the `AXL_API_*` secrets. Tables are RLS-on with no policies (service role only).

### `coach-hours` (v1)

- **Purpose**: self-reported coach working hours.
- **Trigger / auth**: HTTP, `verify_jwt: true`. Validates the user via an anon-key client carrying the caller's `Authorization` (`auth.getUser()`); DB access uses a separate service-role client.
- **Permission gates**: `isPrivileged` = `is_admin` OR legacy `permissions` includes `ms_ic`/`delivery_ic`/`mentorship`. `canViewAllHours` = privileged OR `permissions_v2` `coach.view_hours_all`. `canEditAllHours` = privileged OR `coach.edit_hours_all`. Non-privileged coaches are scoped to their **own** coach name(s), derived (mirroring the coach dashboard) by matching the user's `user_metadata.first_name` and email-local-part (before `@`, split on `+._`) against the distinct `coach` values in `mentorship_students`.
- **API endpoints** (`?api=`):
  - `bootstrap` (GET): capabilities + coach picker (all coaches if view-all, else just the user's) + `my_coach_names`.
  - `list` (GET): `coach_work_hours` rows, optional `from`/`to` (on `work_date`); privileged may filter by `?coach=`, others forced to their own names (empty names → empty rows).
  - `upsert` (POST): `{coach_name, period_type(weekly|daily, default daily), work_date(YYYY-MM-DD), hours(0–168), notes?}`, `onConflict: coach_name,period_type,work_date`; non-edit-all callers may only write their own coach name (403 otherwise).
  - `delete` (POST): `{id}`; non-edit-all callers may delete only rows whose `coach_name` is theirs.
- **Tables read**: `mentorship_students` (distinct coaches), `coach_work_hours`. **Written**: `coach_work_hours` (upsert/delete); stamps `entered_by_email`/`entered_by_id`/`updated_at`.
- **Gotchas**: coach identity is name-matching, not a stable ID — a user with no name match gets zero access to data. `hours` bounded 0–168.

### `meta-ads`

- **Purpose**: live read of Meta ad campaigns/insights/adsets for the marketing dashboard (proxies the Meta Graph API directly; does not read the mirror tables).
- **Trigger / auth**: HTTP, requires `Bearer` user JWT validated via anon-key client `auth.getUser()`. No version header in source.
- **Permission gate**: `is_admin` OR legacy `permissions` includes `marketing` OR `permissions_v2` includes `meta.view` (else 403).
- **External service**: Meta Graph API `v19.0`, `GET /{META_AD_ACCOUNT_ID}/<edge>` with `META_ACCESS_TOKEN`. Returns `data.data ?? []`. Requires env `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` (500 if unset).
- **API types** (`?api=`): `campaigns` (id,name,status,daily/lifetime_budget,objective; limit 100), `insights` (level=campaign, time_increment=1, fields spend/impressions/clicks/ctr/cpm/cpc/reach, `time_range` from `?from`/`?to`, default last 30d→today, limit 500), `adsets` (id,name,campaign_id,status,budgets,optimization_goal; limit 100).
- **Tables**: none (pass-through to Meta). **Gotchas**: budgets returned raw (in cents) here — unlike `sync-meta-ads` which converts to dollars.

### `sync-meta-ads`

- **Purpose**: read-only mirror of the Meta Marketing API into the `meta_ads_*` Supabase tables (only issues GET to Meta, never mutates the ad account). Cron-capable.
- **Trigger / auth**: HTTP; auth is **either** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` **or** header `x-sync-secret: <META_SYNC_SECRET>`. No user JWT path — meant for cron/back-end callers. No version header in source.
- **External service**: Meta Graph API `v19.0`; `metaGetAll()` paginates `paging.next` (page size 300, guard 100 pages). Env: `META_ACCESS_TOKEN` (ads_read), `META_AD_ACCOUNT_ID` (`act_...`), plus `META_SYNC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Modes** (`?mode=`, default `daily`); window via `?days=N` (default 30) or `?from=&to=` (default `to`=today):
  - `daily`: upserts entities — `meta_ads_campaigns` (id), `meta_ads_adsets` (id), `meta_ads_ads` (id, with `creative{id,name}`) — then daily (`time_increment=1`) campaign- and ad-level insights into `meta_ads_insights` (`onConflict: level,entity_id,date`).
  - `totals`: one aggregate insight row per campaign/ad over the window into `meta_ads_totals` (`onConflict: level,entity_id,date_from,date_to`).
- **Tables written**: `meta_ads_campaigns`, `meta_ads_adsets`, `meta_ads_ads`, `meta_ads_insights`, `meta_ads_totals`, and a `meta_ads_sync_runs` audit row per call (insert `running`; update to `success`/`error` with counts/finish time/error). Upserts are chunked 500/batch.
- **Gotchas**: budgets (`daily_budget`/`lifetime_budget`) converted cents→dollars; metrics coerced with `num`/`int` (non-finite → null). Insight `date` comes from Meta's `date_start`. Insights are stamped `synced_at`.

### `sync-accel-calls`

- **Purpose**: pull recent call sessions from the Accelerator (`accelonline.io`) admin API into the Calls Log, replicating the legacy Apps Script `fetchCallsAndLog`. Cron every minute.
- **Trigger / auth**: HTTP, **no caller auth check in source** (relies on `ACCEL_TOKEN` server secret to reach Accel; should be deployed with `verify_jwt` off or gated by the cron caller). No version header.
- **External service**: `GET https://admin.accelonline.io/api/v1/call/session` with `Authorization: <ACCEL_TOKEN>` (token already includes `Bearer`). Fixed query: `softDeleted=false&useSort=true&useBaseFilter=true&useItemsTotal=true&state=1` plus a nested `fields` selector for `startDate,durationInSec,fromUser/toUser{admin{firstName},student{firstName,phone,email}}`. `?skip` (0) / `?take` (50) paginate one page per invocation.
- **Query params**: `?dry_run=1` (transform, no insert), `?debug=1` (return counts + raw/mapped sample), `?take`, `?skip`. Returns 500 if `ACCEL_TOKEN` unset, 502 on fetch failure / non-2xx from Accel.
- **Mapping**: student = `fromUser.student ?? toUser.student`; rep (admin) = whichever side has `admin.firstName`. Output row `{date_time, first_name, number, email, rep, duration}`: `date_time` formatted as `yyyy-MM-dd HH:mm:ss` in **America/New_York** (to match existing Apps-Script rows); phone digit-stripped; email lowercased/trimmed; duration stringified. Rows with null `date_time` are dropped.
- **Tables written**: Calls Log via RPC **`insert_calls_batch(rows)`** (service-role client) — the RPC handles dedup/insert. Returns `{fetched, transformed, inserted}`.
- **Gotchas**: items read from `payload.body.items ?? payload.items`. Single page per call (no internal pagination) — the every-minute cron + dedup RPC is how the log stays current. No caller authentication in the function itself.
## Ingest, integrations & notifications

External data flows **into** the system through `ingest-*` HTTP endpoints and webhooks: VSL leads, Sales Log rows, Calendly bookings (drop-in replacements for the legacy Apps Script `doPost` handlers, writing through `insert_*` RPCs into their raw/data tables), Kajabi (credentials probe only), Typeform help-intake, and Dropbox file events. The mentorship survey lands via `survey-intake` (→ `mentorship_survey_responses`), and one-off / staged data loads go through `bulk-import-mentorship`.

Web push notifications run on `push-subscribe` (web-push / VAPID, `push_subscriptions` table); other functions fan out alerts by inserting `notifications` rows and calling `push-subscribe?api=dispatch` (service-role-only) plus per-recipient emails via `dispatch-event` (`event_key` → Resend, logged in `email_automation_sends`). The Dropbox integration is split across `dropbox-webhook` (cursor-driven polling, state in `dropbox_state`), `dropbox-resync` (backfill), and `dropbox-proxy` (read-only list / share / temp-link for the dashboard), all sharing a refresh-token OAuth flow.

Most public ingest endpoints are authed by a shared `?token=`/`?key=` query secret or a service-role bearer rather than a Supabase JWT, since external CRMs/webhooks cannot mint JWTs.

> **Retired stubs (deprecated / no-op):** `test-email`, `test-push`, `debug-smtp`, and `test-resync` are retired and now return HTTP **410**. Do not call or revive them; live equivalents live in `push-subscribe` (`api=test`/`admin-test`), `dispatch-event`, and `dropbox-resync`.

### ingest-vsl-lead

- **Purpose:** Replaces the Apps Script "VSL leads data" webhook; ingests CRM lead rows.
- **Trigger:** Public `POST` (JSON `{ name, phone, email, rep, type, funnel }`). `verify_jwt: false` (CRM can't send a JWT). CORS `*`; handles `OPTIONS`.
- **Writes:** via RPC `insert_vsl_lead({ payload })` (service-role client).
- **Gotchas:** No auth/secret at all — wide-open public POST. Payload passed through verbatim; all validation/null handling is the RPC's job.

### ingest-sales-log

- **Purpose:** Replaces the Apps Script "Sales Log" webhook.
- **Trigger:** Public `POST` (JSON `{ firstName, email, product, price, status, affiliate, platform, lastWebinar }`). `verify_jwt: false`. CORS `*`.
- **Writes:** via RPC `insert_sales_log({ payload })` (service-role).
- **Gotchas:** No auth/secret (public). `price` is locally cleaned via `cleanPrice()` (strips everything except `0-9 . -`); other fields default to `""` and rely on the RPC's `nullif` empty-string handling.

### ingest-calendly

- **Purpose:** Replaces the Apps Script "Calendly Data" webhook.
- **Trigger:** Public `POST` (JSON `{ firstName, phone, email, rep, appointment }`). `verify_jwt: false`. CORS `*`.
- **Writes:** via RPC `insert_calendly_data({ payload })` (service-role).
- **External:** none (uses runtime `Intl.DateTimeFormat`).
- **Gotchas:** No auth/secret (public). `formatET()` reparses `appointment` and reformats to `America/New_York` wall-clock (`YYYY-MM-DD HH:mm:ss`, h23); `"null"` sentinels → `""`; unparseable values pass through unchanged so the RPC fails loudly rather than writing garbage.

### survey-intake

- **Purpose:** Mentorship onboarding survey ingest from Typeform — extracts a student profile, upserts the student, stores the full Q&A, and alerts staff.
- **Trigger:** `POST` with `?token=<INTAKE_SECRET>` (env). Returns 500 if `INTAKE_SECRET` unset, 401 on mismatch. Accepts Typeform `form_response`; also unwraps a single-key `{ data: "<json string>" }` envelope. CORS allows `typeform-signature` header (signature not actually verified).
- **Reads:** `mentorship_students` (by `ilike(email)`), `auth.users` (admin `listUsers`, perPage 1000) to resolve coach + `ms_ic`/`delivery_ic` recipients.
- **Writes:** `mentorship_students` (insert new with `status:'Active', months_count:12`, or fill-only update of empty fields), `mentorship_survey_responses` (`source:'typeform'`, `content_qa`, `content_raw` markdown, `metadata`), `activity_log` (`mentorship.survey.received`), `notifications` (`kind:'survey_received'`), `notification_dispatch_log`, and `survey_intake_debug` (every request, success or failure).
- **External / fan-out:** calls `push-subscribe?api=dispatch` (service-role bearer) for web push and `dispatch-event` (`X-Dispatch-Secret`, `event_key:'survey_received'`) for staff emails. Requires `DISPATCH_EVENT_SECRET` (warns + skips email if missing).
- **Gotchas:** Profile mapping is a fuzzy title-matching `FIELD_MAP` (name/email/phone/location/goal/concern/baseline levels); brittle to question wording. Requires an extractable email or returns 400. Duplicate `mentorship_survey_responses` inserts are tolerated (error containing "duplicate" ignored). Header is `// survey-intake v17`.

### kajabi-probe

- **Purpose:** Diagnostic only — inspects the *shape* of `KAJABI_KEY`/`KAJABI_SECRET` env vars (length, prefix/suffix, whitespace, quote/UUID heuristics — no secret leak) and attempts a `client_credentials` OAuth call against Kajabi.
- **Trigger:** `GET`/any with `?token=<INTAKE_SECRET>`; 401 on mismatch. CORS `*`.
- **External:** `POST https://api.kajabi.com/v1/oauth/token`; echoes status + parsed body.
- **Tables:** none.
- **Gotchas:** Not a data ingest — a credential debugging tool. Header `// kajabi-probe v3`.

### bulk-import-mentorship

- **Purpose:** Staged bulk loader — pulls a JSON dump from the project's GitHub raw repo and feeds it to a bulk-import RPC.
- **Trigger:** Any method with `?token=<INTAKE_SECRET>` (401 on mismatch) and optional `?stage=master|coach|extras` (default `master`; unknown stage → 400).
- **External:** fetches `https://raw.githubusercontent.com/Ridleyacademy/dashboards/main/<file>` (cache-busted) where stage maps to `{ _tmp_import_data.json → bulk_import_all, _tmp_coach_data.json → bulk_import_coach_data, _tmp_extras.json → bulk_import_extras }`.
- **Writes:** via the stage's RPC `(<rpc>)({ p_data })` (service-role). Returns timing (`fetch_ms`, `rpc_ms`).
- **Gotchas:** Depends on a checked-in temp file existing in the public GitHub repo at fetch time (operational, ad-hoc). Header `// v5`.

### push-subscribe

- **Purpose:** Web-push hub — manages subscriptions and sends VAPID notifications.
- **Trigger:** `POST` with `?api=`; CORS allows `x-dispatch-secret`. Modes:
  - `subscribe` / `unsubscribe`: Bearer **user JWT** (parsed locally via `parseJwt`, `sub` = user_id; signature not verified). Upserts/deletes `push_subscriptions` on `(user_id, endpoint)`.
  - `test`: Bearer user JWT; sends a test push to the caller's own subscriptions.
  - `admin-test`: no Bearer; auth via `X-Dispatch-Secret` == `DISPATCH_EVENT_SECRET` (403 otherwise); sends test push to a given `user_id`.
  - `dispatch`: **service-role bearer only** (403 otherwise); sends `payload` to all subscriptions of `user_ids`. This is the internal entry point other functions call.
- **Reads/Writes:** `push_subscriptions` (select/upsert/delete; prunes endpoints on HTTP 404/410, bumps `last_used_at` on success). Logs each send to `notification_dispatch_log` (`channel:'push'`).
- **External:** `web-push@3.6.7` (npm). Needs `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`, default `mailto:alerts@ridleyacademy.team`); returns "VAPID not configured" if missing.
- **Gotchas:** Must be deployed `verify_jwt: false` since `admin-test`/`dispatch` use non-JWT auth and JWTs are parsed manually. Header `// push-subscribe v2.1`.

### dropbox-webhook

- **Purpose:** Detects new mentorship-video uploads in Dropbox, matches them to students by email-in-filename, updates the student's `video_url` + `video_submitted_date`, and alerts staff.
- **Trigger:** Dropbox webhook. `GET` echoes the `?challenge` (verification handshake, `text/plain` + `nosniff`); `POST` does the cursor-based diff.
- **⚠ Possible misconfig:** deployed **`verify_jwt: true`** despite receiving external Dropbox webhooks that cannot present a Supabase JWT — this would block real webhook deliveries (and the GET challenge). Verify the deployed setting; it most likely should be `verify_jwt: false` like the other webhooks.
- **Reads/Writes:** `dropbox_state` (key `mentorship_videos`: stores `cursor`, `last_polled_at`, `details`; lazily initializes via `get_latest_cursor`, re-inits cursor on `continue` error), `mentorship_students` (match by `ilike(email)`, update url/date), `auth.users` (coach + IC resolution), `notifications` (`kind:'video_received'`), `activity_log` (`mentorship.video.received`), `notification_dispatch_log`.
- **External:** Dropbox API via refresh-token OAuth (`DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN`): `list_folder` (`continue`, `get_latest_cursor`), `sharing/list_shared_links` + `create_shared_link_with_settings`. Folder from `DROPBOX_FOLDER` (default `/Mentorship Content/Mentorship Students Playing`). Fans out to `push-subscribe?api=dispatch` and `dispatch-event` (`event_key:'video_received'`, needs `DISPATCH_EVENT_SECRET`).
- **Gotchas:** `parseEmailFromFilename` handles plain `a@b.com` and `name-domain.tld` dashed forms. `video_submitted_date` = earliest matching file's `client_modified`/`server_modified` (date only). Each student processed once per run (`seenStudents`/`handledIds`). v3 explicitly **awaits** push/email fetches (v2 fire-and-forget got killed when the handler returned). Header `// dropbox-webhook v3`.

### dropbox-resync

- **Purpose:** Backfill `video_submitted_date` from real Dropbox file metadata only (no notifications, no purchase-date or filename-date fallback).
- **Trigger:** Any method; **service-role bearer required** (`Authorization: Bearer <SERVICE_ROLE_KEY>` exact match, else 401). No CORS headers.
- **Reads/Writes:** `mentorship_students` — Pass 1: students with files in the folder (set date from earliest file, set `video_url` via share link if missing). Pass 2: "stragglers" (have `video_url`, null `video_submitted_date`, Dropbox URL) → date from `sharing/get_shared_link_metadata`.
- **External:** Dropbox `list_folder`, `sharing/{list_shared_links, create_shared_link_with_settings, get_shared_link_metadata}` via refresh-token OAuth; same `DROPBOX_FOLDER`.
- **Gotchas:** Idempotent backfill; leaves date NULL if no real file metadata found. Returns per-pass counts. Header `// dropbox-resync v3`.

### dropbox-proxy

- **Purpose:** Read-only Dropbox browser for the dashboard — list files, get a share link, or get a short-lived streaming link.
- **Trigger:** `GET`/`POST` with `?api=list|share|temp-link|resolve` (default `list`). Triple auth: header `x-intake-secret` == `INTAKE_SECRET`, **or** `x-dispatch-secret` == `DISPATCH_EVENT_SECRET` (so SQL/server callers can query it), **or** a valid Supabase user (anon client + `getUser()` on the Bearer JWT); 401 if none.
- **External:** Dropbox `list_folder`, `search_v2` (recursive subfolder fallback), `sharing/{list_shared_links, create_shared_link_with_settings, get_shared_link_metadata}`, `files/get_temporary_link`. Refresh-token OAuth; `DROPBOX_FOLDER` default as above.
- **Modes:** `list` (optional `?q=` filter, newest first, cap 5000); `share`; `temp-link` (~4h direct media URL); `resolve` (`?url=` stale share link → fresh streaming link).
- **v20 EMAIL-FIRST matching (the student-video finder).** Files are named `<emaillocal>@<domain>-<date>-…`. `list` extracts the email(s) from `q` and matches on the FULL email or WHOLE email-local (never split on `.`, so `jackbaron1` ≠ `jack.wenaus`). Only if no email hit does it fall back to NAME matching with ALL tokens required (AND) — a lone common first name can't pull a stranger's clip. Recursive search re-applies the same strict test. Prior bug: loose ≥3-char OR-token matching leaked other students' videos. `via` reports `email|name|search|list`.
- **Tables:** none. Header comment says v20 (older lines still cite v4–v7).

### typeform-help

- **Purpose:** Public webhook for the "Need any help? Tell us" Typeform — parses answers, identifies the student by email, and raises an MS help alert that fans out to coach + MS-IC/Delivery-IC (in-app + web push).
- **Trigger:** `POST` with `?key=<secret>`. Non-`form_response` payloads (test pings) are acknowledged with 200 `ignored`. CORS `*`.
- **🔴 SECURITY — hardcoded secret:** the intake key is a **string literal in source** (`const INTAKE_KEY = 'tfk_4a91c7e6b2d04f38a5e1c9d7b6038f2e'`), not an env var. It is committed to the repo and rotating it requires editing + redeploying the function. **Action: move this to a `Deno.env.get(...)` secret and rotate the leaked value.**
- **Writes:** all DB work is inside RPC `ms_help_request({ p_email, p_name, p_message })` (service-role client), which creates the alert and fans out notifications.
- **Gotchas:** Identity fields (email/first/last/full name, phone) are used only for matching/title and are **excluded** from the alert message body; remaining answers join with `  |  ` and cap at 4000 chars (`(no message provided)` if empty). Email/name hidden-field fallbacks supported. Typeform signature header is not verified — security rests entirely on the URL `key`.

### daily-reports (v5; built 2026-07-01, `verify_jwt:false`)

- **Purpose:** Daily Report system. Admins assign people a report on custom weekdays; assignees submit answers to a question set; admins ↔ assignees hold a threaded conversation per report; a ~5 PM ET cron nudges anyone due-today who hasn't submitted.
- **Auth:** parses the Bearer user JWT itself (`verify_jwt:false`); `?api=run` is secret-gated via `X-Dispatch-Secret`. Service-role DB client. "Manager" = admin OR `daily_reports` role OR `daily_reports.manage`; assignees can always view+submit their own.
- **Tables:** `daily_report_questions` (global baseline set), `daily_report_assignments` (user_id UNIQUE, weekdays int[], active, assigned_by, **`questions` jsonb** = per-person override), `daily_reports` (user_id+report_date UNIQUE, answers jsonb), `daily_report_messages` (thread). Assigning auto-inserts a `daily_reports.view` grant; unassign deletes it.
- **APIs:** bootstrap / my-reports / submit / thread / reply / questions / save-questions / all-reports / assignments / assign / **assign-questions** / unassign / run.
- **Per-person questions (v5).** `questionsForUser(userId)` returns the assignment's `questions` jsonb if non-empty, else the global baseline; used by both `bootstrap` (the form shown) and `submit` (answer→text map). `assign-questions` sets/clears a person's set (empty array → NULL → inherit). `assignments` also returns `baseline` for the editor prefill. Frontend: Assignments tab → per-person **Questions** editor + "Reset to baseline".
- **Notifications (v4+):** `notify()` does THREE things — in-app `notifications` row + web-push (`push-subscribe?api=dispatch`) + **email** (`enqueueEmails()` → `email_outbox`, resolving each recipient via `auth.admin.getUserById`, `dedupe_key` NULL so every event sends). Fires on submit / replies / assignment / nudge. Routes to the assignment CREATOR (fallback: all managers).
- **Cron:** pg_cron `daily-reports-evening-nudge` `0 21 * * *` (5 PM EDT) → `?api=run` with the vault dispatch secret.

---

### org-targets (v6; `verify_jwt:true`)

- **Purpose:** ClickUp-style task backend for the Targets dashboard + org board My Post. Powers `targets-widget.js`.
- **Auth:** verifies the Bearer JWT via `getUser`; then a service-role DB client. Reads (list/for-post/get) = any authed user. Writes gated by `canManageTarget` = admin OR `org.edit_structure`/`org.assign_holders` OR the task's creator OR an assignee OR (if post-bound) the post's holder / senior holder. Any authed user may `create`, `comment-add`, `watch`/`unwatch`.
- **Tables:** `org_targets` (post_id nullable, status/priority/dates/estimate/tags[]/assignee_ids[], parent_target_id = subtasks, last_reminded_on), `org_target_comments` (**kind** 'comment'|'activity'), `org_target_checklist`, `org_target_attachments` (Dropbox), `org_target_watchers` (unique target_id+user_id). All RLS-on, **0 policies** (service-role only — advisor INFO is expected).
- **APIs:** list / for-post / get / create / update / delete / comment-add / comment-delete / checklist-add|update|delete / **watch** / **unwatch** / **attachment-upload** / attachment-delete.
- **Activity log:** `update` diffs old→new and writes `kind='activity'` comment rows ("changed status to Done", "set the due date to …", "updated the assignees", …). Reminders write activity rows too (`user_id` null).
- **Watchers/notifications:** recipients = **watchers ∪ assignees** (creator auto-follows on create). `notify()` (standard `notifications` row + `push-subscribe?api=dispatch`) fires on assignment (`target_assigned`), @mention (`target_mention`), comment (`target_comment`), status change (`target_status`).
- **Attachments — the rule:** `attachment-upload` reads the **raw request body stream** (`?target_id=&filename=`, mime from Content-Type) → Dropbox **upload session** (8 MB chunks, 20 MB cap) → public shared link. **Never base64-in-JSON** (an earlier version did and failed on the edge runtime). Same recipe as `chat`. `dbxToken()` uses the shared `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN`.
- **Gotcha:** `org-board.js` is a build artifact (`cat org-board-boot.js org-core.js org-extras.js > org-board.js`); the widget is used by both the dashboard and the board.

### targets-reminders (v4; `verify_jwt:false`, secret-gated)

- **Purpose:** Daily cron. Notifies on **overdue** (due_date < ET today) and **due-today** open tasks; recipients = assignees ∪ watchers. Overdue also posts an activity note. Dedupe via `org_targets.last_reminded_on` (once/day per task).
- **Auth:** `X-Dispatch-Secret` gate; service-role client.
- **Cron:** pg_cron `targets-overdue-reminders` `30 13 * * *` → the fn with the vault dispatch secret.

---

## Operations reference

### Cron jobs (pg_cron)

All HTTP-triggered jobs call an edge function via `net.http_post`/`net.http_get`, secret-gated with the `X-Dispatch-Secret` header pulled from the vault (never inline the secret).

| jobid | name | schedule | does |
|---|---|---|---|
| 1 | `sync-accel-calls-every-minute` | `* * * * *` | pull new calls from Accelerator API → `Calls Log` |
| 2 | `mentorship_pauses_daily_sweep` | `0 6 * * *` | SQL `sweep_ended_pauses()` — un-pause students whose pause ended |
| 4 | `check-pause-endings-daily` | `0 9 * * *` | edge fn: notify on pauses ending soon |
| 5 | `daily_lifecycle_dispatch` | `0 14 * * *` | SQL `run_daily_lifecycle_dispatch()` — lifecycle emails |
| 6 | `zoom-scheduler-every-15m` | `*/15 * * * *` | edge fn: per-occurrence Zoom invites + 24h/1h/live reminders |
| 7 | `weekly-active-snapshot-wed` | `30 23 * * 3` | SQL `write_weekly_active_snapshot()` — Wed end-of-week active counts |
| 8 | `double-payment-detector-15m` | `*/15 * * * *` | edge fn: flag duplicate charges → support ticket + alert |
| 9 | `zoom-room-roll` | `0 9 * * *` | edge fn `zoom-room-migrate?action=roll` — trim every recurring room to next 2 occurrences so it never expires |
| 10 | `email-drainer-every-min` | `* * * * *` | edge fn: drain `email_outbox` → Resend (sole sender) |
| 11 | `queue-watchdog-5min` | `*/5 * * * *` | edge fn: alert if the email queue stalls |
| – | `daily-reports-evening-nudge` | `0 21 * * *` | edge fn `daily-reports?api=run` — nudge people who haven't submitted |
| – | `mentorship-expiry-turnovers-daily` | `0 13 * * *` | edge fn: create expiry-milestone turnovers at 90/30/7 days before eff_end |
| – | `targets-overdue-reminders` | `30 13 * * *` | edge fn `targets-reminders` — overdue + due-today task notifications |

### Database tables (public schema, ~80)

- **Mentorship CRM:** `mentorship_students` (67 cols, the core record), `mentorship_activity_log`, `mentorship_alerts` + `mentorship_alert_comments`, `mentorship_turnovers` + `mentorship_turnover_comments`, `mentorship_coach_notes`, `mentorship_ic_notes`, `mentorship_rep_notes`, `mentorship_pauses`, `mentorship_pins`, `mentorship_resigns`, `mentorship_session_groups`, `mentorship_wins`, `mentorship_survey_responses`, `coach_work_hours`
- **Zoom:** `mentorship_zoom_sessions` (one row per class, shares the coach's room id+link), `mentorship_zoom_attendance`, `zoom_scheduler_runs`
- **Sales / calls / attribution:** `Sales Log`, `Calls Log`, `Calendly Data`, `VSL leads data`, `sales_declarations`, `rep_mappings`, `rep_reassign_map`, `rep_reassign_backup_20260616`
- **Email / notify:** `email_outbox` (durable queue), `email_automations` + `email_automation_sends`, `email_snippets`, `email_suppressions`, `resend_pacing` (shared token bucket), `notifications` + `notification_dispatch_log`, `push_subscriptions`, `system_heartbeats`
- **RBAC / auth / org:** `app_permissions` (key catalog), `app_roles`, `app_role_permissions`, `app_user_roles`, `app_user_permission_grants`; org board: `org_divisions`, `org_departments`, `org_posts`, `org_post_holders`, `org_executive_posts`/`_holders`/`_divisions`, `org_division_policy_editors`, `org_policies`; `pending_invites`, `api_keys`, `user_presence`, `activity_log`, `events`, `dashboard_archive`
- **Finance / support:** `refunds` + `refund_events`, `collections`, `support_tickets` + `support_events`, `subscriptions` + `subscription_events`, `fanbasis_webhooks_raw`
- **Meta ads:** `meta_ads_ads`, `meta_ads_adsets`, `meta_ads_campaigns`, `meta_ads_insights`, `meta_ads_totals`, `meta_ads_sync_runs`
- **Weekly stats:** `weekly_stats` (manual values), `weekly_stats_metrics` (catalog)
- **Tasks (Targets):** `org_targets`, `org_target_comments` (kind comment|activity), `org_target_checklist`, `org_target_attachments`, `org_target_watchers`
- **Messaging:** `chat_conversations`, `chat_members`, `chat_messages` (+ reactions/reads) — internal Slack-style chat via the `chat` fn
- **Integrations / misc:** `dropbox_state`, `survey_intake_debug`

RLS is enabled on all tables. Edge functions use the service-role key (bypasses RLS) and enforce access in code (legacy role + `permissions_v2` granular key — see *Backend RBAC*).

### Secrets

Stored in Supabase Vault / function env, never in source or surfaced in chat. Key ones: `DISPATCH_EVENT_SECRET` (gates dispatch-event, zoom-scheduler, all cron-invoked fns), `RESEND_API_KEY`, `ZOOM_ACCOUNT_ID`/`ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, Meta/Fanbasis/Dropbox tokens, VAPID keys. To invoke a secret-gated fn from SQL: `net.http_post(url:=…, headers:=jsonb_build_object('X-Dispatch-Secret',(select decrypted_secret from vault.decrypted_secrets where name='dispatch_event_secret')), …)`. ⚠️ `typeform-help.ts` has a hardcoded intake key in source — rotate it into env.

### Deploying an edge function (+ verify)

There is **no Supabase CLI / deno / access token in this environment** — the only deploy path is the MCP tool `deploy_edge_function` with the full source inlined.

1. Edit the local mirror `/tmp/dashx/edge-functions/<slug>.ts` (or `/tmp/<slug>-index.ts`), bump the header `// vN` comment, `node --check` it.
2. Deploy with `mcp__supabase__deploy_edge_function` (name, `entrypoint_path:"index.ts"`, correct `verify_jwt`, `files:[{name:"index.ts",content:<FULL source>}]`).
3. **Verify byte-fidelity** (mandatory for large files): `get_edge_function` → write deployed `content` to a temp file → `shasum`/`diff` against the local source; confirm it ends in the real handler, not a stub.
4. ⚠️ **Truncation gotcha (cost a ~20-min outage once):** general-purpose subagents silently truncate large inline `content` and deploy a broken stub. Deploy big functions (>~30 KB: students, zoom-meetings, access-control, email-automations, weekly-stats, declarations, collections, zoom-room-migrate) **from the main agent**, and always run step 3.

### Knowledge graph

A graphify knowledge graph of the **whole stack** (frontend + all 56 edge functions, with backend data-flow: fn→table, fn→service, page→script, page→endpoint, file→permissions) lives at `/tmp/dashx/graphify-out/` and as an Obsidian vault at `~/Documents/ridley-graph-vault`. Rebuild after changes: from `/tmp/dashx`, run `/graphify . --update` (content-hash cache makes unchanged files free). Query: `/graphify query "…"`, `/graphify path "A" "B"`, `/graphify explain "node"`.

---

## Kajabi community sync (v585)

Pulls coaching activity out of the Kajabi community into the Mentorship CRM.
Backend is the `kajabi-sync` edge fn (`verify_jwt:false` — it does its own auth).

### Why it exists

Coaches and students talk in private Kajabi channels named
`<Student>'s Assignments` (699 of them). `last_assignment_sent` /
`last_assignment_received` were maintained by hand and had drifted badly —
228 of 679 active students had both blank, and 246 more were >90 days stale.

### How the data gets in

Kajabi has **no public REST API for community data**. The only surface is
their MCP server (`mcp.kajabi.com/mcp`), which is plain HTTPS JSON-RPC with a
Bearer token, so an edge fn can call it. Non-obvious things that will bite you:

- The refresh token **rotates and the old one is revoked on use**, so it cannot
  live in a function secret. It lives in `kajabi_oauth` and is written back on
  every refresh, guarded by a `lease_until` mutex. The access token is cached
  for its full hour so a whole run refreshes once.
- **Always send `scope=read` on refresh.** Kajabi ignores scope narrowing at
  authorize time and otherwise grants `write:*` + `publish`.
- **Send a real `User-Agent`** or Cloudflare 403s you.
- Toolsets are **per-connection**: `enable_toolset {communities}` after
  `initialize`. Concurrent tool calls lose it — issue them **sequentially**.
- Argument types are inconsistent: `site_id` and `level` are **strings**,
  `per` is an **integer**.
- `list_posts` returns a **truncated** `message_preview`; full bodies need
  `get_post`, which is why the UI expands one post at a time.
- Videos are **not reachable**. They are uploaded natively to posts and appear
  in no API field and not in the media library. Do not re-investigate.

### Endpoints

| `?api=` | Auth | Purpose |
|---|---|---|
| `health` | `x-sync-secret` | Sweep all channels (11 calls, ~7s), update counts, re-run the matcher |
| `derive` | `x-sync-secret` | 2 calls/channel → last coach/student post; `&limit=` (max 60) |
| `sync` | `x-sync-secret` | health + derive |
| `status` | `x-sync-secret` | Token + backfill state |
| `conversation` | user JWT | Thread for `&student_id=`, optional `&channel_id=` |
| `post` | user JWT | Full body of one `&post_id=` |

Ops auth is the vault `dispatch_event_secret`, compared inside Postgres via
`kajabi_check_sync_secret()` — the secret never enters a function env var.
The service-role key is **not** in the vault; don't gate on it.
Dashboard auth is the normal user JWT plus `mentorship`/`sales_manager`/`coach`.

### Tables and functions

| Object | Notes |
|---|---|
| `kajabi_channels` | One row per channel; `student_id`, `is_primary`, derived activity. RLS on, service-role only. |
| `kajabi_oauth` | Single row. Rotating refresh token + cached access token + lease. |
| `kajabi_sync_runs` | Run log. |
| `kajabi_reparse_and_match()` | Re-derives `parsed_name` and re-runs the 3-stage matcher. Auto-links new channels. |
| `kajabi_rollup_to_students()` | Max across a student's channels → `mentorship_students.kajabi_*`. |
| `kajabi_sync_status()` | Counts for `?api=status`. |

Cron: `kajabi-health-2x-daily` (05:00/17:00) and `kajabi-derive-10min` (only
fires when a channel's post count actually moved).

### Matching gotchas

Channel names are hand-typed (`Assignments`/`asignments`/`Assingments`/
`Asssignments`/`Assginments`/`Assignements`). The matcher normalizes, then
tries exact → substring → first+last token. Two traps:

- A student whose name normalizes to an **empty string** (e.g. a CJK name)
  substring-matches every channel. Always guard `length(key) > 2`.
- Students legitimately own **more than one** channel. Never put a unique index
  on `student_id` — use `is_primary` with a partial unique index.
- **`is_privileged` does NOT identify coaches** (one coach is `false`, another
  `true`). A post's author is the student iff their name matches the student's
  CRM name; everyone else is the coach. Coaches also differ in layout — some
  post the assignment as the root, others reply in comments — so direction must
  key on author, never on post level.


### Stats (v586)

`kajabi_channels` only holds the LATEST coach/student post per channel, which
can answer "when" but never "how many this week". Counts over time come from
`kajabi_posts` (one row per post, ~52k rows), filled by `?api=posts`.

- **Incremental**: `list_posts` accepts `since`, so after the first backfill a
  channel only ever fetches what is new. `kajabi_channels.posts_synced_at` /
  `posts_newest_at` are the watermarks; a channel is re-fetched only when
  `last_post_at > posts_synced_at`.
- **`author_name` is stored, not the student's current coach.** Coach
  attribution must reflect who actually posted at the time — joining to
  `mentorship_students.coach` would silently rewrite past weeks whenever a
  student is reassigned.

`kajabi_metric(key, from, to)` is the single entry point for every metric:
`assignments_sent`, `assignments_received`, `students_posting`,
`coaches_posting`, `response_pct_48h`, `median_response_hours`,
`unanswered_count`, `awaiting_coach_now`. A `:Coach` suffix scopes to one coach
(`assignments_sent:Madison`).

**Response is measured PER CHANNEL, not per thread.** Some coaches reply inside
the student's thread; others answer by posting the next assignment as a new
root. Thread-scoping scored the second group as "never replied" (0% response
rates). A channel belongs to one student, so any later coach post in it counts.

**Dashboard wiring deliberately avoids the derived dispatcher.** The five
metrics are registered in `weekly_stats_metrics` as `source='manual'`, and
`kajabi_write_weekly_stats(weeks)` (cron `kajabi-weekly-stats-daily`, 05:30)
computes and upserts them into `weekly_stats`. This means **no edits to the
large weekly-stats edge function**. Rows are tagged `notes='auto: kajabi-sync'`
and the upsert only overwrites rows still carrying that tag, so a value edited
by hand in the dashboard is never clobbered.


### Coach vs student: the roster (v586)

**Never classify by comparing the author's name to the student's.** Display
names drift ("Gary M Whitfield" vs "Gary Whitfield", "CleoStone" vs "Cleone
Stone") and every miss turns a STUDENT into a COACH -- that was 32% of all
coach posts and inflated "assignments sent" badly.

`kajabi_staff_authors` is the roster, built by REACH: an author seen in >= 3
distinct channels is staff (no student posts in three students' channels), plus
anyone whose first name matches a CRM coach (catches a new coach with few
students). `kajabi_refresh_staff_authors()` rebuilds it and reclassifies
`kajabi_posts.is_coach`; rows with `source='manual'` are never overwritten, so
a human decision sticks.

`counts_as_coach=false` marks staff who are not coaching -- "Ridley Academy"
posts announcements across 90 channels and must not count as assignments sent.

Per-coach metrics resolve through `coach_key`, because the CRM stores a first
name ("Madison") and Kajabi carries a full name ("Madison Johnson").

Nightly self-heal order (`kajabi_write_weekly_stats`): refresh roster ->
`kajabi_derive_from_posts()` (recompute channel dates from stored posts, free
and exact) -> write weekly_stats.

Crons: `kajabi-health-2x-daily`, `kajabi-derive-10min`, `kajabi-posts-5min`,
`kajabi-weekly-stats-daily`. The derive/posts jobs no-op unless a channel's
post count actually moved.

~11 channels can't be auto-linked (nicknames like `Dvora Cope` vs CRM
`Deborah Cope`, one-letter typos, first-name-only channels) and need mapping
by hand.

### Missing files fail SILENTLY here (v588)

Two files — `loading-states.js` and `skeletons.css` — were deleted as collateral
in an unrelated commit (`2bc59a2`, "v99: service alert fan-out") and nothing
noticed for ~489 versions. 16 pages kept requesting a script that was gone.

Nothing surfaced it, for three separate reasons:

**Cloudflare answers a missing path with `200 text/html`** (the SPA fallback),
not 404. So a dead `<link>`/`<script>` is not a failed request — the browser
fetches an HTML document and quietly rejects it on MIME grounds. `curl` against
production cannot tell present from absent. **Audit the repo, not the site.**

**`cache.addAll()` is atomic.** One missing entry rejects the whole batch, and
the call was wrapped in `.catch(() => {})`. The result was that NONE of the 40
precache entries were ever cached — the PWA had no offline cache at all, and
said nothing. Use per-entry `cache.add()` + `Promise.allSettled` so one bad
entry costs one file.

**The Cache API refuses to store a redirected response** (`cache.put` throws on
`response.redirected`). This host 308s `/foo.html` → `/foo`, so every `.html`
entry in PRECACHE silently failed even after the atomicity fix. **PRECACHE paths
must be extensionless.**

`skeletons.css` was NOT restored: its rules already live in `mobile.css`
(`.skel`, `skel-shimmer`, `.skel-row/-kpi/-table-row`). That half of the deletion
was a real migration. Only the JS was lost.

Run `node tools/audit-refs.mjs` from the repo root before a release. It checks
asset references, page links, the three registries, and all four service-worker
traps, and exits non-zero on failure.

### `activate.html` is unregistered on purpose

It is not in `permissions.js` PAGES, and must not be. `access-guard.js` only
redirects when it finds a matching `PAGES` entry (`if (!didRedirect && def)`),
so an unregistered page passes through. `activate.html` is reached from an
invite email by someone who is not signed in yet — registering it would bounce
invitees to `home.html`. Anyone tightening that guard needs to keep this path
open.
