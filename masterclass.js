/* Masterclass Students CRM — talks to the `masterclass` edge fn. Lean clone of the
   Mentorship CRM: identity/rep/purchase/course-progress + turnovers, alerts, wins,
   notes. Lifetime access (no expiry). */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://pojqljrhhtnigyrtzdzz.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos';
  const MC_BASE = SUPABASE_URL + '/functions/v1/masterclass';
  const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let students = [];          // list rows
  let reps = [];              // assignable reps
  let caps = { is_admin: false, can_edit: false };
  let cur = null;             // currently open { row, turnovers, alerts, wins, notes }
  let filter = 'all';
  let query = '';
  let editing = false;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (n) => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  const stCls = (s) => 'st-' + String(s || 'Active').replace(/\s+/g, '');
  function fmtDate(d) { if (!d) return ''; const x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : d); if (isNaN(x)) return String(d); return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtStamp(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return String(d); return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

  async function mcFetch(path, opts = {}) {
    const { data: { session } } = await supa.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const r = await fetch(MC_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  // ── Modal helper ──
  function openModal(html, onReady) { const m = $('modal'); m.innerHTML = html; $('ov').classList.add('open'); if (onReady) onReady(m); const f = m.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 40); }
  function closeModal() { $('ov').classList.remove('open'); $('modal').innerHTML = ''; }
  $('ov').addEventListener('click', (e) => { if (e.target.id === 'ov') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  function confirmDialog(msg, onYes) {
    openModal(`<h3>Please confirm</h3><p style="color:var(--text-muted);font-size:0.9rem;margin:0 0 14px;">${esc(msg)}</p><div class="modal-row"><button class="tbtn" id="cNo">Cancel</button><button class="tbtn tbtn-primary" id="cYes">Confirm</button></div>`);
    $('cNo').onclick = closeModal; $('cYes').onclick = () => { closeModal(); onYes(); };
  }

  // ── List ──
  async function loadList() {
    try {
      const j = await mcFetch('?api=list');
      students = j.rows || []; caps = j.capabilities || caps;
      renderList();
    } catch (e) { $('mcList').innerHTML = `<div class="mc-empty">${esc(e.message)}</div>`; }
  }
  function matchFilter(s) {
    if (query) { const q = query; const hay = `${s.name || ''} ${s.email || ''} ${s.rep || ''}`.toLowerCase(); if (!hay.includes(q)) return false; }
    if (filter === 'all') return true;
    if (filter === 'alerts') return (s.open_alerts_count || 0) > 0;
    if (filter === 'winning') return !!s.winning_student;
    return (s.derived_status || 'Active') === filter;
  }
  function renderList() {
    const rows = students.filter(matchFilter);
    $('mcCount').textContent = rows.length === students.length ? `${students.length}` : `${rows.length} / ${students.length}`;
    if (!rows.length) { $('mcList').innerHTML = `<div class="mc-empty">${students.length ? 'No matches.' : 'No students yet.'}</div>`; return; }
    $('mcList').innerHTML = rows.map(s => {
      const badges = [];
      if (s.open_alerts_count) badges.push(`<span class="mc-mini badge-open" title="Open alerts">⚠ ${s.open_alerts_count}</span>`);
      if (s.turnovers_count) badges.push(`<span class="mc-mini" style="background:var(--blue-bg);color:var(--blue)" title="Turnovers">↪ ${s.turnovers_count}</span>`);
      const sub = [s.masterclass_level || s.level, s.rep ? '· ' + s.rep : ''].filter(Boolean).join(' ');
      return `<div class="mc-row${cur && cur.row.id === s.id ? ' active' : ''}" data-id="${s.id}">
        <div class="mc-av">${esc(initials(s.name))}</div>
        <div class="mc-rowmid"><div class="mc-rowname">${esc(s.name || '(unnamed)')}</div><div class="mc-rowsub">${esc(sub || s.email || '')}</div></div>
        <div class="mc-rowbadges"><span class="st ${stCls(s.derived_status)}">${esc(s.derived_status || 'Active')}</span>${badges.join('')}</div>
      </div>`;
    }).join('');
  }
  $('mcList').addEventListener('click', (e) => { const r = e.target.closest('.mc-row'); if (r) openStudent(Number(r.dataset.id)); });
  $('mcSearch').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
  $('mcChips').addEventListener('click', (e) => { const c = e.target.closest('.mc-chip'); if (!c) return; filter = c.dataset.f; [...$('mcChips').children].forEach(x => x.classList.toggle('active', x === c)); renderList(); });

  // ── Profile ──
  const LEVELS = ['', 'INTRODUCTION', 'LEVEL 1', 'LEVEL 2', 'LEVEL 3', 'LEVEL 4', 'LEVEL 5', 'LEVEL 6', 'LEVEL 7', 'LEVEL 8', 'LEVEL 9', 'LEVEL 10'];
  async function openStudent(id) {
    try { const j = await mcFetch('?api=get&id=' + id); cur = j; caps = j.capabilities || caps; editing = false; renderProfile(); renderList(); }
    catch (e) { toast('Could not load: ' + e.message); }
  }
  function newStudent() { cur = { row: { id: null, status: 'Active' }, turnovers: [], alerts: [], wins: [], notes: [] }; editing = true; renderProfile(); }

  function fld(label, id, val, type = 'text', opts) {
    if (type === 'select') return `<div class="fld"><label>${esc(label)}</label><select id="${id}">${opts.map(o => `<option value="${esc(o)}"${String(val || '') === o ? ' selected' : ''}>${esc(o || '—')}</option>`).join('')}</select></div>`;
    if (type === 'textarea') return `<div class="fld"><label>${esc(label)}</label><textarea id="${id}">${esc(val || '')}</textarea></div>`;
    if (type === 'checkbox') return `<div class="fld fld-row"><input type="checkbox" id="${id}" ${val ? 'checked' : ''} style="width:auto"><label style="margin:0">${esc(label)}</label></div>`;
    return `<div class="fld"><label>${esc(label)}</label><input type="${type}" id="${id}" value="${esc(val == null ? '' : val)}"></div>`;
  }

  function renderProfile() {
    const r = cur.row; const isNew = !r.id;
    $('mcMainEmpty').classList.add('hidden'); const p = $('mcProfile'); p.classList.remove('hidden');
    const canEdit = caps.can_edit;
    const repList = reps.map(x => `<option value="${esc(x.display)}">`).join('');
    const head = `<div class="prof-head">
      <div style="flex:1;min-width:0"><div class="prof-name">${esc(r.name || 'New student')}</div>
        <div class="prof-sub">${isNew ? 'Create a new masterclass student' : `${esc(r.email || '')}${r.rep ? ' · Rep: ' + esc(r.rep) : ''}`}</div></div>
      ${isNew ? '' : `<span class="st ${stCls(r.derived_status)}">${esc(r.derived_status || 'Active')}</span>`}
    </div>`;
    const actions = isNew ? '' : `<div class="prof-actions">
      <button class="pbtn" data-act="turnover">↪ Turn over <span class="n">${cur.turnovers.length}</span></button>
      <button class="pbtn" data-act="alert">⚠ Alert <span class="n">${cur.alerts.length}</span></button>
      <button class="pbtn" data-act="win">★ Win <span class="n">${cur.wins.length}</span></button>
      <button class="pbtn" data-act="note">✎ Note <span class="n">${cur.notes.length}</span></button>
      ${caps.is_admin ? '<button class="pbtn danger" data-act="del">Delete</button>' : ''}
    </div>`;

    const form = `<div class="prof-body">
      <div class="sec"><div class="sec-t">Identity</div>
        ${fld('Name', 'f-name', r.name)}${fld('Email', 'f-email', r.email)}${fld('Phone', 'f-phone', r.phone)}
        <div class="fld"><label>Rep</label><input id="f-rep" list="repList" value="${esc(r.rep || '')}"><datalist id="repList">${repList}</datalist></div>
      </div>
      <div class="sec"><div class="sec-t">Purchase</div>
        ${fld('First purchase', 'f-first_purchase_date', r.first_purchase_date, 'date')}
        ${fld('Last purchase', 'f-last_purchase_date', r.last_purchase_date, 'date')}
        ${fld('Price', 'f-price', r.price, 'number')}
      </div>
      <div class="sec"><div class="sec-t">Course progress</div>
        ${fld('Level', 'f-level', r.level, 'select', LEVELS)}
        ${fld('Masterclass level', 'f-masterclass_level', r.masterclass_level, 'select', LEVELS)}
        ${fld('Current module', 'f-current_module', r.current_module)}
      </div>
      <div class="sec"><div class="sec-t">Admin</div>
        ${fld('Status', 'f-status', r.status || 'Active', 'select', ['Active', 'Completed', 'Refunded'])}
        ${fld('Refunded date', 'f-refunded_date', r.refunded_date, 'date')}
        ${fld('Refunded amount', 'f-refunded_amount', r.refunded_amount, 'number')}
        ${fld('Verified', 'f-verified', r.verified, 'checkbox')}
        ${fld('Dead file', 'f-dead_file', r.dead_file, 'checkbox')}
        ${fld('Winning student', 'f-winning_student', r.winning_student, 'checkbox')}
      </div>
      <div class="sec" style="grid-column:1/-1"><div class="sec-t">Notes (profile)</div>${fld('', 'f-notes', r.notes, 'textarea')}</div>
      ${canEdit ? `<div class="save-row"><button class="tbtn" id="cancelBtn">Cancel</button><button class="tbtn tbtn-primary" id="saveBtn">${isNew ? 'Create student' : 'Save changes'}</button></div>` : ''}
    </div>`;

    const panels = isNew ? '' : renderTurnovers() + renderAlerts() + renderWins() + renderNotes();
    p.innerHTML = head + actions + form + panels;

    p.querySelectorAll('.pbtn').forEach(b => b.addEventListener('click', () => onAction(b.dataset.act)));
    if (canEdit) { const sb = $('saveBtn'); if (sb) sb.onclick = saveProfile; const cb = $('cancelBtn'); if (cb) cb.onclick = () => { if (isNew) { cur = null; p.classList.add('hidden'); $('mcMainEmpty').classList.remove('hidden'); } else openStudent(r.id); }; }
    wirePanels();
  }

  async function saveProfile() {
    const g = (id) => { const el = $(id); if (!el) return undefined; return el.type === 'checkbox' ? el.checked : el.value; };
    const body = { id: cur.row.id || undefined };
    ['name', 'email', 'phone', 'rep', 'first_purchase_date', 'last_purchase_date', 'price', 'level', 'masterclass_level', 'current_module', 'status', 'refunded_date', 'refunded_amount', 'verified', 'dead_file', 'winning_student', 'notes'].forEach(k => { body[k] = g('f-' + k); });
    if (!String(body.name || '').trim()) { toast('Name is required'); return; }
    try {
      const j = await mcFetch('?api=upsert', { method: 'POST', body: JSON.stringify(body) });
      toast('Saved'); await loadList(); openStudent(cur.row.id || j.id);
    } catch (e) { toast('Save failed: ' + e.message); }
  }
  function onAction(act) {
    if (act === 'del') return confirmDialog('Delete this student and all their turnovers/alerts/wins/notes?', async () => { try { await mcFetch('?api=delete', { method: 'POST', body: JSON.stringify({ id: cur.row.id }) }); toast('Deleted'); cur = null; $('mcProfile').classList.add('hidden'); $('mcMainEmpty').classList.remove('hidden'); loadList(); } catch (e) { toast(e.message); } });
    if (act === 'turnover') return turnoverModal();
    if (act === 'alert') return alertModal();
    if (act === 'win') return winModal();
    if (act === 'note') return noteModal();
  }

  // ── Shared bits (MS-CRM parity) ──
  // Inline Response/Resolution picker shown on open turnovers/alerts. kind = 't' | 'a'.
  function answerForm(kind, id) {
    return `<div class="ans" data-kind="${kind}" data-id="${id}">
      <div class="ans-tabs">
        <label class="ans-opt"><input type="radio" name="${kind}mode-${id}" value="response" checked> Response</label>
        <label class="ans-opt"><input type="radio" name="${kind}mode-${id}" value="resolve"> Resolution</label>
      </div>
      <textarea class="ans-note" placeholder="Post an update without resolving…"></textarea>
      <button class="tbtn tbtn-primary ans-btn" data-kind="${kind}" data-id="${id}">↩ Post response</button>
    </div>`;
  }
  function threadHTML(comments) {
    const cs = comments || [];
    if (!cs.length) return '';
    return `<div class="thread-h">Responses (${cs.length})</div>` +
      cs.map(c => `<div class="cmt">${esc(c.body)}<div class="cmt-meta">${esc(c.created_by_name || c.created_by_email || 'someone')} · ${fmtStamp(c.created_at)}</div></div>`).join('');
  }

  // ── Turnovers ──
  function renderTurnovers() {
    const rows = cur.turnovers.map(t => {
      const done = !!(t.result && String(t.result).trim());
      const prog = !done && (t.comments || []).length > 0;
      const badge = done
        ? '<span class="pill-open badge-done">✓ resolved</span>'
        : prog
          ? '<span class="pill-open" style="background:var(--gold-bg);color:var(--gold)">◐ in progress</span>'
          : '<span class="pill-open" style="background:var(--green-bg);color:var(--green)">↪ open</span>';
      const resultBlock = done ? `<div class="result-box">
        <div class="result-h">Result</div>
        <div class="item-body" style="margin:0">${esc(t.result)}</div>
        <div class="cmt-meta" style="margin-top:4px">${t.result_at ? fmtStamp(t.result_at) : ''}${t.result_by_name ? ' · by ' + esc(t.result_by_name) : ''}</div>
        ${caps.can_edit ? `<div style="margin-top:6px"><button class="lnk" data-tact="editresult" data-id="${t.id}">Edit result</button></div>` : ''}
      </div>` : '';
      return `<div class="item" data-tid="${t.id}">
        <div class="item-top"><span class="item-title">→ ${esc(t.rep_name || '(unassigned)')} ${badge}</span><span class="item-meta">${esc(t.created_by_name || '')} · ${fmtDate(t.turnover_date || t.created_at)}</span></div>
        ${t.note ? `<div class="item-body">${esc(t.note)}</div>` : ''}
        ${threadHTML(t.comments)}
        ${resultBlock}
        ${(!done && caps.can_edit) ? answerForm('t', t.id) : ''}
        <div class="item-actions">
          ${caps.can_edit ? `<button class="lnk dim" data-tact="reassign" data-id="${t.id}">⇄ Reassign</button>` : ''}
          ${caps.can_edit ? `<button class="lnk red" data-tact="del" data-id="${t.id}">Delete</button>` : ''}
        </div></div>`;
    }).join('');
    return `<div class="panel"><div class="panel-h"><div class="sec-t">Turn overs (${cur.turnovers.length})</div>${caps.can_edit ? '<button class="lnk" data-add="turnover">+ Add</button>' : ''}</div>${cur.turnovers.length ? rows : '<div class="item-meta" style="padding:4px 2px">No turnovers yet.</div>'}</div>`;
  }
  function turnoverModal() {
    const repOpts = reps.map(x => `<option value="${esc(x.display)}">${esc(x.display)}</option>`).join('');
    openModal(`<h3>Turn over to a rep</h3>
      <div class="fld"><label>Rep</label><select id="tRep"><option value="">Select…</option>${repOpts}</select></div>
      <div class="fld"><label>Note (optional)</label><textarea id="tNote" placeholder="Why are you handing this student over?"></textarea></div>
      <div class="modal-row"><button class="tbtn" onclick="void 0" id="tCancel">Cancel</button><button class="tbtn tbtn-primary" id="tSave">Create turnover</button></div>`);
    $('tCancel').onclick = closeModal;
    $('tSave').onclick = async () => { const rep_name = $('tRep').value.trim(); if (!rep_name) { toast('Pick a rep'); return; } try { await mcFetch('?api=add-turnover', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, rep_name, note: $('tNote').value.trim() || null }) }); closeModal(); toast('Turnover created'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } };
  }

  // ── Alerts ──
  function renderAlerts() {
    // Open first, then resolved by most-recent.
    const sorted = [...cur.alerts].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    const rows = sorted.map(a => {
      const open = a.status === 'open';
      const prog = open && (a.comments || []).length > 0;
      const badge = !open
        ? '<span class="pill-open badge-done">✓ resolved</span>'
        : prog
          ? '<span class="pill-open" style="background:var(--gold-bg);color:var(--gold)">◐ in progress</span>'
          : '<span class="pill-open" style="background:var(--red-bg);color:var(--red)">⚠ submitted</span>';
      const resBlock = !open ? `<div class="result-box">
        <div class="result-h">Resolution</div>
        <div class="item-body" style="margin:0">${esc(a.resolution_note || '')}</div>
        <div class="cmt-meta" style="margin-top:4px">${a.resolved_at ? fmtStamp(a.resolved_at) : ''}${a.resolved_by_name ? ' · by ' + esc(a.resolved_by_name) : ''}</div>
      </div>` : '';
      return `<div class="item" data-aid="${a.id}">
        <div class="item-top"><span class="item-title">${esc(a.title)} ${badge}</span><span class="item-meta">${esc(a.created_by_name || '')} · ${fmtDate(a.created_at)}</span></div>
        ${a.description ? `<div class="item-body">${esc(a.description)}</div>` : ''}
        ${threadHTML(a.comments)}
        ${resBlock}
        ${(open && caps.can_edit) ? answerForm('a', a.id) : ''}
        <div class="item-actions">${caps.can_edit ? `<button class="lnk red" data-aact="del" data-id="${a.id}">Delete</button>` : ''}</div>
      </div>`;
    }).join('');
    const openCount = cur.alerts.filter(a => a.status === 'open').length;
    return `<div class="panel"><div class="panel-h"><div class="sec-t">Alerts (${openCount} open · ${cur.alerts.length - openCount} resolved)</div>${caps.can_edit ? '<button class="lnk" data-add="alert">+ Add</button>' : ''}</div>${cur.alerts.length ? rows : '<div class="item-meta" style="padding:4px 2px">No alerts yet.</div>'}</div>`;
  }
  function alertModal() {
    openModal(`<h3>Raise an alert</h3>
      <div class="fld"><label>Title</label><input id="aTitle" placeholder="Short summary"></div>
      <div class="fld"><label>Details (optional)</label><textarea id="aDesc"></textarea></div>
      <div class="modal-row"><button class="tbtn" id="aCancel">Cancel</button><button class="tbtn tbtn-primary" id="aSave">Raise alert</button></div>`);
    $('aCancel').onclick = closeModal;
    $('aSave').onclick = async () => { const title = $('aTitle').value.trim(); if (!title) { toast('Title required'); return; } try { await mcFetch('?api=add-alert', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, title, description: $('aDesc').value.trim() || null }) }); closeModal(); toast('Alert raised'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } };
  }

  // ── Wins ──
  function renderWins() {
    const rows = cur.wins.map(w => `<div class="item"><div class="item-top"><span class="item-body" style="margin:0">${esc(w.text)}</span><span class="item-meta">${fmtDate(w.win_date || w.created_at)}</span></div>${caps.can_edit ? `<div class="item-actions"><button class="lnk red" data-wact="del" data-id="${w.id}">Delete</button></div>` : ''}</div>`).join('');
    return `<div class="panel"><div class="panel-h"><div class="sec-t">Wins (${cur.wins.length})</div>${caps.can_edit ? '<button class="lnk" data-add="win">+ Add</button>' : ''}</div>${cur.wins.length ? rows : '<div class="item-meta" style="padding:4px 2px">No wins yet.</div>'}</div>`;
  }
  function winModal() {
    openModal(`<h3>Log a win</h3><div class="fld"><label>What happened?</label><textarea id="wText"></textarea></div><div class="fld"><label>Date</label><input type="date" id="wDate"></div><div class="modal-row"><button class="tbtn" id="wCancel">Cancel</button><button class="tbtn tbtn-primary" id="wSave">Add win</button></div>`);
    $('wCancel').onclick = closeModal;
    $('wSave').onclick = async () => { const text = $('wText').value.trim(); if (!text) { toast('Enter the win'); return; } try { await mcFetch('?api=add-win', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, text, win_date: $('wDate').value || null }) }); closeModal(); toast('Win logged'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } };
  }

  // ── Notes ──
  function renderNotes() {
    const rows = cur.notes.map(n => `<div class="item"><div class="item-top"><span class="item-body" style="margin:0">${esc(n.text)}</span><span class="item-meta">${esc(n.created_by_name || n.created_by_email || '')} · ${fmtDate(n.note_date || n.created_at)}</span></div>${caps.can_edit ? `<div class="item-actions"><button class="lnk red" data-nact="del" data-id="${n.id}">Delete</button></div>` : ''}</div>`).join('');
    return `<div class="panel"><div class="panel-h"><div class="sec-t">Notes (${cur.notes.length})</div>${caps.can_edit ? '<button class="lnk" data-add="note">+ Add</button>' : ''}</div>${cur.notes.length ? rows : '<div class="item-meta" style="padding:4px 2px">No notes yet.</div>'}</div>`;
  }
  function noteModal() {
    openModal(`<h3>Add a note</h3><div class="fld"><label>Note</label><textarea id="nText"></textarea></div><div class="modal-row"><button class="tbtn" id="nCancel">Cancel</button><button class="tbtn tbtn-primary" id="nSave">Add note</button></div>`);
    $('nCancel').onclick = closeModal;
    $('nSave').onclick = async () => { const text = $('nText').value.trim(); if (!text) return; try { await mcFetch('?api=add-note', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, text }) }); closeModal(); toast('Note added'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } };
  }

  // Reassign a turnover to another rep — typeahead defaulting to the student's rep.
  function reassignModal(t) {
    const repList = reps.map(x => `<option value="${esc(x.display)}">`).join('');
    openModal(`<h3>Reassign turnover</h3>
      <p style="color:var(--text-muted);font-size:0.82rem;margin:0 0 12px">Currently with <b>${esc(t.rep_name || '(unassigned)')}</b>. Hand it to another rep — they'll be notified and it moves to their queue.</p>
      <div class="fld"><label>New rep *</label><input id="raRep" list="raRepList" placeholder="Pick or type a rep name" autocomplete="off"><datalist id="raRepList">${repList}</datalist></div>
      <div class="modal-row"><button class="tbtn" id="raCancel">Cancel</button><button class="tbtn tbtn-primary" id="raSave">Reassign</button></div>`);
    const inp = $('raRep');
    const sRep = (cur.row.rep || '').trim();
    if (sRep && sRep.toLowerCase() !== String(t.rep_name || '').trim().toLowerCase()) inp.value = sRep;
    $('raCancel').onclick = closeModal;
    $('raSave').onclick = async () => {
      const rep_name = inp.value.trim();
      if (!rep_name) { toast('Pick a rep'); return; }
      if (rep_name.toLowerCase() === String(t.rep_name || '').trim().toLowerCase()) { toast('Already assigned to ' + rep_name); return; }
      try { await mcFetch('?api=reassign-turnover', { method: 'POST', body: JSON.stringify({ id: t.id, rep_name }) }); closeModal(); toast('Reassigned'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); }
    };
  }
  function editResultModal(t) {
    openModal(`<h3>Edit turnover result</h3>
      <div class="fld"><label>Result</label><textarea id="erText" rows="5">${esc(t.result || '')}</textarea></div>
      <div class="modal-row"><button class="tbtn" id="erClear" style="margin-right:auto;color:var(--red)">Clear result</button><button class="tbtn" id="erCancel">Cancel</button><button class="tbtn tbtn-primary" id="erSave">Save result</button></div>`);
    $('erCancel').onclick = closeModal;
    $('erClear').onclick = () => confirmDialog('Clear this turnover result (reopens it)?', async () => { try { await mcFetch('?api=set-turnover-result', { method: 'POST', body: JSON.stringify({ id: t.id, result: '' }) }); toast('Result cleared'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } });
    $('erSave').onclick = async () => { const result = $('erText').value.trim(); if (!result) { toast('Enter a result, or use Clear result'); return; } try { await mcFetch('?api=set-turnover-result', { method: 'POST', body: JSON.stringify({ id: t.id, result }) }); closeModal(); toast('Result saved'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } };
  }
  // Single submit for the inline Response/Resolution picker. Resolution closes the
  // item (result / resolution note required); Response posts an in-progress update.
  async function submitAnswer(kind, id, btn) {
    const wrap = btn.closest('.ans'); if (!wrap) return;
    const mode = (wrap.querySelector(`input[name="${kind}mode-${id}"]:checked`) || {}).value || 'response';
    const text = (wrap.querySelector('.ans-note').value || '').trim();
    if (!text) { toast(mode === 'resolve' ? (kind === 'a' ? 'A resolution note is required' : 'A result is required') : 'Write a response first'); return; }
    const orig = btn.textContent; btn.disabled = true; btn.textContent = mode === 'resolve' ? 'Resolving…' : 'Posting…';
    try {
      if (kind === 't') {
        if (mode === 'resolve') await mcFetch('?api=set-turnover-result', { method: 'POST', body: JSON.stringify({ id, result: text }) });
        else await mcFetch('?api=add-turnover-comment', { method: 'POST', body: JSON.stringify({ turnoverId: id, body: text }) });
      } else {
        if (mode === 'resolve') await mcFetch('?api=resolve-alert', { method: 'POST', body: JSON.stringify({ id, resolution_note: text }) });
        else await mcFetch('?api=add-alert-comment', { method: 'POST', body: JSON.stringify({ alertId: id, body: text }) });
      }
      toast(mode === 'resolve' ? 'Resolved' : 'Response posted');
      await openStudent(cur.row.id); await loadList();
    } catch (e) { btn.disabled = false; btn.textContent = orig; toast(e.message); }
  }

  // ── Panel action wiring (delegated) ──
  function wirePanels() {
    const p = $('mcProfile');
    p.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => onAction(b.dataset.add)));
    // Response/Resolution picker: swap placeholder + button label on mode change.
    p.querySelectorAll('.ans input[type="radio"]').forEach(r => r.addEventListener('change', () => {
      const wrap = r.closest('.ans'); const kind = wrap.dataset.kind;
      const mode = (wrap.querySelector('input:checked') || {}).value || 'response';
      const ta = wrap.querySelector('.ans-note'); const btn = wrap.querySelector('.ans-btn');
      if (mode === 'resolve') { ta.placeholder = kind === 'a' ? 'Explain how this was resolved (required)…' : 'Describe the outcome / result (required)…'; btn.textContent = '✓ Resolve'; }
      else { ta.placeholder = 'Post an update without resolving…'; btn.textContent = '↩ Post response'; }
    }));
    p.querySelectorAll('.ans-btn').forEach(b => b.addEventListener('click', () => submitAnswer(b.dataset.kind, Number(b.dataset.id), b)));
    // Turnover item actions
    p.querySelectorAll('[data-tact]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id); const act = b.dataset.tact;
      const t = cur.turnovers.find(x => Number(x.id) === id);
      if (act === 'del') return confirmDialog('Delete this turnover?', async () => { try { await mcFetch('?api=delete-turnover', { method: 'POST', body: JSON.stringify({ id }) }); toast('Deleted'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } });
      if (act === 'reassign' && t) return reassignModal(t);
      if (act === 'editresult' && t) return editResultModal(t);
    }));
    // Alert item actions
    p.querySelectorAll('[data-aact]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id); const act = b.dataset.aact;
      if (act === 'del') return confirmDialog('Delete this alert?', async () => { try { await mcFetch('?api=delete-alert', { method: 'POST', body: JSON.stringify({ id }) }); toast('Deleted'); openStudent(cur.row.id); loadList(); } catch (e) { toast(e.message); } });
    }));
    p.querySelectorAll('[data-wact]').forEach(b => b.addEventListener('click', () => confirmDialog('Delete this win?', async () => { await mcFetch('?api=delete-win', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.id) }) }); openStudent(cur.row.id); loadList(); })));
    p.querySelectorAll('[data-nact]').forEach(b => b.addEventListener('click', () => confirmDialog('Delete this note?', async () => { await mcFetch('?api=delete-note', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.id) }) }); openStudent(cur.row.id); loadList(); })));
  }

  // ── Top bar wiring ──
  $('refreshBtn').addEventListener('click', () => { loadList(); if (cur && cur.row.id) openStudent(cur.row.id); });
  $('newBtn').addEventListener('click', newStudent);
  $('signOutBtn').addEventListener('click', async () => { try { await supa.auth.signOut(); } catch (_) {} location.href = 'index.html'; });

  // ── Init ──
  (async function init() {
    const { data: { session } } = await supa.auth.getSession();
    if (session?.user) { const em = session.user.email || ''; $('userEmail').textContent = em; $('userAvatar').textContent = (em[0] || 'U').toUpperCase(); window.__RIDLEY_USER = session.user; }
    try { const j = await mcFetch('?api=reps'); reps = j.reps || []; } catch (_) {}
    await loadList();
    const params = new URLSearchParams(location.search);
    const openId = Number(params.get('id') || 0);
    if (openId) openStudent(openId);
  })();
})();
