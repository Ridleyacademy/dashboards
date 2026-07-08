// "What's new" changelog modal.
// Reads version.txt, compares to the last version the user has acknowledged
// (localStorage key `changelog-seen`). If newer, shows a modal listing the
// entries since their last seen version.
// Entries are embedded here so we don't need a separate fetch.
(function () {
  const SEEN_KEY    = 'changelog-seen';
  const SHOWN_AT_KEY = 'changelog-shown-at';
  // Once we've shown the modal in the last N ms, never show it again — even
  // if we somehow lose the SEEN_KEY (Safari PWA storage purges, SW reloads,
  // race between show() and a hard reload, etc.). 30 days is plenty.
  const RESHOW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  // Newest first. Version is the major label only (without timestamp prefix);
  // the comparison uses array order, not string compare.
  // Each entry can carry a `roles` array to restrict who sees it.
  // Omit `roles` (or pass an empty array) to show to everyone.
  // `adminOnly: true` is shorthand for "is_admin only".
  const ENTRIES = [
    { version: 'v456', title: 'Messages — saved messages, search filters, disappearing messages', items: [
      'Save any message as a personal bookmark (⋯ menu → Save). Open the ★ button at the top of the message list to see everything you’ve saved, and tap one to jump to it.',
      'Filter search by person, files-only, and a date range — pick a name / toggle “Files only” / set from–to dates under the search box.',
      'Turn on disappearing messages per conversation (clock button in the chat header → Off / 1 hour / 24 hours / 7 days); older messages are removed automatically for everyone.',
    ]},
    { version: 'v455', title: 'Messages — emoji button in the composer', items: [
      'A smiley button next to the message box opens the full emoji picker so you can drop emoji straight into what you’re typing (it stays open so you can add several).',
    ]},
    { version: 'v454', title: 'Messages — full emoji picker, desktop alerts, group read receipts', items: [
      'React with any emoji: the six quick reactions now have a “＋” that opens a full emoji picker.',
      'Desktop notifications: when the dashboards are open in a tab you’re not looking at, you get a native pop-up for new messages (on top of the phone push). Your browser will ask permission the first time.',
      'In group chats, open a message’s ⋯ menu → “Read by” to see exactly who has read it and when.',
    ]},
    { version: 'v453', title: 'Messages — pin a message + mark unread', items: [
      'Pin any message to the top of a chat so the whole conversation can jump back to it — tap the pinned bar to scroll to it, or unpin from the ⋯ menu.',
      'Mark a conversation as unread from its ⋯ menu in the list, so you can come back and deal with it later.',
    ]},
    { version: 'v452', title: 'Messages — draft autosave', items: [
      'A message you start but don’t send is remembered per conversation — switch away and it’s still there when you come back. The list shows a red “Draft” hint.',
    ]},
    { version: 'v451', title: 'Messages — load older + steadier layout', items: [
      'Scroll up in a long conversation to load earlier messages (history no longer stops at the most recent batch).',
      'Chats no longer jump around while images, videos, and link previews load — their space is reserved up front.',
    ]},
    { version: 'v450', title: 'Messages — online / last seen', items: [
      'See who’s online now (green dot on their avatar) and, in a direct chat, “online” or “last seen …” under their name.',
    ]},
    { version: 'v449', title: 'Messages — voice note audio fix', items: [
      'Fixed voice notes playing back silently — the player now loads them with the correct audio type.',
    ]},
    { version: 'v448', title: 'Messages — voice notes play in every browser', items: [
      'Voice messages now record in a universal format, so they play on Safari, Chrome, and phones alike — no more silent notes between different browsers.',
    ]},
    { version: 'v447', title: 'Messages — voice note playback fix', items: [
      'Voice messages now play back reliably (previously the controls appeared but nothing played).',
    ]},
    { version: 'v446', title: 'Messages — mute, @everyone, voice notes', items: [
      'Mute a conversation (bell icon in the chat header) to stop its phone notifications — handy for busy groups.',
      'Type @everyone (or @all) in a group to notify all members.',
      'Record and send voice messages with the mic button in the composer.',
    ]},
    { version: 'v445', title: 'Messages — link preview image fits', items: [
      'Link preview thumbnails now show the whole image instead of a cropped strip.',
    ]},
    { version: 'v444', title: 'Messages — link previews', items: [
      'Links you send now show a preview card with the page’s title, description, and thumbnail (fetched securely on the server).',
    ]},
    { version: 'v443', title: 'Messages — drag & drop + separate sends', items: [
      'Drag photos, videos, or files straight onto a conversation to attach them (like WhatsApp).',
      'When you attach several files at once, each is sent as its own message — so each keeps its own 50 MB limit instead of sharing one.',
    ]},
    { version: 'v442', title: 'Messages — video thumbnails', items: [
      'Videos in a chat now show a preview of their first frame (with the play button) instead of a blank tile.',
    ]},
    { version: 'v441', title: 'Messages — PDF viewer renders inline', items: [
      'PDFs now open and render right inside the viewer with page-to-page scrolling (previously showed a blank screen / download prompt).',
    ]},
    { version: 'v440', title: 'Messages — open PDFs & files in the viewer', items: [
      'Tap a PDF to open it right inside the message viewer (like images) with page-to-page scrolling. Other file types open in the same viewer with an Open / Download option.',
    ]},
    { version: 'v439', title: 'Messages — fix “Load failed” on first upload', items: [
      'Attachments now retry automatically if the first upload after a page load fails, so a document uploads on the first try instead of needing a second attempt.',
    ]},
    { version: 'v438', title: 'Messages — line-style upload spinner', items: [
      'The uploading indicator on an attachment is now a spinning line-style loader instead of an hourglass emoji.',
    ]},
    { version: 'v437', title: 'Messages — consistent attachment icons', items: [
      'Attachment indicators now use the same line-icon style as the rest of the app (video thumbnails, previews) instead of emoji.',
    ]},
    { version: 'v436', title: 'Messages — pin chats, send files, copy text', items: [
      'Pin a conversation to keep it at the top of your list (great for the support/refunds team’s key threads). Open a chat and tap the pin icon in the header.',
      'Attach files beyond photos & videos — PDFs, docs, spreadsheets, etc. (up to 50 MB). They show as a downloadable file tile.',
      'Copy a message’s text from the ⋯ menu.',
    ]},
    { version: 'v435', title: 'Messages — faster chat open + loading skeleton', items: [
      'Opening a conversation (including jumping to a searched message) is faster — the server no longer re-authenticates with attachment storage on every open.',
      'While a chat loads, shimmering placeholder bubbles show instead of a blank “Loading…”, so it no longer looks frozen.',
    ]},
    { version: 'v434', title: 'Messages — loading skeleton while searching', items: [
      'Searching message content now shows shimmering placeholder rows while results load, instead of looking empty/broken until the server responds.',
    ]},
    { version: 'v433', title: 'Messages — search box now searches message text', items: [
      'The conversation search box now also searches inside message content (relabeled “Search messages & chats”). If it looked like it only matched chat names, hard-refresh to pick up the new version.',
    ]},
    { version: 'v432', title: 'Messages — search inside messages', items: [
      'The conversation search now also finds conversations by their message content — results show which chat and the matching message (with the term highlighted).',
      'Tap a message result to jump straight to that message in the conversation.',
    ]},
    { version: 'v431', title: 'Messages — line-style search icon', items: [
      'The in-conversation search button now uses a clean magnifier icon matching the rest of the UI.',
    ]},
    { version: 'v430', title: 'Messages — search, typing indicator & new-message divider', items: [
      'Search your conversation list by name (box above the list).',
      'Search within a conversation: tap the 🔍 in the thread header, then step through matches.',
      '“X is typing…” shows live while someone is typing to you.',
      'A “New messages” divider marks where you left off, plus a ↓ button to jump to the latest.',
    ]},
    { version: 'v429', title: 'Messages — deleted messages can’t be selected', items: [
      'Deleted messages no longer show a checkbox and can’t be picked when selecting to forward.',
    ]},
    { version: 'v428', title: 'Messages — readable reply quote + smoother select', items: [
      'Redesigned the “replying to” quote: dark panel, teal name, and up to two readable lines of the original — clear on every message.',
      'Fixed flicker when checking messages in Select/Forward mode (rows now toggle in place instead of re-rendering the whole thread).',
    ]},
    { version: 'v427', title: 'Messages — clearer reply quote', items: [
      'The quoted “replying to” preview is now easy to read on both your own (green) and incoming messages.',
    ]},
    { version: 'v426', title: 'Messages — reply, forward & clickable links', items: [
      'Reply to a specific message (like WhatsApp): pick Reply from a message’s ⋯ menu; the reply shows a quote you can tap to jump to the original.',
      'Forward messages: use ⋯ → Forward for one, or ⋯ → Select to pick several, then choose a conversation to send them to.',
      'Links in messages are now clickable and open in a new tab.',
      'Fixed: the ⋯ menu in the topbar messages popup now opens reliably.',
    ]},
    { version: 'v425', title: 'Messages — cleaner “deleted” look', items: [
      'A deleted message now shows as a small, muted “This message was deleted” line instead of a full bubble with an emoji.',
    ]},
    { version: 'v424', title: 'Messages — fix delete + in-app confirm dialog', items: [
      'Fixed a bug where using Edit/Delete from the topbar messages popup could close the whole panel.',
      'Delete now asks with a styled in-app confirmation instead of the browser’s default popup.',
    ]},
    { version: 'v423', title: 'Messages — line-style Edit/Delete icons', items: [
      'The Edit and Delete options (and the “Editing” bar) now use clean line icons that match the rest of the UI.',
    ]},
    { version: 'v422', title: 'Messages — styled react icon + WhatsApp-style read receipts', items: [
      'The react button is now a clean smiley icon that matches the rest of the UI (and shows in dark mode).',
      'Each message footer now shows the full date and time.',
      'Your sent messages show delivery status like WhatsApp: ✓ sent, ✓✓ delivered, and ✓✓ (green) once read.',
    ]},
    { version: 'v421', title: 'Messages — clearer react/edit buttons + smoother updates', items: [
      'The react (🙂) and edit/delete (⋯) buttons now sit under every message and are always visible — no more hovering to find them (works on touch too).',
      'Reactions and edits update more smoothly — your own changes no longer flicker or momentarily double-count.',
    ]},
    { version: 'v420', title: 'Messages — reactions, edit/delete & @mentions', items: [
      'React to any message with an emoji — tap the ☺ on a message or a reaction chip to toggle yours.',
      'Edit or delete your own messages from the ⋯ menu. Edits show an "edited" tag; deletes leave a "message deleted" placeholder.',
      'Type @ to mention a member (in DMs or groups). Mentioned people get a distinct "mentioned you" phone notification and the name is highlighted in the thread.',
    ]},
    { version: 'v419', title: 'Refunds — "Refund Manager" record type', items: [
      'New record type "Refund Manager" (right after Refund Request). Setting a refund to it notifies the refund manager.',
    ]},
    { version: 'v417', title: 'Declarations — New GI stat', items: [
      'Added a "New GI" card up top: cash sales + payment plans, excluding rebills.',
    ]},
    { version: 'v416', title: 'Messages — zoom images + smoother media loading', items: [
      'In the expanded view, tap an image to zoom in (and pan); tap again to zoom out.',
      'Media now shows a placeholder while it loads instead of popping in suddenly.',
      'Opening media from the 💬 popup no longer closes the popup behind it.',
    ]},
    { version: 'v415', title: 'Messages — tap media to expand + download', items: [
      'Tap a photo to open it full-size in a pop-up, or tap a video to play it there — no new tab.',
      'Each has a Download button to save the file directly.',
    ]},
    { version: 'v414', title: 'Messages — attachment size limit + lighter background refresh', items: [
      'Photo/video attachments are now capped at 50 MB each.',
      'The messaging background refresh runs a bit less often (live updates are unaffected).',
    ]},
    { version: 'v413', title: 'Photo/video attachments now upload reliably', items: [
      'Fixed attachments failing to upload — media now sends through the server to storage instead of the browser uploading directly (which was being blocked).',
    ]},
    { version: 'v411', title: 'Messages — send photos & videos', items: [
      'Tap the 📎 in any chat (DM or group) to attach photos and videos, with or without a caption.',
      'Images preview inline (tap to open full-size); videos play right in the chat.',
      'Media is stored securely and only people in that conversation can view it.',
    ]},
    { version: 'v410', title: 'Messages — "Send failed" after idle fixed + phone alerts restored', items: [
      'Sending a message after leaving the page open no longer fails with "Load failed" — it now retries automatically with a fresh session.',
      'If a send still can\'t go through, your typed text is restored instead of being lost.',
      'New messages once again send a phone/app notification (they just stay out of the 🔔 bell).',
    ]},
    { version: 'v409', title: 'Messages stay in Messages (out of the bell) + live unread', items: [
      'New messages no longer show in the 🔔 notification bell — they live in Messages only.',
      'The 💬 button shows a green count of unread messages, and conversations with unseen messages are highlighted in the list.',
      'Messages now arrive live (fixed a realtime hiccup) — no refresh needed.',
    ]},
    { version: 'v406', title: 'Messages — cleaner bubbles + snappier sending', items: [
      'Fixed message bubbles that squished short words onto stacked letters — text now wraps normally.',
      'Sending is instant (your message shows immediately) and conversations load faster (no full refresh on every send).',
    ]},
    { version: 'v404', title: 'Fix: top-bar Messages popup now shows your conversations', adminOnly: true, items: [
      'The 💬 top-bar popup was using a separate login session, so it showed no conversations. It now shares your session — the same DMs and groups as the Messages page appear.',
    ]},
    { version: 'v403', title: 'Messages button in the top bar (everywhere)', items: [
      'A 💬 Messages button now sits next to the 🔔 bell on every dashboard — click it to pop open your chats without leaving the page.',
      'The popup has the full messaging: your conversations, DMs, group chats, and a composer. A green count shows unread messages.',
    ]},
    { version: 'v402', title: 'New: Messages — internal team chat', items: [
      'A new Messages dashboard: direct-message anyone on the team and create group chats — text only, like a simple Slack.',
      'New messages ping your notification bell and push to your phone (if push is enabled). Open it from the Dashboards menu or the home screen.',
      'Start a 1:1 with “New message”, or “＋ Group” to make a named group; messages appear live as they’re sent.',
    ]},
    { version: 'v401', title: 'Push enable — now shows the exact reason if it fails', adminOnly: true, items: [
      'Tapping "Enable push notifications" now pops up a clear success/failure message (with the failure reason) instead of only a tiny button label — added to diagnose an iPhone case where enabling silently didn\'t register.',
    ]},
    { version: 'v400b', title: 'Notifications — Daily Reports now email you + push fix',
      items: [
      'Daily Reports now also send an email (in addition to in-app + push) on everything: submissions, replies, new assignments, and the 5 PM reminder.',
      'Push notifications: fixed a case (especially on iPhone home-screen apps) where a subscription went stale and quietly stopped delivering — enabling now always registers a fresh one. If push still isn’t arriving, open the 🔔 bell → Enable push notifications → Allow.',
    ]},
    { version: 'v400a', title: 'Daily Reports — custom questions per person',
      roles: ['daily_reports'], items: [
      'The Questions tab is the shared baseline everyone answers. You can now tailor questions for one person: Assignments → that person → Questions → edit → Save.',
      'A “custom Q×N” tag marks anyone with their own set; “Reset to baseline” drops the override so they follow the shared questions again.',
    ]},
    { version: 'v400', title: 'Student CRM — “No video” filter, multiple emails/phones + coach fixes',
      roles: ['coach', 'mentorship', 'ms_ic', 'delivery_ic'], items: [
      'New “No video” quick-filter in the student list: shows onboarded students who have no video on file, so you can chase submissions.',
      'A student can now have more than one email and phone in Identity (＋ to add, ✕ to remove). The first is the primary; the video finder searches all of a student’s emails.',
      'Coach dashboard: the highlighted “next session” no longer shows a class that already happened, and the Upcoming Meetings section loads much faster.',
    ]},
    { version: 'v392', title: 'Student videos — stale Dropbox links now play again',
      roles: ['coach', 'mentorship', 'ms_ic', 'delivery_ic'], items: [
      'Saved Dropbox links go stale over time and stopped playing (a normal .mp4 would even show a false “format not supported”). The player now resolves the saved link to a fresh streaming link, so these videos play inline again.',
      'When a video genuinely can’t play, the message no longer blames the format for normal types — it points you to Open in Dropbox / Download.',
    ]},
    { version: 'v391', title: 'Student videos — clearer player + Download for unplayable formats',
      roles: ['coach', 'mentorship', 'ms_ic', 'delivery_ic'], items: [
      'Videos in formats browsers can’t play (e.g. .3gpp phone clips) no longer show a black screen — you now get a clear message plus Download and Open-in-Dropbox buttons.',
      'Download grabs a fresh link, so you can play the file in QuickTime or VLC.',
      'Video lookup now searches Dropbox subfolders too, so a student’s video is found (and gets a fresh link) even when it isn’t in the top-level folder.',
    ]},
    { version: 'v390', title: 'Zoom — cancel a single class date (not the whole series)',
      roles: ['coach', 'mentorship', 'ms_ic', 'delivery_ic'], items: [
      'Open a recurring meeting’s Invitees → "Recurring schedule" pane now has a "Cancel date" button on each upcoming class.',
      'Cancelling one date emails just that date’s invitees a cancellation notice and removes it from Zoom — the rest of the recurring schedule keeps running untouched.',
      'Cancelled dates show a "✗ Cancelled" tag in the schedule so you can see what was called off.',
    ]},
    { version: 'v389', title: 'Coach dashboard — "Start as host" on the next-session card',
      roles: ['coach', 'mentorship', 'ms_ic', 'delivery_ic'], items: [
      'The highlighted "Next session" card now shows the "Start as host →" button whenever you can host that meeting (it was being hidden on the account-wide next session).',
    ]},
    { version: 'v388', title: 'Rep Area — view a student’s full contact log',
      roles: ['ms_rep', 'rep', 'sales_manager', 'ms_ic', 'delivery_ic'], items: [
      'The Rep Area now has a "Contacts log" button that shows every contact logged on that student (date · who · notes) — reps can log a new one from there too.',
      'The phone icon now matches the rest of the dashboard’s icon style.',
    ]},
    { version: 'v385', title: 'Rep Area is now a collapsible section under Identity',
      roles: ['ms_rep', 'rep', 'sales_manager', 'ms_ic', 'delivery_ic'], items: [
      'The Rep Area is now its own collapsible "Rep Area" section right under Identity (matches the other profile sections — click to collapse/expand).',
      'The "Assigned rep" field moved out of Identity and now lives inside the Rep Area.',
    ]},
    { version: 'v384', title: 'Rep Area — status, last contact & filters per student',
      roles: ['ms_rep', 'rep', 'sales_manager', 'ms_ic', 'delivery_ic'], items: [
      'Open any student → new "Rep Area": the assigned rep, last-contact date, and a rep-status dropdown (Hot / Warm / Cold / Qualified / Not qualified / Needs help / Do not contact). Every change is kept in a "Status history" log.',
      'Reps / Admins / MS-IC / Delivery-IC can set the status and log a contact right from the profile; Sales Managers can view.',
      'Student rows now show the rep-status badge + a "📞 7d" tag when contacted in the last week (rep-view roles only), plus new rep-status and "contacted in last 7 days" filters.',
    ]},
    { version: 'v383', title: 'Rep Contacts log (new Contacts button)',
      roles: ['ms_rep', 'rep', 'sales_manager', 'ms_ic', 'delivery_ic', 'coach'], items: [
      'New "Contacts" button at the top of the Mentorship CRM (next to Turn Over) — the running log of rep↔student contacts.',
      'Reps / Admins / MS-IC / Delivery-IC can log a contact straight from there: just pick the student (+ date + optional note). The count badge shows how many students were contacted in the last 7 days.',
      'Reps / Admins / Sales Managers / MS-IC / Delivery-IC see all contacts; coaches see only their own students\'.',
      'Coming next in this Rep Area: a per-student rep status (Hot / Needs help / Not qualified…) with full history, a last-contact date, a "recently contacted" tag, and matching filters.',
    ]},
    { version: 'v382', title: 'Turnover reassign — now in the queue + smarter default',
      roles: ['ms_ic', 'delivery_ic'], items: [
      'The "⇄ reassign" button is now also on every turnover in the global "↪ Turn Over" queue (top-left), not just inside a student profile.',
      'The rep picker now pre-fills with the student\'s currently-assigned rep when it differs from the turnover\'s rep — usually one click to hand it to the right person.',
    ]},
    { version: 'v381', title: 'Turnovers — reassign to another rep',
      roles: ['ms_ic', 'delivery_ic'], items: [
      'Admins, MS-IC and Delivery-IC now get a small "⇄ reassign" button next to the rep name on any turnover (in the student\'s Turnovers history).',
      'Pick a new rep — the turnover moves to their queue, they\'re notified (in-app + email), and the previous rep is dropped from the thread. Out of the way of the response/resolution controls.',
    ]},
    { version: 'v380', title: 'Weekly Stats — assign stats to people & filter by person',
      items: [
      'Each weekly-stats metric can now be assigned to one or more people — open a stat, hit Edit, and tick the people under "Assigned to".',
      'New "Assigned to" filter at the top of the dashboard narrows the grid to one person\'s stats (or "Unassigned"). It is an optional lens — everyone still sees every stat, and the value itself stays shared.',
      'Assignees appear as small initials chips on each stat card.',
    ]},
    { version: 'v159', title: 'Email Automations — every email now editable',
      adminOnly: true, items: [
      'Phase 1: new admin-only "Email Automations" dashboard — list of every transactional email the system sends, with a Quill rich-text editor, variable-insertion chips, Save / Send-test / Duplicate / Broadcast / Send-history.',
      'Phase 2: refactored the Zoom invite / reschedule / cancel emails (zoom-meetings v18), the pause-ended email (check-pause-endings v2), and the account-invite email (invite v36) to load their templates from the database. Editing them in the dashboard now changes what the system actually sends.',
      'Round-out: alerts (opened + resolved), turnovers (opened + closed), survey-received and video-received notifications also moved onto the system (send-email v21). They now ship as branded HTML through Resend with first-name personalization and dashboard-deep-link buttons. SMTP is kept as a fallback for any kind that does not yet have a template.',
      'Every send is logged in email_automation_sends — open the Send history tab on any automation to see who got what, when, and the resend_id.',
      'Manual broadcasts: duplicate any system template into a manual one, edit it, and pick a list of students to email.',
    ]},
    { version: 'v144', title: 'Student profile popup is now mobile-friendly',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Tapping a student on the Coach Dashboard opens a clean bottom-sheet on phones — title at the top, "Full profile ↗" link on its own row, close button in a 44px tap target in the corner.',
      'All fields stack in a single column with proper spacing and 48px-tall inputs.',
      'Sticky footer with full-width Save / Cancel buttons that respect the iPhone home indicator (safe-area-inset-bottom).',
    ]},
    { version: 'v143', title: 'Coach Dashboard student list now fits the phone screen',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'On phones the student list no longer scrolls horizontally — each row becomes a tall card with the student name as the header and every column (Level / Module / Last Zoom / Asgmt Sent / Asgmt Recv / Days left / Status) stacked vertically with labels on the left.',
      'Topbar now respects the iPhone notch / Dynamic Island — content sits below the status bar instead of slipping under it.',
      'Bug fix: the "What\'s new" modal was popping every time the page reloaded or you switched dashboards. It now stays dismissed for at least 30 days even if local storage is touched in the background.',
    ]},
    { version: 'v142', title: 'Mobile UX overhaul on the CRM and Coach Dashboard',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic', 'ms_rep'], items: [
      'Mentorship CRM on phones: opening a student now switches to a full-screen profile with a sticky "← Back" bar showing their name. The student list takes the full width when nothing is open. No more cramped split-view on small screens.',
      'Coach Dashboard table scrolls horizontally on phones; the Name column stays sticky so rows stay identifiable.',
      'KPIs / charts / filter bar / bulk action bar all wrap cleanly with bigger touch targets (40px+).',
      'All modals adopt a bottom-sheet style on phones — slide up from the bottom, full width, drag-handle pill at the top, scroll inside the sheet.',
      'Filter chips, profile-action buttons, and form fields are all bigger and easier to tap.',
    ]},
    { version: 'v141', title: 'Invite system rebuilt — links never expire',
      adminOnly: true, items: [
      'Replaced Supabase\'s built-in magic-link invite (which expired in ~1h) with a token-based flow that stays valid until the account is created.',
      'When you invite someone, a row is saved in pending_invites with a long random token. The email goes out from mentorship@ridleyacademy.team via Resend, with a "Create my account" button.',
      'The link lands on a new /activate page where the user picks a password (and confirms their first name). Their account is created with the right permissions, then they\'re auto-signed-in and redirected home.',
      'New "Pending invites" yellow card at the top of the Admin → Users tab shows everyone who hasn\'t activated yet, with Resend and Revoke buttons.',
      'Existing users who never signed in still get the legacy "Send reset" path (which uses Supabase recovery).',
    ]},
    { version: 'v140', title: 'Resend expired invite from Admin Panel',
      adminOnly: true, items: [
      'Bug: when an invited user didn\'t open their email in time, the invite token expired and they had no way to set their password.',
      'Fix: new yellow "Resend invite" button on the Admin Panel for any user who hasn\'t signed in yet. Sends a fresh invite link.',
      'For users who have signed in but forgot their password, "Reset password" still works as before.',
    ]},
    { version: 'v139', title: 'Advanced filters everywhere students are picked',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'The Schedule Zoom modal and the New / Edit group modal now have a "Filters" button next to the search box.',
      'Same filter set as the Coach Dashboard (Level, Module, Status, Last Zoom, Last assignment, etc.) — pick by criteria instead of scrolling.',
      'Filter state is shared, so applying a filter on the dashboard and then opening Schedule Zoom keeps the same view.',
    ]},
    { version: 'v138', title: 'Advanced filters on the Coach Dashboard',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New "Filters" button in the chip bar opens a modal to filter by Level, Current module, Masterclass level, Coach status, Lifecycle status, Last Zoom (never / >7d / >30d / >90d), Last assignment sent / received, and "Has email".',
      'Active filters show a counter badge on the button.',
      'Expired students are now hidden by default. A "+ Show expired" toggle on the chip bar surfaces them with a count of how many are hidden.',
    ]},
    { version: 'v137', title: 'Even more Zoom advanced settings',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New toggles: Let participants rename themselves, Watermark on screen-share, End-to-end encryption, Allow chat in meeting.',
      'New Audio options: Telephone & computer, Computer (VoIP) only, Telephone only.',
      'New Invitation email language picker (16 languages) for any Zoom-side notifications.',
    ]},
    { version: 'v136', title: 'Recurring sessions, custom passcode, timezone, captions, login required',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'Schedule Zoom → Advanced settings now supports: recurring meetings (daily / weekly / every 2 weeks / monthly with end-after-N or end-by-date), custom passcode (override Zoom\'s auto-generated code), timezone picker (defaults to your local), enable live captions / transcription, and require Zoom login to join.',
      'Recurring meetings keep a single Zoom link — students get one invitation that covers the whole series, and the email shows "Recurring: every week for 4 sessions" so they know.',
    ]},
    { version: 'v135', title: 'Advanced Zoom settings in Schedule Zoom',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New collapsible "Advanced Zoom settings" section in the Schedule Zoom modal — same options Zoom offers when scheduling on the website.',
      'Toggle: waiting room, join before host, mute on entry, host video, participants\' video, require passcode.',
      'Auto-recording: None / Local / Cloud.',
      'Approval type: auto-approve or manual-approve registrants.',
      'Alternative hosts: comma-separated list of co-hosts (must be Licensed users on the same Zoom account).',
    ]},
    { version: 'v134', title: 'Schedule Zoom & Groups on a coach\'s behalf',
      roles: ['mentorship', 'sales_manager', 'ms_ic', 'delivery_ic'], items: [
      'Admins / Mentorship I-C / Delivery I-C can now create Zoom meetings on behalf of any coach. The meeting is hosted under the coach\'s Zoom account, and the meeting card attributes it to them.',
      'Same for groups: a "Owner (coach)" dropdown in New / Edit group lets privileged users assign or move a group to any coach.',
      'Coaches without a Zoom host email mapped show as disabled in the picker — set their mapping in the Admin Panel first.',
    ]},
    { version: 'v133', title: 'Saved student groups for Schedule Zoom',
      roles: ['mentorship', 'sales_manager', 'coach', 'ms_ic', 'delivery_ic'], items: [
      'New "Groups" button on the Coach Dashboard. Each coach can save preset groups of students (e.g. "Tuesday cohort", "Beginners weekly").',
      'In the Schedule Zoom modal, a new "— Use a group —" dropdown auto-fills the student selection with the group\'s members. You can then still add/remove individuals before sending.',
      'Coaches own their own groups; admins / I-Cs / Mentorship can see and edit everyone\'s groups.',
    ]},
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

  function markSeen(latest) {
    try {
      localStorage.setItem(SEEN_KEY, latest);
      localStorage.setItem(SHOWN_AT_KEY, String(Date.now()));
    } catch (_) {}
  }

  function show(entries, latest) {
    if (document.getElementById('changelogModal')) return;
    // Tell pwa.js to hold off on auto-reloads while this is up
    window.__changelogModalOpen = true;
    // Persist the "seen" markers IMMEDIATELY — before any reload race can wipe
    // the modal. If the user never gets to click "Got it", we still don't
    // re-show on the next page load.
    markSeen(latest);
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
      // Re-affirm the seen markers on close (defensive — covers any edge case
      // where a service-worker race might have nuked them mid-display).
      markSeen(latest);
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
    let seen = '', shownAt = 0;
    try {
      seen    = localStorage.getItem(SEEN_KEY) || '';
      shownAt = Number(localStorage.getItem(SHOWN_AT_KEY) || '0') || 0;
    } catch (_) {}
    // Primary gate: this exact version has already been acknowledged.
    if (seen === latest) return;
    // Secondary gate: even if seen-key got wiped, don't re-pop the modal if
    // we already showed it within the cooldown window. Re-affirm the key.
    if (shownAt && (Date.now() - shownAt) < RESHOW_COOLDOWN_MS) {
      markSeen(latest);
      return;
    }
    // Wait for the session so we can filter entries by permission.
    const eff = await getEffectiveUser();
    if (!eff) return; // not signed in — skip until next visit
    const entries = pickEntriesSince(seen, eff);
    if (!entries.length) {
      // Nothing relevant to this user — still mark as seen so we don't keep checking
      markSeen(latest);
      return;
    }
    show(entries, latest);
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
