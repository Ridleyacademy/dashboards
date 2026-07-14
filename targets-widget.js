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
    .tw-row-meta{display:flex;align-items:center;gap:8px;flex:0 0 auto;}
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
    .tw-assignpick{position:relative;} .tw-assignmenu{position:absolute;top:100%;left:0;z-index:5;background:var(--surface2,#161616);border:1px solid var(--border-light,#333);border-radius:8px;min-width:200px;max-height:230px;overflow-y:auto;box-shadow:0 12px 30px rgba(0,0,0,.5);padding:4px;}
    .tw-assignmenu button{display:flex;align-items:center;gap:7px;width:100%;text-align:left;background:none;border:0;color:var(--text,#eee);padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.82rem;}
    .tw-assignmenu button:hover{background:var(--surface3,#222);}
    .tw-add-assignee{width:22px;height:22px;border-radius:50%;border:1.5px dashed var(--border-light,#3a3a3a);background:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:0.8rem;line-height:1;}
    `;
    document.head.appendChild(s);
  }

  function avatars(ids) {
    if (!ids || !ids.length) return '<span style="color:rgba(255,255,255,.4);font-size:0.72rem;">Unassigned</span>';
    return '<span class="tw-avatars">' + ids.slice(0, 5).map(u => `<span class="tw-avatar sm" title="${esc(userName(u))}">${esc(userInit(u))}</span>`).join('') + '</span>';
  }
  function statusPill(s) { return `<span class="tw-status tw-status-${s}">${esc(statusLabel(s))}</span>`; }
  function prioFlag(p) { const x = prio(p); return x ? `<span class="tw-prioflag" style="color:${x[2]}" title="${x[1]} priority">⚑</span>` : ''; }

  // ── Board list (grouped by status) ─────────────────────────────────────────
  async function renderBoard(container, opts = {}) {
    injectStyles();
    container.innerHTML = '<div class="tw-empty">Loading…</div>';
    try {
      const qs = ['include_done=1'];
      if (opts.assignee) qs.push('assignee=' + encodeURIComponent(opts.assignee));
      if (opts.postId) qs.push('post_id=' + opts.postId);
      const j = await _api('?api=list&' + qs.join('&'));
      const rows = j.rows || [];
      _drawBoard(container, rows, opts);
    } catch (e) { container.innerHTML = `<div class="tw-empty" style="color:#f87171;">${esc(e.message)}</div>`; }
  }
  function _drawBoard(container, rows, opts) {
    const groups = STATUS.map(([key, label]) => [key, label, rows.filter(r => r.status === key)]);
    container.innerHTML = groups.map(([key, label, list]) => `
      <div class="tw-group">
        <div class="tw-group-h">${esc(label)}<span class="tw-count">${list.length}</span></div>
        ${list.length ? list.map(t => _rowHtml(t)).join('') : '<div class="tw-empty">Nothing here.</div>'}
      </div>`).join('');
    container.querySelectorAll('.tw-row').forEach(row => {
      const id = Number(row.dataset.id);
      row.addEventListener('click', e => { if (e.target.closest('.tw-row-check')) return; openDetail(id, { ...opts, onClose: () => renderBoard(container, opts) }); });
      const chk = row.querySelector('.tw-row-check');
      if (chk) chk.addEventListener('click', async e => {
        e.stopPropagation(); const t = rows.find(x => x.id === id); if (!t) return;
        try { await _api('?api=update&id=' + id, { method: 'POST', body: { status: t.status === 'done' ? 'todo' : 'done' } }); renderBoard(container, opts); } catch (err) { alert(err.message); }
      });
    });
  }
  function _rowHtml(t) {
    const done = t.status === 'done';
    const post = t.post_id ? posts().find(p => p.id === t.post_id) : null;
    return `<div class="tw-row${done ? ' done' : ''}" data-id="${t.id}">
      <button class="tw-row-check" title="Toggle done">${done ? '✓' : ''}</button>
      <div class="tw-row-title">${prioFlag(t.priority)} ${esc(t.title)}${post ? ` <span class="tw-tag">${esc(post.name)}</span>` : ''}${(t.tags || []).map(tg => `<span class="tw-tag">${esc(tg)}</span>`).join('')}</div>
      <div class="tw-row-meta">${t.due_date ? `<span class="tw-due${isOverdue(t) ? ' over' : ''}">${esc(String(t.due_date).slice(5, 10))}</span>` : ''}${avatars(t.assignee_ids)}</div>
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
      _api('?api=comment-add', { method: 'POST', body: { target_id: t.id, body: v } }).then(r => { const nw = document.createElement('div'); nw.innerHTML = _cmtHtml(r.row); const rel = nw.firstElementChild; el.replaceWith(rel); wireCmt(rel); }).catch(e => { el.remove(); alert(e.message); });
    };
    card.querySelector('#twCmtAdd').addEventListener('click', goC);
    card.querySelector('#twCmtNew').addEventListener('keydown', e => { if (e.key === 'Enter') goC(); });
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

  function _ciHtml(c) { return `<div class="tw-check-item${c.done ? ' done' : ''}" data-id="${c.id}"><span class="tw-ci-box">${c.done ? '✓' : ''}</span><span class="tw-ci-text">${esc(c.text)}</span><button class="tw-del">✕</button></div>`; }
  function _subHtml(s) { const done = s.status === 'done'; return `<div class="tw-sub-item${done ? ' done' : ''}" data-id="${s.id}"><span class="tw-si-box">${done ? '✓' : ''}</span><span class="tw-si-text">${esc(s.title)}</span></div>`; }
  function _cmtHtml(c) {
    const when = c.created_at ? new Date(c.created_at).toLocaleString() : '';
    const who = c.user_id ? userName(c.user_id) : (c.user_email || 'System');
    const init = (c.user_id ? userInit(c.user_id) : (who[0] || 'R')).toUpperCase();
    const sys = !c.user_id;
    return `<div class="tw-comment"><span class="tw-avatar sm" ${sys ? 'style="background:#a78bfa"' : ''}>${esc(init)}</span><div class="tw-c-body"><span class="tw-c-who">${esc(who)}</span><span class="tw-c-when">${esc(when)}</span><div class="tw-c-text">${esc(c.body)}</div></div>${sys ? '' : `<button class="tw-del" data-del-cmt="${c.id}">✕</button>`}</div>`;
  }

  async function openNew(defaults = {}) {
    try {
      const j = await _api('?api=create', { method: 'POST', body: { title: defaults.title || 'New task', post_id: defaults.post_id || null, assignee_ids: defaults.assignee_ids || [] } });
      openDetail(j.row.id, defaults.opts || {});
    } catch (e) { alert(e.message); }
  }

  window.Targets = { injectStyles, openDetail, openNew, renderBoard, STATUS, PRIORITY, statusLabel, isOverdue, avatars, statusPill, prioFlag, _api };
})();
