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
  const UNFURL_BASE = SUPABASE_URL + '/functions/v1/unfurl';
  const PRESENCE_BASE = SUPABASE_URL + '/functions/v1/presence';
  let onlineIds = new Set(), presenceCh = null, lastSeenCache = {}, _beatT = null;
  const unfurlCache = new Map();   // url -> { status:'loading'|'done'|'fail', data }
  const audioBlobCache = new Map();   // remote url -> object URL (Dropbox links download rather than stream; fetch to a blob so <audio> plays)

  let mSupa = null, me = null, convs = [], usersCache = [], curConv = null, channel = null, panelOpen = false;
  let curMsgs = [];          // messages currently rendered in the open thread (for reaction/edit updates)
  let curHasMore = false, loadingOlder = false;   // history pagination (load-earlier on scroll-up)
  let curPinned = null;      // pinned message {id, sender_name, snippet} for the open thread
  let editingId = null;      // message id being edited (composer is in edit mode)
  let replyTarget = null;    // { id, sender_name, snippet } message being replied to
  let selectMode = false;    // multi-select (for forwarding) active
  let selectedIds = new Set();
  let readCutoff = null;     // caller's last_read_at when the thread was opened (for the unread divider)
  let listQuery = '';        // conversation-list search text
  let searchResults = [], searchT = null, jumpToMid = null, searching = false;   // message-content search results + pending scroll target
  let findMatches = [], findIdx = -1;   // in-thread find state
  let typingCh = null, lastTypingSent = 0, typingHideT = null;   // per-conversation typing broadcast
  const mentionPicked = new Map();   // id -> name for @mentions chosen while composing
  const nameById = {};
  const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
  // Full emoji picker (categorised); the react button's "+" opens it for any-emoji reactions.
  const EMOJI_CATS = [
    { name: 'Smileys', emojis: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽'.split(' ') },
    { name: 'Gestures', emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 ✍️ 💪 🦾 👊 ✊ 🤛 🤜 💅'.split(' ') },
    { name: 'Hearts', emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ ⭐ 🌟 💫 🔥 💯 ✅ ❌ ❓ ❗ ⚡'.split(' ') },
    { name: 'Objects', emojis: '🎉 🎊 🎈 🎁 🏆 🥇 🎯 💡 📌 📎 🔒 🔑 💰 💵 📈 📉 📊 🗓️ ⏰ ⌛ 📞 📱 💻 🖥️ 📷 🎬 🎵 🎧 ☕ 🍕 🍔 🍺 🍻 🥂 🎂 🚀 ✈️ 🏠 👀 🙈'.split(' ') },
  ];
  const EDIT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  const INFO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M9 13l2 2 4-4"/></svg>';
  const COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.6-2.6a2 2 0 0 1-.4-1.2V8a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5.2a2 2 0 0 1-.4 1.2L5 17z"/></svg>';
  const FILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const PIN_MINI_SVG = '<svg class="mw-cn-pin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.6-2.6a2 2 0 0 1-.4-1.2V8a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5.2a2 2 0 0 1-.4 1.2L5 17z"/></svg>';
  const VIDEO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
  const SLASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';

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
  // Full date + time under a message (today → just time; this year → "Jul 7, 2:34 PM"; else include year).
  function fmtStamp(t) {
    if (!t) return ''; const d = new Date(t), now = new Date();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const dateOpts = d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', dateOpts) + ', ' + time;
  }
  // WhatsApp-style ticks on my own messages: sent ✓, delivered ✓✓, read ✓✓ (accent).
  function statusHtml(m) {
    if (!m.mine || !m.id) return '';
    const s = m.status || 'sent';
    if (s === 'read') return '<span class="mw-tick read" title="Read">✓✓</span>';
    if (s === 'delivered') return '<span class="mw-tick" title="Delivered">✓✓</span>';
    return '<span class="mw-tick" title="Sent">✓</span>';
  }

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
      .mw-iconbtn { display:inline-flex; align-items:center; justify-content:center; padding:5px 7px; }
      .mw-iconbtn svg { display:block; }
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
      .mw-thread { display:none; flex-direction:column; flex:1; min-height:0; position:relative; }
      .mw-thread.open { display:flex; }
      .mw-back { background:none; border:none; color:#7880a8; font-size:1.2rem; cursor:pointer; padding:0 4px; }
      .mw-msgs { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; }
      .mw-row { display:flex; flex-direction:column; align-items:flex-start; margin-top:7px; }
      .mw-row.mine { align-items:flex-end; }
      .mw-bub { max-width:82%; width:fit-content; padding:8px 11px; border-radius:13px; font-size:0.86rem; line-height:1.35; white-space:pre-wrap; overflow-wrap:anywhere; word-break:normal; background:#191e30; border:1px solid #1f2438; }
      .mw-row.mine .mw-bub { background:linear-gradient(135deg,#2c7a5a,#22b07d); border-color:transparent; color:#eafff5; }
      .mw-snd { font-size:0.66rem; font-weight:700; color:#a78bfa; margin:0 3px 2px; }
      .mw-bt { font-size:0.58rem; color:#3e4668; margin:2px 3px 0; text-align:right; }
      .mw-comp { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #1f2438; flex-shrink:0; align-items:flex-end; position:relative; }
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
      .mw-thumb-file { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:4px; color:#7f8bd6; }
      .mw-thumb-file .mw-thumb-fn { font-size:0.58rem; color:#9aa2c8; line-height:1.1; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
      /* skeleton while media loads */
      .mw-mimg.mw-loading, .mw-mtile.mw-loading { min-width:200px; min-height:150px; border-color:transparent; background:linear-gradient(100deg,#141827 30%,#212840 50%,#141827 70%); background-size:300% 100%; animation:mwShimmer 1.25s ease-in-out infinite; }
      .mw-mtile.mw-loading video, .mw-mtile.mw-loading .mw-play { visibility:hidden; }
      @keyframes mwShimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
      .mw-lb { position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:10050; display:none; }
      .mw-lb.open { display:block; }
      .mw-lb-stage { position:absolute; inset:0; overflow:auto; display:flex; align-items:center; justify-content:center; -webkit-overflow-scrolling:touch; }
      .mw-lb-stage img { max-width:94vw; max-height:92vh; border-radius:10px; display:block; cursor:zoom-in; }
      .mw-lb-stage video { max-width:94vw; max-height:92vh; border-radius:10px; display:block; }
      .mw-lb-frame { width:94vw; max-width:900px; height:90vh; border:0; border-radius:10px; background:#fff; }
      .mw-lb-file { display:flex; flex-direction:column; align-items:center; gap:12px; color:#eaecf8; text-align:center; padding:24px; }
      .mw-lb-file .mw-lb-fico { color:#8ea2ff; } .mw-lb-file .mw-lb-fico svg { width:56px; height:56px; }
      .mw-lb-file .mw-lb-fname { font-weight:700; word-break:break-word; max-width:80vw; }
      .mw-lb-file .mw-lb-fhint { color:#9aa2c8; font-size:0.84rem; }
      .mw-lb-spin { width:34px; height:34px; border:3px solid rgba(255,255,255,0.25); border-top-color:#fff; border-radius:50%; animation:attspin2 0.7s linear infinite; }
      @keyframes attspin2 { to { transform:rotate(360deg); } }
      .mw-lb-stage.zoomed { align-items:flex-start; justify-content:flex-start; }
      .mw-lb-stage.zoomed img { max-width:none; max-height:none; margin:auto; cursor:zoom-out; }
      .mw-lb-bar { position:absolute; top:14px; right:14px; z-index:2; display:flex; gap:10px; }
      .mw-lb-btn { background:rgba(255,255,255,0.16); color:#fff; border:none; border-radius:9px; padding:9px 13px; font-size:0.85rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
      .mw-lb-btn:hover { background:rgba(255,255,255,0.3); }
      /* always-visible action footer under each message (react / edit-delete + time) */
      .mw-row { position:relative; }
      .mw-foot { display:flex; align-items:center; gap:5px; margin-top:3px; }
      .mw-row.mine .mw-foot { flex-direction:row-reverse; }
      .mw-foot button { width:23px; height:23px; border-radius:50%; border:1px solid #272d45; background:#191e30; color:#aeb6da; cursor:pointer; font-size:0.82rem; line-height:1; display:flex; align-items:center; justify-content:center; padding:0; opacity:0.85; }
      .mw-foot button:hover { background:#232a41; color:#fff; opacity:1; }
      .mw-react-btn { font-size:0.9rem; }
      .mw-react-btn svg { display:block; }
      .mw-bt { text-align:left; }
      .mw-tick { font-size:0.68rem; letter-spacing:-2px; color:#6b7398; margin-left:1px; }
      .mw-tick.read { color:#34d399; }
      .mw-edited { font-size:0.6rem; color:#6b7398; margin-left:6px; }
      .mw-row.mine .mw-edited { color:#bdeeda; }
      .mw-row.deleted { margin-top:4px; }
      .mw-deleted { display:inline-flex; align-items:center; gap:5px; font-size:0.72rem; font-style:italic; color:#5b6486; padding:1px 2px; }
      .mw-deleted svg { opacity:0.75; flex-shrink:0; }
      .mw-mention { color:#a78bfa; font-weight:700; }
      .mw-row.mine .mw-mention { color:#dfe7ff; }
      /* reaction chips */
      .mw-rx { display:flex; flex-wrap:wrap; gap:4px; margin:3px 2px 0; }
      .mw-row.mine .mw-rx { justify-content:flex-end; }
      .mw-rchip { background:#191e30; border:1px solid #272d45; color:#c7cdec; border-radius:11px; padding:1px 7px; font-size:0.72rem; cursor:pointer; line-height:1.5; }
      .mw-rchip.mine { background:#243a52; border-color:#3b6ea5; color:#dbeafe; }
      .mw-rchip:hover { border-color:#4b567e; }
      /* floating popup (emoji palette / edit-delete menu) */
      .mw-pop { position:fixed; z-index:10060; background:#1a1f30; border:1px solid #2a3150; border-radius:11px; box-shadow:0 10px 30px rgba(0,0,0,0.5); padding:5px; display:flex; gap:3px; }
      .mw-rxopt { background:none; border:none; font-size:1.15rem; cursor:pointer; border-radius:8px; padding:3px 5px; line-height:1; }
      .mw-rxopt:hover { background:#252c44; transform:scale(1.15); }
      .mw-pop.menu { flex-direction:column; gap:1px; padding:4px; }
      .mw-mi { background:none; border:none; color:#c7cdec; text-align:left; padding:7px 13px; border-radius:7px; cursor:pointer; font-size:0.82rem; white-space:nowrap; display:flex; align-items:center; gap:8px; }
      .mw-mi svg { flex-shrink:0; }
      .mw-mi:hover { background:#252c44; color:#eaecf8; }
      .mw-mi.del:hover { background:#3a1f24; color:#ff9a9a; }
      .mw-rxmore { font-size:1.05rem; color:#8b93bd; border-left:1px solid #2a3150; margin-left:2px; padding-left:7px; }
      .mw-pop.emoji { display:block; padding:8px; width:280px; max-height:300px; overflow-y:auto; }
      .mw-emoji-cat { font-size:0.66rem; text-transform:uppercase; letter-spacing:0.05em; color:#8b93bd; margin:6px 2px 3px; font-weight:700; }
      .mw-emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:1px; }
      .mw-emoji { background:none; border:none; font-size:1.2rem; cursor:pointer; border-radius:6px; padding:3px 0; line-height:1.1; }
      .mw-emoji:hover { background:#252c44; transform:scale(1.2); }
      .mw-pop.readby { display:block; padding:9px 11px; min-width:210px; max-width:270px; max-height:300px; overflow-y:auto; }
      .mw-readby-loading { color:#8b93bd; font-size:0.82rem; padding:4px 2px; }
      .mw-rb-head { font-size:0.72rem; color:#8b93bd; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px; }
      .mw-rb-sub { font-size:0.68rem; color:#6b7290; margin:9px 0 4px; text-transform:uppercase; letter-spacing:0.04em; }
      .mw-rb-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:3px 2px; }
      .mw-rb-name { color:#eaecf8; font-size:0.85rem; }
      .mw-rb-when { color:#8b93bd; font-size:0.72rem; white-space:nowrap; }
      .mw-rb-when.dim { color:#6b7290; }
      .mw-toast { position:absolute; left:50%; bottom:76px; transform:translateX(-50%) translateY(6px); background:#0b0d18; border:1px solid #2a3350; color:#eaecf8; padding:7px 14px; border-radius:20px; font-size:0.8rem; opacity:0; pointer-events:none; transition:opacity .18s, transform .18s; z-index:40; box-shadow:0 6px 20px rgba(0,0,0,0.4); }
      .mw-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
      .mw-file { display:flex; align-items:center; gap:10px; text-decoration:none; background:#0f1120; border:1px solid #1f2438; border-radius:12px; padding:9px 12px; max-width:240px; color:#eaecf8; cursor:pointer; }
      .mw-file:hover { border-color:#2a3350; }
      .mw-file .mw-fico { color:#7f8bd6; flex-shrink:0; }
      .mw-file .mw-fmeta { min-width:0; }
      .mw-file .mw-fname { font-size:0.82rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mw-file .mw-fsz { font-size:0.7rem; color:#7880a8; }
      .mw-cn-pin { color:#8ea2ff; margin-right:4px; vertical-align:-1px; flex-shrink:0; }
      .mw-lp { display:flex; margin-top:7px; border-radius:10px; overflow:hidden; text-decoration:none; background:rgba(0,0,0,0.22); border:1px solid rgba(255,255,255,0.12); max-width:260px; }
      .mw-lp:hover { background:rgba(0,0,0,0.30); }
      .mw-lp-img { width:100%; height:150px; object-fit:contain; display:block; background:#0f1120; }
      .mw-lp { flex-direction:column; }
      .mw-lp-tx { padding:8px 10px; min-width:0; }
      .mw-lp-site { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.03em; color:#8ea2ff; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mw-lp-title { font-size:0.82rem; font-weight:700; color:#eaecf8; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .mw-lp-desc { font-size:0.75rem; color:#aab2d5; margin-top:3px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .mw-drop { position:absolute; inset:0; z-index:30; display:none; align-items:center; justify-content:center; background:rgba(11,13,24,0.82); border:2px dashed #3a4a80; border-radius:14px; margin:6px; }
      .mw-drop.show { display:flex; }
      .mw-drop-inner { display:flex; flex-direction:column; align-items:center; gap:8px; color:#8ea2ff; font-weight:700; pointer-events:none; }
      .mw-drop-inner svg { width:38px; height:38px; }
      .mw-iconbtn.on { color:#8ea2ff !important; background:#1a2140 !important; }
      .mw-cn-mute { color:#7880a8; vertical-align:-2px; }
      .mw-draft { color:#ff8f8f; font-weight:600; }
      .mw-conv-menu { background:none; border:none; color:#6b7396; font-size:1rem; line-height:1; cursor:pointer; padding:0 2px; opacity:0; transition:opacity .12s; }
      .mw-conv:hover .mw-conv-menu { opacity:1; }
      @media (hover: none) { .mw-conv-menu { opacity:0.7; } }
      .mw-pinbar { display:none; align-items:center; gap:9px; padding:7px 10px; background:#12162a; border-bottom:1px solid #1f2438; cursor:pointer; }
      .mw-pinbar.show { display:flex; }
      .mw-pinbar-ico { color:#8ea2ff; flex-shrink:0; display:flex; }
      .mw-pinbar-tx { flex:1; min-width:0; display:flex; flex-direction:column; line-height:1.2; }
      .mw-pinbar-name { font-size:0.66rem; color:#8ea2ff; font-weight:700; }
      .mw-pinbar-snip { font-size:0.8rem; color:#c7cdec; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mw-pinbar-x { background:none; border:none; color:#7880a8; font-size:0.9rem; cursor:pointer; padding:2px 6px; flex-shrink:0; }
      .mw-pinbar-x:hover { color:#eaecf8; }
      .mw-presence { font-size:0.68rem; color:#7880a8; line-height:1.1; }
      .mw-presence.online { color:#34d399; }
      .mw-av { position:relative; }
      .mw-online-dot { position:absolute; right:-1px; bottom:-1px; width:11px; height:11px; border-radius:50%; background:#34d399; border:2px solid #12151f; }
      .mw-aud { width:230px; max-width:60vw; height:38px; margin-top:2px; }
      .mw-recbar { display:none; flex:1; align-items:center; gap:9px; padding:4px 4px 4px 10px; }
      .mw-comp.recording .mw-attbtn, .mw-comp.recording #mwMic, .mw-comp.recording #mwInput, .mw-comp.recording #mwSend { display:none; }
      .mw-comp.recording .mw-recbar { display:flex; }
      .mw-rec-dot { width:10px; height:10px; border-radius:50%; background:#ff5d5d; animation:mwRecPulse 1s ease-in-out infinite; flex-shrink:0; }
      @keyframes mwRecPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .mw-rec-time { font-variant-numeric:tabular-nums; color:#eaecf8; font-size:0.85rem; }
      .mw-rec-lbl { color:#7880a8; font-size:0.8rem; flex:1; }
      .mw-rec-cancel { background:none; border:none; color:#ff9a9a; font-size:0.82rem; cursor:pointer; padding:6px 8px; }
      .mw-rec-send { background:#34d399; border:none; color:#04120c; width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
      .mw-confirm { position:fixed; inset:0; z-index:10070; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
      .mw-confirm-card { background:#1a1f30; border:1px solid #2a3150; border-radius:14px; padding:18px; max-width:300px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.6); }
      .mw-confirm-msg { font-size:0.9rem; color:#eaecf8; margin-bottom:16px; line-height:1.4; }
      .mw-confirm-row { display:flex; gap:8px; justify-content:flex-end; }
      .mw-confirm-btn { border:none; border-radius:9px; padding:8px 15px; font-size:0.82rem; font-weight:700; cursor:pointer; }
      .mw-confirm-btn.cancel { background:#232a41; color:#c7cdec; }
      .mw-confirm-btn.ok { background:#c0392b; color:#fff; }
      .mw-confirm-btn.ok:hover { background:#e04b3a; }
      /* links inside messages */
      .mw-link { color:#7fd7ff; text-decoration:underline; word-break:break-all; }
      .mw-row.mine .mw-link { color:#d9f4ff; }
      /* forwarded label + reply quote inside a bubble */
      .mw-fwd { font-size:0.66rem; font-style:italic; color:#8b93b8; margin-bottom:2px; }
      .mw-row.mine .mw-fwd { color:#cdeee0; }
      .mw-quote { border-left:4px solid #34d399; background:rgba(0,0,0,0.32); border-radius:7px; padding:6px 9px; margin-bottom:6px; cursor:pointer; max-width:100%; overflow:hidden; }
      .mw-quote-n { display:block; font-size:0.72rem; font-weight:800; color:#5eead4; margin-bottom:2px; }
      .mw-quote-t { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:0.78rem; line-height:1.35; color:#eef1fb; word-break:break-word; }
      .mw-flash { animation:mwFlash 1.2s ease; }
      @keyframes mwFlash { 0%,100%{ background:transparent } 30%{ background:rgba(52,211,153,0.18) } }
      /* reply composer bar */
      .mw-replybar { display:none; align-items:center; gap:8px; padding:7px 12px; background:#141827; border-top:1px solid #1f2438; border-left:3px solid #34d399; }
      .mw-replybar.open { display:flex; }
      .mw-rb-body { flex:1; min-width:0; display:flex; flex-direction:column; }
      .mw-rb-name { font-size:0.7rem; font-weight:700; color:#34d399; }
      .mw-rb-txt { font-size:0.74rem; color:#9aa3c8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mw-rb-x { background:none; border:none; color:#7880a8; font-size:1rem; cursor:pointer; }
      /* multi-select bar + checkboxes */
      .mw-selbar { display:none; align-items:center; gap:10px; padding:8px 12px; background:#141827; border-top:1px solid #1f2438; }
      .mw-selbar.open { display:flex; }
      .mw-sel-x { background:none; border:none; color:#7880a8; font-size:1rem; cursor:pointer; }
      .mw-sel-count { flex:1; font-size:0.8rem; color:#c7cdec; }
      .mw-sel-fwd { background:linear-gradient(135deg,#34d399,#22b07d); border:none; color:#fff; border-radius:8px; padding:6px 13px; font-size:0.8rem; font-weight:700; cursor:pointer; }
      .mw-sel-fwd:disabled { opacity:0.4; cursor:default; }
      .mw-row.selecting { cursor:pointer; padding-left:26px; position:relative; }
      .mw-row.selecting.mine { padding-left:0; padding-right:26px; }
      .mw-check { position:absolute; top:50%; transform:translateY(-50%); left:2px; width:17px; height:17px; border-radius:50%; border:2px solid #4b567e; }
      .mw-row.selecting.mine .mw-check { left:auto; right:2px; }
      .mw-row.selected .mw-check { background:#34d399; border-color:#34d399; }
      .mw-row.selected { background:rgba(52,211,153,0.08); }
      /* forward → conversation picker overlay */
      .mw-fwdpick { position:fixed; inset:0; z-index:10065; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; padding:20px; }
      .mw-fwdpick-card { background:#13141f; border:1px solid #272d45; border-radius:14px; width:100%; max-width:340px; max-height:70vh; display:flex; flex-direction:column; overflow:hidden; }
      .mw-fwdpick-head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid #1f2438; }
      .mw-fwdpick-x { background:none; border:none; color:#7880a8; font-size:1.1rem; cursor:pointer; }
      .mw-fwdpick-list { overflow-y:auto; }
      .mw-fwd-row { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; border-bottom:1px solid #1a1f30; }
      .mw-fwd-row:hover { background:#191e30; }
      .mw-fwd-row .mw-cn { font-size:0.86rem; }
      /* conversation-list search */
      .mw-listsearch { margin:8px 12px; background:#0f1120; border:1px solid #1f2438; color:#eaecf8; border-radius:9px; padding:8px 11px; font-size:0.82rem; outline:none; }
      .mw-listsearch:focus { border-color:#2a3350; }
      .mw-seclabel { padding:8px 14px 4px; font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#7880a8; }
      .mw-msghit .mw-cp { white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .mw-skel { pointer-events:none; }
      .mw-skb { background:linear-gradient(90deg,rgba(255,255,255,0.05) 25%,rgba(255,255,255,0.11) 37%,rgba(255,255,255,0.05) 63%); background-size:400% 100%; animation:mwSkel 1.2s ease-in-out infinite; border-radius:6px; }
      .mw-skl { height:10px; margin:5px 0; }
      @keyframes mwSkel { 0%{background-position:100% 0} 100%{background-position:0 0} }
      .mw-thskel { padding:12px; display:flex; flex-direction:column; gap:11px; }
      .mw-tsr { display:flex; } .mw-tsr.mine { justify-content:flex-end; }
      .mw-tsb { height:32px; border-radius:12px; max-width:75%; }
      .mw-mk { background:rgba(52,211,153,0.32); color:#eafff5; border-radius:3px; padding:0 1px; }
      /* thread body wrapper (for typing + jump overlays) */
      .mw-msgs-wrap { flex:1; min-height:0; position:relative; display:flex; flex-direction:column; }
      /* in-thread find bar */
      .mw-findbar { display:none; align-items:center; gap:6px; padding:7px 10px; background:#141827; border-bottom:1px solid #1f2438; }
      .mw-findbar.open { display:flex; }
      .mw-findbar input { flex:1; background:#0f1120; border:1px solid #1f2438; color:#eaecf8; border-radius:8px; padding:6px 10px; font-size:0.82rem; outline:none; }
      .mw-find-n { font-size:0.7rem; color:#7880a8; min-width:34px; text-align:center; }
      .mw-find-nav, .mw-find-x { background:#191e30; border:1px solid #272d45; color:#c7cdec; border-radius:7px; width:26px; height:26px; cursor:pointer; font-size:0.8rem; }
      .mw-find-nav:hover, .mw-find-x:hover { background:#232a41; }
      .mw-hit .mw-bub { box-shadow:0 0 0 2px rgba(52,211,153,0.35); }
      .mw-hit-cur .mw-bub { box-shadow:0 0 0 2px #34d399; }
      /* unread divider */
      .mw-newdiv { display:flex; align-items:center; text-align:center; margin:10px 4px 4px; color:#34d399; font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; }
      .mw-newdiv::before, .mw-newdiv::after { content:''; flex:1; height:1px; background:rgba(52,211,153,0.35); }
      .mw-newdiv span { padding:0 10px; }
      /* typing indicator + jump-to-latest */
      .mw-typing { position:absolute; left:12px; bottom:6px; font-size:0.72rem; font-style:italic; color:#7880a8; background:rgba(19,20,31,0.85); padding:2px 8px; border-radius:10px; display:none; pointer-events:none; }
      .mw-typing.show { display:block; }
      .mw-jump { position:absolute; right:14px; bottom:12px; width:36px; height:36px; border-radius:50%; background:#232a41; border:1px solid #2a3350; color:#eaecf8; font-size:1.1rem; cursor:pointer; display:none; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(0,0,0,0.4); }
      .mw-jump.show { display:flex; }
      /* @mention autocomplete */
      .mw-mentions { position:absolute; left:12px; right:12px; bottom:100%; margin-bottom:4px; background:#1a1f30; border:1px solid #2a3150; border-radius:10px; box-shadow:0 -6px 22px rgba(0,0,0,0.45); max-height:180px; overflow-y:auto; display:none; z-index:6; }
      .mw-mentions.open { display:block; }
      .mw-mrow { padding:8px 12px; cursor:pointer; font-size:0.84rem; color:#dfe3f5; display:flex; align-items:center; gap:8px; }
      .mw-mrow:hover, .mw-mrow.active { background:#252c44; }
      .mw-editbar { display:none; align-items:center; gap:8px; padding:6px 12px; background:#141827; border-top:1px solid #1f2438; font-size:0.76rem; color:#9aa3c8; }
      .mw-editbar.open { display:flex; }
      .mw-editbar button { margin-left:auto; background:none; border:none; color:#f2a9a9; cursor:pointer; font-size:0.76rem; font-weight:700; }
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
      <input class="mw-listsearch" id="mwListSearch" placeholder="Search messages & chats…">
      <div class="mw-scroll" id="mwList"><div class="mw-empty">Loading…</div></div>
      <div class="mw-thread" id="mwThread">
        <div class="mw-drop" id="mwDrop"><div class="mw-drop-inner">${FILE_SVG}<span>Drop to attach</span></div></div>
        <div class="mw-head"><button class="mw-back" id="mwBack">‹</button><div style="flex:1;min-width:0;"><div class="mw-title" id="mwThreadTitle" style="font-size:0.88rem;"></div><div class="mw-presence" id="mwThreadSub"></div></div><button class="mw-hbtn mw-iconbtn" id="mwPinBtn" title="Pin conversation" aria-label="Pin"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.6-2.6a2 2 0 0 1-.4-1.2V8a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5.2a2 2 0 0 1-.4 1.2L5 17z"/></svg></button><button class="mw-hbtn mw-iconbtn" id="mwMuteBtn" title="Mute notifications" aria-label="Mute"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></button><button class="mw-hbtn mw-iconbtn" id="mwFindBtn" title="Search in conversation" aria-label="Search"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button><button class="mw-x" id="mwClose2">×</button></div>
        <div class="mw-pinbar" id="mwPinBar"></div>
        <div class="mw-findbar" id="mwFindBar"><input id="mwFindInput" placeholder="Search this conversation…"><span class="mw-find-n" id="mwFindN"></span><button class="mw-find-nav" id="mwFindPrev">↑</button><button class="mw-find-nav" id="mwFindNext">↓</button><button class="mw-find-x" id="mwFindClose">✕</button></div>
        <div class="mw-msgs-wrap">
          <div class="mw-msgs" id="mwMsgs"></div>
          <div class="mw-typing" id="mwTyping"></div>
          <button class="mw-jump" id="mwJump" title="Jump to latest">↓</button>
        </div>
        <div class="mw-selbar" id="mwSelBar"><button class="mw-sel-x" id="mwSelCancel">✕</button><span class="mw-sel-count">0 selected</span><button class="mw-sel-fwd" id="mwSelFwd">↪ Forward</button></div>
        <div class="mw-editbar" id="mwEditBar">${EDIT_SVG}Editing message<button id="mwEditCancel">Cancel</button></div>
        <div class="mw-replybar" id="mwReplyBar"><div class="mw-rb-body"><span class="mw-rb-name"></span><span class="mw-rb-txt"></span></div><button class="mw-rb-x" id="mwReplyCancel">✕</button></div>
        <div class="mw-attstrip" id="mwAttStrip"></div>
        <div class="mw-comp">
          <div class="mw-mentions" id="mwMentions"></div>
          <input type="file" id="mwFile" multiple style="display:none">
          <button id="mwAttach" class="mw-attbtn" title="Attach a file"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
          <button id="mwMic" class="mw-attbtn" title="Record voice message"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg></button>
          <textarea id="mwInput" rows="1" placeholder="Message…"></textarea>
          <button id="mwSend"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
          <div class="mw-recbar" id="mwRecBar"><span class="mw-rec-dot"></span><span class="mw-rec-time" id="mwRecTime">0:00</span><span class="mw-rec-lbl">Recording…</span><button class="mw-rec-cancel" id="mwRecCancel">Cancel</button><button class="mw-rec-send" id="mwRecStop" title="Send"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>
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
    // Thread click: selection toggle, media lightbox, reply-jump, reaction chips, tool buttons.
    p.querySelector('#mwMsgs').addEventListener('click', (e) => {
      const row = e.target.closest && e.target.closest('.mw-row'); const mid = row && row.dataset.mid ? Number(row.dataset.mid) : 0;
      if (selectMode) { const m = mid && curMsgs.find(x => x.id === mid); if (m && !m.deleted) toggleSelect(mid); return; }   // tap to (de)select; deleted msgs aren't selectable
      const media = e.target.closest && e.target.closest('img.mw-mimg, .mw-mtile, .mw-file');
      if (media) { const full = media.getAttribute('data-full'); if (full) openLightbox(full, media.getAttribute('data-kind'), media.getAttribute('data-name'), media.getAttribute('data-mime')); return; }
      const jump = e.target.closest && e.target.closest('.mw-quote');
      if (jump && jump.dataset.jump) { const t = document.querySelector(`.mw-row[data-mid="${jump.dataset.jump}"]`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('mw-flash'); setTimeout(() => t.classList.remove('mw-flash'), 1200); } return; }
      const chip = e.target.closest && e.target.closest('.mw-rchip');
      if (chip && mid) { toggleReaction(mid, chip.dataset.emoji); return; }
      const rbtn = e.target.closest && e.target.closest('.mw-react-btn');
      if (rbtn && mid) { showPop(REACTIONS.map(em => `<button class="mw-rxopt" data-emoji="${em}">${em}</button>`).join('') + '<button class="mw-rxopt mw-rxmore" data-more="1" title="More emoji">＋</button>', rbtn, '', (ev) => { const more = ev.target.closest('.mw-rxmore'); if (more) { openEmojiPicker(rbtn, (em) => toggleReaction(mid, em)); return; } const b = ev.target.closest('.mw-rxopt'); if (!b) return; closePopups(); toggleReaction(mid, b.dataset.emoji); }); return; }
      const mbtn = e.target.closest && e.target.closest('.mw-menu-btn');
      if (mbtn && mid) {
        const m = curMsgs.find(x => x.id === mid);
        const copyItem = (m && m.body) ? `<button class="mw-mi" data-act="copy">${COPY_SVG}Copy text</button>` : '';
        const pinItem = `<button class="mw-mi" data-act="pinmsg">${PIN_SVG}${curPinned && curPinned.id === mid ? 'Unpin' : 'Pin'}</button>`;
        const mineItems = (m && m.mine) ? `<button class="mw-mi" data-act="edit">${EDIT_SVG}Edit</button><button class="mw-mi del" data-act="del">${TRASH_SVG}Delete</button>` : '';
        const conv = convs.find(c => c.id === curConv);
        const readByItem = (m && m.mine && conv && conv.type === 'group') ? `<button class="mw-mi" data-act="readby">${INFO_SVG}Read by</button>` : '';
        showPop(`<button class="mw-mi" data-act="reply">↩ Reply</button><button class="mw-mi" data-act="forward">↪ Forward</button>${copyItem}${pinItem}${readByItem}<button class="mw-mi" data-act="select">☑ Select</button>${mineItems}`, mbtn, 'menu', (ev) => {
          const b = ev.target.closest('.mw-mi'); if (!b) return; closePopups();
          const act = b.dataset.act;
          if (act === 'reply') startReply(mid);
          else if (act === 'forward') openForwardPicker([mid]);
          else if (act === 'copy') copyMsg(mid);
          else if (act === 'pinmsg') pinMessage(mid);
          else if (act === 'readby') showReadBy(mid);
          else if (act === 'select') { enterSelectMode(); toggleSelect(mid); }
          else if (act === 'edit') startEdit(mid);
          else if (act === 'del') doDelete(mid);
        });
        return;
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeLightbox(); closePopups(); } });
    p.querySelector('#mwEditCancel').addEventListener('click', cancelEdit);
    p.querySelector('#mwReplyCancel').addEventListener('click', cancelReply);
    p.querySelector('#mwSelCancel').addEventListener('click', exitSelectMode);
    p.querySelector('#mwSelFwd').addEventListener('click', () => { if (selectedIds.size) openForwardPicker([...selectedIds]); });
    p.querySelector('#mwMentions').addEventListener('click', (e) => { const r = e.target.closest('.mw-mrow'); if (r) insertMention(r.dataset.mid, r.dataset.name); });
    // Conversation-list search
    p.querySelector('#mwListSearch').addEventListener('input', (e) => {
      listQuery = e.target.value.trim().toLowerCase();
      clearTimeout(searchT);
      if (listQuery.length >= 2) { searching = true; searchResults = []; searchT = setTimeout(runListSearch, 250); }
      else { searching = false; searchResults = []; }
      renderList();
    });
    // In-thread find
    // Drag-and-drop files onto the open thread (like WhatsApp).
    (() => {
      const thread = p.querySelector('#mwThread'); const drop = p.querySelector('#mwDrop');
      let depth = 0;
      const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      thread.addEventListener('dragenter', (e) => { if (!curConv || !hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('show'); });
      thread.addEventListener('dragover', (e) => { if (!curConv || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      thread.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('show'); });
      thread.addEventListener('drop', (e) => { if (!curConv || !hasFiles(e)) return; e.preventDefault(); depth = 0; drop.classList.remove('show'); if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
    })();
    p.querySelector('#mwPinBtn').addEventListener('click', togglePin);
    p.querySelector('#mwMuteBtn').addEventListener('click', toggleMute);
    p.querySelector('#mwMic').addEventListener('click', startVoice);
    p.querySelector('#mwRecCancel').addEventListener('click', cancelVoice);
    p.querySelector('#mwRecStop').addEventListener('click', stopVoiceAndSend);
    p.querySelector('#mwFindBtn').addEventListener('click', toggleFind);
    p.querySelector('#mwFindClose').addEventListener('click', closeFind);
    p.querySelector('#mwFindInput').addEventListener('input', (e) => runFind(e.target.value));
    p.querySelector('#mwFindInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') closeFind(); });
    p.querySelector('#mwFindPrev').addEventListener('click', () => stepFind(-1));
    p.querySelector('#mwFindNext').addEventListener('click', () => stepFind(1));
    // Jump to latest + show/hide it based on scroll position
    p.querySelector('#mwJump').addEventListener('click', () => { const el = document.getElementById('mwMsgs'); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });
    p.querySelector('#mwMsgs').addEventListener('scroll', () => { updateJumpBtn(); const el = document.getElementById('mwMsgs'); if (el && el.scrollTop < 80) loadOlder(); });
    p.querySelector('#mwSearch').addEventListener('input', e => renderPicker(e.target.value));
    p.querySelector('#mwPickGo').addEventListener('click', pickerConfirm);
    const inp = p.querySelector('#mwInput');
    inp.addEventListener('keydown', e => {
      const box = document.getElementById('mwMentions');
      if (box.classList.contains('open')) {
        const rows = [...box.querySelectorAll('.mw-mrow')]; let ai = rows.findIndex(r => r.classList.contains('active'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; rows[ai < 0 ? 0 : ai]?.classList.remove('active'); ai = e.key === 'ArrowDown' ? (ai + 1) % rows.length : (ai - 1 + rows.length) % rows.length; rows[ai].classList.add('active'); return; }
        if (e.key === 'Enter') { e.preventDefault(); const r = rows[ai < 0 ? 0 : ai]; if (r) insertMention(r.dataset.mid, r.dataset.name); return; }
        if (e.key === 'Escape') { box.classList.remove('open'); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inp.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 110) + 'px'; updateMentionBox(); sendTyping(); saveDraft(); });
    inp.addEventListener('click', updateMentionBox);
    // close on outside click
    document.addEventListener('click', (e) => {
      if (!panelOpen) return; if (lightboxOpen()) return;
      // Clicks inside our floating overlays (emoji/edit menu, confirm dialog) are NOT "outside".
      // They live in document.body, so .closest() (not panel.contains) is the reliable check —
      // and it resolves even after the popup element has just been detached from the DOM.
      if (e.target.closest('#mwPop, .mw-confirm, .mw-fwdpick')) return;
      // The trigger buttons open/replace the popup themselves — don't treat their click as "outside".
      if (e.target.closest('.mw-react-btn, .mw-menu-btn, .mw-conv-menu')) return;
      const lb = document.getElementById('mwLb'); if (lb && lb.contains(e.target)) return;
      if (document.getElementById('mwPop')) closePopups();   // a click elsewhere dismisses the menu/palette
      const pn = document.getElementById('msgWidgetPanel'); const bt = document.getElementById('msgWidgetBtn');
      if (pn && !pn.contains(e.target) && bt && !bt.contains(e.target)) closePanel();
    });
  }

  function togglePanel() { panelOpen ? closePanel() : openPanel(); }
  function openPanel() { panelOpen = true; ensureNotifyPermission(); document.getElementById('msgWidgetPanel').classList.add('open'); showList(); loadConversations(); }
  let _refreshT = null;
  function refreshSoon() { clearTimeout(_refreshT); _refreshT = setTimeout(loadConversations, 700); }
  function closePanel() { panelOpen = false; const p = document.getElementById('msgWidgetPanel'); if (p) p.classList.remove('open'); document.getElementById('mwPick')?.classList.remove('open'); }
  function showList() { curConv = null; if (typingCh) { try { ensureSupa()?.removeChannel(typingCh); } catch (_) {} typingCh = null; } document.getElementById('mwThread').classList.remove('open'); document.getElementById('mwList').style.display = ''; document.getElementById('mwListHead').style.display = 'flex'; document.getElementById('mwListSearch').style.display = ''; }
  function showThread() { document.getElementById('mwList').style.display = 'none'; document.getElementById('mwListHead').style.display = 'none'; document.getElementById('mwListSearch').style.display = 'none'; document.getElementById('mwThread').classList.add('open'); }

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
  // Highlight the query inside an (escaped) string.
  function hlMatch(text, q) {
    const h = esc(text || '');
    if (!q) return h;
    try { return h.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark class="mw-mk">$1</mark>'); } catch (_) { return h; }
  }
  function threadSkeleton() {
    const widths = [52, 68, 40, 74, 58, 46];
    return '<div class="mw-thskel">' + widths.map((w, i) => `<div class="mw-tsr ${i % 2 ? 'mine' : ''}"><div class="mw-tsb mw-skb" style="width:${w}%"></div></div>`).join('') + '</div>';
  }
  async function runListSearch() {
    const q = listQuery; if (q.length < 2) { searchResults = []; searching = false; renderList(); return; }
    searching = true; renderList();
    try { const j = await chatFetch('?api=search&q=' + encodeURIComponent(q)); if (listQuery === q) searchResults = j.results || []; }
    catch (_) { if (listQuery === q) searchResults = []; }
    finally { if (listQuery === q) { searching = false; renderList(); } }
  }
  function convRow(c) {
    const isG = c.type === 'group';
    const prev = c.last_message ? ((isG && c.last_message.sender_name ? c.last_message.sender_name + ': ' : '') + c.last_message.body) : 'No messages yet';
    const other = !isG ? (c.members || []).find(m => !me || m.id !== me.user_id) : null;
    const online = other && onlineIds.has(other.id);
    const draft = c.id !== curConv ? loadDraft(c.id) : '';
    const prevHtml = draft ? `<span class="mw-draft">Draft:</span> ${esc(draft).slice(0, 60)}` : esc(prev).slice(0, 70);
    return `<div class="mw-conv${c.unread ? ' unread' : ''}" data-c="${c.id}"><div class="mw-av${isG ? ' grp' : ''}">${isG ? '#' : esc(initials(c.title))}${online ? '<span class="mw-online-dot"></span>' : ''}</div>
      <div class="mw-cm"><div class="mw-cn">${c.pinned ? PIN_MINI_SVG : ''}${esc(c.title)}</div><div class="mw-cp">${prevHtml}</div></div>
      <div class="mw-cr"><button class="mw-conv-menu" data-menu="${c.id}" title="More">⋯</button><span class="mw-ct">${fmtTime(c.last_message_at)}</span>${c.muted ? '<svg class="mw-cn-mute" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : ''}${c.unread ? `<span class="mw-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div></div>`;
  }
  function renderList() {
    const el = document.getElementById('mwList'); if (!el) return;
    if (!convs.length) { el.innerHTML = '<div class="mw-empty">No conversations yet.<br>Tap “✉ New” to start one.</div>'; return; }
    if (!listQuery) {
      el.innerHTML = convs.map(convRow).join('');
      el.querySelectorAll('[data-c]').forEach(r => r.addEventListener('click', () => openConv(Number(r.dataset.c))));
      wireConvMenus(el);
      return;
    }
    // Search mode: chats matching by name, then messages matching by content.
    const chatHits = convs.filter(c => String(c.title || '').toLowerCase().includes(listQuery) || (c.members || []).some(m => String(m.name || '').toLowerCase().includes(listQuery)));
    let html = '';
    if (chatHits.length) html += `<div class="mw-seclabel">Chats</div>` + chatHits.map(convRow).join('');
    if (searching) {
      html += `<div class="mw-seclabel">Messages</div>` + Array.from({ length: 4 }).map(() => `
        <div class="mw-conv mw-skel"><div class="mw-av mw-skb"></div>
          <div class="mw-cm"><div class="mw-skb mw-skl" style="width:45%"></div><div class="mw-skb mw-skl" style="width:80%"></div></div></div>`).join('');
    } else if (searchResults.length) {
      html += `<div class="mw-seclabel">Messages</div>` + searchResults.map(r => `
        <div class="mw-conv mw-msghit" data-c="${r.conversation_id}" data-mid="${r.message_id}">
          <div class="mw-av${''}">${esc(initials(r.conversation_title))}</div>
          <div class="mw-cm"><div class="mw-cn">${esc(r.conversation_title)}</div><div class="mw-cp">${(r.mine ? 'You: ' : (esc(r.sender_name) + ': '))}${hlMatch(r.snippet, listQuery)}</div></div>
          <div class="mw-cr"><span class="mw-ct">${fmtTime(r.created_at)}</span></div></div>`).join('');
    }
    if (!html) html = `<div class="mw-empty">No matches for “${esc(listQuery)}”.</div>`;
    el.innerHTML = html;
    el.querySelectorAll('.mw-msghit').forEach(r => r.addEventListener('click', () => openConv(Number(r.dataset.c), Number(r.dataset.mid))));
    el.querySelectorAll('.mw-conv:not(.mw-msghit)').forEach(r => r.addEventListener('click', () => openConv(Number(r.dataset.c))));
    wireConvMenus(el);
  }
  function wireConvMenus(el) {
    el.querySelectorAll('.mw-conv-menu').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const cid = Number(b.dataset.menu); const c = convs.find(x => x.id === cid); if (!c) return;
      showPop(`<button class="mw-mi" data-act="unread">Mark as unread</button>`, b, 'menu', (ev) => {
        const bb = ev.target.closest('.mw-mi'); if (!bb) return; closePopups();
        if (bb.dataset.act === 'unread') markUnread(cid);
      });
    }));
  }
  async function markUnread(cid) {
    const c = convs.find(x => x.id === cid); if (!c) return;
    if (!c.unread) c.unread = 1; renderList(); updateBadge();
    try { await chatFetch('?api=mark-unread', { method: 'POST', body: JSON.stringify({ conversation_id: cid }) }); toast('Marked unread'); }
    catch (_) {}
  }

  // ── Draft autosave (per conversation, localStorage) ──────────────────────
  function draftKey(cid) { return 'chatdraft:' + ((me && me.user_id) || '') + ':' + cid; }
  function saveDraft() {
    if (editingId || !curConv) return;   // don't capture edit-in-progress text as a draft
    const v = document.getElementById('mwInput').value;
    try { if (v.trim()) localStorage.setItem(draftKey(curConv), v); else localStorage.removeItem(draftKey(curConv)); } catch (_) {}
    renderList();   // refresh the list's "Draft:" hint
  }
  function loadDraft(cid) { try { return localStorage.getItem(draftKey(cid)) || ''; } catch (_) { return ''; } }
  function clearDraft(cid) { try { localStorage.removeItem(draftKey(cid)); } catch (_) {} }
  async function openConv(id, jumpMid) {
    curConv = id; const conv = convs.find(c => c.id === id);
    jumpToMid = jumpMid || null;
    resetAtts(); cancelEdit(); cancelReply(); closePopups(); closeFind();
    selectMode = false; selectedIds = new Set(); updateSelectBar();
    subscribeTyping(id); hideTyping();
    showThread();
    document.getElementById('mwThreadTitle').textContent = conv ? conv.title : 'Conversation';
    updatePinBtn(); updateMuteBtn(); cancelVoice(); renderThreadPresence();
    // Restore any unsent draft for this conversation.
    const inp0 = document.getElementById('mwInput'); inp0.value = loadDraft(id); inp0.style.height = 'auto'; inp0.style.height = inp0.value ? Math.min(inp0.scrollHeight, 110) + 'px' : 'auto';
    const mEl = document.getElementById('mwMsgs'); mEl.innerHTML = threadSkeleton();
    try {
      const j = await chatFetch('?api=messages&conversation_id=' + id);
      readCutoff = j.read_cutoff || null; curHasMore = !!j.has_more;
      curPinned = j.pinned_message || null; renderPinBar();
      renderMsgs(j.messages || []);
      if (conv) { conv.unread = 0; renderList(); updateBadge(); }
      if (jumpToMid) {
        // A searched message may be older than the first page — page back until we find it.
        let tries = 0;
        while (!document.querySelector(`#mwMsgs .mw-row[data-mid="${jumpToMid}"]`) && curHasMore && tries < 8) { await loadOlder(true); tries++; }
        const t = document.querySelector(`#mwMsgs .mw-row[data-mid="${jumpToMid}"]`);
        if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('mw-flash'); setTimeout(() => t.classList.remove('mw-flash'), 1400); }
        jumpToMid = null;
      }
    } catch (e) { mEl.innerHTML = `<div class="mw-empty">${esc(e.message)}</div>`; }
    setTimeout(() => { document.getElementById('mwInput').focus(); updateJumpBtn(); }, 40);
  }
  // Load an older page and prepend it, keeping the current message under the viewport
  // (so scroll-up loading doesn't jump). `silent` skips nothing special — just returns.
  async function loadOlder() {
    if (loadingOlder || !curHasMore || !curConv || !curMsgs.length) return;
    loadingOlder = true;
    const el = document.getElementById('mwMsgs'); const prevH = el.scrollHeight, prevTop = el.scrollTop;
    try {
      const before = curMsgs[0].created_at;
      const j = await chatFetch('?api=messages&conversation_id=' + curConv + '&before=' + encodeURIComponent(before));
      const older = j.messages || []; curHasMore = !!j.has_more;
      if (older.length) {
        curMsgs = older.concat(curMsgs);
        renderMsgs(curMsgs, true);
        const el2 = document.getElementById('mwMsgs'); el2.scrollTop = prevTop + (el2.scrollHeight - prevH);
      }
    } catch (_) {}
    loadingOlder = false;
  }
  // ── Pinned message bar ───────────────────────────────────────────────────
  function renderPinBar() {
    const bar = document.getElementById('mwPinBar'); if (!bar) return;
    if (!curPinned) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
    bar.classList.add('show');
    bar.innerHTML = `<span class="mw-pinbar-ico">${PIN_SVG}</span><div class="mw-pinbar-tx"><span class="mw-pinbar-name">${esc(curPinned.sender_name || '')}</span><span class="mw-pinbar-snip">${esc(curPinned.snippet || '')}</span></div><button class="mw-pinbar-x" title="Unpin">✕</button>`;
    bar.querySelector('.mw-pinbar-x').addEventListener('click', (e) => { e.stopPropagation(); pinMessage(curPinned.id); });
    bar.addEventListener('click', () => { const t = document.querySelector(`#mwMsgs .mw-row[data-mid="${curPinned.id}"]`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('mw-flash'); setTimeout(() => t.classList.remove('mw-flash'), 1200); } }, { once: true });
  }
  async function pinMessage(mid) {
    const unpin = curPinned && curPinned.id === mid;
    if (unpin) curPinned = null;
    else { const m = curMsgs.find(x => x.id === mid); curPinned = { id: mid, sender_name: m ? (m.mine ? (me && me.name) || 'You' : m.sender_name) : '', snippet: (m && m.body ? m.body : (m && m.has_attachments ? 'Attachment' : '')).slice(0, 140) }; }
    renderPinBar();
    try { await chatFetch('?api=pin-message', { method: 'POST', body: JSON.stringify({ conversation_id: curConv, message_id: unpin ? null : mid }) }); toast(unpin ? 'Unpinned' : 'Pinned'); }
    catch (_) { toast('Could not update'); }
  }
  // ── In-thread find ───────────────────────────────────────────────────────
  function toggleFind() { const bar = document.getElementById('mwFindBar'); if (bar.classList.contains('open')) closeFind(); else { bar.classList.add('open'); const i = document.getElementById('mwFindInput'); i.value = ''; setTimeout(() => i.focus(), 30); } }
  function closeFind() { const bar = document.getElementById('mwFindBar'); if (bar) bar.classList.remove('open'); findMatches = []; findIdx = -1; document.querySelectorAll('#mwMsgs .mw-hit').forEach(n => n.classList.remove('mw-hit', 'mw-hit-cur')); const n = document.getElementById('mwFindN'); if (n) n.textContent = ''; }
  function runFind(q) {
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#mwMsgs .mw-hit').forEach(n => n.classList.remove('mw-hit', 'mw-hit-cur'));
    findMatches = []; findIdx = -1;
    const n = document.getElementById('mwFindN');
    if (!q) { if (n) n.textContent = ''; return; }
    for (const m of curMsgs) { if (!m.deleted && m.id && (m.body || '').toLowerCase().includes(q)) findMatches.push(m.id); }
    findMatches.forEach(id => { const r = document.querySelector(`#mwMsgs .mw-row[data-mid="${id}"]`); if (r) r.classList.add('mw-hit'); });
    if (findMatches.length) { findIdx = findMatches.length - 1; focusFind(); } else if (n) n.textContent = '0';
  }
  function focusFind() {
    document.querySelectorAll('#mwMsgs .mw-hit-cur').forEach(n => n.classList.remove('mw-hit-cur'));
    const id = findMatches[findIdx]; const r = id && document.querySelector(`#mwMsgs .mw-row[data-mid="${id}"]`);
    if (r) { r.classList.add('mw-hit-cur'); r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    const n = document.getElementById('mwFindN'); if (n) n.textContent = `${findIdx + 1}/${findMatches.length}`;
  }
  function stepFind(dir) { if (!findMatches.length) return; findIdx = (findIdx + dir + findMatches.length) % findMatches.length; focusFind(); }
  // ── Jump-to-latest ───────────────────────────────────────────────────────
  function updateJumpBtn() { const el = document.getElementById('mwMsgs'), b = document.getElementById('mwJump'); if (!el || !b) return; const far = el.scrollHeight - el.scrollTop - el.clientHeight > 240; b.classList.toggle('show', far); }
  // ── Typing indicator (ephemeral realtime broadcast per conversation) ──────
  function subscribeTyping(id) {
    const s = ensureSupa(); if (!s) return;
    if (typingCh) { try { s.removeChannel(typingCh); } catch (_) {} typingCh = null; }
    typingCh = s.channel('typing:' + id, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 't' }, (p) => { if (panelOpen && curConv === id) showTyping(p.payload?.name || 'Someone'); })
      .subscribe();
  }
  function sendTyping() {
    if (!typingCh) return; const now = Date.now();
    if (now - lastTypingSent < 2000) return;   // throttle
    lastTypingSent = now;
    try { typingCh.send({ type: 'broadcast', event: 't', payload: { name: (me && me.name) || 'Someone' } }); } catch (_) {}
  }
  function showTyping(name) {
    const el = document.getElementById('mwTyping'); if (!el) return;
    el.textContent = name + ' is typing…'; el.classList.add('show');
    clearTimeout(typingHideT); typingHideT = setTimeout(hideTyping, 3500);
  }
  function hideTyping() { const el = document.getElementById('mwTyping'); if (el) { el.classList.remove('show'); el.textContent = ''; } clearTimeout(typingHideT); }
  function fmtBytes(n) {
    n = Number(n) || 0; if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function mediaHtml(atts) {
    if (!atts || !atts.length) return '';
    const items = atts.map(a => {
      const src = a.url || a._localUrl || '';
      if (!src) return '';
      const nm = esc(a.name || (a.kind === 'video' ? 'video' : 'image'));
      if (a.kind === 'video') { const ar = (a.width && a.height) ? `aspect-ratio:${a.width}/${a.height};` : ''; return `<div class="mw-mtile mw-loading" style="${ar}" data-full="${esc(src)}" data-kind="video" data-name="${nm}"><video class="mw-mvid" src="${esc(src)}#t=0.1" preload="metadata" muted playsinline></video><div class="mw-play">▶</div></div>`; }
      if (a.kind === 'audio' || (a.mime || '').startsWith('audio/')) return `<audio class="mw-aud" controls preload="metadata" data-aud="${esc(src)}" data-aud-type="${esc(a.mime || 'audio/wav')}"></audio>`;
      if (a.kind === 'file') { const sz = fmtBytes(a.size); return `<div class="mw-file" data-full="${esc(src)}" data-kind="file" data-name="${nm}" data-mime="${esc(a.mime || '')}"><span class="mw-fico">${FILE_SVG}</span><span class="mw-fmeta"><span class="mw-fname">${nm}</span>${sz ? `<span class="mw-fsz">${sz}</span>` : ''}</span></div>`; }
      return `<img class="mw-mimg mw-loading" style="${(a.width && a.height) ? `aspect-ratio:${a.width}/${a.height};` : ''}" src="${esc(src)}" loading="lazy" data-full="${esc(src)}" data-kind="image" data-name="${nm}" alt="${nm}">`;
    }).join('');
    return `<div class="mw-media">${items}</div>`;
  }
  // Drop the skeleton once each image/video has actually loaded (so media fades in
  // instead of popping from nothing).
  function wireMediaSkeletons(el) {
    if (!el) return;
    el.querySelectorAll('img.mw-mimg.mw-loading').forEach((img) => {
      if (img.complete && img.naturalWidth) { img.classList.remove('mw-loading'); return; }
      img.addEventListener('load', () => img.classList.remove('mw-loading'), { once: true });
      img.addEventListener('error', () => img.classList.remove('mw-loading'), { once: true });
    });
    el.querySelectorAll('.mw-mtile.mw-loading').forEach((tile) => {
      const v = tile.querySelector('video'); if (!v) { tile.classList.remove('mw-loading'); return; }
      // Nudge a seek to ~0.1s so the browser paints the first frame as the poster thumbnail
      // (some browsers show a blank frame with only metadata loaded).
      const seekFirstFrame = () => { try { if (v.currentTime < 0.05) v.currentTime = 0.1; } catch (_) {} };
      if (v.readyState >= 1) seekFirstFrame(); else v.addEventListener('loadedmetadata', seekFirstFrame, { once: true });
      if (v.readyState >= 2) { tile.classList.remove('mw-loading'); return; }
      v.addEventListener('loadeddata', () => tile.classList.remove('mw-loading'), { once: true });
      v.addEventListener('error', () => tile.classList.remove('mw-loading'), { once: true });
    });
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
  let _lbBlobUrl = null;
  function revokeLbBlob() { if (_lbBlobUrl) { try { URL.revokeObjectURL(_lbBlobUrl); } catch (_) {} _lbBlobUrl = null; } }
  function closeLightbox() { const lb = document.getElementById('mwLb'); if (lb) { lb.classList.remove('open'); const s = lb.querySelector('.mw-lb-stage'); s.classList.remove('zoomed'); s.innerHTML = ''; } revokeLbBlob(); }
  // Render a PDF inline: Dropbox temp links come back with Content-Disposition: attachment,
  // so an <iframe src=link> just downloads. Fetch the bytes and hand the iframe a blob URL,
  // which the browser's built-in PDF viewer always renders (with page navigation).
  function renderPdf(stage, url, name) {
    stage.innerHTML = `<div class="mw-lb-file"><div class="mw-lb-spin"></div><div class="mw-lb-fhint">Loading “${esc(name || 'document')}”…</div></div>`;
    revokeLbBlob();
    fetch(url).then((r) => r.blob()).then((b) => {
      const blob = b.type === 'application/pdf' ? b : new Blob([b], { type: 'application/pdf' });
      _lbBlobUrl = URL.createObjectURL(blob);
      if (lightboxOpen()) stage.innerHTML = `<iframe class="mw-lb-frame" src="${_lbBlobUrl}" title="${esc(name || 'Document')}"></iframe>`;
    }).catch(() => {
      stage.innerHTML = `<div class="mw-lb-file"><div class="mw-lb-fico">${FILE_SVG}</div><div class="mw-lb-fname">${esc(name || 'File')}</div><div class="mw-lb-fhint">Couldn’t preview — open or download instead.</div><a class="mw-lb-btn" href="${esc(url)}" target="_blank" rel="noopener">Open in new tab</a></div>`;
    });
  }
  function lightboxOpen() { const lb = document.getElementById('mwLb'); return !!(lb && lb.classList.contains('open')); }
  function openLightbox(url, kind, name, mime) {
    let lb = document.getElementById('mwLb');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'mwLb'; lb.className = 'mw-lb';
      lb.innerHTML = `<div class="mw-lb-bar"><button class="mw-lb-btn" id="mwLbDl">⬇ Download</button><button class="mw-lb-btn" id="mwLbX">✕ Close</button></div><div class="mw-lb-stage"></div>`;
      document.body.appendChild(lb);
      const stage = lb.querySelector('.mw-lb-stage');
      // Click empty stage → close; click the image → toggle zoom (fit ↔ actual size, pan by scroll).
      stage.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') { stage.classList.toggle('zoomed'); stage.scrollTop = 0; stage.scrollLeft = 0; }
        else if (e.target === stage) closeLightbox();
      });
      lb.querySelector('#mwLbX').addEventListener('click', closeLightbox);
    }
    const stage = lb.querySelector('.mw-lb-stage');
    stage.classList.remove('zoomed');
    if (kind === 'video') {
      stage.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline></video>`;
    } else if (kind === 'file') {
      const isPdf = /pdf/i.test(mime || '') || /\.pdf$/i.test(name || '');
      // PDFs render inline via a blob URL (see renderPdf). Types the browser can't render
      // fall back to a card with Open / Download.
      if (isPdf) { renderPdf(stage, url, name); }
      else stage.innerHTML = `<div class="mw-lb-file"><div class="mw-lb-fico">${FILE_SVG}</div><div class="mw-lb-fname">${esc(name || 'File')}</div><div class="mw-lb-fhint">This file type can’t be previewed here.</div><a class="mw-lb-btn" href="${esc(url)}" target="_blank" rel="noopener">Open in new tab</a></div>`;
    } else {
      stage.innerHTML = `<img src="${esc(url)}" alt="${esc(name || '')}">`;
    }
    lb.querySelector('#mwLbDl').onclick = () => downloadMedia(url, name);
    lb.classList.add('open');
  }
  // Turn URLs in an (already-escaped) string into clickable links (open in new tab).
  function linkify(h) {
    return h.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (m) => {
      const tail = (m.match(/[.,!?;:)]+$/) || [''])[0];      // don't swallow trailing punctuation
      const u = tail ? m.slice(0, -tail.length) : m;
      const href = u.startsWith('http') ? u : 'https://' + u;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="mw-link">${u}</a>${tail}`;
    });
  }
  // Highlight @mentions of known conversation members + linkify URLs inside a body.
  function renderBody(text) {
    let h = esc(text);
    const conv = convs.find(c => c.id === curConv);
    const names = [...(conv && conv.members || []).map(mm => mm.name), me && me.name].filter(Boolean);
    names.sort((a, b) => b.length - a.length);   // longest first so "Ann Marie" beats "Ann"
    for (const nm of names) { const e = esc(nm); h = h.split('@' + e).join(`<span class="mw-mention">@${e}</span>`); }
    h = h.replace(/@(everyone|all)\b/gi, (m) => `<span class="mw-mention">${m}</span>`);
    return linkify(h);
  }
  // ── Link previews (unfurl) ──────────────────────────────────────────────
  function firstUrl(text) {
    const m = /(https?:\/\/[^\s<]+)/i.exec(text || ''); if (!m) return null;
    return m[1].replace(/[.,!?;:)\]]+$/, '');
  }
  function lpHtml(url) {
    const c = unfurlCache.get(url);
    if (c && c.status === 'done' && c.data && c.data.ok) return unfurlCard(url, c.data);
    if (c && c.status === 'fail') return '';
    return `<div class="mw-lp-ph" data-lpurl="${esc(url)}"></div>`;   // filled async by hydrateLinkPreviews
  }
  function unfurlCard(url, d) {
    const href = esc(d.url || url);
    const img = d.image ? `<img class="mw-lp-img" src="${esc(d.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    const site = d.site ? `<div class="mw-lp-site">${esc(d.site)}</div>` : '';
    const title = `<div class="mw-lp-title">${esc(d.title || d.url || url)}</div>`;
    const desc = d.description ? `<div class="mw-lp-desc">${esc(d.description)}</div>` : '';
    return `<a class="mw-lp" href="${href}" target="_blank" rel="noopener noreferrer">${img}<div class="mw-lp-tx">${site}${title}${desc}</div></a>`;
  }
  async function hydrateAudio(el) {
    if (!el) return;
    for (const a of [...el.querySelectorAll('audio[data-aud]')]) {
      const url = a.getAttribute('data-aud'); const type = a.getAttribute('data-aud-type') || 'audio/wav'; a.removeAttribute('data-aud');
      const cached = audioBlobCache.get(url);
      if (cached) { a.src = cached; continue; }
      try {
        const r = await fetch(url); const b = await r.blob();
        const blob = /^(audio|video)\//.test(b.type) ? b : new Blob([b], { type });
        const u = URL.createObjectURL(blob); audioBlobCache.set(url, u); a.src = u;
      } catch (_) { a.src = url; }   // fall back to the direct link
    }
  }
  async function hydrateLinkPreviews(el) {
    if (!el) return;
    const phs = [...el.querySelectorAll('.mw-lp-ph[data-lpurl]')];
    const urls = [...new Set(phs.map(p => p.dataset.lpurl))];
    for (const url of urls) {
      let c = unfurlCache.get(url);
      if (!c) {
        c = { status: 'loading' }; unfurlCache.set(url, c);
        try {
          const tok = await getToken();
          const r = await fetch(UNFURL_BASE + '?url=' + encodeURIComponent(url), { headers: { Authorization: 'Bearer ' + tok } });
          const j = await r.json().catch(() => ({}));
          c.data = j; c.status = (j && j.ok) ? 'done' : 'fail';
        } catch (_) { c.status = 'fail'; }
      }
      if (c.status === 'loading') continue;   // another render will pick it up
      // Fill (or drop) every placeholder currently showing this URL.
      el.querySelectorAll(`.mw-lp-ph[data-lpurl="${(window.CSS && CSS.escape) ? CSS.escape(url) : url}"]`).forEach(ph => {
        if (c.status === 'done') ph.outerHTML = unfurlCard(url, c.data); else ph.remove();
      });
    }
  }
  function reactionChips(m) {
    if (!m.reactions || !m.reactions.length) return '';
    return `<div class="mw-rx">${m.reactions.map(r => `<button class="mw-rchip${r.mine ? ' mine' : ''}" data-emoji="${esc(r.emoji)}">${esc(r.emoji)} ${r.count}</button>`).join('')}</div>`;
  }
  function bubble(m, isG) {
    const idAttr = m.id ? ` data-mid="${m.id}"` : '';
    const selCls = (selectMode ? ' selecting' : '') + (m.id && selectedIds.has(m.id) ? ' selected' : '');
    const chk = (selectMode && m.id) ? '<span class="mw-check"></span>' : '';
    // Deleted → a compact, muted system line (not selectable, no checkbox).
    if (m.deleted) {
      return `<div class="mw-row${m.mine ? ' mine' : ''} deleted"${m._tmpId ? ` id="${m._tmpId}"` : ''}${idAttr}><span class="mw-deleted">${SLASH_SVG}This message was deleted</span></div>`;
    }
    const snd = (!m.mine && isG) ? `<div class="mw-snd">${esc(m.sender_name || nameById[m.sender_id] || '')}</div>` : '';
    const fwd = m.forwarded ? '<div class="mw-fwd">↪ Forwarded</div>' : '';
    const rq = m.reply ? `<div class="mw-quote" data-jump="${m.reply.id}"><span class="mw-quote-n">${esc(m.reply.sender_name || '')}</span><span class="mw-quote-t">${m.reply.deleted ? 'message deleted' : esc(m.reply.snippet || '')}</span></div>` : '';
    const lpUrl = (!m.deleted && m.body) ? firstUrl(m.body) : null;
    const bubInner = fwd + rq + (m.body ? renderBody(m.body) + (m.edited ? '<span class="mw-edited">edited</span>' : '') : '') + (lpUrl ? lpHtml(lpUrl) : '');
    const txt = bubInner ? `<div class="mw-bub">${bubInner}</div>` : '';
    const inner = mediaHtml(m.attachments) + txt;
    const smileSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
    const tools = (!m.id || selectMode) ? '' : `<button class="mw-react-btn" title="React" aria-label="React">${smileSvg}</button><button class="mw-menu-btn" title="More">⋯</button>`;
    return `<div class="mw-row${m.mine ? ' mine' : ''}${selCls}"${m._tmpId ? ` id="${m._tmpId}"` : ''}${idAttr}>${chk}${snd}${inner}${reactionChips(m)}<div class="mw-foot">${tools}<span class="mw-bt">${fmtStamp(m.created_at)}</span>${statusHtml(m)}</div></div>`;
  }
  function renderMsgs(msgs, preserveScroll) {
    curMsgs = msgs;
    const conv = convs.find(c => c.id === curConv); const isG = conv && conv.type === 'group';
    const el = document.getElementById('mwMsgs');
    const prevTop = el.scrollTop, atBottom = el.scrollHeight - prevTop - el.clientHeight < 40;
    // Unread divider: before the first message newer than my read cutoff that isn't mine.
    const cut = readCutoff ? new Date(readCutoff).getTime() : 0;
    let dividerBefore = null;
    if (cut) { const first = msgs.find(m => !m.mine && m.id && new Date(m.created_at).getTime() > cut); if (first) dividerBefore = first.id; }
    el.innerHTML = msgs.length
      ? msgs.map(m => (m.id === dividerBefore ? '<div class="mw-newdiv"><span>New messages</span></div>' : '') + bubble(m, isG)).join('')
      : '<div class="mw-empty">No messages yet — say hi 👋</div>';
    wireMediaSkeletons(el); hydrateLinkPreviews(el); hydrateAudio(el);
    if (preserveScroll && !atBottom) el.scrollTop = prevTop;
    else if (dividerBefore) { const d = el.querySelector('.mw-newdiv'); if (d) d.scrollIntoView({ block: 'center' }); else el.scrollTop = el.scrollHeight; }
    else el.scrollTop = el.scrollHeight;
    updateJumpBtn();
  }
  function appendMsg(m) {
    const conv = convs.find(c => c.id === curConv); const isG = conv && conv.type === 'group';
    const el = document.getElementById('mwMsgs'); const e = el.querySelector('.mw-empty'); if (e) el.innerHTML = '';
    curMsgs.push(m);
    el.insertAdjacentHTML('beforeend', bubble(m, isG)); wireMediaSkeletons(el); hydrateLinkPreviews(el); hydrateAudio(el); el.scrollTop = el.scrollHeight;
  }

  // ── Reactions, edit, delete ──────────────────────────────────────────────
  function closePopups() { const p = document.getElementById('mwPop'); if (p) p.remove(); }
  function showPop(html, anchor, cls, onclick) {
    closePopups();
    const p = document.createElement('div'); p.id = 'mwPop'; p.className = 'mw-pop' + (cls ? ' ' + cls : ''); p.innerHTML = html;
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = r.left, top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
    p.style.left = Math.max(8, left) + 'px'; p.style.top = Math.max(8, top) + 'px';
    p.addEventListener('click', onclick);
  }
  // Full emoji picker — categorised grid, opened by the "+" in the quick-react palette.
  function openEmojiPicker(anchor, onPick) {
    const html = '<div class="mw-emoji-pick">' + EMOJI_CATS.map(cat =>
      `<div class="mw-emoji-cat">${esc(cat.name)}</div><div class="mw-emoji-grid">${cat.emojis.map(em => `<button class="mw-emoji" data-emoji="${em}">${em}</button>`).join('')}</div>`
    ).join('') + '</div>';
    showPop(html, anchor, 'emoji', (ev) => { const b = ev.target.closest('.mw-emoji'); if (!b) return; closePopups(); onPick(b.dataset.emoji); });
  }
  // Group read receipts — "Read by" list for one of my own messages.
  async function showReadBy(mid) {
    const anchor = document.querySelector(`.mw-row[data-mid="${mid}"] .mw-menu-btn`) || document.getElementById('mwThread');
    showPop('<div class="mw-readby"><div class="mw-readby-loading">Loading…</div></div>', anchor, 'readby', () => {});
    try {
      const j = await chatFetch('?api=read-by', { method: 'POST', body: JSON.stringify({ conversation_id: curConv, message_id: mid }) });
      const people = j.people || [];
      const read = people.filter(p => p.read), unread = people.filter(p => !p.read);
      const row = (p) => `<div class="mw-rb-row"><span class="mw-rb-name">${esc(p.name)}</span>${p.read ? `<span class="mw-rb-when">${fmtTime(p.read_at)}</span>` : `<span class="mw-rb-when dim">${p.delivered ? 'Delivered' : 'Sent'}</span>`}</div>`;
      const body = !people.length ? '<div class="mw-readby-loading">No other members.</div>'
        : `<div class="mw-rb-head">Read by ${read.length}/${people.length}</div>`
          + (read.length ? read.map(row).join('') : '')
          + (unread.length ? `<div class="mw-rb-sub">Not yet read</div>` + unread.map(row).join('') : '');
      const pop = document.getElementById('mwPop'); if (pop) pop.querySelector('.mw-readby').innerHTML = body;
    } catch (_) { const pop = document.getElementById('mwPop'); if (pop) pop.querySelector('.mw-readby').innerHTML = '<div class="mw-readby-loading">Could not load.</div>'; }
  }
  // ── Desktop notifications ─────────────────────────────────────────────────
  // Complements the phone push: when the dashboard is open in a tab that isn't
  // focused, pop a native desktop notification for an incoming message.
  function ensureNotifyPermission() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (_) {}
  }
  function desktopNotify(m) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible' && document.hasFocus()) return;   // they can already see it
      const conv = convs.find(c => c.id === m.conversation_id);
      if (conv && conv.muted) return;
      const who = nameById[m.sender_id] || m.sender_name || 'New message';
      const title = conv ? (conv.type === 'group' ? conv.title : who) : who;
      let body = (m.body || '').trim();
      if (!body) body = m.has_attachments ? 'Sent an attachment' : '';
      if (conv && conv.type === 'group' && body) body = who + ': ' + body;
      const n = new Notification(title, { body: body.slice(0, 180), tag: 'chat-' + m.conversation_id, icon: '/icon-192.png', silent: false });
      n.onclick = () => { try { window.focus(); if (!panelOpen) openPanel(); openConv(m.conversation_id); n.close(); } catch (_) {} };
    } catch (_) {}
  }
  async function toggleReaction(mid, emoji) {
    const m = curMsgs.find(x => x.id === mid); if (!m) return;
    m.reactions = m.reactions || [];
    const ex = m.reactions.find(r => r.emoji === emoji);
    if (ex && ex.mine) { ex.count--; ex.mine = false; if (ex.count <= 0) m.reactions = m.reactions.filter(r => r !== ex); }
    else if (ex) { ex.count++; ex.mine = true; }
    else m.reactions.push({ emoji, count: 1, mine: true });
    renderMsgs(curMsgs, true);
    try { await chatFetch('?api=react', { method: 'POST', body: JSON.stringify({ message_id: mid, emoji }) }); }
    catch (e) { refreshThreadSoon(); }
  }
  function updatePinBtn() {
    const btn = document.getElementById('mwPinBtn'); if (!btn) return;
    const conv = convs.find(c => c.id === curConv);
    const on = !!(conv && conv.pinned);
    btn.classList.toggle('on', on);
    btn.title = on ? 'Unpin conversation' : 'Pin conversation';
  }
  async function togglePin() {
    const conv = convs.find(c => c.id === curConv); if (!conv) return;
    const next = !conv.pinned;
    conv.pinned = next; conv.pinned_at = next ? new Date().toISOString() : null;
    updatePinBtn(); sortConvs(); renderList();
    try { await chatFetch('?api=pin', { method: 'POST', body: JSON.stringify({ conversation_id: conv.id, pinned: next }) }); toast(next ? 'Pinned' : 'Unpinned'); }
    catch (_) { conv.pinned = !next; updatePinBtn(); sortConvs(); renderList(); toast('Could not update'); }
  }
  // Keep the local convs array in the same pinned-first, then recent order the server uses,
  // so pin/unpin reorders instantly without a refetch.
  function sortConvs() {
    convs.sort((a, b) => {
      if (a.pinned && b.pinned) return new Date(b.pinned_at || 0) - new Date(a.pinned_at || 0);
      if (a.pinned) return -1; if (b.pinned) return 1;
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
  }
  function updateMuteBtn() {
    const btn = document.getElementById('mwMuteBtn'); if (!btn) return;
    const conv = convs.find(c => c.id === curConv);
    const on = !!(conv && conv.muted);
    btn.classList.toggle('on', on);
    btn.title = on ? 'Unmute notifications' : 'Mute notifications';
  }
  async function toggleMute() {
    const conv = convs.find(c => c.id === curConv); if (!conv) return;
    const next = !conv.muted; conv.muted = next; updateMuteBtn(); renderList();
    try { await chatFetch('?api=mute', { method: 'POST', body: JSON.stringify({ conversation_id: conv.id, muted: next }) }); toast(next ? 'Muted' : 'Unmuted'); }
    catch (_) { conv.muted = !next; updateMuteBtn(); renderList(); toast('Could not update'); }
  }
  let toastT = null;
  function toast(msg) {
    let t = document.getElementById('mwToast');
    if (!t) { t = document.createElement('div'); t.id = 'mwToast'; t.className = 'mw-toast'; (document.getElementById('msgWidgetPanel') || document.body).appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600);
  }
  async function copyMsg(mid) {
    const m = curMsgs.find(x => x.id === mid); if (!m || !m.body) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(m.body);
      else { const ta = document.createElement('textarea'); ta.value = m.body; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      toast('Copied');
    } catch (_) { toast('Could not copy'); }
  }
  function startEdit(mid) {
    const m = curMsgs.find(x => x.id === mid); if (!m || m.deleted) return;
    editingId = mid; mentionPicked.clear();
    const inp = document.getElementById('mwInput'); inp.value = m.body || '';
    document.getElementById('mwEditBar').classList.add('open');
    inp.focus(); inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
  }
  function cancelEdit() {
    editingId = null;
    const bar = document.getElementById('mwEditBar'); if (bar) bar.classList.remove('open');
    const inp = document.getElementById('mwInput'); if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  }
  // ── Reply ────────────────────────────────────────────────────────────────
  function startReply(mid) {
    const m = curMsgs.find(x => x.id === mid); if (!m || m.deleted) return;
    cancelEdit();
    replyTarget = { id: mid, sender_name: m.mine ? 'You' : (m.sender_name || 'Unknown'),
      snippet: (m.body || '').slice(0, 120) || (m.has_attachments ? 'Attachment' : '') };
    const bar = document.getElementById('mwReplyBar');
    bar.querySelector('.mw-rb-name').textContent = replyTarget.sender_name;
    bar.querySelector('.mw-rb-txt').textContent = replyTarget.snippet;
    bar.classList.add('open');
    document.getElementById('mwInput').focus();
  }
  function cancelReply() { replyTarget = null; const bar = document.getElementById('mwReplyBar'); if (bar) bar.classList.remove('open'); }
  // ── Forward + multi-select ───────────────────────────────────────────────
  function enterSelectMode() { selectMode = true; selectedIds = new Set(); renderMsgs(curMsgs, true); updateSelectBar(); }
  function exitSelectMode() { selectMode = false; selectedIds = new Set(); renderMsgs(curMsgs, true); updateSelectBar(); }
  function toggleSelect(mid) {
    // Toggle just this row's state in place — a full re-render on every tap caused
    // a visible flicker/scroll jump while selecting.
    if (selectedIds.has(mid)) selectedIds.delete(mid); else selectedIds.add(mid);
    const row = document.querySelector(`#mwMsgs .mw-row[data-mid="${mid}"]`);
    if (row) row.classList.toggle('selected', selectedIds.has(mid));
    updateSelectBar();
  }
  function updateSelectBar() {
    const bar = document.getElementById('mwSelBar'); if (!bar) return;
    bar.classList.toggle('open', selectMode);
    bar.querySelector('.mw-sel-count').textContent = selectedIds.size + ' selected';
    bar.querySelector('.mw-sel-fwd').disabled = selectedIds.size === 0;
  }
  // Conversation picker overlay → forward `ids` into the chosen conversation.
  function openForwardPicker(ids) {
    closePopups();
    const list = convs.filter(c => c.id).map(c => `<div class="mw-fwd-row" data-c="${c.id}"><div class="mw-av${c.type === 'group' ? ' grp' : ''}">${c.type === 'group' ? '#' : esc(initials(c.title))}</div><div class="mw-cn">${esc(c.title)}</div></div>`).join('') || '<div class="mw-empty">No conversations.</div>';
    const ov = document.createElement('div'); ov.className = 'mw-fwdpick';
    ov.innerHTML = `<div class="mw-fwdpick-card"><div class="mw-fwdpick-head">Forward to…<button class="mw-fwdpick-x">✕</button></div><div class="mw-fwdpick-list">${list}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.mw-fwdpick-x').addEventListener('click', close);
    ov.querySelectorAll('[data-c]').forEach(r => r.addEventListener('click', async () => {
      const target = Number(r.dataset.c); close();
      try {
        const j = await chatFetch('?api=forward', { method: 'POST', body: JSON.stringify({ conversation_id: target, message_ids: ids }) });
        if (selectMode) exitSelectMode();
        if (target === curConv) openConv(curConv); else { await loadConversations(); }
      } catch (e) { alert('Could not forward: ' + e.message); }
    }));
  }
  // In-app styled confirm (replaces the native confirm() popup). Resolves true/false.
  function confirmModal(message, okLabel) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'mw-confirm';
      ov.innerHTML = `<div class="mw-confirm-card"><div class="mw-confirm-msg">${esc(message)}</div><div class="mw-confirm-row"><button class="mw-confirm-btn cancel">Cancel</button><button class="mw-confirm-btn ok">${esc(okLabel || 'OK')}</button></div></div>`;
      document.body.appendChild(ov);
      const done = (v) => { ov.remove(); resolve(v); };
      ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
      ov.querySelector('.cancel').addEventListener('click', () => done(false));
      ov.querySelector('.ok').addEventListener('click', () => done(true));
    });
  }
  async function doDelete(mid) {
    if (!(await confirmModal('Delete this message for everyone?', 'Delete'))) return;
    try {
      await chatFetch('?api=delete-message', { method: 'POST', body: JSON.stringify({ message_id: mid }) });
      const m = curMsgs.find(x => x.id === mid);
      if (m) { m.deleted = true; m.body = ''; m.attachments = []; m.has_attachments = false; m.reactions = []; }
      renderMsgs(curMsgs, true);
    } catch (e) { alert('Could not delete: ' + e.message); }
  }
  let _rxT = null;
  function refreshThreadSoon() {
    clearTimeout(_rxT);
    _rxT = setTimeout(async () => {
      if (!panelOpen || !curConv) return;
      try { const j = await chatFetch('?api=messages&conversation_id=' + curConv); renderMsgs(j.messages || [], true); } catch (_) {}
    }, 300);
  }

  // ── @mention autocomplete ────────────────────────────────────────────────
  function mentionCandidates() {
    const conv = convs.find(c => c.id === curConv);
    const base = (conv && conv.members || []).filter(mm => !me || mm.id !== me.user_id);
    // In groups offer an "everyone" option that pings all members.
    return (conv && conv.type === 'group') ? [{ id: '__everyone__', name: 'everyone' }, ...base] : base;
  }
  function updateMentionBox() {
    const inp = document.getElementById('mwInput'); const box = document.getElementById('mwMentions');
    const before = inp.value.slice(0, inp.selectionStart);
    const mm = before.match(/(?:^|\s)@([\w'\-]*)$/);
    if (!mm) { box.classList.remove('open'); box.innerHTML = ''; return; }
    const q = mm[1].toLowerCase();
    const cands = mentionCandidates().filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
    if (!cands.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
    box.innerHTML = cands.map((c, i) => `<div class="mw-mrow${i === 0 ? ' active' : ''}" data-mid="${c.id}" data-name="${esc(c.name)}"><span class="mw-av" style="width:24px;height:24px;font-size:0.6rem;">${esc(initials(c.name))}</span>${esc(c.name)}</div>`).join('');
    box.classList.add('open');
  }
  function insertMention(id, name) {
    const inp = document.getElementById('mwInput');
    const caret = inp.selectionStart; const before = inp.value.slice(0, caret); const after = inp.value.slice(caret);
    const rep = before.replace(/(^|\s)@([\w'\-]*)$/, (_m, p) => p + '@' + name + ' ');
    inp.value = rep + after; inp.setSelectionRange(rep.length, rep.length);
    mentionPicked.set(id, name);
    document.getElementById('mwMentions').classList.remove('open');
    inp.focus();
  }
  // ── Attachments: upload straight to Dropbox via a one-time link ──────────
  let pendingAtts = [];   // { id, kind, mime, size, name, path, _localUrl, status:'uploading'|'done' }
  function resetAtts() { pendingAtts.forEach(a => { if (a._localUrl) URL.revokeObjectURL(a._localUrl); }); pendingAtts = []; renderAttStrip(); }
  function renderAttStrip() {
    const el = document.getElementById('mwAttStrip'); if (!el) return;
    el.innerHTML = pendingAtts.map(a => {
      const inner = a.kind === 'video'
        ? `<video src="${esc(a._localUrl || '')}" muted></video><div class="mw-vico">${VIDEO_SVG}</div>`
        : a.kind === 'file'
        ? `<div class="mw-thumb-file"><span class="mw-fico">${FILE_SVG}</span><span class="mw-thumb-fn">${esc(a.name || 'file')}</span></div>`
        : `<img src="${esc(a._localUrl || '')}" alt="">`;
      return `<div class="mw-thumb${a.status === 'uploading' ? ' up' : ''}" data-a="${a.id}">${inner}<button class="mw-rm" data-rm="${a.id}">×</button></div>`;
    }).join('');
    el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.rm; const i = pendingAtts.findIndex(a => a.id === id);
      if (i >= 0) { if (pendingAtts[i]._localUrl) URL.revokeObjectURL(pendingAtts[i]._localUrl); pendingAtts.splice(i, 1); renderAttStrip(); }
    }));
  }
  async function uploadWithRetry(url, tok, file, tries = 3) {
    let lastErr;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: file });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      } catch (err) {
        lastErr = err;
        const transient = (err instanceof TypeError) || /load failed|network|fetch/i.test(err.message || '');
        if (attempt < tries - 1 && transient) { await new Promise((res) => setTimeout(res, 600 * (attempt + 1))); continue; }
        throw lastErr;
      }
    }
    throw lastErr;
  }
  async function handleFiles(files) {
    if (!curConv || !files || !files.length) return;
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      if (file.size > 50 * 1024 * 1024) { alert(file.name + ' is larger than 50 MB.'); continue; }
      const localId = 'att-' + Date.now() + '-' + Math.round(performance.now());
      const rec = { id: localId, kind, mime: file.type, size: file.size, name: file.name, path: null, _localUrl: URL.createObjectURL(file), status: 'uploading' };
      pendingAtts.push(rec); renderAttStrip();
      try {
        // Stream the bytes THROUGH our function to Dropbox (browser→Dropbox direct PUT is
        // blocked by CORS). Query carries the metadata; the body is the raw file.
        const tok = await getToken(); if (!tok) throw new Error('no auth');
        const qs = '?api=attach-upload&conversation_id=' + curConv + '&filename=' + encodeURIComponent(file.name) + '&mime=' + encodeURIComponent(file.type || 'application/octet-stream');
        // First upload after a load can hit a cold edge instance and Safari drops the streamed
        // body ("Load failed"); a File is re-readable, so retry a couple of times before erroring.
        const j = await uploadWithRetry(CHAT_BASE + qs, tok, file);
        rec.path = j.path; rec.status = 'done'; renderAttStrip();
      } catch (e) {
        const i = pendingAtts.indexOf(rec); if (i >= 0) { URL.revokeObjectURL(rec._localUrl); pendingAtts.splice(i, 1); }
        renderAttStrip(); alert('Could not upload ' + file.name + ': ' + e.message);
      }
    }
  }

  // ── Voice notes ──────────────────────────────────────────────────────────
  // Recorded via Web Audio → 16 kHz mono 16-bit WAV. WAV/PCM plays natively in EVERY
  // browser (unlike MediaRecorder's webm/opus which Safari can't decode), and encoding is
  // pure client-side — the server just streams the bytes to Dropbox as with any attachment.
  let _recCtx = null, _recSrc = null, _recProc = null, _recStream = null, _recBuf = [], _recSR = 44100, _recStart = 0, _recTimer = null;
  function fmtRecTime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function stopRecStream() {
    try { _recProc && _recProc.disconnect(); } catch (_) {} try { _recSrc && _recSrc.disconnect(); } catch (_) {}
    _recProc = null; _recSrc = null;
    if (_recCtx) { try { _recCtx.close(); } catch (_) {} _recCtx = null; }
    if (_recStream) { _recStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); _recStream = null; }
    clearInterval(_recTimer); _recTimer = null;
    const c = document.querySelector('.mw-comp'); if (c) c.classList.remove('recording');
  }
  function encodeWavFile(chunks, inRate) {
    let len = 0; for (const c of chunks) len += c.length;
    const merged = new Float32Array(len); let o = 0; for (const c of chunks) { merged.set(c, o); o += c.length; }
    const OUT = 16000; let data = merged;
    if (inRate > OUT) { const ratio = inRate / OUT, n = Math.floor(merged.length / ratio); data = new Float32Array(n); for (let i = 0; i < n; i++) data[i] = merged[Math.floor(i * ratio)]; }
    const buffer = new ArrayBuffer(44 + data.length * 2); const view = new DataView(buffer);
    const wr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, OUT, true); view.setUint32(28, OUT * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    wr(36, 'data'); view.setUint32(40, data.length * 2, true);
    let off = 44; for (let i = 0; i < data.length; i++) { const s = Math.max(-1, Math.min(1, data[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2; }
    return new File([buffer], 'voice-' + Date.now() + '.wav', { type: 'audio/wav' });
  }
  async function startVoice() {
    if (!curConv) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices || !AC) { alert('Voice recording isn’t supported in this browser.'); return; }
    try { _recStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { alert('Microphone access was blocked.'); return; }
    _recCtx = new AC(); _recSR = _recCtx.sampleRate; _recBuf = [];
    try { await _recCtx.resume(); } catch (_) {}
    _recSrc = _recCtx.createMediaStreamSource(_recStream);
    _recProc = _recCtx.createScriptProcessor(4096, 1, 1);
    _recProc.onaudioprocess = (e) => { _recBuf.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    const mute = _recCtx.createGain(); mute.gain.value = 0;   // silent sink so onaudioprocess fires without echo
    _recSrc.connect(_recProc); _recProc.connect(mute); mute.connect(_recCtx.destination);
    _recStart = Date.now();
    document.querySelector('.mw-comp').classList.add('recording');
    document.getElementById('mwRecTime').textContent = '0:00';
    clearInterval(_recTimer);
    _recTimer = setInterval(() => { document.getElementById('mwRecTime').textContent = fmtRecTime(Date.now() - _recStart); if (Date.now() - _recStart > 5 * 60 * 1000) stopVoiceAndSend(); }, 400);
  }
  function cancelVoice() { _recBuf = []; stopRecStream(); }
  async function stopVoiceAndSend() {
    if (!_recCtx) { stopRecStream(); return; }
    const dur = Date.now() - _recStart, buf = _recBuf, sr = _recSR; _recBuf = [];
    stopRecStream();
    if (dur < 700 || !buf.length) return;   // too short → discard
    const file = encodeWavFile(buf, sr);
    await handleFiles([file]);
    await send();   // send the voice note as its own message
  }
  async function send() {
    const inp = document.getElementById('mwInput'); const body = inp.value.trim();
    if (!curConv) return;
    document.getElementById('mwMentions').classList.remove('open');
    // Edit mode: update the existing message rather than sending a new one.
    if (editingId) {
      if (!body) { alert('Message can’t be empty — use delete to remove it.'); return; }
      const mid = editingId;
      try {
        await chatFetch('?api=edit-message', { method: 'POST', body: JSON.stringify({ message_id: mid, body }) });
        const m = curMsgs.find(x => x.id === mid); if (m) { m.body = body; m.edited = true; }
        renderMsgs(curMsgs, true); cancelEdit();
      } catch (e) { alert('Could not edit: ' + e.message); }
      return;
    }
    const uploading = pendingAtts.some(a => a.status === 'uploading');
    if (uploading) { alert('Hold on — attachments are still uploading.'); return; }
    const ready = pendingAtts.filter(a => a.status === 'done' && a.path);
    if (!body && !ready.length) return;
    // Resolve which picked @mentions actually survive in the final text.
    const mentioned = [...mentionPicked.entries()].filter(([, name]) => body.includes('@' + name)).map(([id]) => id).filter((id) => id !== '__everyone__');
    mentionPicked.clear();
    const replyId = replyTarget ? replyTarget.id : null;
    const replyObj = replyTarget ? { id: replyTarget.id, sender_name: replyTarget.sender_name, snippet: replyTarget.snippet } : null;
    cancelReply();
    // Each attachment is sent as its OWN message (its own Dropbox path + own 50 MB), never
    // bundled — so multi-file sends behave like WhatsApp. Text/reply ride the first message.
    if (ready.length > 1) {
      for (let i = 0; i < ready.length; i++) {
        await sendWith(i === 0 ? body : '', [ready[i]], i === 0 ? mentioned : [], i === 0 ? replyId : null, i === 0 ? replyObj : null);
      }
      return;
    }
    return sendWith(body, ready, mentioned, replyId, replyObj);
  }
  async function sendWith(body, ready, mentioned, replyId, replyObj) {
    const inp = document.getElementById('mwInput');
    const cid = curConv; inp.value = ''; inp.style.height = 'auto'; clearDraft(cid);
    const nowIso = new Date().toISOString();
    const tmpId = 'mw-tmp-' + nowIso.replace(/\D/g, '') + '-' + Math.round(Math.random() * 1e6);
    // Optimistic bubble reuses the local preview URLs so media shows instantly.
    const optAtts = ready.map(a => ({ kind: a.kind, mime: a.mime, name: a.name, _localUrl: a._localUrl }));
    appendMsg({ body, created_at: nowIso, mine: true, sender_id: me?.user_id, _tmpId: tmpId, attachments: optAtts, reply: replyObj || null });
    // The strip's object URLs are now owned by the optimistic bubble — clear the strip
    // WITHOUT revoking them (revoking would blank the preview we just rendered).
    pendingAtts = []; renderAttStrip();
    const payloadAtts = ready.map(a => ({ path: a.path, mime: a.mime, size: a.size, name: a.name }));
    const preview = body || 'Attachment';
    const conv = convs.find(c => c.id === cid);
    if (conv) { conv.last_message = { body: preview, sender_id: me?.user_id, sender_name: me?.name, created_at: nowIso }; conv.last_message_at = nowIso; convs.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)); renderList(); }
    try {
      const j = await chatFetch('?api=send', { method: 'POST', body: JSON.stringify({ conversation_id: cid, body, attachments: payloadAtts, mentioned_user_ids: mentioned || [], reply_to: replyId || null }) });
      // Swap the optimistic bubble for the real message (gives it an id → react/edit + status ticks).
      if (curConv === cid && j && j.message) { const i = curMsgs.findIndex((x) => x._tmpId === tmpId); if (i >= 0) { curMsgs[i] = { ...j.message, mine: true }; renderMsgs(curMsgs, true); } }
    }
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

  // ── Presence (online now + last seen) ────────────────────────────────────
  function relTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const days = Math.floor(s / 86400); if (days < 7) return days + 'd ago';
    return d.toLocaleDateString();
  }
  async function beat() { try { const tok = await getToken(); if (tok) fetch(PRESENCE_BASE + '?api=beat', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }); } catch (_) {} }
  function startPresence() {
    const s = ensureSupa(); if (!s || presenceCh || !me) return;
    presenceCh = s.channel('presence:chat', { config: { presence: { key: me.user_id } } });
    presenceCh.on('presence', { event: 'sync' }, () => {
      onlineIds = new Set(Object.keys(presenceCh.presenceState()));
      renderList(); renderThreadPresence();
    }).subscribe(async (status) => { if (status === 'SUBSCRIBED') { try { await presenceCh.track({ at: Date.now() }); } catch (_) {} } });
    beat(); clearInterval(_beatT); _beatT = setInterval(beat, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
  }
  async function renderThreadPresence() {
    const sub = document.getElementById('mwThreadSub'); if (!sub) return;
    const conv = convs.find(c => c.id === curConv);
    const other = (conv && conv.type === 'dm') ? (conv.members || []).find(m => !me || m.id !== me.user_id) : null;
    if (!other) { sub.textContent = ''; sub.classList.remove('online'); return; }
    if (onlineIds.has(other.id)) { sub.textContent = 'online'; sub.classList.add('online'); return; }
    sub.classList.remove('online');
    let ls = lastSeenCache[other.id];
    if (ls === undefined) {
      sub.textContent = '';
      try { const tok = await getToken(); const r = await fetch(PRESENCE_BASE + '?api=get&ids=' + other.id, { headers: { Authorization: 'Bearer ' + tok } }); const j = await r.json(); ls = (j.seen && j.seen[other.id]) || null; lastSeenCache[other.id] = ls; } catch (_) { ls = null; }
      if (curConv !== conv.id) return;   // switched away while fetching
    }
    sub.textContent = ls ? ('last seen ' + relTime(ls)) : '';
  }
  async function startRealtime() {
    const s = ensureSupa(); if (!s || channel) return;
    // Authenticate the realtime socket BEFORE subscribing, else RLS silently drops
    // events and messages never arrive live.
    const tok = await getToken(); if (tok) { try { s.realtime.setAuth(tok); } catch (_) {} }
    channel = s.channel('msg-widget-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const m = payload.new; if (!m) return;
        if (me && m.sender_id === me.user_id) return;
        // Tell the sender it arrived (delivered ✓✓), even if we don't open the conversation.
        chatFetch('?api=delivered', { method: 'POST', body: JSON.stringify({ conversation_id: m.conversation_id }) }).catch(() => {});
        if (panelOpen && m.conversation_id === curConv) {
          // The realtime payload carries only the message row, not its attachments — so if
          // it has media, re-fetch the thread to pull fresh view links; otherwise append.
          if (m.has_attachments || m.reply_to) openConv(curConv);   // refetch to hydrate media / reply quote
          else appendMsg({ ...m, sender_name: nameById[m.sender_id] || '', mine: false, edited: !!m.edited_at, deleted: !!m.deleted_at });
          chatFetch('?api=mark-read', { method: 'POST', body: JSON.stringify({ conversation_id: curConv }) }).catch(() => {});
        }
        desktopNotify(m);
        refreshSoon();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        // Edit / soft-delete of an existing message — patch it in place if it's on screen.
        const m = payload.new; if (!m || !panelOpen || m.conversation_id !== curConv) return;
        const cm = curMsgs.find(x => x.id === m.id); if (!cm) return;
        const nextDeleted = !!m.deleted_at, nextBody = m.deleted_at ? '' : m.body, nextEdited = !!m.edited_at;
        // Skip if nothing actually changed (e.g. our own edit already applied optimistically) — avoids flicker.
        if (cm.deleted === nextDeleted && cm.body === nextBody && cm.edited === nextEdited) return;
        cm.deleted = nextDeleted; cm.body = nextBody; cm.edited = nextEdited;
        if (m.deleted_at) { cm.attachments = []; cm.has_attachments = false; cm.reactions = []; }
        renderMsgs(curMsgs, true); refreshSoon();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, (payload) => {
        const row = payload.new || payload.old; if (!row || !panelOpen || row.conversation_id !== curConv) return;
        if (me && row.user_id === me.user_id) return;   // our own toggle is already applied optimistically — no refetch
        refreshThreadSoon();   // someone else reacted: pull fresh counts (debounced, preserves scroll)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members' }, (payload) => {
        // Another member's read/delivered receipt moved → refresh my sent-message ticks.
        const row = payload.new; if (!row || !panelOpen || row.conversation_id !== curConv) return;
        if (me && row.user_id === me.user_id) return;
        refreshThreadSoon();
      })
      .subscribe();
  }

  function init() {
    if (!mountBtn()) { setTimeout(init, 300); return; }
    const s = ensureSupa(); if (!s) { setTimeout(init, 300); return; }
    // getToken() falls back to the page's stored session, so kick these off now
    // (don't gate on our own client's getSession, which may not be hydrated yet).
    loadConversations().then(startPresence); startRealtime(); loadUsers();
    s.auth.onAuthStateChange((_e, sess) => { if (sess) { loadConversations().then(startPresence); startRealtime(); } });
    // periodic badge refresh as a safety net (realtime is primary)
    setInterval(() => { getToken().then(t => { if (t) loadConversations(); }); }, 120000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
