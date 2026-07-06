// messages-widget.js — global 💬 Messages button in the topbar (next to the 🔔 bell,
// order:44) that opens a popup panel with the full internal chat: conversation list,
// DMs, group chats, thread + composer, New message / New group. Loaded on every
// dashboard (except messages.html, which is the full-page version). Talks to the same
// `chat` edge fn + Supabase realtime as messages.html. Self-contained IIFE, own client.
(function () {
  if (window.__msgWidgetLoaded) return; window.__msgWidgetLoaded = true;

  const SUPABASE_URL      = "https://pojqljrhhtnigyrtzdzz.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
  const CHAT_BASE = SUPABASE_URL + '/functions/v1/chat';

  let mSupa = null, me = null, convs = [], usersCache = [], curConv = null, channel = null, panelOpen = false;
  const nameById = {};

  function ensureSupa() {
    if (mSupa) return mSupa;
    if (typeof supabase === 'undefined' || !supabase?.createClient) return null;
    // Default storage (no custom storageKey) so we share the page's persisted
    // session (localStorage 'sb-…-auth-token') — otherwise the widget isn't
    // authed and shows no conversations. Mirrors notifications.js.
    mSupa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: false, autoRefreshToken: true } });
    return mSupa;
  }
  // Prefer our own client's session; if that's not hydrated (race / separate
  // GoTrueClient), fall back to the session the PAGE already persisted in
  // localStorage under sb-<ref>-auth-token — that's always the logged-in user.
  function tokenFromStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
        const o = JSON.parse(localStorage.getItem(k) || 'null');
        const tok = o?.access_token || o?.currentSession?.access_token || o?.session?.access_token;
        if (tok) return tok;
      }
    } catch (_) {}
    return null;
  }
  async function getToken(forceRefresh) {
    const s = ensureSupa();
    if (s) {
      try {
        // On a retry, force a token refresh — Safari can hand back a stale session
        // after the tab has been idle, and the socket may also need re-establishing.
        if (forceRefresh) { try { await s.auth.refreshSession(); } catch (_) {} }
        const { data } = await s.auth.getSession();
        if (data?.session?.access_token) return data.session.access_token;
      } catch (_) {}
    }
    return tokenFromStorage();
  }
  // Safari drops keep-alive connections when a tab sits idle; the first fetch after that
  // rejects at the network layer with "Load failed" (a TypeError, NOT an HTTP status).
  // Transparently retry those once with a fresh token before surfacing the error.
  function isNetworkError(e) {
    const m = String(e && e.message || e || '');
    return e instanceof TypeError || /load failed|failed to fetch|network|connection/i.test(m);
  }
  async function chatFetch(path, opts = {}, _retried) {
    const tok = await getToken(!!_retried); if (!tok) throw new Error('no auth');
    let r;
    try {
      r = await fetch(CHAT_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
    } catch (e) {
      if (!_retried && isNetworkError(e)) { await new Promise(res => setTimeout(res, 400)); return chatFetch(path, opts, true); }
      throw new Error('Connection lost — check your network and try again.');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (n) => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  function fmtTime(t) { if (!t) return ''; const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

  function styles() {
    if (document.getElementById('msgWidgetCss')) return;
    const css = document.createElement('style'); css.id = 'msgWidgetCss';
    css.textContent = `
      #msgWidgetBtn { order:44; position:relative; flex-shrink:0; background:transparent; border:1px solid #1f2438; color:#7880a8; border-radius:8px; width:34px; height:32px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
      #msgWidgetBtn:hover { color:#eaecf8; border-color:#2a3350; }
      #msgWidgetBtn .mw-dot { position:absolute; top:-5px; right:-5px; background:#34d399; color:#04120b; border-radius:999px; min-width:16px; height:16px; padding:0 4px; font-size:0.62rem; font-weight:800; display:none; align-items:center; justify-content:center; }
      #msgWidgetPanel { position:fixed; top:54px; right:12px; width:400px; max-width:calc(100vw - 24px); height:72vh; max-height:640px; background:#13141f; border:1px solid #272d45; border-radius:16px; z-index:10001; display:none; flex-direction:column; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.6); color:#eaecf8; font-family:-apple-system,BlinkMacSystemFont,Inter,'Segoe UI',sans-serif; }
      #msgWidgetPanel.open { display:flex; }
      .mw-head { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #1f2438; flex-shrink:0; }
      .mw-title { font-size:0.95rem; font-weight:800; flex:1; }
      .mw-hbtn { background:#191e30; border:1px solid #1f2438; color:#7880a8; border-radius:8px; padding:5px 9px; font-size:0.72rem; font-weight:700; cursor:pointer; }
      .mw-hbtn:hover { color:#eaecf8; }
      .mw-x { background:none; border:none; color:#7880a8; font-size:1.35rem; cursor:pointer; padding:0 4px; line-height:1; }
      .mw-scroll { flex:1; overflow-y:auto; }
      .mw-conv { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; border-bottom:1px solid #1a1f30; }
      .mw-conv:hover { background:#191e30; }
      .mw-conv.unread { background:rgba(52,211,153,0.07); box-shadow:inset 3px 0 0 #34d399; }
      .mw-conv.unread .mw-cn { color:#eaecf8; font-weight:800; }
      .mw-conv.unread .mw-cp { color:#c3cae6; }
      .mw-av { width:36px; height:36px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:0.78rem; font-weight:800; color:#fff; background:linear-gradient(135deg,#6b9eff,#a78bfa); }
      .mw-av.grp { background:linear-gradient(135deg,#fbbf24,#f59e0b); }
      .mw-cm { flex:1; min-width:0; }
      .mw-cn { font-size:0.84rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mw-cp { font-size:0.74rem; color:#7880a8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
      .mw-cr { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }
      .mw-ct { font-size:0.62rem; color:#3e4668; }
      .mw-badge { background:#34d399; color:#04120b; border-radius:999px; min-width:17px; height:17px; padding:0 5px; font-size:0.64rem; font-weight:800; display:flex; align-items:center; justify-content:center; }
      .mw-empty { text-align:center; color:#3e4668; font-size:0.8rem; padding:30px 16px; }
      .mw-thread { display:none; flex-direction:column; flex:1; min-height:0; }
      .mw-thread.open { display:flex; }
      .mw-back { background:none; border:none; color:#7880a8; font-size:1.2rem; cursor:pointer; padding:0 4px; }
      .mw-msgs { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; }
      .mw-row { display:flex; flex-direction:column; align-items:flex-start; margin-top:7px; }
      .mw-row.mine { align-items:flex-end; }
      .mw-bub { max-width:82%; width:fit-content; padding:8px 11px; border-radius:13px; font-size:0.86rem; line-height:1.35; white-space:pre-wrap; overflow-wrap:anywhere; word-break:normal; background:#191e30; border:1px solid #1f2438; }
      .mw-row.mine .mw-bub { background:linear-gradient(135deg,#2c7a5a,#22b07d); border-color:transparent; color:#eafff5; }
      .mw-snd { font-size:0.66rem; font-weight:700; color:#a78bfa; margin:0 3px 2px; }
      .mw-bt { font-size:0.58rem; color:#3e4668; margin:2px 3px 0; text-align:right; }
      .mw-comp { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #1f2438; flex-shrink:0; align-items:flex-end; }
      .mw-comp textarea { flex:1; background:#0f1120; border:1px solid #1f2438; color:#eaecf8; border-radius:10px; padding:9px 11px; font-size:0.86rem; outline:none; resize:none; max-height:110px; font-family:inherit; line-height:1.35; }
      .mw-comp button { background:linear-gradient(135deg,#34d399,#22b07d); border:none; color:#fff; border-radius:10px; width:38px; height:38px; flex-shrink:0; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .mw-pick { position:absolute; inset:0; background:#13141f; z-index:5; display:none; flex-direction:column; }
      .mw-pick.open { display:flex; }
      .mw-pick input.mw-search { margin:12px 14px 8px; background:#0f1120; border:1px solid #1f2438; color:#eaecf8; border-radius:9px; padding:9px 11px; font-size:0.85rem; outline:none; }
      .mw-prow { display:flex; align-items:center; gap:9px; padding:9px 14px; cursor:pointer; border-bottom:1px solid #1a1f30; }
      .mw-prow:hover { background:#191e30; }
      .mw-pk { width:19px; height:19px; border-radius:6px; border:1px solid #272d45; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.7rem; }
      .mw-prow.sel .mw-pk { background:#34d399; border-color:#34d399; }
      .mw-pfoot { display:flex; gap:8px; padding:10px 14px; border-top:1px solid #1f2438; }
      .mw-pfoot button { flex:1; border-radius:9px; padding:9px; font-size:0.8rem; font-weight:700; cursor:pointer; border:none; }
      .mw-cancel { background:#191e30; color:#7880a8; border:1px solid #1f2438 !important; }
      .mw-go { background:linear-gradient(135deg,#34d399,#22b07d); color:#fff; }
      .mw-attbtn { background:#191e30 !important; border:1px solid #1f2438 !important; color:#7880a8 !important; width:38px !important; height:38px !important; font-size:1.1rem; }
      .mw-attbtn:hover { color:#eaecf8 !important; }
      .mw-attbtn:disabled { opacity:0.4; cursor:default; }
      .mw-attstrip { display:flex; gap:8px; flex-wrap:wrap; padding:8px 12px 0; }
      .mw-attstrip:empty { display:none; }
      .mw-thumb { position:relative; width:58px; height:58px; border-radius:9px; overflow:hidden; border:1px solid #272d45; background:#0f1120; flex-shrink:0; }
      .mw-thumb img, .mw-thumb video { width:100%; height:100%; object-fit:cover; display:block; }
      .mw-thumb .mw-vico { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#fff; background:rgba(0,0,0,0.3); }
      .mw-thumb .mw-rm { position:absolute; top:2px; right:2px; width:17px; height:17px; border-radius:50%; background:rgba(0,0,0,0.7); color:#fff; border:none; cursor:pointer; font-size:0.7rem; line-height:17px; padding:0; }
      .mw-thumb.up::after { content:''; position:absolute; inset:0; background:rgba(15,17,32,0.55) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2334d399' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M12 2v6M12 22v-4'/%3E%3C/svg%3E") center/20px no-repeat; }
      .mw-media { display:flex; flex-direction:column; gap:4px; margin-top:3px; max-width:82%; }
      .mw-row.mine .mw-media { align-items:flex-end; }
      .mw-media img.mw-mimg, .mw-mtile { max-width:240px; max-height:280px; width:auto; border-radius:12px; border:1px solid #1f2438; cursor:pointer; display:block; background:#0f1120; }
      .mw-mtile { position:relative; overflow:hidden; }
      .mw-mtile video.mw-mvid { max-width:240px; max-height:280px; width:auto; display:block; border-radius:12px; }
      .mw-mtile .mw-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:1.6rem; color:#fff; background:rgba(0,0,0,0.28); text-shadow:0 1px 6px rgba(0,0,0,0.6); }
      .mw-lb { position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:10050; display:none; align-items:center; justify-content:center; }
      .mw-lb.open { display:flex; }
      .mw-lb img, .mw-lb video { max-width:92vw; max-height:84vh; border-radius:10px; display:block; }
      .mw-lb-bar { position:absolute; top:14px; right:14px; display:flex; gap:10px; }
      .mw-lb-btn { background:rgba(255,255,255,0.16); color:#fff; border:none; border-radius:9px; padding:9px 13px; font-size:0.85rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
      .mw-lb-btn:hover { background:rgba(255,255,255,0.3); }
    `;
    document.head.appendChild(css);
  }

  function mountBtn() {
    if (document.getElementById('msgWidgetBtn')) return true;
    const topbar = document.querySelector('.topbar'); if (!topbar) return false;
    styles();
    const btn = document.createElement('button');
    btn.id = 'msgWidgetBtn'; btn.title = 'Messages';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="mw-dot" id="mwDot"></span>';
    topbar.appendChild(btn);
    btn.addEventListener('click', togglePanel);
    buildPanel();
    return true;
  }

  function buildPanel() {
    if (document.getElementById('msgWidgetPanel')) return;
    const p = document.createElement('div'); p.id = 'msgWidgetPanel';
    p.innerHTML = `
      <div class="mw-head" id="mwListHead">
        <div class="mw-title">Messages</div>
        <button class="mw-hbtn" id="mwNewDm">✉ New</button>
        <button class="mw-hbtn" id="mwNewGrp">＋ Group</button>
        <button class="mw-x" id="mwClose">×</button>
      </div>
      <div class="mw-scroll" id="mwList"><div class="mw-empty">Loading…</div></div>
      <div class="mw-thread" id="mwThread">
        <div class="mw-head"><button class="mw-back" id="mwBack">‹</button><div class="mw-title" id="mwThreadTitle" style="font-size:0.88rem;"></div><button class="mw-x" id="mwClose2">×</button></div>
        <div class="mw-msgs" id="mwMsgs"></div>
        <div class="mw-attstrip" id="mwAttStrip"></div>
        <div class="mw-comp">
          <input type="file" id="mwFile" accept="image/*,video/*" multiple style="display:none">
          <button id="mwAttach" class="mw-attbtn" title="Attach photo or video"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
          <textarea id="mwInput" rows="1" placeholder="Message…"></textarea>
          <button id="mwSend"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
        </div>
      </div>
      <div class="mw-pick" id="mwPick">
        <div class="mw-head"><div class="mw-title" id="mwPickTitle" style="font-size:0.9rem;">New message</div><button class="mw-x" id="mwPickX">×</button></div>
        <input class="mw-search" id="mwGrpName" placeholder="Group name" style="display:none;">
        <input class="mw-search" id="mwSearch" placeholder="Search people…">
        <div class="mw-scroll" id="mwPickList"></div>
        <div class="mw-pfoot" id="mwPickFoot" style="display:none;"><button class="mw-cancel" id="mwPickCancel">Cancel</button><button class="mw-go" id="mwPickGo">Create group</button></div>
      </div>`;
    document.body.appendChild(p);
    p.querySelector('#mwClose').addEventListener('click', closePanel);
    p.querySelector('#mwClose2').addEventListener('click', closePanel);
    p.querySelector('#mwPickX').addEventListener('click', () => document.getElementById('mwPick').classList.remove('open'));
    p.querySelector('#mwPickCancel').addEventListener('click', () => document.getElementById('mwPick').classList.remove('open'));
    p.querySelector('#mwBack').addEventListener('click', showList);
    p.querySelector('#mwNewDm').addEventListener('click', () => openPicker('dm'));
    p.querySelector('#mwNewGrp').addEventListener('click', () => openPicker('group'));
    p.querySelector('#mwSend').addEventListener('click', send);
    p.querySelector('#mwAttach').addEventListener('click', () => document.getElementById('mwFile').click());
    p.querySelector('#mwFile').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
    // Tap an image or video tile to expand it in the in-app lightbox.
    p.querySelector('#mwMsgs').addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('img.mw-mimg, .mw-mtile'); if (!el) return;
      const full = el.getAttribute('data-full'); if (full) openLightbox(full, el.getAttribute('data-kind'), el.getAttribute('data-name'));
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
    p.querySelector('#mwSearch').addEventListener('input', e => renderPicker(e.target.value));
    p.querySelector('#mwPickGo').addEventListener('click', pickerConfirm);
    const inp = p.querySelector('#mwInput');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    inp.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 110) + 'px'; });
    // close on outside click
    document.addEventListener('click', (e) => { if (!panelOpen) return; const pn = document.getElementById('msgWidgetPanel'); const bt = document.getElementById('msgWidgetBtn'); if (pn && !pn.contains(e.target) && bt && !bt.contains(e.target)) closePanel(); });
  }

  function togglePanel() { panelOpen ? closePanel() : openPanel(); }
  function openPanel() { panelOpen = true; document.getElementById('msgWidgetPanel').classList.add('open'); showList(); loadConversations(); }
  let _refreshT = null;
  function refreshSoon() { clearTimeout(_refreshT); _refreshT = setTimeout(loadConversations, 700); }
  function closePanel() { panelOpen = false; const p = document.getElementById('msgWidgetPanel'); if (p) p.classList.remove('open'); document.getElementById('mwPick')?.classList.remove('open'); }
  function showList() { curConv = null; document.getElementById('mwThread').classList.remove('open'); document.getElementById('mwList').style.display = ''; document.getElementById('mwListHead').style.display = 'flex'; }
  function showThread() { document.getElementById('mwList').style.display = 'none'; document.getElementById('mwListHead').style.display = 'none'; document.getElementById('mwThread').classList.add('open'); }

  async function loadUsers() { try { const j = await chatFetch('?api=users'); usersCache = j.users || []; me = j.me || me; if (me) nameById[me.user_id] = me.name; for (const u of usersCache) nameById[u.id] = u.name; } catch (_) {} }
  async function loadConversations() {
    try {
      const j = await chatFetch('?api=conversations'); me = j.me || me; if (me) nameById[me.user_id] = me.name;
      convs = j.conversations || [];
      for (const c of convs) for (const m of (c.members || [])) nameById[m.id] = m.name;
      renderList(); updateBadge();
    } catch (e) { const el = document.getElementById('mwList'); if (el) el.innerHTML = `<div class="mw-empty">${esc(e.message)}</div>`; }
  }
  function updateBadge() {
    const total = convs.reduce((s, c) => s + (c.unread || 0), 0);
    const dot = document.getElementById('mwDot'); if (!dot) return;
    if (total > 0) { dot.textContent = total > 99 ? '99+' : total; dot.style.display = 'flex'; } else dot.style.display = 'none';
  }
  function renderList() {
    const el = document.getElementById('mwList'); if (!el) return;
    if (!convs.length) { el.innerHTML = '<div class="mw-empty">No conversations yet.<br>Tap “✉ New” to start one.</div>'; return; }
    el.innerHTML = convs.map(c => {
      const isG = c.type === 'group';
      const prev = c.last_message ? ((isG && c.last_message.sender_name ? c.last_message.sender_name + ': ' : '') + c.last_message.body) : 'No messages yet';
      return `<div class="mw-conv${c.unread ? ' unread' : ''}" data-c="${c.id}"><div class="mw-av${isG ? ' grp' : ''}">${isG ? '#' : esc(initials(c.title))}</div>
        <div class="mw-cm"><div class="mw-cn">${esc(c.title)}</div><div class="mw-cp">${esc(prev).slice(0, 70)}</div></div>
        <div class="mw-cr"><span class="mw-ct">${fmtTime(c.last_message_at)}</span>${c.unread ? `<span class="mw-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div></div>`;
    }).join('');
    el.querySelectorAll('[data-c]').forEach(r => r.addEventListener('click', () => openConv(Number(r.dataset.c))));
  }

  async function openConv(id) {
    curConv = id; const conv = convs.find(c => c.id === id);
    resetAtts();
    showThread();
    document.getElementById('mwThreadTitle').textContent = conv ? conv.title : 'Conversation';
    const mEl = document.getElementById('mwMsgs'); mEl.innerHTML = '<div class="mw-empty">Loading…</div>';
    try {
      const j = await chatFetch('?api=messages&conversation_id=' + id);
      renderMsgs(j.messages || []);
      if (conv) { conv.unread = 0; renderList(); updateBadge(); }
    } catch (e) { mEl.innerHTML = `<div class="mw-empty">${esc(e.message)}</div>`; }
    setTimeout(() => document.getElementById('mwInput').focus(), 40);
  }
  function mediaHtml(atts) {
    if (!atts || !atts.length) return '';
    const items = atts.map(a => {
      const src = a.url || a._localUrl || '';
      if (!src) return '';
      const nm = esc(a.name || (a.kind === 'video' ? 'video' : 'image'));
      if (a.kind === 'video') return `<div class="mw-mtile" data-full="${esc(src)}" data-kind="video" data-name="${nm}"><video class="mw-mvid" src="${esc(src)}" preload="metadata" muted playsinline></video><div class="mw-play">▶</div></div>`;
      return `<img class="mw-mimg" src="${esc(src)}" loading="lazy" data-full="${esc(src)}" data-kind="image" data-name="${nm}" alt="${nm}">`;
    }).join('');
    return `<div class="mw-media">${items}</div>`;
  }
  // In-app lightbox: expand an image / play a video over the panel, with a Download
  // button that saves in place (fetch→blob) instead of opening a new tab.
  function downloadMedia(url, name) {
    fetch(url).then(r => r.blob()).then(b => {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a'); a.href = u; a.download = name || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 15000);
    }).catch(() => { const a = document.createElement('a'); a.href = url; a.download = name || 'download'; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); });
  }
  function closeLightbox() { const lb = document.getElementById('mwLb'); if (lb) { lb.classList.remove('open'); lb.querySelector('.mw-lb-stage').innerHTML = ''; } }
  function openLightbox(url, kind, name) {
    let lb = document.getElementById('mwLb');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'mwLb'; lb.className = 'mw-lb';
      lb.innerHTML = `<div class="mw-lb-bar"><button class="mw-lb-btn" id="mwLbDl">⬇ Download</button><button class="mw-lb-btn" id="mwLbX">✕ Close</button></div><div class="mw-lb-stage"></div>`;
      document.body.appendChild(lb);
      lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
      lb.querySelector('#mwLbX').addEventListener('click', closeLightbox);
    }
    const stage = lb.querySelector('.mw-lb-stage');
    stage.innerHTML = kind === 'video'
      ? `<video src="${esc(url)}" controls autoplay playsinline></video>`
      : `<img src="${esc(url)}" alt="${esc(name || '')}">`;
    lb.querySelector('#mwLbDl').onclick = () => downloadMedia(url, name);
    lb.classList.add('open');
  }
  function bubble(m, isG) {
    const snd = (!m.mine && isG) ? `<div class="mw-snd">${esc(m.sender_name || nameById[m.sender_id] || '')}</div>` : '';
    const txt = m.body ? `<div class="mw-bub">${esc(m.body)}</div>` : '';
    return `<div class="mw-row${m.mine ? ' mine' : ''}"${m._tmpId ? ` id="${m._tmpId}"` : ''}>${snd}${mediaHtml(m.attachments)}${txt}<div class="mw-bt">${fmtTime(m.created_at)}</div></div>`;
  }
  function renderMsgs(msgs) {
    const conv = convs.find(c => c.id === curConv); const isG = conv && conv.type === 'group';
    const el = document.getElementById('mwMsgs');
    el.innerHTML = msgs.length ? msgs.map(m => bubble(m, isG)).join('') : '<div class="mw-empty">No messages yet — say hi 👋</div>';
    el.scrollTop = el.scrollHeight;
  }
  function appendMsg(m) {
    const conv = convs.find(c => c.id === curConv); const isG = conv && conv.type === 'group';
    const el = document.getElementById('mwMsgs'); const e = el.querySelector('.mw-empty'); if (e) el.innerHTML = '';
    el.insertAdjacentHTML('beforeend', bubble(m, isG)); el.scrollTop = el.scrollHeight;
  }
  // ── Attachments: upload straight to Dropbox via a one-time link ──────────
  let pendingAtts = [];   // { id, kind, mime, size, name, path, _localUrl, status:'uploading'|'done' }
  function resetAtts() { pendingAtts.forEach(a => { if (a._localUrl) URL.revokeObjectURL(a._localUrl); }); pendingAtts = []; renderAttStrip(); }
  function renderAttStrip() {
    const el = document.getElementById('mwAttStrip'); if (!el) return;
    el.innerHTML = pendingAtts.map(a => {
      const inner = a.kind === 'video'
        ? `<video src="${esc(a._localUrl || '')}" muted></video><div class="mw-vico">🎬</div>`
        : `<img src="${esc(a._localUrl || '')}" alt="">`;
      return `<div class="mw-thumb${a.status === 'uploading' ? ' up' : ''}" data-a="${a.id}">${inner}<button class="mw-rm" data-rm="${a.id}">×</button></div>`;
    }).join('');
    el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.rm; const i = pendingAtts.findIndex(a => a.id === id);
      if (i >= 0) { if (pendingAtts[i]._localUrl) URL.revokeObjectURL(pendingAtts[i]._localUrl); pendingAtts.splice(i, 1); renderAttStrip(); }
    }));
  }
  async function handleFiles(files) {
    if (!curConv || !files || !files.length) return;
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      if (kind === 'file') { alert('Only photos and videos can be attached.'); continue; }
      const localId = 'att-' + Date.now() + '-' + Math.round(performance.now());
      const rec = { id: localId, kind, mime: file.type, size: file.size, name: file.name, path: null, _localUrl: URL.createObjectURL(file), status: 'uploading' };
      pendingAtts.push(rec); renderAttStrip();
      try {
        // Stream the bytes THROUGH our function to Dropbox (browser→Dropbox direct PUT is
        // blocked by CORS). Query carries the metadata; the body is the raw file.
        const tok = await getToken(); if (!tok) throw new Error('no auth');
        const qs = '?api=attach-upload&conversation_id=' + curConv + '&filename=' + encodeURIComponent(file.name) + '&mime=' + encodeURIComponent(file.type || 'application/octet-stream');
        const r = await fetch(CHAT_BASE + qs, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: file });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        rec.path = j.path; rec.status = 'done'; renderAttStrip();
      } catch (e) {
        const i = pendingAtts.indexOf(rec); if (i >= 0) { URL.revokeObjectURL(rec._localUrl); pendingAtts.splice(i, 1); }
        renderAttStrip(); alert('Could not upload ' + file.name + ': ' + e.message);
      }
    }
  }

  async function send() {
    const inp = document.getElementById('mwInput'); const body = inp.value.trim();
    if (!curConv) return;
    const uploading = pendingAtts.some(a => a.status === 'uploading');
    if (uploading) { alert('Hold on — attachments are still uploading.'); return; }
    const ready = pendingAtts.filter(a => a.status === 'done' && a.path);
    if (!body && !ready.length) return;
    return sendWith(body, ready);
  }
  async function sendWith(body, ready) {
    const inp = document.getElementById('mwInput');
    const cid = curConv; inp.value = ''; inp.style.height = 'auto';
    const nowIso = new Date().toISOString();
    const tmpId = 'mw-tmp-' + nowIso.replace(/\D/g, '');
    // Optimistic bubble reuses the local preview URLs so media shows instantly.
    const optAtts = ready.map(a => ({ kind: a.kind, mime: a.mime, name: a.name, _localUrl: a._localUrl }));
    appendMsg({ body, created_at: nowIso, mine: true, sender_id: me?.user_id, _tmpId: tmpId, attachments: optAtts });
    // The strip's object URLs are now owned by the optimistic bubble — clear the strip
    // WITHOUT revoking them (revoking would blank the preview we just rendered).
    pendingAtts = []; renderAttStrip();
    const payloadAtts = ready.map(a => ({ path: a.path, mime: a.mime, size: a.size, name: a.name }));
    const preview = body || (ready.some(a => a.kind === 'video') ? '📷 Attachment' : '📷 Attachment');
    const conv = convs.find(c => c.id === cid);
    if (conv) { conv.last_message = { body: preview, sender_id: me?.user_id, sender_name: me?.name, created_at: nowIso }; conv.last_message_at = nowIso; convs.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); renderList(); }
    try { await chatFetch('?api=send', { method: 'POST', body: JSON.stringify({ conversation_id: cid, body, attachments: payloadAtts }) }); }
    catch (e) {
      // Roll back the optimistic bubble and put the text back so nothing is silently lost.
      const node = document.getElementById(tmpId); if (node) node.remove();
      if (curConv === cid && !inp.value.trim()) { inp.value = body; inp.style.height = 'auto'; }
      alert('Message not sent: ' + e.message + (body ? '\nYour text was restored — tap send to try again.' : ''));
    }
  }

  // picker
  let pMode = 'dm', pSel = new Set();
  function openPicker(mode) {
    pMode = mode; pSel = new Set();
    document.getElementById('mwPickTitle').textContent = mode === 'group' ? 'New group' : 'New message';
    document.getElementById('mwGrpName').style.display = mode === 'group' ? 'block' : 'none';
    document.getElementById('mwGrpName').value = '';
    document.getElementById('mwPickFoot').style.display = mode === 'group' ? 'flex' : 'none';
    document.getElementById('mwSearch').value = '';
    renderPicker('');
    if (!usersCache.length) { document.getElementById('mwPickList').innerHTML = '<div class="mw-empty">Loading…</div>'; loadUsers().then(() => { if (document.getElementById('mwPick').classList.contains('open')) renderPicker(document.getElementById('mwSearch').value); }); }
    document.getElementById('mwPick').classList.add('open');
    setTimeout(() => document.getElementById('mwSearch').focus(), 40);
  }
  function renderPicker(q) {
    const ql = (q || '').toLowerCase();
    const rows = usersCache.filter(u => !ql || u.name.toLowerCase().includes(ql) || (u.email || '').toLowerCase().includes(ql));
    const list = document.getElementById('mwPickList');
    list.innerHTML = rows.length ? rows.map(u => `<div class="mw-prow${pSel.has(u.id) ? ' sel' : ''}" data-u="${u.id}"><div class="mw-av" style="width:30px;height:30px;">${esc(initials(u.name))}</div><div class="mw-cm"><div class="mw-cn">${esc(u.name)}</div><div class="mw-cp">${esc(u.email || '')}</div></div>${pMode === 'group' ? `<div class="mw-pk">${pSel.has(u.id) ? '✓' : ''}</div>` : ''}</div>`).join('') : '<div class="mw-empty">No people found.</div>';
    list.querySelectorAll('[data-u]').forEach(r => r.addEventListener('click', async () => {
      const uid = r.dataset.u;
      if (pMode === 'dm') { document.getElementById('mwPick').classList.remove('open'); try { const j = await chatFetch('?api=start-dm', { method: 'POST', body: JSON.stringify({ user_id: uid }) }); await loadConversations(); openConv(j.conversation_id); } catch (e) { alert('Failed: ' + e.message); } }
      else { pSel.has(uid) ? pSel.delete(uid) : pSel.add(uid); renderPicker(document.getElementById('mwSearch').value); }
    }));
  }
  async function pickerConfirm() {
    const ids = [...pSel]; if (!ids.length) { alert('Pick at least one person.'); return; }
    const title = document.getElementById('mwGrpName').value.trim() || 'Group';
    try { const j = await chatFetch('?api=create-group', { method: 'POST', body: JSON.stringify({ title, member_ids: ids }) }); document.getElementById('mwPick').classList.remove('open'); await loadConversations(); openConv(j.conversation_id); }
    catch (e) { alert('Failed: ' + e.message); }
  }

  async function startRealtime() {
    const s = ensureSupa(); if (!s || channel) return;
    // Authenticate the realtime socket BEFORE subscribing, else RLS silently drops
    // events and messages never arrive live.
    const tok = await getToken(); if (tok) { try { s.realtime.setAuth(tok); } catch (_) {} }
    channel = s.channel('msg-widget-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      const m = payload.new; if (!m) return;
      if (me && m.sender_id === me.user_id) return;
      if (panelOpen && m.conversation_id === curConv) {
        // The realtime payload carries only the message row, not its attachments — so if
        // it has media, re-fetch the thread to pull fresh view links; otherwise append.
        if (m.has_attachments) openConv(curConv);
        else appendMsg({ ...m, sender_name: nameById[m.sender_id] || '', mine: false });
        chatFetch('?api=mark-read', { method: 'POST', body: JSON.stringify({ conversation_id: curConv }) }).catch(() => {});
      }
      refreshSoon();
    }).subscribe();
  }

  function init() {
    if (!mountBtn()) { setTimeout(init, 300); return; }
    const s = ensureSupa(); if (!s) { setTimeout(init, 300); return; }
    // getToken() falls back to the page's stored session, so kick these off now
    // (don't gate on our own client's getSession, which may not be hydrated yet).
    loadConversations(); startRealtime(); loadUsers();
    s.auth.onAuthStateChange((_e, sess) => { if (sess) { loadConversations(); startRealtime(); } });
    // periodic badge refresh as a safety net (realtime is primary)
    setInterval(() => { getToken().then(t => { if (t) loadConversations(); }); }, 120000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
