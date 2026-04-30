// "What's new" changelog modal.
// Reads version.txt, compares to the last version the user has acknowledged
// (localStorage key `changelog-seen`). If newer, shows a modal listing the
// entries since their last seen version.
// Entries are embedded here so we don't need a separate fetch.
(function () {
  const SEEN_KEY = 'changelog-seen';
  // Newest first. Version is the major label only (without timestamp prefix);
  // the comparison uses array order, not string compare.
  const ENTRIES = [
    { version: 'v50', title: 'Income forecast + duplicate detection', items: [
      'Income dashboard: new toggleable End-of-Month Forecast zone — predicts where the month will land based on current velocity.',
      'Income table now flags possible duplicate sales (same email + same amount within 5 minutes).',
      'Auto theme: theme button now cycles Light → Dark → Auto. Auto follows your OS setting.',
      'Skeleton loaders during data fetch so the page structure is visible immediately.',
      'This "What\'s new" modal will pop up once after every release.',
    ]},
    { version: 'v48', title: 'Filter persistence', items: [
      'Date range, rep selector, and product tab now stay set when you switch dashboards.',
    ]},
    { version: 'v46', title: 'Permissions & invites', items: [
      'Permission picker is now a single multi-select dropdown.',
      'Bulk invite mode in the admin Invite pane.',
      'Send password reset email from each user row.',
      '"View as" any user (admin only) to preview what they see.',
      'Income no longer accessible to sales managers.',
      'VSL Performance now correctly accessible to marketing + sales.',
    ]},
    { version: 'v40', title: 'Mobile + PWA polish', items: [
      'Pull-to-refresh inside the installed PWA.',
      'Haptic taps on Android.',
      'iOS install hint with bouncing arrow toward Safari\'s Share button.',
      'Home screen icon name is now "Ridleyacademy".',
    ]},
  ];

  function pickEntriesSince(seenVersion) {
    if (!seenVersion) return ENTRIES.slice(0, 1); // first ever visit: show only the latest
    const idx = ENTRIES.findIndex(e => e.version === seenVersion);
    if (idx === -1) return ENTRIES.slice(0, 3); // unknown — show recent few
    return ENTRIES.slice(0, idx); // everything newer than what they've seen
  }

  function show(entries) {
    if (document.getElementById('changelogModal')) return;
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
    function close() { m.remove(); }
  }

  async function maybeShow() {
    if (!ENTRIES.length) return;
    const latest = ENTRIES[0].version;
    let seen = '';
    try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch (_) {}
    if (seen === latest) return;
    const entries = pickEntriesSince(seen);
    if (!entries.length) return;
    show(entries);
    try { localStorage.setItem(SEEN_KEY, latest); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(maybeShow, 800));
  } else {
    setTimeout(maybeShow, 800);
  }
})();
