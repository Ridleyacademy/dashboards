# Decisions & change log (dev-facing)

Append-only narrative of meaningful changes — **newest first**. One entry per change.
This is the *why* behind the code; the user-facing notes live in `changelog.js`, and
the structural map lives in the knowledge graph (`/graphify`). Format:

```
## YYYY-MM-DD — <short title>
**What:** one or two lines.
**Why:** the reason / problem it solved.
**Touched:** files / edge fns / tables / version.
```

---

## 2026-06-23 — Weekly Stats: assign metrics to users + filter by user
**What:** Added `weekly_stats_metrics.assigned_user_ids uuid[]` (+ GIN index). `weekly-stats` v36 adds `assignees` (GET, view — lists weekly-stats users) and `assign` (POST, edit — set a metric's assignees); `catalog` now returns `assigned_user_ids`. Dashboard (weekly-stats.js/.html) adds an "Assigned to" filter beside the division tabs, initials chips on cards, and an assignee checklist in the drilldown editor.
**Why:** User wanted to tag who owns each stat and filter the board to one person's stats. Chosen model: ownership tag only (shared value), optional filter for everyone (not an access restriction), assignable to anyone with weekly-stats access.
**Touched:** migration `weekly_stats_metric_assignees`; edge fn weekly-stats v36 (deploy byte-verified, sha b906f999); weekly-stats.js, weekly-stats.html; version.txt v380; changelog.js v380. Frontend goes live on git push.

## 2026-06-23 — Full backend documentation + whole-stack knowledge graph
**What:** Added Part II (Backend & Operations) to AGENTS.md documenting all 56 edge functions, cron jobs, tables, secrets, deploy/verify procedure. Built a graphify graph of the whole stack (frontend + edge functions + data-flow + cross-links) at `graphify-out/` and `~/Documents/ridley-graph-vault`. Seeded this file.
**Why:** Backend was undocumented; wanted a single referable source so future work is faster, cheaper, and lower-risk.
**Touched:** AGENTS.md, CLAUDE.md, DECISIONS.md (new), graphify-out/, edge-functions/ mirror.

## 2026-06-23 — Zoom "one room per coach" for create + remaining coaches
**What:** `zoom-meetings` v45: the `create` flow now adds a recurring class to the coach's existing room (one shared link) instead of making a new meeting — fail-safe (any error falls back to the old new-meeting path). Consolidated Madison, Dan, Ricardo onto single rooms (joining Carlos): each coach's classes share one room id+link, old meetings deleted, all students re-registered + emailed the new link.
**Why:** Coaches had accumulated many links; the goal is exactly one link per coach forever. Verified: every student has one personal link working across all their classes; reminders send the right per-student link.
**Touched:** zoom-meetings.ts (v45, deploy byte-verified after a truncated-stub outage), zoom-room-migrate.ts (consolidate/golive/resend), mentorship_zoom_sessions.

## 2026-06-23 — Durable email queue (email_outbox + drainer + watchdog)
**What:** `dispatch-event` now ENQUEUES into `email_outbox` instead of sending; `email-drainer` (cron/min) is the sole Resend caller (paced, retried, priority); `queue-watchdog` (cron/5min) alerts independently if the queue stalls.
**Why:** Make all email durable, paced under Resend's 2/s limit, and self-healing. Known residual: dispatch-event calls `listUsers` per send → bursts can rate-limit (fix identified, not yet shipped).
**Touched:** dispatch-event.ts (v11), email-drainer.ts, queue-watchdog.ts, email_outbox, resend_pacing, system_heartbeats.

## 2026-06-23 — System-wide RBAC v2 enforcement
**What:** Wired `permissions_v2` granular keys additively across every dashboard edge fn (students, zoom-meetings, admin-api, invite, access-control, income, calls, declarations, coach-hours, collections, meta-ads, etc.). Added assignable keys (e.g. `students.alerts.view_all`, `students.turnovers.view_all`). Closed write holes on zoom create/reschedule/cancel; admin-api now verifies JWT via getUser.
**Why:** Give fine-grained, role-assignable control without changing anyone's existing access (additive).
**Touched:** ~12 edge fns; app_permissions/app_roles/app_user_roles. See AGENTS.md → Backend RBAC.

<!-- Older history: see git log + changelog.js. Add new entries above this line. -->
