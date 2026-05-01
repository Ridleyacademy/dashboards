# Graph Report - /tmp/dashboards  (2026-05-02)

## Corpus Check
- 0 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 115 nodes · 157 edges · 16 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Impersonation + KPI tooltips|Impersonation + KPI tooltips]]
- [[_COMMUNITY_Mentorship CRM — coach + progress|Mentorship CRM — coach + progress]]
- [[_COMMUNITY_Mentorship CRM — schema + Logs|Mentorship CRM — schema + Logs]]
- [[_COMMUNITY_Access guard|Access guard]]
- [[_COMMUNITY_Cross-page filter persistence|Cross-page filter persistence]]
- [[_COMMUNITY_PWA install + version check|PWA install + version check]]
- [[_COMMUNITY_Auth gate (first-name + activated)|Auth gate (first-name + activated)]]
- [[_COMMUNITY_Changelog modal|Changelog modal]]
- [[_COMMUNITY_RBAC source of truth|RBAC source of truth]]
- [[_COMMUNITY_RBAC source of truth|RBAC source of truth]]
- [[_COMMUNITY_PWA install + version check|PWA install + version check]]
- [[_COMMUNITY_Skeleton loading states|Skeleton loading states]]
- [[_COMMUNITY_Service worker|Service worker]]
- [[_COMMUNITY_Other edge functions|Other edge functions]]
- [[_COMMUNITY_Nav menu picker|Nav menu picker]]
- [[_COMMUNITY_Meta Ads edge function|Meta Ads edge function]]

## God Nodes (most connected - your core abstractions)
1. `students edge function` - 13 edges
2. `students.html (Mentorship CRM page)` - 8 edges
3. `enforce()` - 6 edges
4. `permissions.js (RBAC source of truth)` - 6 edges
5. `Logs button (chooser modal)` - 6 edges
6. `AGENTS.md (Agent Guide)` - 5 edges
7. `coach permission (v94+)` - 5 edges
8. `first_name + activation gate (v95+)` - 5 edges
9. `CLAUDE.md (Claude Instructions)` - 5 edges
10. `effOf()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `CLAUDE.md (Claude Instructions)` --references--> `RidleyPerms.canOpen()`  [EXTRACTED]
  CLAUDE.md → AGENTS.md
- `CLAUDE.md (Claude Instructions)` --references--> `RidleyPerms.effective()`  [EXTRACTED]
  CLAUDE.md → AGENTS.md
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

### Community 0 - "Impersonation + KPI tooltips"
Cohesion: 0.2
Nodes (8): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence(), watchKPIs()

### Community 1 - "Mentorship CRM — coach + progress"
Cohesion: 0.27
Nodes (13): AVAILABLE_PERMS list, RidleyPerms.canOpen(), Coach Overview toggle, coach permission (v94+), Coach progress fields (v97+), students ?api=coaches, RidleyPerms.effective(), AGENTS.md (Agent Guide) (+5 more)

### Community 2 - "Mentorship CRM — schema + Logs"
Cohesion: 0.26
Nodes (12): mentorship_alerts table, mentorship_coach_notes, mentorship_ic_notes (I-C notes), computeLifecycle (server-side), Logs button (chooser modal), mentorship_students table, mentorship_pauses table, mentorship_rep_notes (+4 more)

### Community 3 - "Access guard"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 4 - "Cross-page filter persistence"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 5 - "PWA install + version check"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 6 - "Auth gate (first-name + activated)"
Cohesion: 0.28
Nodes (9): user_metadata.activated flag, admin-api edge function, admin-api ?api=set-permissions, admin-api ?api=users, first_name + activation gate (v95+), invite edge function, New invitee flow, Legacy user flow (+1 more)

### Community 7 - "Changelog modal"
Cohesion: 0.43
Nodes (4): getEffectiveUser(), maybeShow(), pickEntriesSince(), show()

### Community 8 - "RBAC source of truth"
Cohesion: 0.67
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 9 - "RBAC source of truth"
Cohesion: 0.6
Nodes (5): canOpen(), canOpenWith(), effective(), impersonation(), pageDef()

### Community 10 - "PWA install + version check"
Cohesion: 0.47
Nodes (5): changelog.js (ENTRIES), git post-commit graphify hook, pwa.js / nuclearVersionCheck, 4-step release process, CLAUDE.md release reminder

### Community 11 - "Skeleton loading states"
Cohesion: 0.5
Nodes (0): 

### Community 12 - "Service worker"
Cohesion: 0.5
Nodes (0): 

### Community 13 - "Other edge functions"
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

- **Why does `AGENTS.md (Agent Guide)` connect `Mentorship CRM — coach + progress` to `Mentorship CRM — schema + Logs`, `Auth gate (first-name + activated)`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `students edge function` connect `Mentorship CRM — schema + Logs` to `Mentorship CRM — coach + progress`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `first_name + activation gate (v95+)` connect `Auth gate (first-name + activated)` to `Mentorship CRM — coach + progress`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `dashboard edge function`, `calls edge function`, `income edge function` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._