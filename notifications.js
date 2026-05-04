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
  const PUSH_BASE         = SUPABASE_URL + '/functions/v1/push-subscribe';
  // VAPID public key (web push). Public — safe to embed.
  const VAPID_PUBLIC_KEY  = "BAmtR2m5G-vJp5A0x5FsWK_h3U0cUc1_b_jOsM8gYV7HnHCpPNB0_SE4QjX43YMLEboRPRbDGHSnxneVs1sf4YE";

  // 5-min fallback poll (was 60s). Realtime via WebSocket is the primary path;
  // poll only catches up if the socket dies.
  const POLL_MS = 5 * 60_000;
  let pollTimer = null;
  let cachedRows = [];
  let cachedUnread = 0;
  let dropdownOpen = false;
  let realtimeChannel = null;
  let lastBadgeShown = 0;
  let chimeContext = null;
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
          box-sizing: border-box;
        }
        @media (max-width: 600px) {
          /* Full-width sheet anchored to the bottom of the topbar — same on
             every page so the panel can never overflow the viewport. */
          #notifBellPanel {
            left: 8px !important; right: 8px !important; width: auto !important;
            max-height: calc(100dvh - var(--notif-top, 64px) - 16px) !important;
          }
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
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Anchor under the bell. Cap top so the panel never starts off-screen.
    const top = Math.max(8, Math.min(r.bottom + 8, vh - 120));
    panel.style.top = top + 'px';
    // Set CSS var the @media rule uses for max-height.
    panel.style.setProperty('--notif-top', top + 'px');
    if (vw <= 600) {
      // Mobile: full-width sheet via the @media rule (left/right/width !important).
      // Clear any inline overrides set by previous desktop calls.
      panel.style.left = '';
      panel.style.right = '';
      panel.style.width = '';
    } else {
      // Desktop: anchor to the bell's right edge, but never let the LEFT
      // edge slip below 8px — so on weird zoom levels we don't overflow.
      const panelW = Math.min(420, vw - 24);
      let right = Math.max(8, vw - r.right);
      // Ensure left edge is on-screen.
      if (vw - right - panelW < 8) right = Math.max(8, vw - panelW - 8);
      panel.style.right = right + 'px';
      panel.style.left = '';
      panel.style.width = panelW + 'px';
    }
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

  // ── Chime + bell shake ───────────────────────────────────────────────
  function ensureChimeStyles() {
    if (document.getElementById('notifChimeCss')) return;
    const css = document.createElement('style');
    css.id = 'notifChimeCss';
    css.textContent = `
      @keyframes notif-shake {
        0%, 100% { transform: translateX(0) rotate(0); }
        15% { transform: translateX(-2px) rotate(-12deg); }
        30% { transform: translateX(2px) rotate(12deg); }
        45% { transform: translateX(-2px) rotate(-8deg); }
        60% { transform: translateX(2px) rotate(8deg); }
        75% { transform: translateX(-1px) rotate(-4deg); }
      }
      #notifBellBtn.notif-shake svg { animation: notif-shake 0.6s ease-in-out; transform-origin: 50% 30%; }
      #notifBellBtn.notif-shake .notif-dot { animation: notif-shake 0.6s ease-in-out; }
    `;
    document.head.appendChild(css);
  }
  function shakeBell() {
    const btn = document.getElementById('notifBellBtn');
    if (!btn) return;
    btn.classList.remove('notif-shake');
    void btn.offsetWidth;            // force reflow so animation can re-trigger
    btn.classList.add('notif-shake');
    setTimeout(() => btn.classList.remove('notif-shake'), 700);
  }
  // Prime WebAudio on the first user gesture. iOS / Safari / most browsers
  // block AudioContext until at least one tap/click has happened, even after
  // the page has been interacted with elsewhere. Playing a 1-frame silent
  // buffer here unlocks the context for the rest of the session.
  function primeAudio() {
    try {
      if (!chimeContext) chimeContext = new (window.AudioContext || window.webkitAudioContext)();
      if (chimeContext.state === 'suspended') chimeContext.resume().catch(() => {});
      // Play one silent frame to satisfy the user-gesture requirement.
      const buf = chimeContext.createBuffer(1, 1, 22050);
      const src = chimeContext.createBufferSource();
      src.buffer = buf; src.connect(chimeContext.destination); src.start(0);
    } catch (_) {}
  }
  function installAudioPrime() {
    if (window.__notifAudioPrimed) return;
    const handler = () => {
      window.__notifAudioPrimed = true;
      primeAudio();
      ['pointerdown','touchstart','keydown','click'].forEach(ev =>
        document.removeEventListener(ev, handler, { capture: true })
      );
    };
    ['pointerdown','touchstart','keydown','click'].forEach(ev =>
      document.addEventListener(ev, handler, { capture: true, passive: true })
    );
  }

  function playChime() {
    // Two-tone chime via WebAudio.
    try {
      if (!chimeContext) {
        chimeContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (chimeContext.state === 'suspended') {
        chimeContext.resume().catch(() => {});
      }
      // If the context is still suspended (no user gesture yet) we can't play.
      if (chimeContext.state !== 'running') return;
      const t0 = chimeContext.currentTime;
      const playTone = (freq, start, dur) => {
        const osc = chimeContext.createOscillator();
        const gain = chimeContext.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain); gain.connect(chimeContext.destination);
        osc.start(start); osc.stop(start + dur + 0.05);
      };
      playTone(880, t0,        0.18);
      playTone(1175, t0 + 0.12, 0.22);
    } catch (_) { /* silent */ }
  }
  function pingForNew() {
    // Don't chime when the dropdown is already open — the user is looking.
    if (dropdownOpen) { shakeBell(); return; }
    shakeBell();
    playChime();
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
      // For OPEN alerts (alert_opened with an alert_id), add a quick "Mark done"
      // button so the user can resolve from the bell without going to the page.
      if (n.kind === 'alert_opened' && n.alert_id) {
        const actions = document.createElement('div');
        actions.style.cssText = 'margin-top:8px;display:flex;gap:8px;';
        const doneBtn = document.createElement('button');
        doneBtn.className = 'notif-mark-done';
        doneBtn.dataset.aid = n.alert_id;
        doneBtn.dataset.nid = n.id;
        doneBtn.textContent = '✓ Mark done';
        doneBtn.style.cssText = 'background:rgba(52,211,153,0.15);border:1px solid #34d399;color:#34d399;border-radius:7px;padding:4px 10px;font-weight:700;font-size:0.7rem;cursor:pointer;';
        doneBtn.addEventListener('click', (e) => { e.stopPropagation(); markAlertDone(n); });
        actions.appendChild(doneBtn);
        row.appendChild(actions);
      }
      row.addEventListener('click', () => onClickRow(n));
      body.appendChild(row);
    }
  }

  async function markAlertDone(n) {
    const tok = await getToken(); if (!tok) return;
    const note = window.prompt('Resolution note (required):', 'Resolved from bell');
    if (note === null) return;          // user cancelled
    const trimmed = (note || '').trim();
    if (!trimmed) { alert('A resolution note is required.'); return; }
    try {
      const r = await fetch(STUDENTS_BASE + '?api=resolve-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ id: n.alert_id, resolution_note: trimmed }),
      });
      const j = await r.json();
      if (!r.ok) { alert('Resolve failed: ' + (j.error || r.status)); return; }
      // Mark the in-app row read locally so the badge ticks down without waiting for the next poll.
      if (!n.read_at) {
        markRead(n.id);
        n.read_at = new Date().toISOString();
        setBadge(Math.max(0, cachedUnread - 1));
        lastBadgeShown = cachedUnread;
        renderRows();
      }
    } catch (e) { alert('Resolve failed: ' + (e.message || e)); }
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
      const newUnread = j.unread || 0;
      const grew = newUnread > lastBadgeShown;
      cachedRows = j.rows || [];
      setBadge(newUnread);
      lastBadgeShown = newUnread;
      if (grew) pingForNew();
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
    injectPushCta(); refreshPushCta();
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

  // ── Realtime: subscribe to inserts/updates on this user's notifications.
  async function startRealtime() {
    const s = ensureSupa(); if (!s) return;
    const { data: { user } } = await s.auth.getUser();
    if (!user) return;
    if (realtimeChannel) { try { s.removeChannel(realtimeChannel); } catch (_) {} realtimeChannel = null; }
    realtimeChannel = s.channel('notifications-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, (payload) => {
        const n = payload.new || {};
        // Prepend if it's not already in the cache.
        if (!cachedRows.find(r => r.id === n.id)) cachedRows = [n, ...cachedRows].slice(0, 50);
        const newUnread = cachedUnread + (n.read_at ? 0 : 1);
        setBadge(newUnread);
        lastBadgeShown = newUnread;
        if (!n.read_at) pingForNew();
        if (dropdownOpen) renderRows();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + user.id,
      }, (payload) => {
        const n = payload.new || {};
        const i = cachedRows.findIndex(r => r.id === n.id);
        if (i >= 0) cachedRows[i] = n;
        // Recompute unread from cache (cheap; ≤50 rows).
        const u = cachedRows.filter(r => !r.read_at).length;
        setBadge(u); lastBadgeShown = u;
        if (dropdownOpen) renderRows();
      })
      .subscribe();
  }

  // ── Web push subscription ────────────────────────────────────────────
  function urlB64ToUint8(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  async function getPushReg() {
    try { return await navigator.serviceWorker.ready; } catch (_) { return null; }
  }
  async function getCurrentPushSub() {
    if (!pushSupported()) return null;
    const reg = await getPushReg(); if (!reg) return null;
    return await reg.pushManager.getSubscription();
  }
  async function ensurePushSubscribed() {
    if (!pushSupported()) return { ok: false, reason: 'unsupported' };
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return { ok: false, reason: p };
    }
    const reg = await getPushReg(); if (!reg) return { ok: false, reason: 'no service worker' };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
        });
      } catch (e) { return { ok: false, reason: 'subscribe-failed: ' + (e?.message || e) }; }
    }
    // Send to server
    const tok = await getToken(); if (!tok) return { ok: false, reason: 'no auth' };
    const json = sub.toJSON();
    try {
      const r = await fetch(PUSH_BASE + '?api=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent.slice(0, 500),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        return { ok: false, reason: 'server: ' + (j.error || r.status) };
      }
    } catch (e) { return { ok: false, reason: 'network: ' + (e?.message || e) }; }
    return { ok: true };
  }
  async function unsubscribePush() {
    const sub = await getCurrentPushSub();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (_) {}
    const tok = await getToken();
    if (tok) {
      try {
        await fetch(PUSH_BASE + '?api=unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
          body: JSON.stringify({ endpoint }),
        });
      } catch (_) {}
    }
    return { ok: true };
  }

  function injectPushCta() {
    if (!pushSupported()) return;
    const head = document.querySelector('#notifBellPanel .notif-head');
    if (!head || head.querySelector('.notif-push-cta')) return;
    const el = document.createElement('div');
    el.className = 'notif-push-cta';
    el.style.cssText = 'flex-basis:100%;padding:8px 0 0;font-size:0.72rem;color:#7880a8;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    head.style.flexWrap = 'wrap';
    head.appendChild(el);
    refreshPushCta();
  }
  async function refreshPushCta() {
    const el = document.querySelector('#notifBellPanel .notif-push-cta');
    if (!el) return;
    if (!pushSupported()) {
      el.innerHTML = '<span>Push not supported on this browser. Add to home screen on iOS 16.4+ for push.</span>';
      return;
    }
    const perm = Notification.permission;
    const sub = await getCurrentPushSub();
    if (perm === 'denied') {
      el.innerHTML = '<span>🔕 Push notifications blocked in browser settings.</span>';
      return;
    }
    if (sub) {
      el.innerHTML = '<span>🔔 Push notifications on for this device.</span> <button id="notifPushOff" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:7px;padding:3px 8px;font-weight:700;font-size:0.66rem;cursor:pointer;">Turn off</button>';
      const off = document.getElementById('notifPushOff');
      if (off) off.addEventListener('click', async () => {
        await unsubscribePush(); refreshPushCta();
      });
    } else {
      el.innerHTML = '<button id="notifPushOn" style="background:rgba(52,211,153,0.15);border:1px solid #34d399;color:#34d399;border-radius:7px;padding:4px 10px;font-weight:700;font-size:0.7rem;cursor:pointer;">🔔 Enable push notifications</button> <span style="font-size:0.66rem;">(works when the tab is closed)</span>';
      const on = document.getElementById('notifPushOn');
      if (on) on.addEventListener('click', async () => {
        on.disabled = true; on.textContent = 'Enabling…';
        const res = await ensurePushSubscribed();
        if (!res.ok) { on.disabled = false; on.textContent = '🔔 Enable push (failed: ' + res.reason + ')'; return; }
        refreshPushCta();
      });
    }
  }

  // Listen for service worker click messages so we can route without reload.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open-link' && e.data.link) {
        try {
          const u = new URL(e.data.link, window.location.origin);
          if (u.pathname.endsWith('students.html') && typeof window.openAlertById === 'function') {
            const aid = parseInt(u.searchParams.get('openAlert') || '0', 10);
            const sid = parseInt(u.searchParams.get('student') || '0', 10);
            if (sid && aid) { window.openAlertById(sid, aid); return; }
          }
          window.location.href = e.data.link;
        } catch (_) {}
      }
    });
  }

  function init() {
    ensureBellInTopbar();
    ensureChimeStyles();
    installAudioPrime();
    const s = ensureSupa();
    if (!s) {
      // supabase-js not loaded yet (load order race) — try again shortly.
      setTimeout(init, 250);
      return;
    }
    s.auth.getSession().then(({ data }) => { if (data?.session) { startPolling(); startRealtime(); injectPushCta(); } });
    s.auth.onAuthStateChange((_e, sess) => { if (sess) { startPolling(); startRealtime(); injectPushCta(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
