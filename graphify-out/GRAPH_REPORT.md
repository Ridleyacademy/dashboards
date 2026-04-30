# Graph Report - .  (2026-04-30)

## Corpus Check
- 10 files · ~13,597 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 70 nodes · 92 edges · 10 communities detected
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

## God Nodes (most connected - your core abstractions)
1. `enforce()` - 6 edges
2. `effOf()` - 4 edges
3. `effective()` - 4 edges
4. `apply()` - 4 edges
5. `maybeShow()` - 4 edges
6. `canAccess()` - 3 edges
7. `syncBtn()` - 3 edges
8. `restoreDateRange()` - 3 edges
9. `wirePageFilters()` - 3 edges
10. `init()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.2
Nodes (8): applyImpersonationToUI(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence(), watchKPIs()

### Community 1 - "Community 1"
Cohesion: 0.42
Nodes (7): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), runWhenReady()

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (7): checkForUpdates(), init(), isIPad(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), showIOSHint()

### Community 4 - "Community 4"
Cohesion: 0.43
Nodes (4): getEffectiveUser(), maybeShow(), pickEntriesSince(), show()

### Community 5 - "Community 5"
Cohesion: 0.67
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 6 - "Community 6"
Cohesion: 0.6
Nodes (5): canOpen(), canOpenWith(), effective(), impersonation(), pageDef()

### Community 7 - "Community 7"
Cohesion: 0.5
Nodes (0): 

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 9`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Not enough signal to generate questions. This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, no INFERRED relationships, and all communities are tightly cohesive. Add more files or run with --mode deep to extract richer edges._