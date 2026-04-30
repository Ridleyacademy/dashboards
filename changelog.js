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
