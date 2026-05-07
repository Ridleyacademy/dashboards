// "What's new" changelog modal.
// Reads version.txt, compares to the last version the user has acknowledged
// (localStorage key `changelog-seen`). If newer, shows a modal listing the
// entries since their last seen version.
// Entries are embedded here so we don't need a separate fetch.
(function () {
  const SEEN_KEY = 'changelog-seen';
  // Newest first. Version is the major label only (without timestamp prefix);
  // the comparison uses array order, not string compare.
  // Each entry can carry a `roles` array to restrict who sees it.
  // Omit `roles` (or pass an empty array) to show to everyone.
  // `adminOnly: true` is shorthand for "is_admin only".
  const ENTRIES = [
    { version: 'v132', title: 'Coach Dashboard boots ~10× faster',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'Coach Dashboard now caches the student list locally — on warm reload the page renders instantly from cache and refreshes in the background.',
      'Pins and upcoming-meetings load in parallel after first paint instead of blocking it.',
      'Backend: zoom-meetings list-all now fetches per-user upcoming meetings in parallel (was serial) and caches the active-Zoom-users list for 60s.',
    ]},
    { version: 'v131', title: 'Admins see ALL upcoming Zoom meetings on the account',
      adminOnly: true, items: [
      'The Coach Dashboard now reads upcoming meetings directly from the shared Zoom account too — including any meeting created in zoom.us by hand (not just ones scheduled via this system).',
      'Externally-scheduled meetings are tagged with a "From Zoom" pill. Reschedule/cancel/invitees actions stay disabled for them (they\'re managed from Zoom directly).',
      'Coaches still see only meetings they host.',
    ]},
    { version: 'v130', title: 'Coach Dashboard: Your next Zoom session card + invitees modal',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New highlighted "Your next session" card at the top of the Coach Dashboard for the logged-in coach\'s upcoming meeting.',
      'One-click "Start as host" or "Open Zoom" button.',
      '"Invitees" button opens a modal listing every student invited, their email, whether the invitation email was sent, plus a "Copy personal link" button.',
      'Coaches now only see their own upcoming meetings on the dashboard. Admins / I-Cs / Delivery I-Cs / Mentorship still see everyone\'s.',
    ]},
    { version: 'v129', title: 'CRM icons aligned with the dashboard look',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Replaced colored emoji throughout the Mentorship CRM (Alerts, Logs, Videos, Surveys, Coach section, filter chips, modal headers) with the same Lucide-stroke SVG icons used by the Dashboards menu and Coach Dashboard.',
      'Same vocabulary across the app — easier to scan and matches the rest of the system.',
    ]},
    { version: 'v128', title: 'Zoom attendance history per student',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'Every Zoom session a student attends is now logged as a permanent record (not just overwriting "Last Zoom").',
      'Last Zoom date still updates to the most recent session — but old sessions are preserved.',
      'Mentorship CRM → student profile → Coach section → click the 🎥 History button next to Last Zoom to see the full session list (date, topic, duration, time in call).',
      'Coach Dashboard keeps showing only the latest Last Zoom date (uncluttered).',
      'Existing matched sessions were backfilled into the history.',
    ]},
    { version: 'v127', title: 'Per-coach Zoom host mapping (concurrent meetings)',
      adminOnly: true, items: [
      'New "Zoom host email" field in the Admin Panel (next to First name) — set each coach\'s personal Zoom account email there.',
      'When a coach schedules a meeting, it\'s now hosted under THEIR Zoom user, not the global owner. Two coaches with separate Zoom licenses can run sessions at the same time.',
      'Falls back to the ZOOM_HOST_EMAIL secret (if set) or the account Owner when a user has no mapping.',
    ]},
    { version: 'v126', title: 'Zoom integration — auto-attendance + schedule from dashboard',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'When a Zoom meeting on the shared mentorship account ends, the system auto-bumps the matching student\'s Last Zoom date — no more manual logging.',
      'New "Schedule Zoom" button on the Coach Dashboard: pick a time + duration, choose students, click Create. Zoom emails each student their personal join link automatically.',
      'Bulk schedule: select multiple students, hit "📅 Schedule Zoom for selected" to invite them all to one meeting.',
      'Upcoming meetings appear at the top of the Coach Dashboard with Copy link / Start / Reschedule / Cancel controls.',
    ]},
    { version: 'v125', title: 'New 🎯 Coach Dashboard with KPIs and bulk edit',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New Coach Dashboard tile on home — see your roster at a glance with 5 KPI cards (total / at risk / expiring / avg days since zoom / % with assignment last 7d).',
      'Coaches see only their own students; admins/ICs see a coach picker with All / per-coach scope.',
      'Click any row to open a profile modal with the most-used coach fields editable (Coach, Level, Module, Coach status, Last Zoom / Last Assignment dates, Schedule, Concern, Goal). "Full profile ↗" link jumps to the CRM for everything else.',
      'Multi-select checkboxes + bulk-edit toolbar: pick a field (Last Zoom, Last assignment, Level, Module, Coach status…) and apply to all selected students at once.',
      'Filter chips: All / At risk / Expiring / Needs attention. Search by name, email, or module.',
    ]},
    { version: 'v122', title: 'Schedule field moved from survey auto-extract to coach area',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New Schedule field in the Coach section of the student profile — coaches enter it manually (e.g. "Tue/Thu 6pm CET").',
      'Survey-intake no longer extracts the time-slot answer from Typeform automatically. Existing values stay; only future surveys stop overriding it.',
    ]},
    { version: 'v121', title: 'Mentorship CRM: full-featured filter system',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New 🔎 Filters button on the student list opens a panel with multi-select filters: Coach, Rep/Mentor, Product, Lifecycle status, Time until end (≤7d / ≤30d / Expired / etc.), Days since last activity, Coach status, Level, Module, Masterclass level, Term length.',
      'Yes/No filters: Verified, Has open alerts, Has wins, Has video, Has survey, Has Google Drive doc.',
      'Active filters show as removable chips at the top of the list — click ✕ to remove one or "Clear all" to reset.',
      'All filters work in both the regular student list view AND the 📊 Overview table view.',
    ]},
    { version: 'v120', title: 'Surveys: legacy Google Doc links + delete button',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New ➕ Add legacy survey link button at the top of the 📝 Surveys modal — paste a Google Doc / Notion / any URL with an optional label and date.',
      'Legacy links show with 🔗 icon and open in a new tab on click; structured Typeform surveys still open the in-app Q&A doc viewer.',
      '🗑 Delete button on each survey row for cleaning up test entries or stale links.',
    ]},
    { version: 'v119', title: 'Surveys: Typeform direct intake + 📝 Survey button',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Typeform now posts directly to the app (no Zapier needed). Every response is captured as a Q&A list and viewable as a doc from the student profile.',
      'New 📝 Surveys button on each student profile (next to 📂 Videos) — opens the list of received surveys with badge count, click any entry to read the full Q&A.',
      'Auto-fill of existing profile fields from the survey: Name, Email, Phone, Location, Goal (from "biggest benefit" / "what would you get" / "what goals would it help"), Concern (from "what problem would coaching solve" / "what do you struggle with"). Only fills NULL fields — never overwrites your edits.',
      'Removed the SURVEY DOC URL field from Resources — covered by the new live data.',
      'New 🔔 in-app + email + push notification when a survey arrives, fanned out to coach + ICs.',
    ]},
    { version: 'v118', title: 'Delayed start date on Onboarding',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New Delayed start (optional) date in Onboarding. When set in the future, the student\'s status becomes ⏳ Delayed start with a countdown until the date — sidebar dot turns blue, header badge shows "Xd to go".',
      'Once the delayed-start date arrives, the normal lifecycle calc takes over (Active / Expiring / Expired) based on the student\'s onboarded date.',
    ]},
    { version: 'v117', title: 'Videos modal: ✏️ Set URL button for manual entry',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New ✏️ Set URL button at the top of the Videos modal. Paste any URL — Dropbox, YouTube, anything — and it\'s saved on the student. Empties the field if you submit blank.',
      'When a student has no Dropbox match and no stored URL, the empty state now points to the button instead of leaving you stuck.',
    ]},
    { version: 'v116', title: 'Hide Student video URL field — covered by 📂 Videos button',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Removed the Student video URL input from Resources. The 📂 Videos button at the top of each profile already surfaces the file (Dropbox match first, stored URL as fallback), so the input was redundant.',
      'Existing video_url values stay in the database and still feed the fallback row in the Videos modal — nothing lost.',
    ]},
    { version: 'v115', title: 'Onboarding tidy: Circle URL replaces Circle-created checkbox',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Circle created checkbox is gone — having a Community / Circle URL says the same thing.',
      'Community / Circle URL moved out of Resources and into Onboarding next to Coach.',
    ]},
    { version: 'v114', title: 'Removed Product field from Identity',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'The Product input was unused; gone from the Identity section. Existing values stay in the database in case anything needs them later.',
    ]},
    { version: 'v113', title: 'Videos: stored URL fallback + earliest-date submission',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'When the Videos modal finds nothing in Dropbox but the profile has a Student video URL set, it now shows that URL as a single playable row. Dropbox share links are auto-converted to direct streams (?dl=0 → ?raw=1) so they play in the inline window.',
      'video_submitted_date now reflects the EARLIEST matching file in Dropbox for that student — both for the one-time backfill (19 students updated) and going forward via the webhook.',
    ]},
    { version: 'v112', title: 'Videos: inline player + Dropbox auto-sync',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Click ▶ Open on a student\'s video → it now plays inside a black, full-window player ON the same page (works inside the iOS PWA, no new tab). ↗ Share link button at the top right falls back to a public Dropbox URL if needed.',
      'New dropbox-webhook endpoint: when a video is uploaded to /Mentorship Content/Mentorship Students Playing/, the dashboard automatically updates that student\'s video_url + video_submitted_date and pings the coach + I/Cs via the bell + email + push.',
      'The whole Zapier zap (Dropbox trigger → 11 sheet/email steps) can now be retired — the dashboard does it directly.',
    ]},
    { version: 'v111', title: 'Dropbox videos button on each student profile',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New 📂 Videos button next to 🔔 Alerts and 📋 Logs. Opens a list of files from /Mentorship Content/Mentorship Students Playing/ filtered by the student\'s email or name.',
      'Each row has a ▶ Open button that fetches a public sharing link from Dropbox and opens the video in a new tab.',
      'Backend uses our new dropbox-proxy edge function with a stored Dropbox refresh token — no more Google Sheet round-trips needed for video access.',
    ]},
    { version: 'v110', title: 'Resource URL fields are now clickable',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Each URL field on a student profile now has an ↗ Open button next to it that opens the link in a new tab. The button only shows when the value starts with http(s) — pastes and edits update it live.',
    ]},
    { version: 'v109', title: 'Resources section + 25 students imported from coach tracker',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'New "Resources" section on each profile with four URL fields: Community / Circle URL, Google Drive doc, Student video, Survey doc — the four columns from the coach tracking sheet that didn\'t have a home before.',
      'Imported 25 students from the coach tracker (Sheet 2) with their coach, level, module, masterclass level, concern, last-assignment dates, plus all four resource URLs. The Mentorship CRM is now a complete superset of both Google Sheets — coaches no longer need to keep them open.',
    ]},
    { version: 'v108', title: 'Turnovers now ping like alerts (in-app + email + push)',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Filing a turnover now notifies the rep being handed-to (matched by first name or email), every MS I/C, every Delivery I/C, and the student\'s assigned coach. All three channels — bell + email + push — fan out at once.',
      'When you set a result on a turnover (closing it), everyone who was on the original recipient list PLUS the original creator gets notified that it\'s closed, with the result text and resolver — minus whoever set the result. So the rep who filed it always learns the outcome.',
      'Recipient list is snapshotted at create-time so the close fan-out is faithful even if perms change later (same pattern as alerts).',
    ]},
    { version: 'v107', title: 'Fix: chime path uses HTMLAudio first (iOS PWA reliable)',
      items: [
      'WebAudio kept refusing to play from realtime callbacks on iOS PWA. Switched the primary chime path to HTMLAudio (chime.wav), which keeps working after focus changes once it has been played once during a user gesture.',
      'The first-tap prime now plays the audio element at zero volume briefly (un-muted) — iOS doesn\'t count muted plays as user-activated, but a zero-volume play does.',
    ]},
    { version: 'v106', title: 'Fix: chime now plays from realtime callbacks on iOS PWA',
      items: [
      'iOS suspends the WebAudio context the moment the PWA loses focus (lock screen, app switch). When a realtime alert arrived afterward there was no fresh user gesture to resume it, so the chime was silent.',
      'The audio prime on first tap now also "warms" the HTMLAudio element (.play() then .pause() while muted). Once primed that way it can play any time, including from realtime callbacks.',
    ]},
    { version: 'v105', title: 'Notifications: HTMLAudio fallback + Test sound button',
      items: [
      'iOS PWAs sometimes refuse WebAudio entirely. The bell now falls back to an HTMLAudio chime (chime.wav) when WebAudio is suspended.',
      'New 🔊 Test sound button in the bell dropdown — plays the chime on demand so you can sanity-check whether the device / silent switch / volume is the issue.',
    ]},
    { version: 'v104', title: 'Fix: chime was silent (audio not unlocked)',
      items: [
      'iOS / Safari / Chrome block WebAudio until the user has tapped at least once, even on pages they\'ve been clicking around. The bell now primes the audio context on the first tap of any page so subsequent chimes actually play.',
    ]},
    { version: 'v103', title: 'Fix: bell dropdown overflowed on mobile',
      items: [
      'On phones the dropdown extended past the viewport edge. It now becomes a full-width sheet on screens ≤600px wide, with the height capped to fit between the topbar and the safe-area bottom.',
      'On desktop, the panel is force-clamped so its left edge can never slip off-screen at zoom levels ≠ 100%.',
    ]},
    { version: 'v102', title: 'Notifications: realtime + chime + mark-done from the bell',
      items: [
      'Bell now updates in real-time via WebSocket — new alerts pop in instantly instead of after up to 60 seconds. Polling kept as a 5-min fallback if the socket dies.',
      'Soft two-tone chime + bell-shake animation when a new alert lands (silent if the dropdown is already open).',
      'Open-alert rows in the dropdown have a ✓ Mark done button — type a resolution note, press OK, alert is resolved and the resolved fan-out fires (in-app + email + push) to everyone else. No need to open the student\'s page.',
    ]},
    { version: 'v101', title: 'Web push notifications (works when tab is closed)',
      items: [
      'New 🔔 Enable push notifications button in the bell dropdown. Once enabled, alerts arrive as system notifications even when the tab is closed.',
      'On iOS, requires adding ridleyacademy.team to your home screen first (Safari → Share → Add to Home Screen) and opening from there. iOS 16.4+ only.',
      'Service worker handles the push event, shows a system notification, and on click opens the alert in the dashboard.',
      'Once you set the VAPID secrets in Supabase (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), every new MS alert and resolution will dispatch alongside the in-app + email channels.',
    ]},
    { version: 'v100', title: 'Fix: bell dropdown was empty (no auth context)',
      items: [
      'notifications.js was trying to read the page\'s `supa` auth client off `window`, but each page declares it with `const`/`let` inside an inline <script> which doesn\'t attach to window. The bell rendered but never polled.',
      'Script now creates its own Supabase client and shares the persisted session via localStorage. No login impact — same session as the page.',
    ]},
    { version: 'v99', title: 'Service alert system: full fan-out + notifications bell',
      items: [
      'New permissions: ms_ic (full mentorship access), delivery_ic (full delivery access), ms_rep (read-only on the Mentorship CRM EXCEPT for resigns + alerts).',
      'When an MS alert is filed, every ms_ic, every delivery_ic, and the student\'s assigned coach (matched by first name) gets pinged. The recipient list is snapshotted on the alert so resolve-time fan-out is faithful.',
      'When the alert is resolved, every recipient PLUS the original creator gets a "resolved" notification (minus the resolver).',
      'New 🔔 notifications bell in the topbar of every dashboard, with unread count, dropdown of recent items, and one-click jump to the alert. Click outside to close.',
      'Email channel deployed (send-email edge fn over SMTP). Each notification includes the full payload — student name + email + assigned coach, who filed, when, alert title and details, and on resolution the resolution note. To turn on email, set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM as edge function secrets in Supabase.',
    ]},
    { version: 'v98', title: 'Mentorship: My-students filter, Coach overview, duplicates',
      roles: ['mentorship', 'sales_manager', 'coach'], items: [
      'New filter chips above the student list: All / Mine / Stale (>30d) / Duplicates. Each chip shows a live count.',
      '"Mine" filters to students whose Coach field matches your first name or email. Coach-only users land here by default.',
      '"Stale" surfaces onboarded students with no assignment received in the last 30 days (so coaches see who needs attention).',
      'Duplicate detection: students with the same email or name are auto-flagged with a ⎘ dup badge on the row.',
      '📊 Overview button — swap the profile pane for a coach overview table: name, status, level, module, coach status, days-since-last-assignment, last Zoom, alerts. Sorted stalest first. Click any row to jump back to the profile.',
    ]},
    { version: 'v97', title: 'Mentorship: new Coach section on each student',
      roles: ['mentorship', 'sales_manager', 'coach'], items: [
      'New Coach section in the student profile with 9 fields the coach updates: Level, Masterclass level, Current module, Coach status (All good / Needs attention), Last assignment sent, Last assignment received, Last Zoom, Concern, Goal.',
      'Mentorship CRM is now visible to users with the new coach permission too (previously mentorship + sales_manager only).',
    ]},
    { version: 'v96', title: 'Fix: new invitees were skipping the password step',
      items: [
      'The legacy-vs-new-user detection used last_sign_in_at, but Supabase sets that as soon as the invite link is clicked — so brand new invitees were getting the first-name-only screen and skipping password creation.',
      'Replaced with an explicit user_metadata.activated flag. Backfilled true for all existing users via SQL. New invitees see activated=false until they complete the form, so they always have to set a password.',
    ]},
    { version: 'v95', title: 'Force first-name set before app access',
      items: [
      'Every authenticated user must now have a first name set. If yours is missing, you\'ll be bumped to a small screen to enter it before reaching the app — even on a normal email/password sign-in.',
      'Legacy users (who already had a password) only see the first-name field — no need to re-enter the password.',
      'New invitees still get the full Activate Account flow (first name + new password + confirm).',
    ]},
    { version: 'v94', title: 'Coach permission + first names + Coach field type',
      items: [
      'New "coach" permission in the role list. Users with this permission appear in the Coach picker on the Mentorship CRM.',
      'Manage Users (admin): each user row now has a First name field. Edit + Save persists it to the user record.',
      'Invite form: optional First name field — pre-fills the new user\'s account before they activate.',
      'Activate Account screen now asks for First name alongside the new password and confirmation.',
      'Mentorship CRM Coach field is now a free-text input with autocomplete from coaches — type any name even if the coach doesn\'t have an account yet.',
    ]},
    { version: 'v93', title: 'Mentorship: consolidate Onboarding section',
      roles: ['mentorship', 'sales_manager'], items: [
      'Removed the 1st coach assignment field.',
      'Coach, Circle created, and Student onboarded date moved into Onboarding. The Coaching section is gone (Pauses panel now lives under Onboarding).',
    ]},
    { version: 'v92', title: 'Mentorship: + Rep notes + I/C notes; remove REG/Kat textareas',
      roles: ['mentorship', 'sales_manager'], items: [
      'Two new log types under the 📋 Logs button: 🧑‍💼 Rep notes (from REGs/sales reps) and 🎯 I/C notes (initial-call notes).',
      'Removed the REG notes and Kat\'s notes textareas from the profile. Any existing data was migrated into Rep notes entries (tagged "Migrated from …").',
      'Logs chooser now shows 5 cards (Wins / Coach notes / Rep notes / I/C notes / Turnovers) with per-type counts.',
    ]},
    { version: 'v91', title: 'Mentorship: one Logs button + turnover results',
      roles: ['mentorship', 'sales_manager'], items: [
      'The 🏆 Wins / 📝 Notes / 🔄 Turnover buttons are now consolidated into one 📋 Logs button at the top of each profile.',
      'Click Logs → choose Wins, Coach notes, or Turnovers. Each opens its full history modal as before.',
      'New: every turnover entry now has a + Add result button. Log the outcome of the hand-off (closed, not interested, scheduling, refunded, etc.) — captured with author + timestamp.',
    ]},
    { version: 'v90', title: 'Mentorship: unsaved-changes guard',
      roles: ['mentorship', 'sales_manager'], items: [
      'If you edit a student profile and click another student, sign out, or reload the tab, you now get a Save / Leave without saving / Cancel prompt before losing your work.',
    ]},
    { version: 'v88', title: 'Mentorship: turnover log replaces "Turnover to REG"',
      roles: ['mentorship', 'sales_manager'], items: [
      'Removed the "Turnover to REG" section and the standalone Coaching notes textbox (use 📝 Notes instead).',
      'New 🔄 Turnover button at the top of each profile. Pick a rep (autocompletes from the mentors list, or type a new name) + add a note + optional date.',
      'Each turnover is logged with who recorded it and when. Existing reg_assigned values were migrated to turnover entries on first deploy.',
    ]},
    { version: 'v87', title: 'Mentorship: collapsible sections + coach notes',
      roles: ['mentorship', 'sales_manager'], items: [
      'Every section in a student profile is now collapsible — click the section header to fold it. Open/closed state is remembered per-browser.',
      'New 📝 Notes button at the top of each profile (next to 🔔 Alerts and 🏆 Wins). Log session notes, observations, follow-ups; each note has an optional date and tracks who wrote it.',
      'Notes count badge turns purple when the student has any logged notes.',
    ]},
    { version: 'v85', title: 'Mentorship: service alerts',
      roles: ['mentorship', 'sales_manager'], items: [
      'Each student now has a Service Alerts system. ⚠ + Alert button at the top of the profile opens a modal to log a title + details for an unresolved issue.',
      '🔔 Alerts (N) button shows the count of unresolved alerts. Click to see the full history (open + resolved).',
      'Resolving an alert requires a resolution note. Resolved alerts stay in the list with the original details + the resolution + who resolved it and when.',
      'Sidebar ⚠ icon repurposed: now means "has unresolved alerts" (the dot color already shows expired/active/etc).',
    ]},
    { version: 'v82', title: 'Mentorship: resigns extend course duration',
      roles: ['mentorship', 'sales_manager'], items: [
      'New Resigns panel per student. Click + Add resign → modal with date / months added / amount / notes.',
      'Each resign adds N months to the lifecycle. Effective end date and Active / Expiring / Expired status update automatically.',
      'Last purchase date field is gone — any imported value was migrated to a resign entry on first deploy.',
      'Profile header now shows +Xmo from resigns when extensions are present.',
    ]},
    { version: 'v80', title: 'Mentorship: pauses + automatic expiring/expired',
      roles: ['mentorship', 'sales_manager'], items: [
      'Expired / Expiring soon is now computed automatically from student onboarded date + months count + total paused days. The manual checkbox is gone.',
      'Pauses are a list now. Each profile has its own Pauses table — click + Add pause to record one. Leave the End date blank for ongoing pauses; the lifecycle calculator freezes time while a pause is active.',
      'Header badges show: ● Active / ⚠ Expiring soon (Xd left) / ⚠ Expired (Xd ago) / ⏸ Paused. Plus the computed end date and total paused days.',
      'Sidebar list shows the same derived status + days left at a glance.',
    ]},
    { version: 'v79', title: 'Mentorship CRM matches the Routing Form',
      roles: ['mentorship', 'sales_manager'], items: [
      'Profile now mirrors every column from the Super Mentorship Routing Form sheet — REG, 1st & last purchase dates, months count, welcome call/zoom/survey/video, coach + circle + onboarded date, pause start/end/notes, end date + 9-month survey, winning student + winning data, turnover + REG assigned + resign date, Kat\'s notes, last activity, expired flag, verified flag.',
      'Profile is grouped into 8 sections (Identity, Purchase, Onboarding, Coaching, Pause, Lifecycle, Turnover to REG, Admin) so you can scan it without scrolling forever.',
      'Sidebar list shows coach + months + winning/verified/expired badges per row.',
      'Months count auto-fills from 1st purchase date if you leave it blank.',
    ]},
    { version: 'v76', title: 'Unified topbar across every page', items: [
      'The topbar logo gradient and the user-pill avatar were per-page (cyan-blue on Calls, gold-green on Income, etc.). Every dashboard now uses the same blue→purple gradient. Same banner everywhere.',
    ]},
    { version: 'v75', title: 'New dashboard: Mentorship CRM',
      roles: ['mentorship', 'sales_manager'], items: [
      'New "Mentorship Students" dashboard for the mentorship program. Searchable list of students; click a name to open their profile.',
      'Profile fields: name, email, phone, status (Active / Paused / Graduated / Cancelled / Lead), mentor (from rep mappings), product, joined / graduated dates, notes.',
      'New "mentorship" permission. Admin and Sales Manager also have access.',
    ]},
    { version: 'v74', title: 'Duplicate detection in declarations + auto-assign',
      roles: ['rep', 'sales_manager'], items: [
      'Two declarations claiming the same sale (same email + date + amount): later ones now show as Maybe with reason "Duplicate declaration: also declared by X". Earliest claim keeps Yes and gets a hint of the conflict.',
      'Auto-assign modal flags Sales Log duplicate rows (same email + price in scan range) with an amber ⚠ dup badge. Pre-checked toggle is OFF for affiliate-matched duplicates so admin reviews before crediting both.',
      'Header counts how many Sales Log duplicate rows were seen in the scan range.',
    ]},
    { version: 'v73', title: 'Declarations: clear message when no rep mapping', items: [
      'A rep whose Supabase user wasn\'t linked to a rep_mappings row would see a blank Declarations dashboard with no explanation. Now shows "No rep mapping configured for your account — ask an admin to link your account in Rep Mapping" so the next time it happens it\'s obvious.',
      'XSS-safe error rendering on the declarations table.',
    ]},
    { version: 'v72', title: 'Bug audit fixes', adminOnly: true, items: [
      'admin-api ?api=activity now sanitizes search inputs with double-quote PostgREST escaping. A comma in the search box no longer breaks the query (or in theory injects extra filters).',
      'home admin error messages render via textContent now, so a malicious error string can never inject HTML.',
      'home onAuthed reads the effective identity through RidleyPerms.effective() instead of duplicating impersonation logic.',
    ]},
    { version: 'v71', title: 'Audit pass: every page now has auth-flow safety nets', items: [
      'meta-ads + performance dashboards added the same 8s safety net the others already had — boot screen never hangs forever.',
      'declarations: invite + recovery detection extended to handle the PKCE query-string flow (was hash only).',
      'forgot-password.js: same hash+query detection, and only shows its overlay when the page didn\'t already route to set-password — no more double prompts.',
    ]},
    { version: 'v70', title: 'Fix: invitees were stuck spinning, no password form', items: [
      'Newer Supabase versions deliver invite links as ?code=xxx&type=invite (PKCE) instead of #access_token=...&type=invite (legacy hash). Detection only looked at the hash, so invitees never saw the set-password form.',
      'Detection now checks both hash and query, with a 12s safety net so the boot screen never hangs.',
      'Set-password form now also lives on home.html (was only on the Sales dashboard). Invite redirect points at /home so even reps without Sales access land somewhere they can use.',
    ]},
    { version: 'v68', title: 'Sessions tab now shows who\'s actually live',
      adminOnly: true, items: [
      'Each open dashboard sends a heartbeat every 60s. Sessions tab marks anyone whose last heartbeat is < 90s as ● live.',
      'Banner at the top of the tab counts how many users are live right now.',
      'Tab auto-refreshes every 30s while open.',
      'Force-logout also clears the user\'s presence so they immediately stop showing as live.',
    ]},
    { version: 'v67', title: 'Admin: audit-log filters + sessions + recent-activity widget',
      adminOnly: true, items: [
      'Activity log now filters server-side by actor email, action, date range, and free-text search. New "Clear filters" button.',
      'New Sessions tab: every user sorted by last sign-in. Each row has a Force Logout button that invalidates their refresh tokens (they get kicked within ~1 h, sooner if their app refreshes).',
      'Home dashboard now shows a "Recent Activity" widget with the last 10 events. View all → jumps to the full activity tab.',
    ]},
    { version: 'v65', title: 'Fixed date picker going off-screen on laptop', items: [
      'The date picker popup was anchored to the right edge of its button — when the daterange button moved to the left of the topbar (second row), the popup extended off-screen.',
      'Now anchored left, capped at viewport width − 24px. Mobile behaviour unchanged.',
    ]},
    { version: 'v64', title: 'Maybe-check now flags type mismatches',
      roles: ['rep', 'sales_manager'], items: [
      'A declaration whose email + date + price exactly matches a Sales Log row but whose type doesn\'t (e.g. you said Rebill but the sale was PP) is now marked as Maybe instead of Yes.',
      'The reason column shows: "Type mismatch: declared as X but sale was Y".',
      'Edit the declaration\'s type to switch back to a clean Yes.',
    ]},
    { version: 'v63', title: 'Auto-assign now shows already-declared sales',
      adminOnly: true, items: [
      'Bug: a $99 PP sale on the 28th wasn\'t showing because Chicca had already declared it as type=Rebill — silently skipped.',
      'Fix: the modal now has a third "📋 Already declared" section listing every sale that was skipped because a declaration already exists.',
      'Type mismatches (Sales Log status ≠ declaration type) are highlighted in amber and the section auto-expands when there are any. Edit the declaration directly to fix.',
    ]},
    { version: 'v62', title: 'Auto-assign now opens a preview modal',
      adminOnly: true, items: [
      'Clicking ⚡ Auto-assign opens a custom modal listing every sale that would be added.',
      'Top section: affiliate-matched sales (pre-checked). Uncheck any you do not want.',
      'Bottom section: unmapped sales (no affiliate). Pick a rep per row to manually assign — leave blank to skip.',
      'Apply commits exactly the selected rows. Existing declarations are still skipped.',
      'A row is highlighted if some other rep already declared the same sale.',
    ]},
    { version: 'v61', title: 'Auto-create declarations now includes Rebills',
      adminOnly: true, items: [
      'Both the per-row income auto-create and the bulk auto-assign on declarations now create declarations for Rebill rows too (with type=Rebill).',
      'GI and the Overall Revenue leaderboard still exclude Rebills server-side, so this is purely about giving admins a complete per-rep audit trail.',
    ]},
    { version: 'v60', title: 'Auto-assign declarations from Sales Log',
      adminOnly: true, items: [
      'New "⚡ Auto-assign from Sales Log" button on the Declarations dashboard (admin only).',
      'Scans Sales Log within the current date range, rep filter, and product filter; creates verified declarations for any sale whose Affiliate maps to a rep but does not already have one.',
      'Skips Rebills, sales without a rep-mapped affiliate, and sales missing email/date/price.',
      'Audit log records each batch with counts and 10 sample inserts under action declaration.auto_assign.',
    ]},
    { version: 'v59', title: 'Income edit modal: pick the time, not just the date',
      roles: ['finance', 'sales_manager'], items: [
      'When editing or creating a transaction on the Income dashboard, the Date field is now a date+time picker.',
      'Existing rows that only have a date keep working — they default to 00:00 in the picker.',
    ]},
    { version: 'v58', title: 'Income edits auto-create rep declarations',
      roles: ['finance', 'sales_manager'], items: [
      'When you save a sale on the Income dashboard whose Affiliate maps to a rep, the system now auto-creates a verified declaration for that rep — but only if the rep does not already have one for that sale.',
      'Skipped for Rebills and for sales without an Affiliate or matching email/date/amount.',
      'The note "Auto-created by system from Sales Log (verified affiliate match)" is set so it is distinguishable from manually-declared rows in the audit log.',
    ]},
    { version: 'v57', title: 'Fixed Calls "no data" bug after switching dashboards', items: [
      'When you switched from one dashboard to another, Calls would show empty GI / leaderboard until you re-clicked the date preset.',
      'Caused by a race: the page would fire its first data fetch with the default range BEFORE filter restoration kicked in, then a second fetch raced against it. Sometimes the wrong response won.',
      'Fix: pages now read the saved preset at init time, so there is only ever ONE data fetch with the correct range from the start.',
    ]},
    { version: 'v56', title: 'GI now excludes Rebills only (PP still counts)',
      roles: ['sales', 'sales_manager', 'calls', 'rep'], items: [
      'Sales Dashboard GI: was silently including 831 Rebill rows. Now excludes Rebill status only — Cash, PP, and untyped sales still count.',
      'Calls leaderboard / Overall Revenue: same rule (was already excluding Rebill, kept PP). Verified declarations of type Rebill are now also excluded.',
      'Payment Plan installments are kept as new sales by your decision.',
    ]},
    { version: 'v55', title: 'Sales dashboard GI now credits verified declarations',
      roles: ['sales', 'sales_manager'], items: [
      'Daily Gross Income on the Sales Dashboard now includes verified declared sales whose buyer email was not in VSL leads (e.g. direct buyers).',
      'No double-counting: declarations whose email is already in the lead cohort are skipped.',
      'When a funnel filter is active, declarations are excluded (they have no funnel attribution).',
    ]},
    { version: 'v54', title: 'Calls leaderboard now credits verified declarations',
      roles: ['calls', 'sales_manager', 'rep'], items: [
      'Gross Income and the Overall Revenue leaderboard now include verified declared sales whose Sales Log row had no (or unmapped) Affiliate. Previously those sales were uncredited.',
      'No double-counting: declarations that match a sale already attributed via affiliate are skipped.',
      'Each rep row now tracks how many of their sales came from declaration credits (declarationCredits / declarationCreditsGI).',
    ]},
    { version: 'v52', title: 'Filter persistence rewrite', items: [
      'Date range now correctly restores on Declarations (was stuck on This Week before).',
      'Switching dashboards no longer fires a second data fetch — fixes the Calls 0-calls / 600 k GI mismatch.',
    ]},
    { version: 'v51', title: 'Whats-new modal improvements', items: [
      'Modal no longer disappears when the app auto-reloads — pwa.js defers reloads while the modal is open.',
      'Entries are now filtered by your role, so you only see whats relevant to you.',
    ]},
    { version: 'v50a', title: 'Income forecast + duplicate detection',
      roles: ['finance'], items: [
      'New toggleable End-of-Month Forecast zone — predicts where the month will land based on current velocity.',
      'Transaction log flags possible duplicate sales (same email + same amount within 5 minutes).',
    ]},
    { version: 'v50b', title: 'App polish', items: [
      'Theme button now cycles Light → Dark → Auto. Auto follows your OS setting.',
      'Skeleton loaders during data fetch so the page structure is visible immediately.',
      'This "What\'s new" modal will pop up once after every release.',
    ]},
    { version: 'v48', title: 'Filter persistence', items: [
      'Date range, rep selector, and product tab now stay set when you switch dashboards.',
    ]},
    { version: 'v46a', title: 'Permission system improvements', adminOnly: true, items: [
      'Permission picker is now a single multi-select dropdown.',
      'Bulk invite mode in the Invite pane.',
      'Send password reset email from each user row.',
      '"View as" any user to preview what they see.',
    ]},
    { version: 'v46b', title: 'Access changes', items: [
      'Income access now scoped to Finance only.',
      'VSL Performance now correctly accessible to Marketing + Sales.',
    ]},
    { version: 'v40', title: 'Mobile + PWA polish', items: [
      'Pull-to-refresh inside the installed PWA.',
      'Haptic taps on Android.',
      'iOS install hint with bouncing arrow toward Safari\'s Share button.',
      'Home screen icon name is now "Ridleyacademy".',
    ]},
  ];

  // Returns true if `entry` is relevant to the given effective user.
  function entryAppliesTo(entry, eff) {
    if (eff?.is_admin) return true; // admin sees everything
    if (entry.adminOnly) return false;
    if (!entry.roles || !entry.roles.length) return true;
    const have = eff?.permissions || [];
    return entry.roles.some(r => have.includes(r));
  }

  function pickEntriesSince(seenVersion, eff) {
    let pool;
    if (!seenVersion) pool = ENTRIES.slice(0, 4); // first visit: a few recent
    else {
      const idx = ENTRIES.findIndex(e => e.version === seenVersion);
      pool = idx === -1 ? ENTRIES.slice(0, 4) : ENTRIES.slice(0, idx);
    }
    return pool.filter(e => entryAppliesTo(e, eff));
  }

  function show(entries) {
    if (document.getElementById('changelogModal')) return;
    // Tell pwa.js to hold off on auto-reloads while this is up
    window.__changelogModalOpen = true;
    const m = document.createElement('div');
    m.id = 'changelogModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
    const inner = document.createElement('div');
    inner.style.cssText = 'background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 22px;max-width:480px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);max-height:85vh;overflow-y:auto;';
    const sections = entries.map(e => `
      <div style="margin-bottom:18px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="background:rgba(107,158,255,0.18);color:#6b9eff;border-radius:999px;padding:2px 9px;font-size:0.66rem;font-weight:800;letter-spacing:0.04em;">${e.version}</span>
          <span style="font-weight:700;font-size:0.95rem;letter-spacing:-0.01em;">${e.title}</span>
        </div>
        <ul style="margin:0;padding-left:18px;">
          ${e.items.map(it => `<li style="font-size:0.83rem;line-height:1.55;color:#cbd1ee;margin-bottom:4px;">${it}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    inner.innerHTML = `
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:1.05rem;font-weight:800;letter-spacing:-0.02em;">✨ What's new</div>
        <div style="font-size:0.78rem;color:#7880a8;margin-top:2px;">Recent updates to the dashboards</div>
      </div>
      ${sections}
      <button id="changelogClose" style="width:100%;background:linear-gradient(135deg,#AC1818,#7a0e0e);color:#fff;border:none;border-radius:11px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer;margin-top:6px;">Got it</button>
    `;
    m.appendChild(inner);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    document.body.appendChild(m);
    document.getElementById('changelogClose').addEventListener('click', close);
    function close() {
      m.remove();
      window.__changelogModalOpen = false;
    }
  }

  async function getEffectiveUser() {
    if (typeof supa === 'undefined' || !window.RidleyPerms) return null;
    try {
      const { data: { session } } = await supa.auth.getSession();
      return window.RidleyPerms.effective(session?.user || null);
    } catch (_) { return null; }
  }

  async function maybeShow() {
    if (!ENTRIES.length) return;
    const latest = ENTRIES[0].version;
    let seen = '';
    try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch (_) {}
    if (seen === latest) return;
    // Wait for the session so we can filter entries by permission.
    const eff = await getEffectiveUser();
    if (!eff) return; // not signed in — skip until next visit
    const entries = pickEntriesSince(seen, eff);
    if (!entries.length) {
      // Nothing relevant to this user — still mark as seen so we don't keep checking
      try { localStorage.setItem(SEEN_KEY, latest); } catch (_) {}
      return;
    }
    show(entries);
    try { localStorage.setItem(SEEN_KEY, latest); } catch (_) {}
  }

  // Delay enough to let pwa.js's first version-check + any service-worker
  // takeover settle BEFORE we show the modal. Otherwise the modal would
  // pop and then a controllerchange reload would wipe it away.
  function start() { setTimeout(maybeShow, 4000); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
