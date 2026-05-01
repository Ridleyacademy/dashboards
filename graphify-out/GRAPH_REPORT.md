# Graph Report - /tmp/dashboards  (2026-05-02)

## Corpus Check
- 0 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 117 nodes · 161 edges · 16 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Impersonation + KPI tooltips (ux.js)|Impersonation + KPI tooltips (ux.js)]]
- [[_COMMUNITY_Mentorship CRM — coach permission + progress|Mentorship CRM — coach permission + progress]]
- [[_COMMUNITY_Mentorship CRM — students schema + Logs|Mentorship CRM — students schema + Logs]]
- [[_COMMUNITY_Access guard|Access guard]]
- [[_COMMUNITY_PWA install + version check|PWA install + version check]]
- [[_COMMUNITY_Cross-page filter persistence|Cross-page filter persistence]]
- [[_COMMUNITY_Auth gate — invite + first-name + activated|Auth gate — invite + first-name + activated]]
- [[_COMMUNITY_Changelog modal|Changelog modal]]
- [[_COMMUNITY_Release process + auto graph rebuild|Release process + auto graph rebuild]]
- [[_COMMUNITY_Theme cycle|Theme cycle]]
- [[_COMMUNITY_RBAC source of truth (permissions.js)|RBAC source of truth (permissions.js)]]
- [[_COMMUNITY_Skeleton loading states|Skeleton loading states]]
- [[_COMMUNITY_Service worker|Service worker]]
- [[_COMMUNITY_Other edge functions (callsdashboarddeclarationsincome)|Other edge functions (calls/dashboard/declarations/income)]]
- [[_COMMUNITY_Nav menu picker|Nav menu picker]]
- [[_COMMUNITY_Meta Ads edge function|Meta Ads edge function]]

## God Nodes (most connected - your core abstractions)
1. `students edge function` - 13 edges
2. `students.html (Mentorship CRM page)` - 8 edges
3. `permissions.js (RBAC source of truth)` - 7 edges
4. `enforce()` - 6 edges
5. `Logs button (chooser modal)` - 6 edges
6. `AGENTS.md (Agent Guide)` - 5 edges
7. `CLAUDE.md (Claude Instructions)` - 5 edges
8. `coach permission (v94+)` - 5 edges
9. `first_name + activation gate (v95+)` - 5 edges
10. `effOf()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `God nodes (canOpen, effective, enforce)` --semantically_similar_to--> `RidleyPerms.canOpen()`  [INFERRED] [semantically similar]
  graphify-out/GRAPH_REPORT.md → AGENTS.md
- `God nodes (canOpen, effective, enforce)` --semantically_similar_to--> `RidleyPerms.effective()`  [INFERRED] [semantically similar]
  graphify-out/GRAPH_REPORT.md → AGENTS.md
- `CLAUDE.md (Claude Instructions)` --references--> `4-step release process`  [EXTRACTED]
  CLAUDE.md → AGENTS.md
- `CLAUDE.md (Claude Instructions)` --references--> `AGENTS.md (Agent Guide)`  [EXTRACTED]
  CLAUDE.md → AGENTS.md
- `CLAUDE.md (Claude Instructions)` --references--> `permissions.js (RBAC source of truth)`  [EXTRACTED]
  CLAUDE.md → AGENTS.md

## Hyperedges (group relationships)
- **Logs system (5 log kinds)** — agents_wins, agents_coach_notes, agents_rep_notes, agents_ic_notes, agents_turnovers, agents_logs_button [EXTRACTED 1.00]
- **First-name + activation auth gate** — agents_first_name_gate, agents_activated_flag, agents_set_password, agents_invitee_flow, agents_legacy_flow [EXTRACTED 1.00]
- **RBAC single source of truth** — agents_permissions_js, agents_available_perms, agents_pages_array, agents_canopen, agents_effective [EXTRACTED 1.00]

## Communities

### Community 0 - "Impersonation + KPI tooltips (ux.js)"
Cohesion: 0.2
Nodes (8): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence(), watchKPIs()

### Community 1 - "Mentorship CRM — coach permission + progress"
Cohesion: 0.25
Nodes (14): AVAILABLE_PERMS list, RidleyPerms.canOpen(), Coach Overview toggle, coach permission (v94+), Coach progress fields (v97+), students ?api=coaches, RidleyPerms.effective(), AGENTS.md (Agent Guide) (+6 more)

### Community 2 - "Mentorship CRM — students schema + Logs"
Cohesion: 0.26
Nodes (12): mentorship_alerts table, mentorship_coach_notes, mentorship_ic_notes (I-C notes), computeLifecycle (server-side), Logs button (chooser modal), mentorship_students table, mentorship_pauses table, mentorship_rep_notes (+4 more)

### Community 3 - "Access guard"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 4 - "PWA install + version check"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 5 - "Cross-page filter persistence"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 6 - "Auth gate — invite + first-name + activated"
Cohesion: 0.28
Nodes (9): user_metadata.activated flag, admin-api edge function, admin-api ?api=set-permissions, admin-api ?api=users, first_name + activation gate (v95+), invite edge function, New invitee flow, Legacy user flow (+1 more)

### Community 7 - "Changelog modal"
Cohesion: 0.43
Nodes (4): getEffectiveUser(), maybeShow(), pickEntriesSince(), show()

### Community 8 - "Release process + auto graph rebuild"
Cohesion: 0.38
Nodes (5): changelog.js (ENTRIES), git post-commit graphify hook, pwa.js / nuclearVersionCheck, 4-step release process, CLAUDE.md release reminder

### Community 9 - "Theme cycle"
Cohesion: 0.67
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 10 - "RBAC source of truth (permissions.js)"
Cohesion: 0.6
Nodes (5): canOpen(), canOpenWith(), effective(), impersonation(), pageDef()

### Community 11 - "Skeleton loading states"
Cohesion: 0.5
Nodes (0): 

### Community 12 - "Service worker"
Cohesion: 0.5
Nodes (0): 

### Community 13 - "Other edge functions (calls/dashboard/declarations/income)"
Cohesion: 0.5
Nodes (4): calls edge function, dashboard edge function, declarations edge function, income edge function

### Community 14 - "Nav menu picker"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Meta Ads edge function"
Cohesion: 1.0
Nodes (1): meta-ads edge function

## Knowledge Gaps
- **9 isolated node(s):** `dashboard edge function`, `calls edge function`, `income edge function`, `meta-ads edge function`, `user_metadata.activated flag` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Nav menu picker`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Meta Ads edge function`** (1 nodes): `meta-ads edge function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AGENTS.md (Agent Guide)` connect `Mentorship CRM — coach permission + progress` to `Mentorship CRM — students schema + Logs`, `Auth gate — invite + first-name + activated`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `students edge function` connect `Mentorship CRM — students schema + Logs` to `Mentorship CRM — coach permission + progress`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `first_name + activation gate (v95+)` connect `Auth gate — invite + first-name + activated` to `Mentorship CRM — coach permission + progress`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `dashboard edge function`, `calls edge function`, `income edge function` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._