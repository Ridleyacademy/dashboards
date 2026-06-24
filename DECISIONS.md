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

## 2026-06-24 — Rep Area: per-student contacts log + SVG phone icon
**What:** Added a "Contacts log" button in the Rep Area → `openStudentContacts(s)` modal (fetches `rep-contacts ?api=contacts&student_id=…`, lists date/who/notes; rep can log from there). Added `ICONS.phone` (lucide style) and replaced the 📞 emoji on the Log-contact button, the recently-contacted tag, the row "7d" badge, and the global contacts list. (The recently_contacted *filter* label keeps its emoji, matching the other emoji filter labels.)
**Touched:** students.js; version v388, changelog v388.

## 2026-06-24 — Rep Area → collapsible section under Identity (+ rep field moved in)
**What:** Moved the `rep` field out of the Identity `SECTIONS` block into a new `['Rep Area', [...]]` section placed right after Identity — so the profile populate/save loops (which iterate `SECTIONS`) keep handling rep automatically. The sections map special-cases 'Rep Area': renders only for `canRepView` (not on a new student) as a collapsible `_section` containing the rep field + a `#prof-rep-widgets` container that `renderRepArea()` fills with status/last-contact/log-contact. Removed the old standalone `#prof-rep-area` injection.
**Touched:** students.js; version v385, changelog v385.

## 2026-06-24 — Rep Area part 2: status + last-contact + badges + filters (UI)
**What:** students.js — profile **Rep Area** panel (assigned rep + last-contact date + rep-status dropdown → `mentorship_rep_status_log` + "Status history" modal + "Log contact" modal); student-row **rep-status badge + "📞 7d" recently-contacted tag** (rep-view roles, from the `repDataMap` loaded once per session); advanced-filter additions **rep_status** (multi) + **recently_contacted** (tri), rep-view only. Status text comes from a fixed dropdown set (safe to inline). `mentorship_students` still never written.
**Touched:** students.js; version v384, changelog v384. (Backend = rep-contacts v1 / the two tables from part 1.)

## 2026-06-24 — Rep Area part 1: contact log + Contacts queue
**What:** New, fully-additive rep CRM layer. Tables `mentorship_rep_contacts` (contact log → last-contact + recently-contacted) and `mentorship_rep_status_log` (append-only status history). `mentorship_students` is NEVER written — snapshot backup `mentorship_students_backup_20260624` (670 rows) taken first as a revert point. New edge fn `rep-contacts` v1 (verify_jwt, sha b51d8872): `rep-data` / `status-log` / `contacts` / `add-contact` / `set-status`. students.js/.html: a "Contacts" top button + modal (log a contact via student-picker; scoped list view), rep-data map loaded for view roles, recently-contacted count badge.
**Roles:** view (rep status, filters, full contacts) = admin/rep/sales_mgr/ms_ic/delivery_ic; edit (log contact, set status) = admin/rep/ms_ic/delivery_ic; coaches = their own students' contacts only.
**Part 2 (next):** per-student Rep Area in the profile (status dropdown + history + last-contact), row status badge + recently-contacted tag, and the list filters.
**Touched:** migration `rep_contacts_and_status_log`; rep-contacts.ts v1; students.js, students.html; version v383, changelog v383.

## 2026-06-24 — Turnover reassign: in the global queue + student-rep default
**What:** The "⇄ reassign" button now also appears on each card in the global "↪ Turn Over" queue (`renderGlobalTurnovers`), not just the per-student history. The rep picker now defaults to the **student's assigned rep** when it differs from the turnover's current rep. `ms-queue` v9 adds `student_rep` to turnover rows so the queue can supply that default. `openReassignTurnoverModal` was generalized to `(t, onDone, studentRep)` so both call sites (per-student modal + global queue) share it.
**Touched:** ms-queue.ts v9 (deploy byte-verified sha 743e9dd4); students.js; version.txt v382; changelog.js v382.

## 2026-06-24 — Turnover reassignment (standalone reassign-turnover fn)
**What:** New small edge fn `reassign-turnover` (v1, verify_jwt) gated to admin/MS-IC/Delivery-IC: updates `mentorship_turnovers.rep_name`, swaps the old rep for the new in `notified_user_ids` (keeps leads/coach), and notifies the new rep (in-app notification + `turnover_opened` email via dispatch-event). students.js: a small "⇄ reassign" button next to the rep name in the Turnovers history (gated by `canReassignTurnover`), opening a rep-picker modal that calls the fn.
**Why:** Ops wanted a quick way to hand a turnover to another rep from the turnover itself — same effect as the manual reassign done earlier for Katarina, now self-serve.
**Decision:** Built as a STANDALONE function rather than a new action in students.ts — students.ts is ~82KB and re-emitting it byte-perfect for an MCP inline deploy is too risky for the critical CRM. The standalone fn (~7KB) deploys/verifies cleanly. Trade-off: minor logic duplication (notify/email) vs. deploy safety. (students.ts mirror was reverted to the deployed v80 to avoid drift.)
**Touched:** edge fn reassign-turnover.ts (v1, byte-verified sha c7bd9b50); students.js; version.txt v381; changelog.js v381. Frontend live on push.

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
