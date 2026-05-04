# Graph Report - .  (2026-05-04)

## Corpus Check
- 10 files · ~20,318 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 101 nodes · 173 edges · 14 communities detected
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
- [[_COMMUNITY_Community 13|Community 13]]

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
  notifications.js → notifications.js  _Bridges community 1 → community 5_
- `fetchNotifications()` --calls--> `getBase()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 5 → community 10_
- `ensurePushSubscribed()` --calls--> `getToken()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 5 → community 7_
- `fetchNotifications()` --calls--> `pingForNew()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 1 → community 10_
- `onClickRow()` --calls--> `closeDropdown()`  [EXTRACTED]
  notifications.js → notifications.js  _Bridges community 5 → community 12_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (8): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence(), watchKPIs()

### Community 1 - "Community 1"
Cohesion: 0.3
Nodes (11): ensureBellInTopbar(), ensureChimeStyles(), ensureSupa(), getChimeAudioEl(), init(), installAudioPrime(), pingForNew(), playChime() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 5 - "Community 5"
Cohesion: 0.39
Nodes (8): getBase(), getToken(), markAlertDone(), markAllRead(), markRead(), onClickRow(), setBadge(), unsubscribePush()

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
Cohesion: 0.5
Nodes (5): fetchNotifications(), openDropdown(), positionPanel(), renderRows(), startPolling()

### Community 11 - "Community 11"
Cohesion: 0.5
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 0.67
Nodes (3): closeDropdown(), onDocClickOutside(), toggleDropdown()

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 13`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getToken()` connect `Community 5` to `Community 1`, `Community 10`, `Community 7`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `fetchNotifications()` connect `Community 10` to `Community 1`, `Community 5`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `openDropdown()` connect `Community 10` to `Community 1`, `Community 12`, `Community 7`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._