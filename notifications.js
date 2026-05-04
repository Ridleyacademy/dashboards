// notifications.js — bell + dropdown for in-app notifications.
// Loaded on every dashboard. Polls /students?api=my-notifications every 60s
// once the user is authed; renders a 🔔 button in the topbar at order:45 so
// it slots between the picker (40) and the user pill (50).
//
// The script is self-contained: it builds its own Supabase client (the URL +
// anon key are public). Top-level `const supa = ...` in each page's inline
// <script> doesn't attach to window, so this script can't borrow the page's
// client — but it CAN share the same persisted auth session via localStorage,
// which is what supabase-js does by default.
(function () {
  if (window.__notificationsLoaded) return;
  window.__notificationsLoaded = true;

  const SUPABASE_URL      = "https://pojqljrhhtnigyrtzdzz.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
  const STUDENTS_BASE     = SUPABASE_URL + '/functions/v1/students';

  const POLL_MS = 60_000;
  let pollTimer = null;
  let cachedRows = [];
  let cachedUnread = 0;
  let dropdownOpen = false;
  let nSupa = null;

  function ensureSupa() {
    if (nSupa) return nSupa;
    if (typeof supabase === 'undefined' || !supabase?.createClient) return null;
    // Same options as the page's own client so we share the persisted session
    // (localStorage key 'sb-…-auth-token') instead of forcing a re-login.
    nSupa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: false, autoRefreshToken: true },
    });
    return nSupa;
  }
  function getBase() { return STUDENTS_BASE; }
  async function getToken() {
    const s = ensureSupa(); if (!s) return null;
    try { const { data } = await s.auth.getSession(); return data?.session?.access_token || null; }
    catch { return null; }
  }

  function ensureBellInTopbar() {
    if (document.getElementById('notifBellBtn')) return;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    // Inject CSS once
    if (!document.getElementById('notifBellCss')) {
      const css = document.createElement('style');
      css.id = 'notifBellCss';
      css.textContent = `
        #notifBellBtn { order: 45; position: relative; flex-shrink: 0; }
        #notifBellBtn .notif-dot {
          position: absolute; top: 4px; right: 4px;
          background: #f87171; color: #0b0c14; font-size: 0.6rem; font-weight: 800;
          border-radius: 999px; min-width: 16px; height: 16px;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0 4px; box-shadow: 0 0 0 2px var(--bg, #0b0c14);
        }
        #notifBellPanel {
          position: fixed; z-index: 10050; background: #13141f;
          border: 1px solid #1f2438; border-radius: 14px;
          width: min(420px, calc(100vw - 24px));
          max-height: min(70vh, 560px); display: none; flex-direction: column;
          box-shadow: 0 24px 60px rgba(0,0,0,0.55); color: #eaecf8;
          font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif;
          overflow: hidden;
        }
        #notifBellPanel.open { display: flex; }
        #notifBellPanel .notif-head {
          padding: 14px 16px; border-bottom: 1px solid #1f2438;
          display: flex; align-items: center; gap: 10px;
        }
        #notifBellPanel .notif-title { font-size: 0.95rem; font-weight: 800; flex: 1; letter-spacing: -0.02em; }
        #notifBellPanel .notif-mark {
          background: transparent; border: 1px solid #1f2438; color: #7880a8;
          border-radius: 8px; padding: 4px 10px; font-weight: 700; font-size: 0.7rem; cursor: pointer;
        }
        #notifBellPanel .notif-mark:hover { color: #eaecf8; border-color: #34d399; }
        #notifBellPanel .notif-body { flex: 1; overflow-y: auto; padding: 6px 0; }
        #notifBellPanel .notif-row {
          padding: 12px 16px; border-bottom: 1px solid rgba(31,36,56,0.6); cursor: pointer;
          display: flex; flex-direction: column; gap: 4px; transition: background 0.12s;
        }
        #notifBellPanel .notif-row:hover { background: #0f1019; }
        #notifBellPanel .notif-row.unread { background: rgba(52,211,153,0.04); border-left: 3px solid #34d399; padding-left: 13px; }
        #notifBellPanel .notif-row .nrt {
          font-size: 0.85rem; font-weight: 700; line-height: 1.35;
        }
        #notifBellPanel .notif-row .nrb {
          font-size: 0.74rem; color: #c2c8e0; line-height: 1.45;
          white-space: pre-wrap; max-height: 6.4em; overflow: hidden;
          text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
        }
        #notifBellPanel .notif-row .nrm { font-size: 0.66rem; color: #7880a8; }
        #notifBellPanel .notif-empty { padding: 32px 20px; text-align: center; color: #7880a8; font-size: 0.84rem; }
      `;
      document.head.appendChild(css);
    }
    const btn = document.createElement('button');
    btn.className = 'tbtn tbtn-ghost';
    btn.id = 'notifBellBtn';
    btn.title = 'Notifications';
    btn.setAttribute('aria-label', 'Notifications');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      <span class="notif-dot" id="notifDot" style="display:none;">0</span>`;
    // Insert anywhere — order:45 will place it correctly via flexbox.
    topbar.appendChild(btn);
    btn.addEventListener('click', toggleDropdown);

    // Panel container (portaled into <body> to escape topbar transform/backdrop-filter)
    if (!document.getElementById('notifBellPanel')) {
      const panel = document.createElement('div');
      panel.id = 'notifBellPanel';
      panel.innerHTML = `
        <div class="notif-head">
          <div class="notif-title">Notifications</div>
          <button class="notif-mark" id="notifMarkAll">Mark all read</button>
        </div>
        <div class="notif-body" id="notifBody"></div>`;
      document.body.appendChild(panel);
      panel.addEventListener('click', e => e.stopPropagation());
      document.getElementById('notifMarkAll').addEventListener('click', markAllRead);
    }
  }

  function positionPanel() {
    const btn = document.getElementById('notifBellBtn');
    const panel = document.getElementById('notifBellPanel');
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    // Position below the bell, right-aligned to the bell's right edge.
    const top = Math.min(r.bottom + 8, window.innerHeight - 80);
    let right = Math.max(8, window.innerWidth - r.right);
    panel.style.top = top + 'px';
    panel.style.right = right + 'px';
  }

  function setBadge(unread) {
    const dot = document.getElementById('notifDot');
    if (!dot) return;
    cachedUnread = unread;
    if (unread > 0) {
      dot.textContent = unread > 99 ? '99+' : String(unread);
      dot.style.display = '';
    } else {
      dot.style.display = 'none';
    }
  }

  function renderRows() {
    const body = document.getElementById('notifBody');
    if (!body) return;
    if (!cachedRows.length) {
      body.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }
    body.innerHTML = '';
    for (const n of cachedRows) {
      const row = document.createElement('div');
      row.className = 'notif-row' + (n.read_at ? '' : ' unread');
      row.dataset.nid = n.id;
      const tEl = document.createElement('div'); tEl.className = 'nrt'; tEl.textContent = n.title || '';
      const bEl = document.createElement('div'); bEl.className = 'nrb'; bEl.textContent = n.body || '';
      const mEl = document.createElement('div'); mEl.className = 'nrm';
      const ts = n.created_at ? new Date(n.created_at).toLocaleString() : '';
      mEl.textContent = ts + (n.created_by_email ? ' · from ' + n.created_by_email : '');
      row.appendChild(tEl); row.appendChild(bEl); row.appendChild(mEl);
      row.addEventListener('click', () => onClickRow(n));
      body.appendChild(row);
    }
  }

  async function fetchNotifications() {
    const tok = await getToken(); if (!tok) return;
    const url = getBase(); if (!url) return;
    try {
      const r = await fetch(url + '?api=my-notifications&limit=50', {
        headers: { Authorization: 'Bearer ' + tok },
      });
      const j = await r.json();
      if (!r.ok) { console.warn('notifications fetch failed', j); return; }
      cachedRows = j.rows || [];
      setBadge(j.unread || 0);
      if (dropdownOpen) renderRows();
    } catch (e) { console.warn('notifications fetch error', e); }
  }

  async function markRead(id) {
    const tok = await getToken(); if (!tok) return;
    try {
      await fetch(getBase() + '?api=mark-notification-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ id }),
      });
    } catch (_) {}
  }
  async function markAllRead() {
    const tok = await getToken(); if (!tok) return;
    try {
      await fetch(getBase() + '?api=mark-all-notifications-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      });
      cachedRows = cachedRows.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      setBadge(0);
      renderRows();
    } catch (_) {}
  }

  async function onClickRow(n) {
    if (!n.read_at) { markRead(n.id); n.read_at = new Date().toISOString(); setBadge(Math.max(0, cachedUnread - 1)); renderRows(); }
    if (n.link_url) {
      // Same-origin nav. If we're already on students.html, just dispatch a
      // custom event so the page can open the alert without a reload.
      try {
        const u = new URL(n.link_url, window.location.origin);
        if (u.pathname.endsWith('/students.html') || u.pathname.endsWith('students.html')) {
          if (window.location.pathname.endsWith('students.html') && typeof window.openAlertById === 'function') {
            const aid = parseInt(u.searchParams.get('openAlert') || '0', 10);
            const sid = parseInt(u.searchParams.get('student') || '0', 10);
            if (sid && aid) { closeDropdown(); window.openAlertById(sid, aid); return; }
          }
        }
      } catch (_) {}
      window.location.href = n.link_url;
    }
  }

  function toggleDropdown() {
    dropdownOpen ? closeDropdown() : openDropdown();
  }
  function openDropdown() {
    const panel = document.getElementById('notifBellPanel');
    if (!panel) return;
    dropdownOpen = true;
    positionPanel();
    panel.classList.add('open');
    renderRows();
    fetchNotifications();
    setTimeout(() => document.addEventListener('click', onDocClickOutside), 0);
    window.addEventListener('resize', positionPanel);
  }
  function closeDropdown() {
    const panel = document.getElementById('notifBellPanel');
    if (!panel) return;
    dropdownOpen = false;
    panel.classList.remove('open');
    document.removeEventListener('click', onDocClickOutside);
    window.removeEventListener('resize', positionPanel);
  }
  function onDocClickOutside(e) {
    const btn = document.getElementById('notifBellBtn');
    if (btn && btn.contains(e.target)) return;
    closeDropdown();
  }

  function startPolling() {
    if (pollTimer) return;
    fetchNotifications();
    pollTimer = setInterval(fetchNotifications, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    });
  }

  function init() {
    ensureBellInTopbar();
    const s = ensureSupa();
    if (!s) {
      // supabase-js not loaded yet (load order race) — try again shortly.
      setTimeout(init, 250);
      return;
    }
    s.auth.getSession().then(({ data }) => { if (data?.session) startPolling(); });
    s.auth.onAuthStateChange((_e, sess) => { if (sess) startPolling(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
