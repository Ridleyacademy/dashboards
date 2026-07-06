# Graph Report - .  (2026-07-06)

## Corpus Check
- 16 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 547 nodes · 1156 edges · 16 communities detected
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
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `openStudent()` - 25 edges
2. `escapeHtml()` - 23 edges
3. `api()` - 19 edges
4. `escapeHtml()` - 18 edges
5. `loadStudents()` - 17 edges
6. `api()` - 14 edges
7. `renderStudentList()` - 14 edges
8. `renderEditor()` - 13 edges
9. `renderAll()` - 13 edges
10. `onAuthed()` - 11 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (106): _activeFilterChipLabel(), _advFilterCount(), _applyAdvFilters(), _computeDuplicateIds(), confirmLeaveUnsaved(), _daysSinceActivity(), deleteCoachNote(), _deleteNote() (+98 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (86): _actAggregate(), _actAvatarColor(), _actBuildAnomalies(), _actBuildSummary(), _actCategory(), _actCollapseNoise(), _actDayBucket(), _actFirstName() (+78 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (67): apply(), _applyAdvancedFilters(), _applyDateFilter(), _applyShowExpiredFilter(), cancelMeeting(), _chartGridColor(), _chartTextColor(), coachSlug() (+59 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (44): api(), attachAutocomplete(), boot(), debouncedRefreshPreview(), _defaultLabelFor(), deleteAutomation(), duplicateAutomation(), ensureEmailBlockBlotRegistered() (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (40): apiFetch(), applyEditCapabilityToButtons(), _attachReorderListeners(), cssId(), currentPeriodStartISO(), deltaParts(), displayPoints(), _enterReorderMode() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (35): closeDropdown(), ensureBellInTopbar(), ensureChimeStyles(), ensurePushSubscribed(), ensureSupa(), fetchNotifications(), getBase(), getChimeAudioEl() (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (22): apiFetch(), currentWeekAnchorUTC(), escapeHtml(), fetchCatalog(), fmtCount(), fmtMoney(), fmtPctV(), fmtVal() (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (9): applyImpersonationToUI(), clearImpersonation(), decorateKPIs(), getImpersonation(), injectTooltipStyles(), presenceTick(), renderImpersonationBanner(), startPresence() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.35
Nodes (9): checkForUpdates(), init(), isIPad(), maybeAutoShowAndroidHint(), maybeAutoShowHint(), maybeShowInstallButton(), nuclearVersionCheck(), safeReload() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.45
Nodes (9): canAccess(), currentPageFile(), effOf(), enforce(), getArchivedIds(), isAdmin(), logPageView(), runWhenReady() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (5): init(), load(), rememberSelect(), restoreDateRange(), wirePageFilters()

### Community 11 - "Community 11"
Cohesion: 0.44
Nodes (8): canOpen(), canOpenWith(), effective(), hasGranular(), impersonation(), pageDef(), _passesAccess(), _passesExclude()

### Community 12 - "Community 12"
Cohesion: 0.43
Nodes (5): getEffectiveUser(), markSeen(), maybeShow(), pickEntriesSince(), show()

### Community 13 - "Community 13"
Cohesion: 0.71
Nodes (5): apply(), bootstrap(), effective(), osPrefersLight(), syncBtn()

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 15`** (2 nodes): `build()`, `nav-menu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._