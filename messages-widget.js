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
  async function getToken() {
    const s = ensureSupa();
    if (s) { try { const { data } = await s.auth.getSession(); if (data?.session?.access_token) return data.session.access_token; } catch (_) {} }
    return tokenFromStorage();
  }
  async function chatFetch(path, opts = {}) {
    const tok = await getToken(); if (!tok) throw new Error('no auth');
    const r = await fetch(CHAT_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
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
      .mw-row { display:flex; margin-top:7px; }
      .mw-row.mine { justify-content:flex-end; }
      .mw-bub { max-width:76%; padding:8px 11px; border-radius:13px; font-size:0.86rem; line-height:1.35; white-space:pre-wrap; word-break:break-word; background:#191e30; border:1px solid #1f2438; }
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
        <div class="mw-comp"><textarea id="mwInput" rows="1" placeholder="Message…"></textarea><button id="mwSend"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>
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
    p.querySelector('#mwSearch').addEventListener('input', e => renderPicker(e.target.value));
    p.querySelector('#mwPickGo').addEventListener('click', pickerConfirm);
    const inp = p.querySelector('#mwInput');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    inp.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 110) + 'px'; });
    // close on outside click
    document.addEventListener('click', (e) => { if (!panelOpen) return; const pn = document.getElementById('msgWidgetPanel'); const bt = document.getElementById('msgWidgetBtn'); if (pn && !pn.contains(e.target) && bt && !bt.contains(e.target)) closePanel(); });
  }

  function togglePanel() { panelOpen ? closePanel() : openPanel(); }
  function openPanel() { panelOpen = true; document.getElementById('msgWidgetPanel').classList.add('open'); showList(); loadConversations(); loadUsers(); }
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
      return `<div class="mw-conv" data-c="${c.id}"><div class="mw-av${isG ? ' grp' : ''}">${isG ? '#' : esc(initials(c.title))}</div>
        <div class="mw-cm"><div class="mw-cn">${esc(c.title)}</div><div class="mw-cp">${esc(prev).slice(0, 70)}</div></div>
        <div class="mw-cr"><span class="mw-ct">${fmtTime(c.last_message_at)}</span>${c.unread ? `<span class="mw-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div></div>`;
    }).join('');
    el.querySelectorAll('[data-c]').forEach(r => r.addEventListener('click', () => openConv(Number(r.dataset.c))));
  }

  async function openConv(id) {
    curConv = id; const conv = convs.find(c => c.id === id);
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
  function bubble(m, isG) {
    return `<div class="mw-row${m.mine ? ' mine' : ''}"><div style="max-width:76%;">${(!m.mine && isG) ? `<div class="mw-snd">${esc(m.sender_name || nameById[m.sender_id] || '')}</div>` : ''}<div class="mw-bub">${esc(m.body)}</div><div class="mw-bt">${fmtTime(m.created_at)}</div></div></div>`;
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
  async function send() {
    const inp = document.getElementById('mwInput'); const body = inp.value.trim(); if (!body || !curConv) return;
    inp.value = ''; inp.style.height = 'auto';
    try { const j = await chatFetch('?api=send', { method: 'POST', body: JSON.stringify({ conversation_id: curConv, body }) }); appendMsg(j.message); loadConversations(); }
    catch (e) { alert('Send failed: ' + e.message); inp.value = body; }
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

  function startRealtime() {
    const s = ensureSupa(); if (!s || channel) return;
    getToken().then(tok => { try { s.realtime.setAuth(tok); } catch (_) {} });
    channel = s.channel('msg-widget-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
      const m = payload.new; if (!m) return;
      if (me && m.sender_id === me.user_id) return;
      if (panelOpen && m.conversation_id === curConv) { appendMsg({ ...m, sender_name: nameById[m.sender_id] || '', mine: false }); chatFetch('?api=mark-read', { method: 'POST', body: JSON.stringify({ conversation_id: curConv }) }).catch(() => {}); }
      loadConversations();
    }).subscribe();
  }

  function init() {
    if (!mountBtn()) { setTimeout(init, 300); return; }
    const s = ensureSupa(); if (!s) { setTimeout(init, 300); return; }
    s.auth.getSession().then(({ data }) => { if (data?.session) { loadConversations(); startRealtime(); } });
    s.auth.onAuthStateChange((_e, sess) => { if (sess) { loadConversations(); startRealtime(); } });
    // periodic badge refresh as a safety net (realtime is primary)
    setInterval(() => { getToken().then(t => { if (t) loadConversations(); }); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
