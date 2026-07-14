/* targets-widget.js — shared ClickUp-style task UI (detail popup + board list).
 * Host page must provide: window.session ({access_token, user}), and set
 *   window.TG_DIRECTORY = [{id, first_name, email}]   (for assignee names/avatars)
 *   window.TG_POSTS     = [{id, name}]                 (for "attach to post")
 * Exposes window.Targets = { openDetail(id), openNew(defaults), renderBoard(el, opts), fmtStatus, STATUS, PRIORITY }.
 */
(function () {
  const TGURL = () => (window.SUPABASE_URL || '') + '/functions/v1/org-targets';
  const STATUS = [['todo', 'To Do'], ['in_progress', 'In Progress'], ['done', 'Done']];
  const PRIORITY = [['urgent', 'Urgent', '#ef4444'], ['high', 'High', '#fbbf24'], ['normal', 'Normal', '#3b82f6'], ['low', 'Low', '#9ca3af']];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dir = () => window.TG_DIRECTORY || [];
  const posts = () => window.TG_POSTS || [];
  const userName = uid => { const u = dir().find(x => x.id === uid); return u ? (u.first_name || (u.email || '').split('@')[0] || 'User') : 'User'; };
  const userInit = uid => (userName(uid)[0] || '?').toUpperCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const isOverdue = t => t.due_date && t.status !== 'done' && String(t.due_date).slice(0, 10) < today();
  const statusLabel = s => (STATUS.find(x => x[0] === s) || ['', s])[1];
  const prio = p => PRIORITY.find(x => x[0] === p);

  async function _api(path, opts = {}) {
    const r = await fetch(TGURL() + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + window.session.access_token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  function injectStyles() {
    if (document.getElementById('tw-styles')) return;
    const s = document.createElement('style'); s.id = 'tw-styles';
    s.textContent = `
    .tw-avatar{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#3b82f6;color:#fff;font-size:0.62rem;font-weight:700;border:1.5px solid var(--surface,#111);flex:0 0 auto;}
    .tw-avatar.sm{width:18px;height:18px;font-size:0.55rem;}
    .tw-chip{display:inline-block;font-size:0.6rem;font-weight:700;padding:1px 7px;border-radius:999px;}
    .tw-status{font-size:0.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:5px;}
    .tw-status-todo{background:rgba(148,163,184,.22);color:#cbd5e1;}
    .tw-status-in_progress{background:rgba(59,130,246,.22);color:#93c5fd;}
    .tw-status-done{background:rgba(52,211,153,.22);color:#6ee7b7;}
    .tw-prioflag{font-size:0.7rem;font-weight:800;}
    .tw-due{font-size:0.68rem;color:rgba(255,255,255,.6);} .tw-due.over{color:#f87171;font-weight:700;}
    .tw-tag{display:inline-block;font-size:0.58rem;background:rgba(167,139,250,.2);color:#c4b5fd;padding:1px 7px;border-radius:999px;margin-right:3px;}
    /* board */
    .tw-group{margin-bottom:14px;}
    .tw-group-h{display:flex;align-items:center;gap:8px;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.65);margin:0 0 6px;}
    .tw-group-h .tw-count{background:var(--surface3,#222);border-radius:999px;padding:0 7px;font-size:0.62rem;color:rgba(255,255,255,.7);}
    .tw-row{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2,#161616);border:1px solid var(--border,#262626);border-radius:9px;margin-bottom:5px;cursor:pointer;}
    .tw-row:hover{border-color:var(--accent,#34d399);}
    .tw-row.done .tw-row-title{text-decoration:line-through;color:rgba(255,255,255,.45);}
    .tw-row-check{width:19px;height:19px;flex:0 0 auto;border-radius:5px;border:1.5px solid var(--border-light,#3a3a3a);background:var(--surface,#111);color:var(--accent,#34d399);font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:0.7rem;}
    .tw-row.done .tw-row-check{background:var(--accent,#34d399);color:#08211a;border-color:var(--accent,#34d399);}
    .tw-row-title{flex:1;min-width:0;font-size:0.86rem;color:var(--text,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tw-row-meta{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
    .tw-cell{cursor:pointer;border-radius:6px;padding:2px 6px;font-size:0.72rem;color:rgba(255,255,255,.7);white-space:nowrap;}
    .tw-cell:hover{background:var(--surface3,#222);}
    .tw-cell-due.over{color:#f87171;font-weight:700;}
    .tw-cell-assignees{display:inline-flex;align-items:center;padding:1px 4px;}
    .tw-menu{position:fixed;z-index:1300;background:var(--surface2,#161728);border:1px solid var(--border-light,#333);border-radius:9px;padding:4px;min-width:150px;max-height:260px;overflow-y:auto;box-shadow:0 12px 34px rgba(0,0,0,.55);}
    .tw-menu button{display:flex;align-items:center;gap:7px;width:100%;text-align:left;background:none;border:0;color:var(--text,#eee);padding:6px 9px;border-radius:6px;cursor:pointer;font-size:0.82rem;}
    .tw-menu button:hover{background:var(--surface3,#222);}
    .tw-quickadd{display:flex;align-items:center;gap:7px;padding:6px 10px;margin-top:2px;opacity:.7;}
    .tw-quickadd:focus-within{opacity:1;}
    .tw-qa-plus{color:rgba(255,255,255,.45);font-size:1rem;}
    .tw-qa-input{flex:1;background:transparent;border:0;color:var(--text,#eee);font-size:0.84rem;outline:none;padding:2px 0;}
    .tw-qa-input::placeholder{color:rgba(255,255,255,.4);}
    .tw-avatars{display:flex;} .tw-avatars .tw-avatar{margin-left:-6px;} .tw-avatars .tw-avatar:first-child{margin-left:0;}
    .tw-empty{font-size:0.82rem;color:rgba(255,255,255,.5);font-style:italic;padding:6px 2px;}
    /* detail modal */
    .tw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:1200;display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;overflow-y:auto;}
    .tw-card{width:100%;max-width:720px;background:var(--surface,#111);border:1px solid var(--border-light,#333);border-radius:16px;box-shadow:0 26px 80px rgba(0,0,0,.65);overflow:hidden;}
    .tw-head{display:flex;gap:10px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border,#262626);background:var(--surface2,#161616);}
    .tw-crumb{font-size:0.66rem;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.55);font-weight:700;flex:1;}
    .tw-x{width:30px;height:30px;border-radius:8px;background:var(--surface3,#222);border:1px solid var(--border,#262626);color:var(--text,#eee);cursor:pointer;font-size:0.9rem;flex:0 0 auto;}
    .tw-x:hover{color:#f87171;border-color:#f87171;}
    .tw-body{padding:16px 18px;}
    .tw-title-in{width:100%;font-size:1.18rem;font-weight:700;background:transparent;border:0;color:var(--text,#eee);padding:2px 0 10px;outline:none;}
    .tw-fields{display:grid;grid-template-columns:110px 1fr;gap:8px 12px;align-items:center;padding:6px 0 12px;border-bottom:1px solid var(--border,#262626);}
    .tw-flabel{font-size:0.72rem;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.03em;}
    .tw-fval{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .tw-sel,.tw-inp{background:var(--surface2,#161616);border:1px solid var(--border,#262626);color:var(--text,#eee);border-radius:7px;padding:5px 8px;font-size:0.82rem;}
    .tw-sec{padding:12px 0;border-bottom:1px solid var(--border,#262626);}
    .tw-sec:last-child{border-bottom:0;}
    .tw-sec h4{font-size:0.72rem;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.55);margin:0 0 7px;font-weight:700;}
    .tw-desc{width:100%;min-height:60px;background:var(--surface2,#161616);border:1px solid var(--border,#262626);color:var(--text,#eee);border-radius:8px;padding:8px 10px;font-size:0.86rem;resize:vertical;}
    .tw-check-item,.tw-sub-item{display:flex;align-items:center;gap:8px;padding:5px 0;}
    .tw-check-item .tw-ci-box,.tw-sub-item .tw-si-box{width:17px;height:17px;flex:0 0 auto;border-radius:5px;border:1.5px solid var(--border-light,#3a3a3a);background:var(--surface,#111);color:var(--accent,#34d399);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;}
    .tw-check-item.done .tw-ci-box,.tw-sub-item.done .tw-si-box{background:var(--accent,#34d399);color:#08211a;border-color:var(--accent,#34d399);}
    .tw-check-item.done .tw-ci-text,.tw-sub-item.done .tw-si-text{text-decoration:line-through;color:rgba(255,255,255,.45);}
    .tw-ci-text{flex:1;font-size:0.84rem;color:var(--text,#eee);} .tw-si-text{flex:1;font-size:0.84rem;color:var(--text,#eee);cursor:pointer;}
    .tw-si-text:hover{color:var(--accent,#34d399);}
    .tw-del{background:none;border:0;color:rgba(255,255,255,.4);cursor:pointer;font-size:0.7rem;} .tw-del:hover{color:#f87171;}
    .tw-addrow{display:flex;gap:6px;margin-top:6px;} .tw-addrow input{flex:1;}
    .tw-btn{background:var(--surface3,#222);border:1px solid var(--border,#262626);color:var(--text,#eee);border-radius:7px;padding:6px 12px;font-size:0.82rem;cursor:pointer;}
    .tw-btn.primary{background:var(--accent,#34d399);color:#08211a;border-color:var(--accent,#34d399);font-weight:700;}
    .tw-btn.danger{color:#f87171;} .tw-btn.danger:hover{border-color:#f87171;}
    .tw-comment{display:flex;gap:8px;padding:7px 0;} .tw-comment .tw-c-body{flex:1;}
    .tw-c-who{font-size:0.72rem;color:rgba(255,255,255,.7);font-weight:700;} .tw-c-when{font-size:0.62rem;color:rgba(255,255,255,.4);margin-left:6px;}
    .tw-c-text{font-size:0.84rem;color:var(--text,#eee);margin-top:2px;white-space:pre-wrap;}
    .tw-mention{color:#93c5fd;font-weight:600;}
    .tw-mention-menu{z-index:1400;}
    .tw-assignpick{position:relative;} .tw-assignmenu{position:absolute;top:100%;left:0;z-index:5;background:var(--surface2,#161616);border:1px solid var(--border-light,#333);border-radius:8px;min-width:200px;max-height:230px;overflow-y:auto;box-shadow:0 12px 30px rgba(0,0,0,.5);padding:4px;}
    .tw-assignmenu button{display:flex;align-items:center;gap:7px;width:100%;text-align:left;background:none;border:0;color:var(--text,#eee);padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.82rem;}
    .tw-assignmenu button:hover{background:var(--surface3,#222);}
    .tw-add-assignee{width:22px;height:22px;border-radius:50%;border:1.5px dashed var(--border-light,#3a3a3a);background:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:0.8rem;line-height:1;}
    /* attachments */
    .tw-atts{display:flex;flex-wrap:wrap;gap:8px;}
    .tw-att{display:flex;align-items:center;gap:8px;background:var(--surface2,#161616);border:1px solid var(--border,#262626);border-radius:9px;padding:6px 8px;max-width:230px;}
    .tw-att-thumb{width:38px;height:38px;flex:0 0 auto;border-radius:6px;object-fit:cover;background:var(--surface3,#222);display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:rgba(255,255,255,.55);overflow:hidden;text-decoration:none;}
    .tw-att-thumb img{width:100%;height:100%;object-fit:cover;}
    .tw-att-meta{min-width:0;flex:1;}
    .tw-att-name{font-size:0.76rem;color:var(--text,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;display:block;}
    .tw-att-name:hover{color:var(--accent,#34d399);}
    .tw-att-sz{font-size:0.62rem;color:rgba(255,255,255,.45);}
    .tw-att.pending{opacity:.55;}
    `;
    document.head.appendChild(s);
  }

  function avatars(ids) {
    if (!ids || !ids.length) return '<span style="color:rgba(255,255,255,.4);font-size:0.72rem;">Unassigned</span>';
    return '<span class="tw-avatars">' + ids.slice(0, 5).map(u => `<span class="tw-avatar sm" title="${esc(userName(u))}">${esc(userInit(u))}</span>`).join('') + '</span>';
  }
  function statusPill(s) { return `<span class="tw-status tw-status-${s}">${esc(statusLabel(s))}</span>`; }
  // @mentions: resolve @firstname tokens in a comment to user ids.
  function resolveMentions(text) {
    const ids = new Set();
    (String(text).match(/@([\w.-]+)/g) || []).forEach(tok => {
      const name = tok.slice(1).toLowerCase();
      const u = dir().find(x => (x.first_name || '').toLowerCase() === name || (x.email || '').split('@')[0].toLowerCase() === name);
      if (u) ids.add(u.id);
    });
    return [...ids];
  }
  function _mentionText(body) { return esc(body).replace(/@([\w.-]+)/g, '<span class="tw-mention">@$1</span>'); }
  // Attach an @-autocomplete to a comment input.
  function _wireMentions(input) {
    const kill = () => { const ex = document.querySelector('.tw-mention-menu'); if (ex) ex.remove(); };
    input.addEventListener('input', () => {
      const val = input.value, pos = input.selectionStart, before = val.slice(0, pos);
      const m = before.match(/@([\w.-]*)$/);
      if (!m) return kill();
      const q = m[1].toLowerCase();
      const people = dir().filter(u => (u.first_name || u.email || '').toLowerCase().includes(q)).slice(0, 8);
      if (!people.length) return kill();
      let menu = document.querySelector('.tw-mention-menu');
      if (!menu) { menu = document.createElement('div'); menu.className = 'tw-menu tw-mention-menu'; document.body.appendChild(menu); }
      menu.innerHTML = people.map(u => `<button data-name="${esc(u.first_name || (u.email || '').split('@')[0])}"><span class="tw-avatar sm">${esc((u.first_name || u.email || '?')[0].toUpperCase())}</span>${esc(u.first_name || u.email)}</button>`).join('');
      const r = input.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.minWidth = Math.min(240, r.width) + 'px'; menu.style.top = (r.top - Math.min(menu.offsetHeight, 200) - 4) + 'px';
      menu.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); const nb = before.replace(/@([\w.-]*)$/, '@' + b.dataset.name + ' ') + val.slice(pos); input.value = nb; input.focus(); input.setSelectionRange(input.value.length, input.value.length); kill(); }));
    });
    input.addEventListener('blur', () => setTimeout(kill, 180));
  }
  function prioFlag(p) { const x = prio(p); return x ? `<span class="tw-prioflag" style="color:${x[2]}" title="${x[1]} priority">⚑</span>` : ''; }

  // ── Small popover menu (priority / status / assignees / date) ───────────────
  function _menu(anchor, html, onReady) {
    document.querySelectorAll('.tw-menu').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'tw-menu'; m.innerHTML = html;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(r.left, window.innerWidth - m.offsetWidth - 6)) + 'px';
    m.style.top = Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 6) + 'px';
    const close = () => { m.remove(); document.removeEventListener('click', outside, true); };
    const outside = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('click', outside, true), 0);
    onReady && onReady(m, close);
    return m;
  }
  const PRIO_MENU = [['', 'None', '#9ca3af'], ...PRIORITY].map(([k, l, c]) => `<button data-v="${k}"><span class="tw-prioflag" style="color:${c}">⚑</span> ${l}</button>`).join('');

  // ── Board list (grouped by status) ─────────────────────────────────────────
  async function renderBoard(container, opts = {}) {
    injectStyles();
    container.innerHTML = '<div class="tw-empty">Loading…</div>';
    try {
      const qs = ['include_done=1'];
      if (opts.assignee) qs.push('assignee=' + encodeURIComponent(opts.assignee));
      if (opts.filterPost) qs.push('post_id=' + opts.filterPost);   // opts.postId is only the default post for NEW tasks
      const j = await _api('?api=list&' + qs.join('&'));
      container._twRows = j.rows || [];
      _drawBoard(container, opts);
    } catch (e) { container.innerHTML = `<div class="tw-empty" style="color:#f87171;">${esc(e.message)}</div>`; }
  }
  function _applyView(rows, opts) {
    let r = rows.slice();
    const q = (opts.search || '').trim().toLowerCase();
    if (q) r = r.filter(t => (t.title || '').toLowerCase().includes(q) || (t.tags || []).some(tg => tg.toLowerCase().includes(q)));
    if (opts.priority) r = r.filter(t => t.priority === opts.priority);
    if (opts.tag) r = r.filter(t => (t.tags || []).includes(opts.tag));
    if (opts.due === 'overdue') r = r.filter(t => isOverdue(t));
    else if (opts.due === 'today') r = r.filter(t => t.due_date && String(t.due_date).slice(0, 10) === today() && t.status !== 'done');
    const sort = opts.sort || 'due';
    const prioRank = { urgent: 0, high: 1, normal: 2, low: 3 };
    r.sort((a, b) => {
      if (sort === 'priority') return (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9);
      if (sort === 'created') return (b.id || 0) - (a.id || 0);
      const ad = a.due_date || '9999', bd = b.due_date || '9999'; return ad < bd ? -1 : ad > bd ? 1 : 0; // due
    });
    return r;
  }
  function _drawBoard(container, opts) {
    const rows = _applyView(container._twRows || [], opts);
    const canAdd = opts.canAdd !== false;
    const groups = STATUS.map(([key, label]) => [key, label, rows.filter(r => r.status === key)]);
    container.innerHTML = groups.map(([key, label, list]) => `
      <div class="tw-group" data-status="${key}">
        <div class="tw-group-h">${esc(label)}<span class="tw-count">${list.length}</span></div>
        ${list.map(t => _rowHtml(t)).join('')}
        ${canAdd ? `<div class="tw-quickadd"><span class="tw-qa-plus">+</span><input class="tw-qa-input" placeholder="Add task…" data-status="${key}"></div>` : ''}
      </div>`).join('');
    _wireBoard(container, opts);
  }
  function _redraw(container, opts) { _drawBoard(container, opts); }

  function _wireBoard(container, opts) {
    const rowsRef = () => container._twRows || [];
    const bgUpdate = (id, body, revert) => _api('?api=update&id=' + id, { method: 'POST', body }).catch(e => { revert && revert(); alert(e.message); });
    container.querySelectorAll('.tw-row').forEach(row => {
      const id = Number(row.dataset.id);
      const t = rowsRef().find(x => x.id === id);
      row.addEventListener('click', e => { if (e.target.closest('.tw-cell, .tw-row-check')) return; openDetail(id, { ...opts, onClose: () => renderBoard(container, opts) }); });
      // done checkbox
      row.querySelector('.tw-row-check').addEventListener('click', e => { e.stopPropagation(); if (!t) return; const was = t.status; t.status = was === 'done' ? 'todo' : 'done'; _redraw(container, opts); bgUpdate(id, { status: t.status }, () => { t.status = was; _redraw(container, opts); }); });
      // status pill
      const sc = row.querySelector('.tw-cell-status'); if (sc) sc.addEventListener('click', e => { e.stopPropagation(); _menu(sc, STATUS.map(([k, l]) => `<button data-v="${k}">${l}</button>`).join(''), (m, close) => m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { close(); if (!t || t.status === b.dataset.v) return; const was = t.status; t.status = b.dataset.v; _redraw(container, opts); bgUpdate(id, { status: t.status }, () => { t.status = was; _redraw(container, opts); }); }))); });
      // priority
      const pc = row.querySelector('.tw-cell-prio'); if (pc) pc.addEventListener('click', e => { e.stopPropagation(); _menu(pc, PRIO_MENU, (m, close) => m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { close(); const was = t.priority; t.priority = b.dataset.v || null; _redraw(container, opts); bgUpdate(id, { priority: t.priority }, () => { t.priority = was; _redraw(container, opts); }); }))); });
      // due date (native picker)
      const dc = row.querySelector('.tw-cell-due'); if (dc) dc.addEventListener('click', e => { e.stopPropagation(); const inp = document.createElement('input'); inp.type = 'date'; inp.value = t.due_date ? String(t.due_date).slice(0, 10) : ''; inp.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(inp); inp.addEventListener('change', () => { const was = t.due_date; t.due_date = inp.value || null; _redraw(container, opts); bgUpdate(id, { due_date: t.due_date }, () => { t.due_date = was; _redraw(container, opts); }); inp.remove(); }); inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 200)); inp.showPicker ? inp.showPicker() : inp.click(); });
      // assignees
      const ac = row.querySelector('.tw-cell-assignees'); if (ac) ac.addEventListener('click', e => { e.stopPropagation(); const ids = t.assignee_ids || []; const avail = dir().filter(u => !ids.includes(u.id)); _menu(ac, (ids.length ? ids.map(u => `<button data-rm="${u}"><span class="tw-avatar sm">${esc(userInit(u))}</span>${esc(userName(u))} <span style="margin-left:auto;color:#f87171">✕</span></button>`).join('') + '<div style="height:1px;background:var(--border);margin:4px 0"></div>' : '') + avail.map(u => `<button data-add="${u.id}"><span class="tw-avatar sm">${esc((u.first_name || u.email || '?')[0].toUpperCase())}</span>${esc(u.first_name || u.email)}</button>`).join(''), (m, close) => { m.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { close(); const was = ids.slice(); t.assignee_ids = [...ids, b.dataset.add]; _redraw(container, opts); bgUpdate(id, { assignee_ids: t.assignee_ids }, () => { t.assignee_ids = was; _redraw(container, opts); }); })); m.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { close(); const was = ids.slice(); t.assignee_ids = ids.filter(x => x !== b.dataset.rm); _redraw(container, opts); bgUpdate(id, { assignee_ids: t.assignee_ids }, () => { t.assignee_ids = was; _redraw(container, opts); }); })); }); });
    });
    // quick-add per group
    container.querySelectorAll('.tw-qa-input').forEach(inp => {
      const add = async () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; try { const r = await _api('?api=create', { method: 'POST', body: { title: v, status: inp.dataset.status, post_id: opts.postId || null, assignee_ids: opts.assignee === 'me' ? [window.session.user.id] : [] } }); (container._twRows = container._twRows || []).push(r.row); _redraw(container, opts); } catch (e) { alert(e.message); } };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    });
  }
  function _rowHtml(t) {
    const done = t.status === 'done';
    const post = t.post_id ? posts().find(p => p.id === t.post_id) : null;
    const px = prio(t.priority);
    return `<div class="tw-row${done ? ' done' : ''}" data-id="${t.id}">
      <button class="tw-row-check" title="Toggle done">${done ? '✓' : ''}</button>
      <div class="tw-row-title">${esc(t.title)}${post ? ` <span class="tw-tag">${esc(post.name)}</span>` : ''}${(t.tags || []).map(tg => `<span class="tw-tag">${esc(tg)}</span>`).join('')}</div>
      <div class="tw-row-meta">
        <span class="tw-cell tw-cell-prio" title="Priority">${px ? `<span class="tw-prioflag" style="color:${px[2]}">⚑</span>` : '<span class="tw-prioflag" style="color:#4b5563">⚑</span>'}</span>
        <span class="tw-cell tw-cell-due${t.due_date && isOverdue(t) ? ' over' : ''}" title="Due date">${t.due_date ? esc(String(t.due_date).slice(5, 10)) : '<span style="color:#4b5563">Set date</span>'}</span>
        <span class="tw-cell tw-cell-assignees" title="Assignees">${(t.assignee_ids && t.assignee_ids.length) ? avatars(t.assignee_ids) : '<span class="tw-add-assignee" style="pointer-events:none">+</span>'}</span>
        <span class="tw-cell tw-cell-status">${statusPill(t.status)}</span>
      </div>
    </div>`;
  }

  // ── Detail modal ───────────────────────────────────────────────────────────
  function _close() { const o = document.getElementById('twOverlay'); if (o) o.remove(); }
  async function openDetail(id, opts = {}) {
    injectStyles();
    let host = document.getElementById('twOverlay'); if (host) host.remove();
    const wrap = document.createElement('div'); wrap.className = 'tw-overlay'; wrap.id = 'twOverlay';
    wrap.innerHTML = '<div class="tw-card"><div class="tw-body"><div class="tw-empty">Loading…</div></div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) { _close(); opts.onClose && opts.onClose(); } });
    try {
      const j = await _api('?api=get&id=' + id);
      _renderDetail(wrap, j, opts);
    } catch (e) { wrap.querySelector('.tw-body').innerHTML = `<div class="tw-empty" style="color:#f87171;">${esc(e.message)}</div>`; }
  }

  function _renderDetail(wrap, j, opts) {
    const t = j.row, ce = !!j.can_edit;
    const dis = ce ? '' : 'disabled';
    const post = t.post_id ? posts().find(p => p.id === t.post_id) : null;
    const card = wrap.querySelector('.tw-card');
    card.innerHTML = `
      <div class="tw-head"><span class="tw-crumb">${post ? esc(post.name) : 'Task'} · #${t.id}</span>
        ${ce ? '<button class="tw-btn danger" id="twDel">Delete</button>' : ''}
        <button class="tw-x" id="twX">✕</button></div>
      <div class="tw-body">
        <input class="tw-title-in" id="twTitle" value="${esc(t.title)}" ${dis}>
        <div class="tw-fields">
          <div class="tw-flabel">Status</div><div class="tw-fval"><select class="tw-sel" id="twStatus" ${dis}>${STATUS.map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="tw-flabel">Assignees</div><div class="tw-fval" id="twAssignees"></div>
          <div class="tw-flabel">Priority</div><div class="tw-fval"><select class="tw-sel" id="twPrio" ${dis}><option value="">—</option>${PRIORITY.map(([k, l]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="tw-flabel">Dates</div><div class="tw-fval"><input type="date" class="tw-inp" id="twStart" value="${t.start_date ? String(t.start_date).slice(0, 10) : ''}" ${dis}> <span style="color:rgba(255,255,255,.4)">→</span> <input type="date" class="tw-inp" id="twDue" value="${t.due_date ? String(t.due_date).slice(0, 10) : ''}" ${dis}></div>
          <div class="tw-flabel">Estimate</div><div class="tw-fval"><input type="number" class="tw-inp" id="twEst" min="0" step="15" style="width:90px" placeholder="min" value="${t.time_estimate_minutes ?? ''}" ${dis}> <span style="color:rgba(255,255,255,.4);font-size:0.72rem;">minutes</span></div>
          <div class="tw-flabel">Tags</div><div class="tw-fval"><input type="text" class="tw-inp" id="twTags" style="flex:1" placeholder="comma,separated" value="${esc((t.tags || []).join(', '))}" ${dis}></div>
          <div class="tw-flabel">Post</div><div class="tw-fval"><select class="tw-sel" id="twPost" ${dis}><option value="">— none (general task) —</option>${posts().map(p => `<option value="${p.id}" ${t.post_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        </div>
        <div class="tw-sec"><h4>Description</h4><textarea class="tw-desc" id="twDesc" placeholder="Add a description…" ${dis}>${esc(t.details || '')}</textarea></div>
        <div class="tw-sec"><h4>Checklist</h4><div id="twChecklist">${(j.checklist || []).map(_ciHtml).join('') || '<div class="tw-empty">No items.</div>'}</div>${ce ? `<div class="tw-addrow"><input class="tw-inp" id="twCiNew" placeholder="Add checklist item…"><button class="tw-btn" id="twCiAdd">Add</button></div>` : ''}</div>
        <div class="tw-sec"><h4>Subtasks</h4><div id="twSubs">${(j.subtasks || []).map(_subHtml).join('') || '<div class="tw-empty">No subtasks.</div>'}</div>${ce ? `<div class="tw-addrow"><input class="tw-inp" id="twSubNew" placeholder="Add subtask…"><button class="tw-btn" id="twSubAdd">Add</button></div>` : ''}</div>
        <div class="tw-sec"><h4>Attachments</h4><div class="tw-atts" id="twAtts">${(j.attachments || []).map(_attHtml).join('') || '<div class="tw-empty">No files.</div>'}</div>${ce ? `<div class="tw-addrow" style="margin-top:8px;"><input type="file" id="twAttFile" multiple style="display:none;"><button class="tw-btn" id="twAttAdd">Attach files</button><span id="twAttNote" style="font-size:0.68rem;color:rgba(255,255,255,.45);align-self:center;">Up to 20MB each</span></div>` : ''}</div>
        <div class="tw-sec"><h4>Activity</h4><div id="twComments">${(j.comments || []).map(_cmtHtml).join('') || '<div class="tw-empty">No comments yet.</div>'}</div><div class="tw-addrow"><input class="tw-inp" id="twCmtNew" placeholder="Write a comment…"><button class="tw-btn primary" id="twCmtAdd">Send</button></div></div>
      </div>`;
    card.querySelector('#twX').addEventListener('click', () => { _close(); opts.onClose && opts.onClose(); });
    if (ce) card.querySelector('#twDel').addEventListener('click', async () => { if (!confirm('Delete this task?')) return; try { await _api('?api=delete&id=' + t.id, { method: 'POST', body: {} }); _close(); opts.onClose && opts.onClose(); } catch (e) { alert(e.message); } });
    // Assignees re-render only their own section (never the whole modal).
    const refreshAssignees = () => _renderAssignees(card.querySelector('#twAssignees'), t, ce, refreshAssignees);
    refreshAssignees();

    // Field auto-save (change only) — fire-and-forget; the input already shows
    // the new value, so no waiting. Reverts nothing (rare failure → alert).
    if (ce) {
      const save = (body) => { Object.assign(t, body); opts.onChange && opts.onChange(); _api('?api=update&id=' + t.id, { method: 'POST', body }).catch(e => alert(e.message)); };
      const f = id => card.querySelector(id);
      f('#twTitle').addEventListener('change', e => save({ title: e.target.value }));
      f('#twStatus').addEventListener('change', e => save({ status: e.target.value }));
      f('#twPrio').addEventListener('change', e => save({ priority: e.target.value || null }));
      f('#twStart').addEventListener('change', e => save({ start_date: e.target.value || null }));
      f('#twDue').addEventListener('change', e => save({ due_date: e.target.value || null }));
      f('#twEst').addEventListener('change', e => save({ time_estimate_minutes: e.target.value ? Number(e.target.value) : null }));
      f('#twTags').addEventListener('change', e => save({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }));
      f('#twPost').addEventListener('change', e => save({ post_id: e.target.value ? Number(e.target.value) : null }));
      f('#twDesc').addEventListener('change', e => save({ details: e.target.value }));

      // Checklist — OPTIMISTIC: UI updates instantly, request goes in the
      // background, only reverts if the server rejects it.
      const ciList = f('#twChecklist');
      const wireCi = (el) => {
        const box = el.querySelector('.tw-ci-box');
        box.addEventListener('click', () => {
          const done = !el.classList.contains('done');
          el.classList.toggle('done', done); box.textContent = done ? '✓' : '';
          _api('?api=checklist-update&id=' + el.dataset.id, { method: 'POST', body: { done } }).catch(e => { el.classList.toggle('done', !done); box.textContent = !done ? '✓' : ''; alert(e.message); });
        });
        el.querySelector('.tw-del').addEventListener('click', () => {
          const next = el.nextSibling, parent = el.parentNode; el.remove();
          if (!ciList.querySelector('.tw-check-item')) ciList.innerHTML = '<div class="tw-empty">No items.</div>';
          _api('?api=checklist-delete&id=' + el.dataset.id, { method: 'POST', body: {} }).catch(e => { const em = ciList.querySelector('.tw-empty'); if (em) em.remove(); parent.insertBefore(el, next); alert(e.message); });
        });
      };
      ciList.querySelectorAll('.tw-check-item').forEach(wireCi);
      const ciAdd = f('#twCiAdd'); if (ciAdd) { const go = () => { const inp = f('#twCiNew'); const v = inp.value.trim(); if (!v) return; const em = ciList.querySelector('.tw-empty'); if (em) em.remove(); const wrap = document.createElement('div'); wrap.innerHTML = _ciHtml({ id: 'tmp', text: v, done: false }); const el = wrap.firstElementChild; ciList.appendChild(el); wireCi(el); inp.value = ''; inp.focus(); _api('?api=checklist-add', { method: 'POST', body: { target_id: t.id, text: v } }).then(r => { el.dataset.id = r.row.id; }).catch(e => { el.remove(); alert(e.message); }); }; ciAdd.addEventListener('click', go); f('#twCiNew').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }

      // Subtasks — optimistic like checklist.
      const subList = f('#twSubs');
      const wireSub = (el) => {
        const box = el.querySelector('.tw-si-box');
        box.addEventListener('click', () => {
          const done = !el.classList.contains('done');
          el.classList.toggle('done', done); box.textContent = done ? '✓' : '';
          _api('?api=update&id=' + el.dataset.id, { method: 'POST', body: { status: done ? 'done' : 'todo' } }).catch(e => { el.classList.toggle('done', !done); box.textContent = !done ? '✓' : ''; alert(e.message); });
        });
        el.querySelector('.tw-si-text').addEventListener('click', () => { if (el.dataset.id !== 'tmp') openDetail(Number(el.dataset.id), {}); });
      };
      subList.querySelectorAll('.tw-sub-item').forEach(wireSub);
      const subAdd = f('#twSubAdd'); if (subAdd) { const go = () => { const inp = f('#twSubNew'); const v = inp.value.trim(); if (!v) return; const em = subList.querySelector('.tw-empty'); if (em) em.remove(); const wrap = document.createElement('div'); wrap.innerHTML = _subHtml({ id: 'tmp', title: v, status: 'todo' }); const el = wrap.firstElementChild; subList.appendChild(el); wireSub(el); inp.value = ''; inp.focus(); _api('?api=create', { method: 'POST', body: { title: v, parent_target_id: t.id, post_id: t.post_id } }).then(r => { el.dataset.id = r.row.id; }).catch(e => { el.remove(); alert(e.message); }); }; subAdd.addEventListener('click', go); f('#twSubNew').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }

      // Attachments — upload each picked file (base64 → Dropbox). Optimistic
      // pending card, replaced with the real one on success.
      const attList = f('#twAtts');
      const wireAtt = (el) => { const b = el.querySelector('.tw-del'); if (b) b.addEventListener('click', () => { const next = el.nextSibling, parent = el.parentNode; el.remove(); if (!attList.querySelector('.tw-att')) attList.innerHTML = '<div class="tw-empty">No files.</div>'; _api('?api=attachment-delete&id=' + b.dataset.id, { method: 'POST', body: {} }).catch(e => { const em = attList.querySelector('.tw-empty'); if (em) em.remove(); parent.insertBefore(el, next); alert(e.message); }); }); };
      attList.querySelectorAll('.tw-att').forEach(wireAtt);
      const attAdd = f('#twAttAdd'), attFile = f('#twAttFile');
      if (attAdd && attFile) {
        attAdd.addEventListener('click', () => attFile.click());
        attFile.addEventListener('change', () => {
          const files = [...attFile.files]; attFile.value = '';
          files.forEach(file => {
            if (file.size > 20 * 1024 * 1024) { alert(file.name + ' is larger than 20MB.'); return; }
            const em = attList.querySelector('.tw-empty'); if (em) em.remove();
            const ph = document.createElement('div'); ph.innerHTML = _attHtml({ id: 'tmp', name: file.name, size: file.size, mime: file.type }, true); const el = ph.firstElementChild; attList.appendChild(el);
            const reader = new FileReader();
            reader.onload = () => {
              const data = String(reader.result).split(',')[1] || '';
              _api('?api=attachment-upload', { method: 'POST', body: { target_id: t.id, name: file.name, mime: file.type || null, data } })
                .then(r => { const nw = document.createElement('div'); nw.innerHTML = _attHtml(r.row); const rel = nw.firstElementChild; el.replaceWith(rel); wireAtt(rel); })
                .catch(e => { el.remove(); if (!attList.querySelector('.tw-att')) attList.innerHTML = '<div class="tw-empty">No files.</div>'; alert(e.message); });
            };
            reader.onerror = () => { el.remove(); alert('Could not read ' + file.name); };
            reader.readAsDataURL(file);
          });
        });
      }
    }

    // Comments — OPTIMISTIC: the comment shows the instant you hit send.
    const cmtList = card.querySelector('#twComments');
    const wireCmt = (el) => { const b = el.querySelector('[data-del-cmt]'); if (b) b.addEventListener('click', () => { const next = el.nextSibling, parent = el.parentNode; el.remove(); if (!cmtList.querySelector('.tw-comment')) cmtList.innerHTML = '<div class="tw-empty">No comments yet.</div>'; _api('?api=comment-delete&id=' + b.dataset.delCmt, { method: 'POST', body: {} }).catch(e => { const em = cmtList.querySelector('.tw-empty'); if (em) em.remove(); parent.insertBefore(el, next); alert(e.message); }); }); };
    cmtList.querySelectorAll('.tw-comment').forEach(wireCmt);
    const goC = () => {
      const inp = card.querySelector('#twCmtNew'); const v = inp.value.trim(); if (!v) return;
      const em = cmtList.querySelector('.tw-empty'); if (em) em.remove();
      const temp = { id: 'tmp', user_id: window.session.user.id, body: v, created_at: new Date().toISOString() };
      const wrap = document.createElement('div'); wrap.innerHTML = _cmtHtml(temp); const el = wrap.firstElementChild; el.style.opacity = '0.6'; cmtList.appendChild(el); inp.value = ''; inp.focus();
      _api('?api=comment-add', { method: 'POST', body: { target_id: t.id, body: v, mention_ids: resolveMentions(v) } }).then(r => { const nw = document.createElement('div'); nw.innerHTML = _cmtHtml(r.row); const rel = nw.firstElementChild; el.replaceWith(rel); wireCmt(rel); }).catch(e => { el.remove(); alert(e.message); });
    };
    card.querySelector('#twCmtAdd').addEventListener('click', goC);
    const cmtInput = card.querySelector('#twCmtNew');
    cmtInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !document.querySelector('.tw-mention-menu')) goC(); });
    cmtInput.placeholder = 'Write a comment… (@ to mention)';
    _wireMentions(cmtInput);
  }

  function _renderAssignees(el, t, ce, refresh) {
    const ids = t.assignee_ids || [];
    el.innerHTML = ids.map(u => `<span class="tw-avatar" title="${esc(userName(u))}" data-uid="${u}" style="cursor:${ce ? 'pointer' : 'default'}">${esc(userInit(u))}</span>`).join('') +
      (ce ? '<span class="tw-assignpick"><button class="tw-add-assignee" id="twAddAssignee">+</button></span>' : (ids.length ? '' : '<span style="color:rgba(255,255,255,.4);font-size:0.78rem;">Unassigned</span>'));
    if (!ce) return;
    const apply = async (nextIds) => { try { const r = await _api('?api=update&id=' + t.id, { method: 'POST', body: { assignee_ids: nextIds } }); t.assignee_ids = (r.row && r.row.assignee_ids) || nextIds; refresh(); } catch (e) { alert(e.message); } };
    if (ids.length) el.querySelectorAll('.tw-avatar[data-uid]').forEach(a => a.addEventListener('click', () => { const uid = a.dataset.uid; if (!confirm('Remove ' + userName(uid) + '?')) return; apply(ids.filter(x => x !== uid)); }));
    el.querySelector('#twAddAssignee').addEventListener('click', () => {
      const existing = el.querySelector('.tw-assignmenu'); if (existing) { existing.remove(); return; }
      const menu = document.createElement('div'); menu.className = 'tw-assignmenu';
      const avail = dir().filter(u => !ids.includes(u.id));
      menu.innerHTML = '<input class="tw-inp" id="twAssignSearch" placeholder="Search people…" style="width:100%;margin-bottom:4px;">' + avail.map(u => `<button data-uid="${u.id}"><span class="tw-avatar sm">${esc((u.first_name || u.email || '?')[0].toUpperCase())}</span>${esc(u.first_name || u.email)}</button>`).join('');
      el.querySelector('.tw-assignpick').appendChild(menu);
      const search = menu.querySelector('#twAssignSearch'); search.focus();
      search.addEventListener('input', () => { const q = search.value.toLowerCase(); menu.querySelectorAll('button[data-uid]').forEach(b => { b.style.display = b.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });
      menu.querySelectorAll('button[data-uid]').forEach(b => b.addEventListener('click', () => apply([...ids, b.dataset.uid])));
    });
  }

  function fmtBytes(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  // Dropbox shared links come as ?dl=0. ?raw=1 serves inline (image src),
  // ?dl=1 forces download.
  function attUrl(a, mode) { const u = a.external_url || ''; if (!u) return '#'; const base = u.replace(/([?&])dl=\d/, '$1').replace(/[?&]$/, ''); const sep = base.includes('?') ? '&' : '?'; return base + sep + (mode === 'raw' ? 'raw=1' : 'dl=1'); }
  function _attHtml(a, pending) {
    const isImg = /^image\//.test(a.mime || '') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(a.name || '');
    const dl = pending ? '#' : attUrl(a, 'dl');
    const thumb = pending ? '<span class="tw-att-thumb">…</span>' : (isImg && a.external_url ? `<a class="tw-att-thumb" href="${esc(attUrl(a, 'raw'))}" target="_blank" rel="noopener"><img src="${esc(attUrl(a, 'raw'))}" alt=""></a>` : `<a class="tw-att-thumb" href="${esc(dl)}" target="_blank" rel="noopener">▤</a>`);
    return `<div class="tw-att${pending ? ' pending' : ''}" data-id="${a.id}">${thumb}<div class="tw-att-meta"><a class="tw-att-name" href="${esc(dl)}" target="_blank" rel="noopener" title="${esc(a.name || 'file')}">${esc(a.name || 'file')}</a><div class="tw-att-sz">${esc(fmtBytes(a.size))}${pending ? ' · uploading…' : ''}</div></div>${pending ? '' : `<button class="tw-del" data-id="${a.id}" title="Remove">✕</button>`}</div>`;
  }
  function _ciHtml(c) { return `<div class="tw-check-item${c.done ? ' done' : ''}" data-id="${c.id}"><span class="tw-ci-box">${c.done ? '✓' : ''}</span><span class="tw-ci-text">${esc(c.text)}</span><button class="tw-del">✕</button></div>`; }
  function _subHtml(s) { const done = s.status === 'done'; return `<div class="tw-sub-item${done ? ' done' : ''}" data-id="${s.id}"><span class="tw-si-box">${done ? '✓' : ''}</span><span class="tw-si-text">${esc(s.title)}</span></div>`; }
  function _cmtHtml(c) {
    const when = c.created_at ? new Date(c.created_at).toLocaleString() : '';
    const who = c.user_id ? userName(c.user_id) : (c.user_email || 'System');
    const init = (c.user_id ? userInit(c.user_id) : (who[0] || 'R')).toUpperCase();
    const sys = !c.user_id;
    return `<div class="tw-comment"><span class="tw-avatar sm" ${sys ? 'style="background:#a78bfa"' : ''}>${esc(init)}</span><div class="tw-c-body"><span class="tw-c-who">${esc(who)}</span><span class="tw-c-when">${esc(when)}</span><div class="tw-c-text">${_mentionText(c.body)}</div></div>${sys ? '' : `<button class="tw-del" data-del-cmt="${c.id}">✕</button>`}</div>`;
  }

  async function openNew(defaults = {}) {
    try {
      const j = await _api('?api=create', { method: 'POST', body: { title: defaults.title || 'New task', post_id: defaults.post_id || null, assignee_ids: defaults.assignee_ids || [] } });
      openDetail(j.row.id, defaults.opts || {});
    } catch (e) { alert(e.message); }
  }

  window.Targets = { injectStyles, openDetail, openNew, renderBoard, STATUS, PRIORITY, statusLabel, isOverdue, avatars, statusPill, prioFlag, _api };
})();
