# Claude / Agent Instructions

**Before making any changes, read `AGENTS.md` in this folder.** It is the
source of truth, in two parts:
- **Part I — Frontend:** permission system (single source: `permissions.js`),
  page/role matrix, shared script load order (`permissions.js` MUST load in
  `<head>`), release process, common pitfalls.
- **Part II — Backend & Operations:** all 56 Supabase edge functions grouped by
  system (Zoom, Email pipeline, Backend RBAC/`permissions_v2`, Finance/Support,
  CRM/sales, Analytics, Ingest/Notify), plus the cron jobs, database tables,
  secrets, the **deploy + byte-verify procedure**, and the knowledge graph.

Also see **`DECISIONS.md`** — the append-only dev log of what changed, when, and
why (one entry per meaningful change; this is the project's narrative history).

## After every code change

1. **Bump `version.txt`** — format `YYYY-MM-DDTHH:MM:SSZ-v<N>-<short-slug>`.
   Required for the PWA cache-bust to fire.
2. **Add a `changelog.js` entry** at the top of `ENTRIES`. Tag it with
   `roles: [...]` or `adminOnly: true` if only some users should see the
   note. Omit both = everyone. Skipping this means users won't be told
   what changed.
3. **Update `AGENTS.md`** if the change introduced a new convention, a
   new shared script, a new localStorage key, or a new gotcha worth
   warning future agents about. The doc is only useful if it stays
   honest.
4. **Add a `DECISIONS.md` entry** — date, what changed, why, files/fns touched,
   version. This is the "every step documented" log; keep it append-only.
5. **Commit + push.** Cloudflare deploys in ~30s. The `post-commit` git
   hook (installed via `graphify hook install`) re-runs AST extraction
   on changed code files and rebuilds `graphify-out/graph.json` +
   `GRAPH_REPORT.md` automatically. For doc/image changes, or after editing
   edge functions, manually refresh the graph from this folder:
   ```
   /graphify . --update
   ```

## Editing edge functions

Edge-function source is NOT shipped from this repo — it's deployed to Supabase
via the MCP `deploy_edge_function` tool (full source inlined). A byte-exact
mirror is kept at `edge-functions/<slug>.ts` for reference + the graph. After
any deploy, **verify byte-fidelity** (`get_edge_function` → `diff`/`shasum`) —
large files can silently truncate into a broken stub. See AGENTS.md →
*Operations reference → Deploying an edge function*. Do NOT commit the
`edge-functions/` mirror (`typeform-help.ts` contains a hardcoded secret).

## Things that are easy to forget

- `permissions.js` must load in `<head>` after `supabase-js`, NOT at end
  of body. Inline scripts depend on it at parse time.
- Topbar buttons must NEVER move position across dashboards. The user
  has flagged this multiple times. CSS for it lives in `mobile.css`.
- iOS Safari has no JavaScript hook for "Add to Home Screen". Don't
  invent one. The hint with arrow is the best UX possible.
- `position: fixed` inside the topbar (which uses `backdrop-filter`)
  gets reframed to that ancestor, not the viewport. Portal popovers to
  `document.body` on first open.
- Always use `RidleyPerms.canOpen()` / `RidleyPerms.effective(user)`
  for permission checks — never read `session.user.app_metadata`
  directly (impersonation breaks otherwise).
