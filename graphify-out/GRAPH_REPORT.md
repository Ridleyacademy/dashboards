# Graph Report - .  (2026-05-04)

## Corpus Check
- 10 files · ~19,438 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 98 nodes · 167 edges · 13 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `getToken()` - 8 edges
2. `fetchNotifications()` - 8 edges
3. `openDropdown()` - 7 edges
4. `enforce()` - 6 edges
5. `renderRows()` - 6 edges
6. `setBadge()` - 5 edges
7. `markAlertDone()` - 5 edges
8. `markRead()` - 5 edges
9. `markAllRead()` - 5 edges
10. `onClickRow()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `getToken()` --calls--> `ensureSupa()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 1 → community 2_
- `ensurePushSubscribed()` --calls--> `getToken()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 2 → community 7_
- `openDropdown()` --calls--> `renderRows()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 2 → community 10_
- `openDropdown()` --calls--> `injectPushCta()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 10 → community 7_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (8): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence(), watchKPIs()

### Community 1 - "Community 1"
Cohesion: 0.33
Nodes (9): ensureBellInTopbar(), ensureChimeStyles(), ensureSupa(), init(), pingForNew(), playChime(), shakeBell(), startPolling() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.4
Nodes (10): fetchNotifications(), getBase(), getToken(), markAlertDone(), markAllRead(), markRead(), onClickRow(), renderRows() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 6 - "Community 6"
Cohesion: 0.43
Nodes (4): getEffectiveUser(), maybeShow(), pickEntriesSince(), show()

### Community 7 - "Community 7"
Cohesion: 0.43
Nodes (7): ensurePushSubscribed(), getCurrentPushSub(), getPushReg(), injectPushCta(), pushSupported(), refreshPushCta(), urlB64ToUint8()

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 9 - "Community 9"
Cohesion: 0.6
Nodes (5): canOpen(), canOpenWith(), effective(), impersonation(), pageDef()

### Community 10 - "Community 10"
Cohesion: 0.4
Nodes (5): closeDropdown(), onDocClickOutside(), openDropdown(), positionPanel(), toggleDropdown()

### Community 11 - "Community 11"
Cohesion: 0.5
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 12`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getToken()` connect `Community 2` to `Community 1`, `Community 7`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `fetchNotifications()` connect `Community 2` to `Community 1`, `Community 10`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `openDropdown()` connect `Community 10` to `Community 1`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._