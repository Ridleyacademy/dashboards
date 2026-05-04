# Claude / Agent Instructions

**Before making any changes, read `AGENTS.md` in this folder.** It is the
source of truth for:
- The permission system (single source: `permissions.js`)
- Page / role matrix
- Shared script load order (`permissions.js` MUST load in `<head>`)
- The 4-step release process (code → bump `version.txt` → add `changelog.js`
  entry → commit + push)
- Common pitfalls (transformed ancestors break `position: fixed` —
  portal popovers to `body`; iOS Safari has no haptics; etc.)

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
4. **Commit + push.** Cloudflare deploys in ~30s. The `post-commit` git
   hook (installed via `graphify hook install`) re-runs AST extraction
   on changed code files and rebuilds `graphify-out/graph.json` +
   `GRAPH_REPORT.md` automatically. For doc/image changes, manually run:
   ```
   /graphify /tmp/dashboards --update
   ```

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
