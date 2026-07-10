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
  const advFilters = { rep: '', level: '', repStatus: '', verified: false, recent: false, wins: false, tag: '', source: '', sms: '', inactive: '', sort: 'name', joinedFrom: '', joinedTo: '' };
  let view = 'all';          // quick-filter bar: all | mine | stale | duplicates
  let overviewMode = false;
  // Rep Area (contacts + rep status). repDataMap: student_id -> { status, status_at, last_contact_date, recently_contacted }
  let repDataMap = {};
  let repStatusOptions = ['Hot', 'Warm', 'Cold', 'Qualified', 'Not qualified', 'Needs help', 'Do not contact'];
  const REP_STATUS_COLORS = {
    'Hot': { bg: 'rgba(248,113,113,0.18)', fg: '#f87171' },
    'Warm': { bg: 'rgba(251,146,60,0.18)', fg: '#fb923c' },
    'Cold': { bg: 'rgba(96,165,250,0.18)', fg: '#60a5fa' },
    'Qualified': { bg: 'rgba(52,211,153,0.18)', fg: '#34d399' },
    'Not qualified': { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
    'Needs help': { bg: 'rgba(167,139,250,0.20)', fg: '#a78bfa' },
    'Do not contact': { bg: 'rgba(248,113,113,0.28)', fg: '#fca5a5' },
  };

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

  // ── List (server-side paginated: search + status + filters computed in the fn) ──
  const PAGE = 100;
  let listTotal = 0, listOffset = 0, listLoading = false;
  function listParams() {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (filter && filter !== 'all') p.set('status', filter);
    if (advFilters.rep) p.set('rep', advFilters.rep);
    if (advFilters.level) p.set('level', advFilters.level);
    if (advFilters.verified) p.set('verified', '1');
    if (advFilters.wins) p.set('has_wins', '1');
    if (advFilters.repStatus) p.set('rep_status', advFilters.repStatus);
    if (advFilters.recent) p.set('recent', '1');
    if (advFilters.tag) p.set('tag', advFilters.tag);
    if (advFilters.source) p.set('source', advFilters.source);
    if (advFilters.sms) p.set('sms', advFilters.sms);
    if (advFilters.inactive) p.set('inactive_days', advFilters.inactive);
    if (advFilters.sort && advFilters.sort !== 'name') p.set('sort', advFilters.sort);
    if (advFilters.joinedFrom) p.set('joined_from', advFilters.joinedFrom);
    if (advFilters.joinedTo) p.set('joined_to', advFilters.joinedTo);
    if (view && view !== 'all') p.set('view', view);
    return p;
  }
  async function loadList(reset = true) {
    if (listLoading) return;
    listLoading = true;
    if (reset) { listOffset = 0; students = []; }
    const p = listParams(); p.set('limit', String(PAGE)); p.set('offset', String(listOffset));
    try {
      const j = await mcFetch('?api=list&' + p.toString());
      caps = j.capabilities || caps; listTotal = j.total || 0;
      students = reset ? (j.rows || []) : students.concat(j.rows || []);
      listOffset = students.length;
      renderList();
    } catch (e) { $('mcList').innerHTML = `<div class="mc-empty">${esc(e.message)}</div>`; }
    finally { listLoading = false; }
  }
  // Populate filter dropdowns (reps ∪ distinct student reps; levels; rep statuses).
  function fillFilterOptions() {
    const repSel = $('afRep'); if (repSel) {
      const set = new Set(); (reps || []).forEach(r => r.display && set.add(r.display));
      const cur = repSel.value; repSel.innerHTML = '<option value="">Any rep</option>' + [...set].sort((a, b) => a.localeCompare(b)).map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join(''); repSel.value = cur;
    }
    const lvlSel = $('afLevel'); if (lvlSel && lvlSel.options.length <= 1) lvlSel.innerHTML = '<option value="">Any level</option>' + LEVELS.filter(Boolean).map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    const stSel = $('afRepStatus'); if (stSel && stSel.options.length <= 1) stSel.innerHTML = '<option value="">Any rep status</option>' + repStatusOptions.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    // Tag suggestions from the tags seen on the loaded page (typeahead; any tag still allowed).
    const tagList = $('afTagList'); if (tagList) { const set = new Set(); students.forEach(s => (s.tags || []).forEach(t => set.add(t))); tagList.innerHTML = [...set].sort((a, b) => a.localeCompare(b)).map(t => `<option value="${esc(t)}">`).join(''); }
  }
  function updateFilterCount() {
    const n = (advFilters.rep ? 1 : 0) + (advFilters.level ? 1 : 0) + (advFilters.repStatus ? 1 : 0) + (advFilters.verified ? 1 : 0) + (advFilters.recent ? 1 : 0) + (advFilters.wins ? 1 : 0) + (advFilters.tag ? 1 : 0) + (advFilters.source ? 1 : 0) + (advFilters.sms ? 1 : 0) + (advFilters.inactive ? 1 : 0);
    const el = $('mcFilterCount'); if (el) { el.textContent = String(n); el.style.display = n ? '' : 'none'; }
    refreshFilterToggle();
  }
  // The Filters pill reads "active" (green) when the panel is open OR filters are applied.
  function refreshFilterToggle() {
    const btn = $('mcFilterToggle'); if (!btn) return;
    const open = !$('mcFilters').classList.contains('hidden');
    const has = (parseInt($('mcFilterCount')?.textContent || '0', 10) || 0) > 0;
    btn.classList.toggle('active', open || has);
  }
  // Active-filters bar: a removable chip per applied filter.
  function renderActiveBar() {
    const bar = $('mcActiveBar'); if (!bar) return;
    const chips = [];
    const add = (key, label) => chips.push(`<span class="afchip">${esc(label)}<button data-clear="${key}" title="Remove">×</button></span>`);
    if (query) add('query', `“${query}”`);
    if (filter && filter !== 'all') add('filter', filter === 'alerts' ? 'Has alerts' : filter === 'winning' ? 'Winning' : filter);
    if (advFilters.rep) add('rep', 'Rep: ' + advFilters.rep);
    if (advFilters.level) add('level', 'Level: ' + advFilters.level);
    if (advFilters.repStatus) add('repStatus', 'Rep status: ' + advFilters.repStatus);
    if (advFilters.tag) add('tag', 'Tag: ' + advFilters.tag);
    if (advFilters.source) add('source', 'Source: ' + advFilters.source);
    if (advFilters.sms) add('sms', advFilters.sms === '1' ? 'SMS opted-in' : 'SMS not opted-in');
    if (advFilters.inactive) add('inactive', 'Inactive ' + advFilters.inactive + 'd+');
    if (advFilters.verified) add('verified', 'Verified');
    if (advFilters.recent) add('recent', 'Contacted ≤7d');
    if (advFilters.wins) add('wins', 'Has wins');
    if (advFilters.joinedFrom || advFilters.joinedTo) add('joined', 'Joined ' + (advFilters.joinedFrom || '…') + '–' + (advFilters.joinedTo || '…'));
    bar.innerHTML = chips.length ? chips.join('') + '<button class="afchip" data-clear="__all" style="cursor:pointer">Clear all</button>' : '';
    bar.classList.toggle('hidden', !chips.length);
  }
  function clearFilter(key) {
    if (key === 'query') { query = ''; $('mcSearch').value = ''; }
    else if (key === 'filter') { filter = 'all'; [...$('mcChips').children].forEach(x => x.classList.toggle('active', x.dataset.f === 'all')); }
    else if (key === 'joined') { advFilters.joinedFrom = ''; advFilters.joinedTo = ''; $('afJoinedFrom').value = ''; $('afJoinedTo').value = ''; }
    else if (key === '__all') {
      query = ''; $('mcSearch').value = ''; filter = 'all'; [...$('mcChips').children].forEach(x => x.classList.toggle('active', x.dataset.f === 'all'));
      Object.assign(advFilters, { rep: '', level: '', repStatus: '', verified: false, recent: false, wins: false, tag: '', source: '', sms: '', inactive: '', joinedFrom: '', joinedTo: '' });
      ['afRep', 'afLevel', 'afRepStatus', 'afTag', 'afSource', 'afJoinedFrom', 'afJoinedTo'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      $('afSms').value = ''; $('afInactive').value = '';
      ['afVerified', 'afRecent', 'afWins'].forEach(id => { $(id).checked = false; });
    } else {
      advFilters[key] = (key === 'verified' || key === 'recent' || key === 'wins') ? false : '';
      const ctl = { rep: 'afRep', level: 'afLevel', repStatus: 'afRepStatus', tag: 'afTag', source: 'afSource', sms: 'afSms', inactive: 'afInactive', verified: 'afVerified', recent: 'afRecent', wins: 'afWins' }[key];
      const el = ctl && $(ctl); if (el) { if (el.type === 'checkbox') el.checked = false; else el.value = ''; }
    }
    updateFilterCount(); loadList(true);
  }
  // ── Overview pane (aggregate health snapshot) ──
  function toggleOverview(on) {
    overviewMode = on;
    $('mcOverviewBtn').classList.toggle('active', on);
    $('mcList').classList.toggle('hidden', on);
    $('mcOverview').classList.toggle('hidden', !on);
    $('mcLoadMore').classList.add('hidden');
    if (on) loadOverview();
  }
  async function loadOverview() {
    const box = $('mcOverview'); box.innerHTML = '<div class="mc-empty">Loading…</div>';
    try {
      const j = await mcFetch('?api=overview');
      const card = (n, l, view) => `<div class="ov-card${view ? ' ov-clk' : ''}"${view ? ` data-view="${view}"` : ''}><div class="n">${(n || 0).toLocaleString()}</div><div class="l">${esc(l)}</div></div>`;
      const reps = (j.top_reps || []).map(r => `<div class="ov-reprow" data-rep="${esc(r.rep)}"><span>${esc(r.rep)}</span><span>${r.n}</span></div>`).join('') || '<div class="item-meta">No reps assigned yet.</div>';
      box.innerHTML = `<div class="ov-grid">
          ${card(j.active_week, 'Active Masterclass students (this week)', 'active')}${card(j.started_week, 'New Starters (this week)', 'starters')}
          ${card(j.starters_total, 'Masterclass Starters (tracked)', 'starters')}${card(j.total, 'Total students')}
          ${card(j.active, 'Active (status)')}${card(j.completed, 'Completed')}
          ${card(j.refunded, 'Refunded')}${card(j.dead_file, 'Dead file')}
          ${card(j.no_rep, 'No rep assigned')}${card(j.inactive_90, 'Inactive 90d+')}
          ${card(j.open_alerts, 'Open alerts')}${card(j.verified, 'Verified')}
          ${card(j.winning, 'Winning')}
        </div>
        <div class="item-meta" style="margin:2px 2px 8px">Week = current Thu–Wed period${j.week_start ? ' (from ' + esc(j.week_start) + ')' : ''}. Starters are tracked from first activity seen going forward.</div>
        <div class="sec-t" style="margin:4px 2px 6px">Weekly history</div>
        <div id="ovHistory" class="item-meta" style="margin:0 2px 12px">Loading…</div>
        <div class="sec-t" style="margin:4px 2px 6px">Students per rep (click to filter)</div>${reps}`;
      box.querySelectorAll('.ov-card.ov-clk').forEach(c => c.addEventListener('click', () => {
        const v = c.dataset.view; view = v;
        [...document.querySelectorAll('.mc-qf[data-view]')].forEach(x => x.classList.toggle('active', x.dataset.view === v));
        toggleOverview(false); loadList(true);
      }));
      box.querySelectorAll('.ov-reprow').forEach(r => r.addEventListener('click', () => {
        toggleOverview(false); advFilters.rep = r.dataset.rep; const el = $('afRep'); if (el) el.value = r.dataset.rep; updateFilterCount(); loadList(true);
      }));
      loadStatsHistory();
    } catch (e) { box.innerHTML = `<div class="mc-empty" style="color:var(--red)">${esc(e.message)}</div>`; }
  }
  // Retained weekly stats history (one row per Thu–Wed week, snapshotted on each import + daily).
  async function loadStatsHistory() {
    const el = $('ovHistory'); if (!el) return;
    try {
      const j = await mcFetch('?api=stats-history&limit=52');
      const rows = j.rows || [];
      if (!rows.length) { el.innerHTML = 'No weekly snapshots yet — they accrue from this week forward (one per week).'; return; }
      const fmtWk = (d) => { const s = String(d).slice(0, 10); const dt = new Date(s + 'T00:00:00Z'); return isNaN(dt) ? s : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
      el.innerHTML = `<div style="overflow:auto;border:1px solid var(--border);border-radius:8px">
        <table class="ov-hist"><thead><tr>
          <th>Week of</th><th>Active</th><th>New starters</th><th>Starters (total)</th><th>Total</th><th>No rep</th><th>Inactive 90d+</th>
        </tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td>${esc(fmtWk(r.week_start))}</td>
          <td>${(r.active||0).toLocaleString()}</td>
          <td>${(r.new_starters||0).toLocaleString()}</td>
          <td>${(r.starters_total||0).toLocaleString()}</td>
          <td>${(r.total||0).toLocaleString()}</td>
          <td>${(r.no_rep||0).toLocaleString()}</td>
          <td>${(r.inactive_90||0).toLocaleString()}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    } catch (e) { el.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
  }

  function renderList() {
    renderActiveBar();
    const gqb = $('gqBulk'); if (gqb) gqb.classList.toggle('hidden', !caps.can_edit);
    const gqi = $('gqImport'); if (gqi) gqi.classList.toggle('hidden', !caps.can_edit);
    const rows = students;
    $('mcCount').textContent = rows.length < listTotal ? `${rows.length} / ${listTotal}` : `${listTotal}`;
    const lm = $('mcLoadMore'); if (lm) lm.classList.toggle('hidden', rows.length >= listTotal);
    if (!rows.length) { $('mcList').innerHTML = `<div class="mc-empty">No matches.</div>`; return; }
    $('mcList').innerHTML = rows.map(s => {
      const badges = [];
      const rd = repDataMap[s.id];
      if (rd && rd.status) { const c = REP_STATUS_COLORS[rd.status] || { bg: 'var(--surface3)', fg: 'var(--text)' }; badges.push(`<span class="mc-mini" style="background:${c.bg};color:${c.fg}" title="Rep status: ${esc(rd.status)}">${esc(rd.status)}</span>`); }
      if (rd && rd.recently_contacted) badges.push(`<span class="mc-mini" style="background:var(--blue-bg);color:var(--blue)" title="Contacted in the last 7 days">✆ 7d</span>`);
      if (s.open_alerts_count) badges.push(`<span class="mc-mini badge-open" title="Open alerts">⚠ ${s.open_alerts_count}</span>`);
      if (s.turnovers_count) badges.push(`<span class="mc-mini" style="background:var(--blue-bg);color:var(--blue)" title="Turnovers">↪ ${s.turnovers_count}</span>`);
      if (s.last_activity_at) { const days = Math.floor((Date.now() - new Date(s.last_activity_at).getTime()) / 86400000); if (days >= 90) badges.push(`<span class="mc-mini" style="background:var(--red-bg);color:var(--red)" title="Last active ${esc(fmtDate(s.last_activity_at))}">inactive ${days}d</span>`); }
      const sub = [s.masterclass_level || s.level, s.rep ? '· ' + s.rep : ''].filter(Boolean).join(' ');
      return `<div class="mc-row${cur && cur.row.id === s.id ? ' active' : ''}" data-id="${s.id}">
        <div class="mc-av">${esc(initials(s.name))}</div>
        <div class="mc-rowmid"><div class="mc-rowname">${esc(s.name || '(unnamed)')}</div><div class="mc-rowsub">${esc(sub || s.email || '')}</div></div>
        <div class="mc-rowbadges">${(s.derived_status && s.derived_status !== 'Active') ? `<span class="st ${stCls(s.derived_status)}">${esc(s.derived_status)}</span>` : ''}${badges.join('')}</div>
      </div>`;
    }).join('');
  }
  $('mcList').addEventListener('click', (e) => { const r = e.target.closest('.mc-row'); if (r) openStudent(Number(r.dataset.id)); });
  let _searchT;
  $('mcSearch').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); clearTimeout(_searchT); _searchT = setTimeout(() => loadList(true), 300); });
  $('mcChips').addEventListener('click', (e) => { const c = e.target.closest('.mc-chip'); if (!c) return; filter = c.dataset.f; [...$('mcChips').children].forEach(x => x.classList.toggle('active', x === c)); loadList(true); });
  const lmBtn = $('mcLoadMore'); if (lmBtn) lmBtn.addEventListener('click', () => loadList(false));
  // Advanced filter panel
  $('mcFilterToggle').addEventListener('click', () => { $('mcFilters').classList.toggle('hidden'); refreshFilterToggle(); });
  const _afApply = () => {
    advFilters.rep = $('afRep').value; advFilters.level = $('afLevel').value; advFilters.repStatus = $('afRepStatus').value;
    advFilters.verified = $('afVerified').checked; advFilters.recent = $('afRecent').checked; advFilters.wins = $('afWins').checked;
    advFilters.tag = $('afTag').value.trim(); advFilters.source = $('afSource').value.trim();
    advFilters.sms = $('afSms').value; advFilters.inactive = $('afInactive').value; advFilters.sort = $('afSort').value;
    advFilters.joinedFrom = $('afJoinedFrom').value; advFilters.joinedTo = $('afJoinedTo').value;
    updateFilterCount(); loadList(true);
  };
  ['afRep', 'afLevel', 'afRepStatus', 'afSms', 'afInactive', 'afSort', 'afJoinedFrom', 'afJoinedTo'].forEach(id => $(id).addEventListener('change', _afApply));
  // Quick-filter bar (All/Mine/Stale/Duplicates)
  $('mcQuickBar').addEventListener('click', (e) => { const b = e.target.closest('.mc-qf[data-view]'); if (!b) return; view = b.dataset.view; [...document.querySelectorAll('.mc-qf[data-view]')].forEach(x => x.classList.toggle('active', x === b)); if (overviewMode) toggleOverview(false); loadList(true); });
  $('mcOverviewBtn').addEventListener('click', () => toggleOverview(!overviewMode));
  $('mcActiveBar').addEventListener('click', (e) => { const b = e.target.closest('[data-clear]'); if (b) clearFilter(b.dataset.clear); });
  ['afVerified', 'afRecent', 'afWins'].forEach(id => $(id).addEventListener('change', _afApply));
  let _afT; ['afTag', 'afSource'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(_afT); _afT = setTimeout(_afApply, 350); }));
  $('afClear').addEventListener('click', () => {
    ['afRep', 'afLevel', 'afRepStatus', 'afTag', 'afSource', 'afJoinedFrom', 'afJoinedTo'].forEach(id => { $(id).value = ''; });
    $('afSms').value = ''; $('afInactive').value = ''; $('afSort').value = 'name';
    ['afVerified', 'afRecent', 'afWins'].forEach(id => { $(id).checked = false; });
    _afApply();
  });

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
  // Multi-value field (email / phone): first value → the primary column, extras →
  // metadata[metaKey]. First non-empty is the primary used by dedup / notifications.
  function multiRow(type, v) { return `<div class="multi-row"><input class="multi-input" type="${type}" value="${esc(v == null ? '' : v)}"><button type="button" class="multi-del" title="Remove">×</button></div>`; }
  function multiField(label, key, metaKey, type, primary, alts) {
    const seen = new Set(); const vals = [];
    [primary, ...(Array.isArray(alts) ? alts : [])].forEach(v => { const t = (v == null ? '' : String(v)).trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); vals.push(t); } });
    if (!vals.length) vals.push('');
    return `<div class="fld full"><label>${esc(label)}</label><div class="multi" data-key="${key}" data-meta="${metaKey}">${vals.map(v => multiRow(type, v)).join('')}<button type="button" class="lnk multi-add">+ Add ${esc(label.toLowerCase())}</button></div></div>`;
  }

  // Read-only display helpers for imported (Kajabi) data.
  function roField(label, val) { const v = (val == null || val === '') ? '—' : String(val); return `<div class="fld"><label>${esc(label)}</label><div class="ro">${esc(v)}</div></div>`; }
  function roFull(label, val) { const v = (val == null || val === '') ? '—' : String(val); return `<div class="fld full"><label>${esc(label)}</label><div class="ro">${esc(v)}</div></div>`; }
  function chipsField(label, arr) { const a = Array.isArray(arr) ? arr : []; const inner = a.length ? a.map(x => `<span class="kchip">${esc(x)}</span>`).join('') : '<span class="item-meta">—</span>'; return `<div class="fld full"><label>${esc(label)} (${a.length})</label><div class="kchips">${inner}</div></div>`; }
  function tagChip(t) { return `<span class="kchip tag-chip" data-tag="${esc(t)}">${esc(t)}<button type="button" class="tag-x" title="Remove">×</button></span>`; }
  function tagEditor(tags, canEdit) {
    const chips = (Array.isArray(tags) ? tags : []).map(tagChip).join('');
    return `<div class="fld full"><label>Tags (${(tags || []).length})</label><div class="tag-edit" id="tagEdit">${chips}${canEdit ? '<input class="tag-input" id="tagInput" placeholder="+ add tag, Enter">' : ''}</div></div>`;
  }

  function activityLogHTML() {
    const acts = cur.activity || [];
    const rows = acts.map(a => `<div class="item"><div class="item-top"><span class="item-title" style="font-size:0.86rem">${esc(a.kind || 'Activity')} · ${esc(fmtDate(a.activity_date))}</span><span class="item-meta">${esc(a.created_by_name || a.created_by_email || '')}</span></div>${a.note ? `<div class="item-body">${esc(a.note)}</div>` : ''}${caps.can_edit ? `<div class="item-actions"><button class="lnk red" data-actdel="${a.id}">Delete</button></div>` : ''}</div>`).join('');
    return `<div class="full">${caps.can_edit ? '<button class="tbtn" id="actAdd" style="margin-bottom:8px">+ Log activity</button>' : ''}${acts.length ? rows : '<div class="item-meta" style="padding:2px">No activity logged yet. Imported last sign-in / activity is shown in Engagement above.</div>'}</div>`;
  }
  function activityModal() {
    const today = new Date().toISOString().slice(0, 10);
    openModal(`<h3>Log activity</h3>
      <div class="fld"><label>Type</label><select id="acKind"><option>Sign-in</option><option>Activity</option><option>Other</option></select></div>
      <div class="fld"><label>Date</label><input type="date" id="acDate" value="${today}"></div>
      <div class="fld"><label>Note (optional)</label><textarea id="acNote" placeholder="What happened?"></textarea></div>
      <div class="modal-row"><button class="tbtn" id="acCancel">Cancel</button><button class="tbtn tbtn-primary" id="acSave">Log</button></div>`);
    $('acCancel').onclick = closeModal;
    $('acSave').onclick = async () => { try { await mcFetch('?api=add-activity', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, kind: $('acKind').value, activity_date: $('acDate').value || null, note: $('acNote').value || '' }) }); closeModal(); toast('Activity logged'); await openStudent(cur.row.id); } catch (e) { toast(e.message); } };
  }

  function renderProfile() {
    const r = cur.row; const isNew = !r.id;
    $('mcMainEmpty').classList.add('hidden'); const p = $('mcProfile'); p.classList.remove('hidden');
    const canEdit = caps.can_edit;
    // Last sign-in / activity = latest log entry of that kind, else the imported column.
    const acts = cur.activity || [];
    const lastOf = (k) => { const e = acts.find(a => a.kind === k); return e ? e.activity_date : null; };
    const lastSignIn = lastOf('Sign-in') || (r.last_sign_in_at ? String(r.last_sign_in_at).slice(0, 10) : null);
    const lastActivity = lastOf('Activity') || (r.last_activity_at ? String(r.last_activity_at).slice(0, 10) : null);
    const repList = reps.map(x => `<option value="${esc(x.display)}">`).join('');
    const head = `<div class="prof-head">
      <div style="flex:1;min-width:0"><div class="prof-name">${esc(r.name || 'New student')}</div>
        <div class="prof-sub">${isNew ? 'Create a new masterclass student' : `${esc(r.email || '')}${r.rep ? ' · Rep: ' + esc(r.rep) : ''}`}</div></div>
      ${(!isNew && r.derived_status && r.derived_status !== 'Active') ? `<span class="st ${stCls(r.derived_status)}">${esc(r.derived_status)}</span>` : ''}
    </div>`;
    const openAlerts = cur.alerts.filter(a => a.status === 'open').length;
    const actions = isNew ? '' : `<div class="prof-actions">
      <button class="pbtn" data-act="turnover">↪ Turn-overs <span class="n">${cur.turnovers.length}</span></button>
      <button class="pbtn" data-act="alert">⚠ Alerts <span class="n">${openAlerts}</span></button>
      <button class="pbtn" data-act="win">★ Wins <span class="n">${cur.wins.length}</span></button>
      <button class="pbtn" data-act="note">✎ Notes <span class="n">${cur.notes.length}</span></button>
      ${caps.is_admin ? '<button class="pbtn danger" data-act="del">Delete</button>' : ''}
    </div>`;

    const collapsed = collapsedSections();
    const sec = (title, inner) => `<details class="mc-sec" data-section="${esc(title)}"${collapsed.has(title) ? '' : ' open'}><summary><span class="mc-sec-title">${esc(title)}</span><span class="mc-sec-line"></span><span class="mc-sec-caret">▾</span></summary><div class="sec-grid">${inner}</div></details>`;
    const form = `<div class="prof-body">
      ${sec('Identity', `${fld('First name', 'f-first_name', r.first_name)}${fld('Last name', 'f-last_name', r.last_name)}${multiField('Email', 'email', 'alternate_emails', 'email', r.email, (r.metadata || {}).alternate_emails)}${multiField('Phone', 'phone', 'alternate_phones', 'tel', r.phone, (r.metadata || {}).alternate_phones)}`)}
      ${sec('Rep Area', `<div class="fld full"><label>Assigned rep</label><input id="f-rep" list="repList" value="${esc(r.rep || '')}" placeholder="Type or pick a rep…"><datalist id="repList">${repList}</datalist></div><div class="full" id="repWidgets">${isNew ? '<div class="item-meta" style="padding:2px">Create the student first to log contacts &amp; set a rep status.</div>' : '<div class="item-meta" style="padding:2px">Loading…</div>'}</div>`)}
      ${sec('Purchase', `${fld('First purchase', 'f-first_purchase_date', r.first_purchase_date, 'date')}${fld('Last purchase', 'f-last_purchase_date', r.last_purchase_date, 'date')}${fld('Price', 'f-price', r.price, 'number')}`)}
      ${sec('Course progress', `${fld('Level', 'f-level', r.level, 'select', LEVELS)}${fld('Masterclass level', 'f-masterclass_level', r.masterclass_level, 'select', LEVELS)}${fld('Current module', 'f-current_module', r.current_module)}`)}
      ${isNew ? '' : sec('Engagement', `${fld('Sign-ins (course visits)', 'f-sign_in_count', r.sign_in_count, 'number')}${roField('Last sign-in', lastSignIn ? fmtDate(lastSignIn) : '')}${roField('Last activity', lastActivity ? fmtDate(lastActivity) : '')}${roField('Joined (Kajabi)', r.kajabi_created_at ? fmtDate(r.kajabi_created_at) : '')}${fld('Source', 'f-source', r.source)}${fld('SMS opt-in', 'f-sms_opt_in', r.sms_opt_in, 'checkbox')}`)}
      ${isNew ? '' : sec('Activity log', activityLogHTML())}
      ${sec('Location & contact', `${fld('Mobile', 'f-mobile_phone', r.mobile_phone)}${fld('Address line 1', 'f-address_line1', r.address_line1)}${fld('Address line 2', 'f-address_line2', r.address_line2)}${fld('City', 'f-city', r.city)}${fld('State', 'f-state', r.state)}${fld('Country', 'f-country', r.country)}${fld('Zip', 'f-zip', r.zip)}`)}
      ${isNew ? '' : sec('Tags', tagEditor(r.tags, canEdit))}
      ${(Array.isArray(r.products) && r.products.length) ? sec('Products', chipsField('Products', r.products)) : ''}
      ${sec('Admin', `${fld('Status', 'f-status', r.status || 'Active', 'select', ['Active', 'Completed', 'Refunded'])}${fld('Refunded date', 'f-refunded_date', r.refunded_date, 'date')}${fld('Refunded amount', 'f-refunded_amount', r.refunded_amount, 'number')}${fld('Verified', 'f-verified', r.verified, 'checkbox')}${fld('Dead file', 'f-dead_file', r.dead_file, 'checkbox')}${fld('Winning student', 'f-winning_student', r.winning_student, 'checkbox')}`)}
      ${sec('Notes (profile)', `<div class="full">${fld('', 'f-notes', r.notes, 'textarea')}</div>`)}
      ${(r.metadata && r.metadata.kajabi && Object.keys(r.metadata.kajabi).length) ? sec('All imported details', Object.entries(r.metadata.kajabi).map(([k, v]) => roFull(k, v)).join('')) : ''}
      ${canEdit ? `<div class="save-row"><button class="tbtn" id="cancelBtn">Cancel</button><button class="tbtn tbtn-primary" id="saveBtn">${isNew ? 'Create student' : 'Save changes'}</button></div>` : ''}
    </div>`;

    p.innerHTML = head + actions + form;

    p.querySelectorAll('.pbtn').forEach(b => b.addEventListener('click', () => onAction(b.dataset.act)));
    // Persist collapse state per section title (survives reloads + re-renders).
    p.querySelectorAll('details.mc-sec').forEach(d => d.addEventListener('toggle', () => {
      const set = collapsedSections(); const t = d.dataset.section;
      if (d.open) set.delete(t); else set.add(t);
      try { localStorage.setItem('mc-collapsed-sections', JSON.stringify([...set])); } catch (_) {}
    }));
    if (canEdit) { const sb = $('saveBtn'); if (sb) sb.onclick = saveProfile; const cb = $('cancelBtn'); if (cb) cb.onclick = () => { if (isNew) { cur = null; p.classList.add('hidden'); $('mcMainEmpty').classList.remove('hidden'); } else openStudent(r.id); }; }
    if (!isNew) renderRepArea(r);
    const aAdd = $('actAdd'); if (aAdd) aAdd.onclick = activityModal;
    p.querySelectorAll('[data-actdel]').forEach(b => b.addEventListener('click', () => confirmDialog('Delete this activity entry?', async () => { try { await mcFetch('?api=delete-activity', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.actdel) }) }); toast('Deleted'); await openStudent(cur.row.id); } catch (e) { toast(e.message); } })));
  }
  function collapsedSections() { try { return new Set(JSON.parse(localStorage.getItem('mc-collapsed-sections') || '[]')); } catch (_) { return new Set(); } }

  // ── Rep Area (contacts + rep status) ──────────────────────────────────────
  async function loadRepData() {
    try {
      const j = await mcFetch('?api=rep-data');
      repDataMap = {};
      for (const row of (j.rows || [])) repDataMap[row.student_id] = row;
      if (Array.isArray(j.status_options) && j.status_options.length) repStatusOptions = j.status_options;
      renderList();
    } catch (_) {}
  }
  function renderRepArea(s) {
    const box = $('repWidgets'); if (!box) return;
    const rd = repDataMap[s.id] || {};
    const c = rd.status ? (REP_STATUS_COLORS[rd.status] || { bg: 'var(--surface3)', fg: 'var(--text)' }) : null;
    const statusPill = rd.status
      ? `<span class="pill-open" style="background:${c.bg};color:${c.fg}">${esc(rd.status)}</span>${rd.status_at ? `<span class="item-meta" style="margin-left:6px">since ${fmtDate(rd.status_at)}</span>` : ''}`
      : '<span class="item-meta">No status set</span>';
    const recent = rd.recently_contacted ? '<span class="pill-open" style="background:var(--blue-bg);color:var(--blue);margin-left:6px">✆ ≤7d</span>' : '';
    const statusSel = caps.can_edit
      ? `<select id="repStatusSel" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:0.82rem;cursor:pointer;font-family:inherit"><option value="">— set status —</option>${repStatusOptions.map(o => `<option value="${esc(o)}"${o === rd.status ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : '';
    box.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="item-meta">Rep status:</span> ${statusPill} ${recent}</div>
        <div class="item-meta" style="color:var(--text)">Last contact: <strong>${rd.last_contact_date ? esc(fmtDate(rd.last_contact_date)) : '—'}</strong></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${statusSel}
        ${caps.can_edit ? '<button class="tbtn tbtn-primary" id="repLogContact" style="background:var(--blue-bg);color:var(--blue);border:none">✆ Log contact</button>' : ''}
        <button class="tbtn" id="repContactsLog">✆ Contacts log</button>
        <button class="tbtn" id="repStatusHist">Status history</button>
      </div>`;
    const sel = $('repStatusSel'); if (sel) sel.addEventListener('change', () => { if (sel.value) setRepStatus(s.id, sel.value); });
    const lc = $('repLogContact'); if (lc) lc.addEventListener('click', () => repContactModal(s));
    $('repContactsLog').addEventListener('click', () => repContactsModal(s));
    $('repStatusHist').addEventListener('click', () => repStatusHistoryModal(s));
  }
  async function setRepStatus(studentId, status) {
    try { await mcFetch('?api=rep-set-status', { method: 'POST', body: JSON.stringify({ studentId, status }) }); toast('Status set to ' + status); await loadRepData(); if (cur && cur.row.id === studentId) renderRepArea(cur.row); }
    catch (e) { toast(e.message); }
  }
  function repContactModal(s) {
    const today = new Date().toISOString().slice(0, 10);
    openModal(`<h3>Log contact — ${esc(s.name || '')}</h3>
      <div class="fld"><label>Contact date</label><input type="date" id="rcDate" value="${today}"></div>
      <div class="fld"><label>Notes (optional)</label><textarea id="rcNote" placeholder="What happened on this contact?"></textarea></div>
      <div class="modal-row"><button class="tbtn" id="rcCancel">Cancel</button><button class="tbtn tbtn-primary" id="rcSave">Log contact</button></div>`);
    $('rcCancel').onclick = closeModal;
    $('rcSave').onclick = async () => { try { await mcFetch('?api=rep-add-contact', { method: 'POST', body: JSON.stringify({ studentId: s.id, contact_date: $('rcDate').value || null, notes: $('rcNote').value || '' }) }); closeModal(); toast('Contact logged'); await loadRepData(); if (cur && cur.row.id === s.id) renderRepArea(cur.row); } catch (e) { toast(e.message); } };
  }
  async function repContactsModal(s) {
    openModal(`<h3>Contacts — ${esc(s.name || '')}</h3><div id="rcBody" class="item-meta">Loading…</div><div class="modal-row" style="margin-top:12px">${caps.can_edit ? '<button class="tbtn" id="rcAdd" style="margin-right:auto">✆ Log</button>' : ''}<button class="tbtn" id="rcClose">Close</button></div>`);
    $('rcClose').onclick = closeModal;
    const addb = $('rcAdd'); if (addb) addb.onclick = () => repContactModal(s);
    try {
      const j = await mcFetch('?api=rep-contacts&student_id=' + s.id);
      const rows = j.rows || [];
      $('rcBody').innerHTML = rows.length
        ? rows.map(c => `<div class="item"><div class="item-top"><span class="item-title" style="font-size:0.84rem">✆ ${esc(fmtDate(c.contact_date))}</span><span class="item-meta">${esc(c.created_by_name || '')}</span></div>${c.notes ? `<div class="item-body">${esc(c.notes)}</div>` : ''}</div>`).join('')
        : '<div class="item-meta" style="padding:16px;text-align:center">No contacts logged yet.</div>';
    } catch (e) { $('rcBody').innerHTML = `<div class="item-meta" style="color:var(--red)">${esc(e.message)}</div>`; }
  }
  async function repStatusHistoryModal(s) {
    openModal(`<h3>Rep status history — ${esc(s.name || '')}</h3><div id="rsBody" class="item-meta">Loading…</div><div class="modal-row" style="margin-top:12px"><button class="tbtn" id="rsClose">Close</button></div>`);
    $('rsClose').onclick = closeModal;
    try {
      const j = await mcFetch('?api=rep-status-log&student_id=' + s.id);
      const rows = j.rows || [];
      $('rsBody').innerHTML = rows.length
        ? rows.map(r => { const c = REP_STATUS_COLORS[r.status] || { bg: 'var(--surface3)', fg: 'var(--text)' }; return `<div class="item" style="display:flex;align-items:center;gap:10px"><span class="pill-open" style="background:${c.bg};color:${c.fg}">${esc(r.status)}</span><span class="item-meta">${esc(fmtStamp(r.set_at))}</span><span class="item-meta" style="margin-left:auto">${esc(r.set_by_name || '')}</span></div>`; }).join('')
        : '<div class="item-meta" style="padding:16px;text-align:center">No status changes yet.</div>';
    } catch (e) { $('rsBody').innerHTML = `<div class="item-meta" style="color:var(--red)">${esc(e.message)}</div>`; }
  }

  async function saveProfile() {
    const g = (id) => { const el = $(id); if (!el) return undefined; return el.type === 'checkbox' ? el.checked : el.value; };
    const body = { id: cur.row.id || undefined };
    ['first_name', 'last_name', 'rep', 'first_purchase_date', 'last_purchase_date', 'price', 'level', 'masterclass_level', 'current_module', 'status', 'refunded_date', 'refunded_amount', 'verified', 'dead_file', 'winning_student', 'notes', 'mobile_phone', 'address_line1', 'address_line2', 'city', 'state', 'country', 'zip', 'source', 'sms_opt_in', 'sign_in_count'].forEach(k => { const v = g('f-' + k); if (v !== undefined) body[k] = v; });
    // `name` is derived server-side from first/last; still validate here for the create form.
    const _combined = [g('f-first_name'), g('f-last_name')].map(x => (x || '').trim()).filter(Boolean).join(' ');
    // Multi-value email/phone: first → column, rest → metadata alternates.
    const meta = { ...(cur.row.metadata || {}) };
    $('mcProfile').querySelectorAll('.multi').forEach(m => {
      const seen = new Set(); const vals = [];
      m.querySelectorAll('.multi-input').forEach(inp => { const t = (inp.value || '').trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); vals.push(t); } });
      body[m.dataset.key] = vals[0] || null;
      if (m.dataset.meta) meta[m.dataset.meta] = vals.slice(1);
    });
    body.metadata = meta;
    // Tags (editable chip editor) — only send when the editor is on screen.
    const te = $('tagEdit'); if (te) body.tags = [...te.querySelectorAll('.tag-chip')].map(c => c.dataset.tag);
    if (!_combined) { toast('First name is required'); return; }
    try {
      const j = await mcFetch('?api=upsert', { method: 'POST', body: JSON.stringify(body) });
      toast('Saved'); await loadList(); openStudent(cur.row.id || j.id);
    } catch (e) { toast('Save failed: ' + e.message); }
  }
  function onAction(act) {
    if (act === 'del') return confirmDialog('Delete this student and all their turnovers/alerts/wins/notes?', async () => { try { await mcFetch('?api=delete', { method: 'POST', body: JSON.stringify({ id: cur.row.id }) }); toast('Deleted'); closeListModal(); cur = null; $('mcProfile').classList.add('hidden'); $('mcMainEmpty').classList.remove('hidden'); loadList(); } catch (e) { toast(e.message); } });
    if (act === 'turnover') return openListModal('t');
    if (act === 'alert') return openListModal('a');
    if (act === 'win') return openListModal('w');
    if (act === 'note') return openListModal('n');
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

  // ── Item renderers (one row each; rendered inside the pop-up list modals) ──
  function turnoverItem(t) {
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
  }
  function alertItem(a) {
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
  }
  function winItem(w) {
    return `<div class="item"><div class="item-top"><span class="item-body" style="margin:0">${esc(w.text)}</span><span class="item-meta">${fmtDate(w.win_date || w.created_at)}</span></div>${caps.can_edit ? `<div class="item-actions"><button class="lnk red" data-wact="del" data-id="${w.id}">Delete</button></div>` : ''}</div>`;
  }
  function noteItem(n) {
    return `<div class="item"><div class="item-top"><span class="item-body" style="margin:0">${esc(n.text)}</span><span class="item-meta">${esc(n.created_by_name || n.created_by_email || '')} · ${fmtDate(n.note_date || n.created_at)}</span></div>${caps.can_edit ? `<div class="item-actions"><button class="lnk red" data-nact="del" data-id="${n.id}">Delete</button></div>` : ''}</div>`;
  }

  // ── Add forms (open on top of the pop-up list modal, via the small .ov overlay) ──
  function turnoverModal() {
    const repOpts = reps.map(x => `<option value="${esc(x.display)}">${esc(x.display)}</option>`).join('');
    openModal(`<h3>New turn-over</h3>
      <div class="fld"><label>Rep</label><select id="tRep"><option value="">Select…</option>${repOpts}</select></div>
      <div class="fld"><label>Note (optional)</label><textarea id="tNote" placeholder="Why are you handing this student over?"></textarea></div>
      <div class="modal-row"><button class="tbtn" id="tCancel">Cancel</button><button class="tbtn tbtn-primary" id="tSave">Create turnover</button></div>`);
    $('tCancel').onclick = closeModal;
    $('tSave').onclick = async () => { const rep_name = $('tRep').value.trim(); if (!rep_name) { toast('Pick a rep'); return; } try { await mcFetch('?api=add-turnover', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, rep_name, note: $('tNote').value.trim() || null }) }); closeModal(); toast('Turnover created'); await afterMutate(); } catch (e) { toast(e.message); } };
  }
  function alertModal() {
    openModal(`<h3>Submit an alert</h3>
      <div class="fld"><label>Title</label><input id="aTitle" placeholder="e.g. Refund pending, missed welcome call…"></div>
      <div class="fld"><label>Details (optional)</label><textarea id="aDesc" placeholder="Context, what needs to happen…"></textarea></div>
      <div class="modal-row"><button class="tbtn" id="aCancel">Cancel</button><button class="tbtn tbtn-primary" id="aSave">Submit alert</button></div>`);
    $('aCancel').onclick = closeModal;
    $('aSave').onclick = async () => { const title = $('aTitle').value.trim(); if (!title) { toast('Title required'); return; } try { await mcFetch('?api=add-alert', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, title, description: $('aDesc').value.trim() || null }) }); closeModal(); toast('Alert submitted'); await afterMutate(); } catch (e) { toast(e.message); } };
  }
  function winModal() {
    openModal(`<h3>Log a win</h3><div class="fld"><label>What happened?</label><textarea id="wText"></textarea></div><div class="fld"><label>Date</label><input type="date" id="wDate"></div><div class="modal-row"><button class="tbtn" id="wCancel">Cancel</button><button class="tbtn tbtn-primary" id="wSave">Add win</button></div>`);
    $('wCancel').onclick = closeModal;
    $('wSave').onclick = async () => { const text = $('wText').value.trim(); if (!text) { toast('Enter the win'); return; } try { await mcFetch('?api=add-win', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, text, win_date: $('wDate').value || null }) }); closeModal(); toast('Win logged'); await afterMutate(); } catch (e) { toast(e.message); } };
  }
  function noteModal() {
    openModal(`<h3>Add a note</h3><div class="fld"><label>Note</label><textarea id="nText"></textarea></div><div class="modal-row"><button class="tbtn" id="nCancel">Cancel</button><button class="tbtn tbtn-primary" id="nSave">Add note</button></div>`);
    $('nCancel').onclick = closeModal;
    $('nSave').onclick = async () => { const text = $('nText').value.trim(); if (!text) return; try { await mcFetch('?api=add-note', { method: 'POST', body: JSON.stringify({ studentId: cur.row.id, text }) }); closeModal(); toast('Note added'); await afterMutate(); } catch (e) { toast(e.message); } };
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
      try { await mcFetch('?api=reassign-turnover', { method: 'POST', body: JSON.stringify({ id: t.id, rep_name }) }); closeModal(); toast('Reassigned'); await afterMutate(); } catch (e) { toast(e.message); }
    };
  }
  function editResultModal(t) {
    openModal(`<h3>Edit turnover result</h3>
      <div class="fld"><label>Result</label><textarea id="erText" rows="5">${esc(t.result || '')}</textarea></div>
      <div class="modal-row"><button class="tbtn" id="erClear" style="margin-right:auto;color:var(--red)">Clear result</button><button class="tbtn" id="erCancel">Cancel</button><button class="tbtn tbtn-primary" id="erSave">Save result</button></div>`);
    $('erCancel').onclick = closeModal;
    $('erClear').onclick = () => confirmDialog('Clear this turnover result (reopens it)?', async () => { try { await mcFetch('?api=set-turnover-result', { method: 'POST', body: JSON.stringify({ id: t.id, result: '' }) }); toast('Result cleared'); await afterMutate(); } catch (e) { toast(e.message); } });
    $('erSave').onclick = async () => { const result = $('erText').value.trim(); if (!result) { toast('Enter a result, or use Clear result'); return; } try { await mcFetch('?api=set-turnover-result', { method: 'POST', body: JSON.stringify({ id: t.id, result }) }); closeModal(); toast('Result saved'); await afterMutate(); } catch (e) { toast(e.message); } };
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
      await afterMutate();
    } catch (e) { btn.disabled = false; btn.textContent = orig; toast(e.message); }
  }

  // ── Pop-up list modals (Turn overs / Alerts / Wins / Notes) ──
  let listKind = null; // which list modal is currently open ('t'|'a'|'w'|'n')
  const LIST_META = {
    t: { title: 'Turn overs', add: '+ New turn-over', addFn: turnoverModal },
    a: { title: 'Alerts',     add: '+ Submit alert',  addFn: alertModal },
    w: { title: 'Wins',       add: '+ Add win',       addFn: winModal },
    n: { title: 'Notes',      add: '+ Add note',      addFn: noteModal },
  };
  function emptyRow(m) { return `<div class="item-meta" style="padding:26px;text-align:center">${m}</div>`; }
  function listCountLabel(kind) {
    if (kind === 'a') { const o = cur.alerts.filter(a => a.status === 'open').length; return `${o} open · ${cur.alerts.length - o} resolved`; }
    const n = kind === 't' ? cur.turnovers.length : kind === 'w' ? cur.wins.length : cur.notes.length;
    return `${n} total`;
  }
  function listBodyHTML(kind) {
    if (kind === 't') return cur.turnovers.length ? cur.turnovers.map(turnoverItem).join('') : emptyRow('No turn-overs yet.');
    if (kind === 'a') {
      const sorted = [...cur.alerts].sort((a, b) => (a.status !== b.status) ? (a.status === 'open' ? -1 : 1) : String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return cur.alerts.length ? sorted.map(alertItem).join('') : emptyRow('No alerts yet.');
    }
    if (kind === 'w') return cur.wins.length ? cur.wins.map(winItem).join('') : emptyRow('No wins yet.');
    return cur.notes.length ? cur.notes.map(noteItem).join('') : emptyRow('No notes yet.');
  }
  function closeListModal() { listKind = null; document.getElementById('mcListModal')?.remove(); }
  function openListModal(kind) {
    if (!cur || !cur.row.id) return;
    listKind = kind;
    document.getElementById('mcListModal')?.remove();
    const meta = LIST_META[kind];
    const m = document.createElement('div');
    m.id = 'mcListModal';
    m.className = 'lm-ov';
    m.innerHTML = `<div class="lm-box">
      <div class="lm-head">
        <div style="flex:1;min-width:0"><div class="lm-title">${meta.title} — ${esc(cur.row.name || '')}</div><div class="lm-sub" id="lmSub">${listCountLabel(kind)}</div></div>
        ${caps.can_edit ? `<button class="tbtn tbtn-primary" id="lmAdd">${meta.add}</button>` : ''}
        <button class="lm-x" id="lmClose" aria-label="Close">×</button>
      </div>
      <div class="lm-body" id="lmBody">${listBodyHTML(kind)}</div>
    </div>`;
    document.body.appendChild(m);
    function onKey(e) { if (e.key === 'Escape' && !$('ov').classList.contains('open')) close(); }
    function close() { document.removeEventListener('keydown', onKey); closeListModal(); }
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    $('lmClose').onclick = close;
    const addBtn = $('lmAdd'); if (addBtn) addBtn.onclick = () => meta.addFn();
    wireListItems();
  }
  function rerenderListBody() {
    if (!listKind) return;
    const body = document.getElementById('lmBody'); if (!body) return;
    body.innerHTML = listBodyHTML(listKind);
    const sub = document.getElementById('lmSub'); if (sub) sub.textContent = listCountLabel(listKind);
    wireListItems();
  }
  // Refetch the student, refresh sidebar + profile counts, and re-render the open list modal.
  async function afterMutate() {
    await loadList();
    if (cur && cur.row.id) { try { const j = await mcFetch('?api=get&id=' + cur.row.id); cur = j; caps = j.capabilities || caps; renderProfile(); } catch (_) {} }
    rerenderListBody();
  }
  // Delegated wiring for the items inside the open list modal body.
  function wireListItems() {
    const body = document.getElementById('lmBody'); if (!body) return;
    // Response/Resolution picker: swap placeholder + button label on mode change.
    body.querySelectorAll('.ans input[type="radio"]').forEach(r => r.addEventListener('change', () => {
      const wrap = r.closest('.ans'); const kind = wrap.dataset.kind;
      const mode = (wrap.querySelector('input:checked') || {}).value || 'response';
      const ta = wrap.querySelector('.ans-note'); const btn = wrap.querySelector('.ans-btn');
      if (mode === 'resolve') { ta.placeholder = kind === 'a' ? 'Explain how this was resolved (required)…' : 'Describe the outcome / result (required)…'; btn.textContent = '✓ Resolve'; }
      else { ta.placeholder = 'Post an update without resolving…'; btn.textContent = '↩ Post response'; }
    }));
    body.querySelectorAll('.ans-btn').forEach(b => b.addEventListener('click', () => submitAnswer(b.dataset.kind, Number(b.dataset.id), b)));
    body.querySelectorAll('[data-tact]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id); const act = b.dataset.tact;
      const t = cur.turnovers.find(x => Number(x.id) === id);
      if (act === 'del') return confirmDialog('Delete this turnover?', async () => { try { await mcFetch('?api=delete-turnover', { method: 'POST', body: JSON.stringify({ id }) }); toast('Deleted'); await afterMutate(); } catch (e) { toast(e.message); } });
      if (act === 'reassign' && t) return reassignModal(t);
      if (act === 'editresult' && t) return editResultModal(t);
    }));
    body.querySelectorAll('[data-aact]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id);
      if (b.dataset.aact === 'del') return confirmDialog('Delete this alert?', async () => { try { await mcFetch('?api=delete-alert', { method: 'POST', body: JSON.stringify({ id }) }); toast('Deleted'); await afterMutate(); } catch (e) { toast(e.message); } });
    }));
    body.querySelectorAll('[data-wact]').forEach(b => b.addEventListener('click', () => confirmDialog('Delete this win?', async () => { try { await mcFetch('?api=delete-win', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.id) }) }); toast('Deleted'); await afterMutate(); } catch (e) { toast(e.message); } })));
    body.querySelectorAll('[data-nact]').forEach(b => b.addEventListener('click', () => confirmDialog('Delete this note?', async () => { try { await mcFetch('?api=delete-note', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.id) }) }); toast('Deleted'); await afterMutate(); } catch (e) { toast(e.message); } })));
  }

  // ── Global queues (Alerts / Turn-overs / Contacts across all students) ──
  const QUEUE_META = {
    alerts:    { title: 'Alerts',     api: 'queue-alerts',    toggle: true },
    turnovers: { title: 'Turn-overs', api: 'queue-turnovers', toggle: true },
    contacts:  { title: 'Contacts',   api: 'queue-contacts',  toggle: false },
  };
  async function openQueueModal(kind, done = false) {
    const meta = QUEUE_META[kind];
    document.getElementById('mcQueueModal')?.remove();
    const m = document.createElement('div');
    m.id = 'mcQueueModal'; m.className = 'lm-ov';
    const toggle = meta.toggle
      ? `<div style="display:flex;gap:6px"><button class="tbtn${done ? '' : ' tbtn-primary'}" data-done="0">Open</button><button class="tbtn${done ? ' tbtn-primary' : ''}" data-done="1">${kind === 'alerts' ? 'Resolved' : 'Done'}</button></div>`
      : '';
    m.innerHTML = `<div class="lm-box">
      <div class="lm-head">
        <div style="flex:1;min-width:0"><div class="lm-title">${meta.title}</div><div class="lm-sub" id="qSub">Loading…</div></div>
        ${toggle}
        <button class="lm-x" id="qClose" aria-label="Close">×</button>
      </div>
      <div class="lm-body" id="qBody"><div class="item-meta" style="padding:26px;text-align:center">Loading…</div></div>
    </div>`;
    document.body.appendChild(m);
    const close = () => { document.removeEventListener('keydown', onKey); m.remove(); };
    function onKey(e) { if (e.key === 'Escape' && !$('ov').classList.contains('open')) close(); }
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    $('qClose').onclick = close;
    m.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => openQueueModal(kind, b.dataset.done === '1')));
    try {
      const j = await mcFetch('?api=' + meta.api + (meta.toggle ? '&done=' + (done ? '1' : '0') : ''));
      const rows = j.rows || [];
      const scope = j.see_all ? 'showing all' : 'the ones you’re on';
      $('qSub').textContent = `${rows.length} ${meta.toggle ? (done ? (kind === 'alerts' ? 'resolved' : 'done') : 'open') : 'logged'} · ${scope}`;
      $('qBody').innerHTML = rows.length ? rows.map(r => queueRow(kind, r, done)).join('') : `<div class="item-meta" style="padding:26px;text-align:center">Nothing here.</div>`;
      $('qBody').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { close(); openStudent(Number(b.dataset.open)); }));
    } catch (e) { $('qBody').innerHTML = `<div class="item-meta" style="color:var(--red);padding:20px">${esc(e.message)}</div>`; }
  }
  function queueRow(kind, r, done) {
    const openBtn = `<button class="lnk" data-open="${r.student_id}">Open student →</button>`;
    const who = `<span class="item-meta">${esc(r.created_by_name || '')}</span>`;
    if (kind === 'contacts') {
      return `<div class="item"><div class="item-top"><span class="item-title" style="font-size:0.9rem">${esc(r.student_name || '(unnamed)')}</span><span class="item-meta">✆ ${esc(fmtDate(r.contact_date))}</span></div>${r.notes ? `<div class="item-body">${esc(r.notes)}</div>` : ''}<div class="item-actions">${who}<span style="flex:1"></span>${openBtn}</div></div>`;
    }
    if (kind === 'alerts') {
      const badge = done ? '<span class="pill-open badge-done">✓ resolved</span>' : '<span class="pill-open" style="background:var(--red-bg);color:var(--red)">⚠ open</span>';
      return `<div class="item"><div class="item-top"><span class="item-title" style="font-size:0.9rem">${esc(r.student_name || '(unnamed)')} — ${esc(r.title || '')} ${badge}</span><span class="item-meta">${esc(fmtDate(r.created_at))}</span></div>${r.description ? `<div class="item-body">${esc(r.description)}</div>` : ''}${done && r.resolution_note ? `<div class="item-body"><b>Resolved:</b> ${esc(r.resolution_note)}</div>` : ''}<div class="item-actions">${who}<span style="flex:1"></span>${openBtn}</div></div>`;
    }
    // turnovers
    const badge = done ? '<span class="pill-open badge-done">✓ resolved</span>' : '<span class="pill-open" style="background:var(--green-bg);color:var(--green)">↪ open</span>';
    return `<div class="item"><div class="item-top"><span class="item-title" style="font-size:0.9rem">${esc(r.student_name || '(unnamed)')} → ${esc(r.rep_name || '')} ${badge}</span><span class="item-meta">${esc(fmtDate(r.turnover_date || r.created_at))}</span></div>${r.note ? `<div class="item-body">${esc(r.note)}</div>` : ''}${done && r.result ? `<div class="item-body"><b>Result:</b> ${esc(r.result)}</div>` : ''}<div class="item-actions">${who}<span style="flex:1"></span>${openBtn}</div></div>`;
  }
  $('gqAlerts').addEventListener('click', () => openQueueModal('alerts', false));
  $('gqTurnovers').addEventListener('click', () => openQueueModal('turnovers', false));
  $('gqContacts').addEventListener('click', () => openQueueModal('contacts', false));

  // ── Bulk actions: apply an assign-rep / clear-rep / add-tag / remove-tag to
  // every student matching the CURRENT filters (search + chips + advanced). Solves
  // "28k students with no rep" without touching them one at a time. ──
  function bulkFilters() { return Object.fromEntries(listParams()); }
  function bulkFilterSummary() {
    const bits = [];
    if (query) bits.push(`search “${query}”`);
    if (filter && filter !== 'all') bits.push(`status: ${filter}`);
    if (view && view !== 'all') bits.push(view);
    if (advFilters.rep) bits.push('rep: ' + advFilters.rep);
    if (advFilters.level) bits.push('level: ' + advFilters.level);
    if (advFilters.repStatus) bits.push('rep status: ' + advFilters.repStatus);
    if (advFilters.tag) bits.push('tag: ' + advFilters.tag);
    if (advFilters.source) bits.push('source: ' + advFilters.source);
    if (advFilters.sms) bits.push(advFilters.sms === '1' ? 'SMS opted-in' : 'SMS not opted-in');
    if (advFilters.inactive) bits.push('inactive ' + advFilters.inactive + 'd+');
    if (advFilters.verified) bits.push('verified');
    if (advFilters.recent) bits.push('contacted ≤7d');
    if (advFilters.wins) bits.push('has wins');
    if (advFilters.joinedFrom || advFilters.joinedTo) bits.push('joined ' + (advFilters.joinedFrom || '…') + '–' + (advFilters.joinedTo || '…'));
    return bits.length ? bits.join(' · ') : 'ALL students (no filters)';
  }
  async function openBulkModal() {
    if (!caps.can_edit) return;
    const filters = bulkFilters();
    const repList = reps.map(x => `<option value="${esc(x.display)}">`).join('');
    openModal(`<h3>⇉ Bulk actions</h3>
      <p style="color:var(--text-muted);font-size:0.86rem;margin:0 0 12px">Applies to <b id="bkCount">…</b> student(s) matching: <span style="color:var(--text)">${esc(bulkFilterSummary())}</span></p>
      <div class="fld full"><label>Action</label>
        <select id="bkAction">
          <option value="assign-rep">Assign rep</option>
          <option value="clear-rep">Clear rep (unassign)</option>
          <option value="add-tag">Add tag</option>
          <option value="remove-tag">Remove tag</option>
        </select>
      </div>
      <div class="fld full" id="bkValWrap"><label id="bkValLabel">Rep</label>
        <input id="bkValue" list="bkRepList" placeholder="Pick or type a rep name" autocomplete="off">
        <datalist id="bkRepList">${repList}</datalist>
        <datalist id="bkTagList"></datalist>
      </div>
      <div class="modal-row" style="margin-top:14px"><button class="tbtn" id="bkCancel">Cancel</button><button class="tbtn tbtn-primary" id="bkGo" disabled>Apply</button></div>
      <div id="bkMsg" class="item-meta" style="margin-top:8px"></div>`);
    const tagSet = new Set(); students.forEach(s => (s.tags || []).forEach(t => tagSet.add(t)));
    $('bkTagList').innerHTML = [...tagSet].sort((a, b) => a.localeCompare(b)).map(t => `<option value="${esc(t)}">`).join('');
    const actionSel = $('bkAction'), valInput = $('bkValue'), valWrap = $('bkValWrap'), valLabel = $('bkValLabel'), goBtn = $('bkGo');
    const syncAction = () => {
      const a = actionSel.value;
      if (a === 'clear-rep') { valWrap.classList.add('hidden'); }
      else { valWrap.classList.remove('hidden'); valLabel.textContent = a === 'assign-rep' ? 'Rep' : 'Tag'; valInput.setAttribute('list', a === 'assign-rep' ? 'bkRepList' : 'bkTagList'); valInput.placeholder = a === 'assign-rep' ? 'Pick or type a rep name' : 'Type a tag'; }
      goBtn.disabled = (a !== 'clear-rep') && !valInput.value.trim();
    };
    actionSel.addEventListener('change', syncAction);
    valInput.addEventListener('input', syncAction);
    syncAction();
    $('bkCancel').onclick = closeModal;
    // Live count for the current filter set.
    try { const c = await mcFetch('?api=bulk-count&' + listParams().toString()); $('bkCount').textContent = (c.count ?? 0).toLocaleString(); }
    catch (_) { $('bkCount').textContent = '?'; }
    goBtn.onclick = () => {
      const action = actionSel.value; const value = valInput.value.trim();
      if (action !== 'clear-rep' && !value) return;
      const n = $('bkCount').textContent;
      const verb = action === 'assign-rep' ? `assign rep “${value}” to` : action === 'clear-rep' ? 'clear the rep on' : action === 'add-tag' ? `add tag “${value}” to` : `remove tag “${value}” from`;
      confirmDialog(`This will ${verb} ${n} student(s). Continue?`, async () => {
        openModal(`<h3>Working…</h3><p class="item-meta">Applying to ${esc(n)} student(s). This can take a moment for large segments.</p>`);
        try {
          const j = await mcFetch('?api=bulk', { method: 'POST', body: JSON.stringify({ action, value, filters }) });
          closeModal();
          toast(`Done — ${(j.affected ?? 0).toLocaleString()} student(s) updated`);
          await loadList(true); loadRepData();
        } catch (e) { openModal(`<h3>Bulk action failed</h3><p class="item-meta" style="color:var(--red)">${esc(e.message)}</p><div class="modal-row" style="margin-top:12px"><button class="tbtn" id="bkErrClose">Close</button></div>`); $('bkErrClose').onclick = closeModal; }
      });
    };
  }
  $('gqBulk').addEventListener('click', openBulkModal);

  // ── CSV re-import (Kajabi export) ──────────────────────────────────────────
  // Parses the semicolon-delimited, windows-1252 Kajabi CSV in the browser,
  // maps columns → normalized rows (day-first dates → ISO), and posts them to
  // ?api=import in batches. Enriches + refreshes activity; never replaces CRM
  // edits. Stamps started_at on the no-activity→activity transition so we can
  // track Masterclass Starters + Active-this-week going forward.
  const CSV_BATCH = 500;
  // Split one CSV line honoring quoted fields (delimiter is ; for Kajabi).
  function splitCsvLine(line, delim) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  }
  // Full parse: handles quoted fields spanning newlines. Returns {headers, rows}.
  function parseCsv(text) {
    // Strip BOM.
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // Delimiter: whichever of ; or , appears more in the first line.
    const firstNL = text.indexOf('\n'); const head = text.slice(0, firstNL < 0 ? text.length : firstNL);
    const delim = (head.split(';').length > head.split(',').length) ? ';' : ',';
    // Split into records honoring quotes across newlines.
    const records = []; let field = ''; let row = []; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') records.push(row); row = []; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') records.push(row); }
    if (!records.length) return { headers: [], rows: [], malformed: 0 };
    const headers = records[0].map(h => h.trim());
    // A record whose column count != the header count is a desynced parse (an
    // embedded newline/quote in a free-text field). Drop it rather than map its
    // values onto the wrong columns.
    const rows = []; let malformed = 0;
    for (const r of records.slice(1)) {
      if (r.length !== headers.length) { malformed++; continue; }
      const o = {}; headers.forEach((h, i) => { o[h] = (r[i] == null ? '' : r[i]).trim(); }); rows.push(o);
    }
    return { headers, rows, malformed };
  }
  // Day-first "DD/MM/YYYY HH:MM" → ISO (UTC). Returns '' if unparseable.
  function kajabiDateToISO(s) {
    if (!s) return '';
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (!m) return '';
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)));
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const csvFirst = (r, keys) => { for (const k of keys) { const v = (r[k] || '').trim(); if (v) return v; } return ''; };
  const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  // Basic email shape — rows whose "email" isn't a real email are almost always
  // a misaligned parse (free-text/survey fields desync columns); we skip them.
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  // One raw CSV row object → normalized import row (keeps the whole raw row as kajabi).
  function normalizeCsvRow(r) {
    const email = csvFirst(r, ['Email', 'Email (email)', 'email']).toLowerCase();
    if (!EMAIL_RE.test(email)) return null;
    const smsRaw = csvFirst(r, ['By checking this box, you are opting in to receive SMS messaging and agree to the Terms of Service & Privacy Policy. Reply STOP to cancel, HELP for help. Msg & data rates may apply. Msg frequency varies.  (custom_25)']);
    const out = {
      email,
      first_name: csvFirst(r, ['First Name']),
      last_name: csvFirst(r, ['Last Name']),
      phone: csvFirst(r, ['Phone Number', 'Phone (custom_1)', 'Phone Number (phone_number)']),
      mobile_phone: csvFirst(r, ['Phone Number (phone_number)']),
      address_line1: csvFirst(r, ['Address (address_line_1)']),
      address_line2: csvFirst(r, ['Address Line 2 (address_line_2)']),
      city: csvFirst(r, ['City (address_city)']),
      state: csvFirst(r, ['State (address_state)']),
      country: csvFirst(r, ['Country (address_country)', 'Country (custom_2)']),
      zip: csvFirst(r, ['Zip Code (address_zip)']),
      source: csvFirst(r, ['Source (custom_14)']),
      // Digits only — guard against a date landing in this column (custom_17 can hold dates).
      sign_in_count: (csvFirst(r, ['Sign In Count']).match(/^\d{1,9}$/) || [''])[0],
      last_activity_at: kajabiDateToISO(csvFirst(r, ['Last Activity'])),
      last_sign_in_at: kajabiDateToISO(csvFirst(r, ['Last Sign In At'])),
      tags: splitList(csvFirst(r, ['Tags'])),
      products: splitList(csvFirst(r, ['Products'])),
      kajabi: r,
    };
    if (smsRaw) out.sms_opt_in = true;
    return out;
  }
  // Activity signature — MUST match the server's activity-index format exactly:
  // "sign_in_count|last_activity_ms|last_sign_in_ms" (empty string when no date).
  function rowSig(n) {
    const cnt = parseInt(n.sign_in_count || '0', 10) || 0;
    const la = n.last_activity_at ? Date.parse(n.last_activity_at) : '';
    const ls = n.last_sign_in_at ? Date.parse(n.last_sign_in_at) : '';
    return `${cnt}|${la}|${ls}`;
  }

  let _csvRows = null; let _showImportPreview = null;
  $('gqImport').addEventListener('click', () => { if (caps.can_edit) $('mcCsvFile').click(); });
  $('mcCsvFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    openModal(`<h3>⭱ Import CSV</h3><p class="item-meta" id="imMsg">Reading <b>${esc(file.name)}</b>…</p>`);
    try {
      const buf = await file.arrayBuffer();
      // Kajabi exports as windows-1252; decode accordingly to keep accents intact.
      let text; try { text = new TextDecoder('windows-1252').decode(buf); } catch (_) { text = new TextDecoder('utf-8').decode(buf); }
      const { headers, rows, malformed } = parseCsv(text);
      if (!rows.length) { $('imMsg').innerHTML = 'No rows found in the file.'; return; }
      const norm = []; let noEmail = 0;
      for (const r of rows) { const n = normalizeCsvRow(r); if (n) norm.push(n); else noEmail++; }
      const skipped = noEmail + (malformed || 0);
      const hasEmailCol = headers.some(h => /^email/i.test(h));

      // Diff against the CRM's activity fingerprint so we only upload what changed.
      // Kajabi always exports all ~28k rows; most are unchanged week to week.
      $('imMsg').innerHTML = `Parsed <b>${norm.length.toLocaleString()}</b> students. Checking what changed…`;
      let index = null;
      try { const j = await mcFetch('?api=activity-index'); index = j.index || {}; } catch (_) { index = null; }

      let toSend, added = 0, changed = 0, unchanged = 0;
      if (index) {
        toSend = [];
        for (const n of norm) {
          const cur = index[n.email];
          if (cur === undefined) { added++; n.__diff = 'new'; toSend.push(n); }
          else if (cur !== rowSig(n)) { changed++; n.__diff = 'changed'; toSend.push(n); }
          else unchanged++;
        }
      } else {
        toSend = norm.map(n => (n.__diff = 'send', n)); // fingerprint unavailable → send everything
      }
      _csvRows = toSend;

      const breakdown = index
        ? `<b>${added.toLocaleString()}</b> new to add · <b>${changed.toLocaleString()}</b> existing with new activity to update · <b>${unchanged.toLocaleString()}</b> unchanged (skipped).`
        : `Couldn’t fetch the change index — will send all <b>${norm.length.toLocaleString()}</b> rows.`;
      _showImportPreview = () => {
        openModal(`<h3>⭱ Import CSV</h3>
          <p style="color:var(--text-muted);font-size:0.9rem;margin:0 0 6px"><b>${esc(file.name)}</b> · ${(rows.length + (malformed || 0)).toLocaleString()} rows${skipped ? ` · ${skipped.toLocaleString()} skipped (no/invalid email or unparseable)` : ''}</p>
          <div class="item-meta" style="line-height:1.7">
            ${breakdown}<br>
            Existing students are <b>enriched</b> (activity refreshed, blanks filled, tags merged) — reps, statuses, and notes are never overwritten.
          </div>
          ${!hasEmailCol ? '<div class="item-meta" style="color:var(--red);margin-top:8px">⚠ No “Email” column detected — this may not be the Kajabi export.</div>' : ''}
          ${_csvRows.length ? '<div style="margin-top:8px"><button class="lnk" id="imReview">🔍 Review the ' + _csvRows.length.toLocaleString() + ' rows to import</button></div>' : ''}
          <div class="modal-row" style="margin-top:14px"><button class="tbtn" id="imCancel">Cancel</button><button class="tbtn tbtn-primary" id="imGo"${_csvRows.length ? '' : ' disabled'}>${_csvRows.length ? 'Import ' + _csvRows.length.toLocaleString() + ' students' : 'Nothing to import'}</button></div>`);
        $('imCancel').onclick = closeModal;
        $('imGo').onclick = () => runImport();
        if ($('imReview')) $('imReview').onclick = () => reviewImportRows();
      };
      _showImportPreview();
    } catch (err) { $('imMsg').innerHTML = `<span style="color:var(--red)">Could not read file: ${esc(err.message)}</span>`; }
  });

  // Inspect exactly which rows will be uploaded (new vs changed) before committing.
  function reviewImportRows() {
    const rows = _csvRows || [];
    const nm = (n) => [n.first_name, n.last_name].filter(Boolean).join(' ') || '(no name)';
    const badge = (d) => d === 'new'
      ? '<span class="mc-mini" style="background:var(--green-bg);color:var(--green)">new</span>'
      : (d === 'changed' ? '<span class="mc-mini" style="background:var(--blue-bg);color:var(--blue)">activity</span>' : '');
    const list = rows.slice(0, 500).map(n => `<div class="item" style="padding:6px 8px"><div class="item-top"><span class="item-title" style="font-size:0.84rem">${esc(nm(n))} ${badge(n.__diff)}</span><span class="item-meta">${esc(n.email)}</span></div><div class="item-meta">sign-ins: ${esc(String(n.sign_in_count || '0'))}${n.last_activity_at ? ' · last activity ' + esc(n.last_activity_at.slice(0, 10)) : ''}</div></div>`).join('');
    openModal(`<h3>Rows to import (${rows.length.toLocaleString()})</h3>
      <div class="item-meta" style="margin:0 0 8px">${rows.length > 500 ? 'Showing the first 500. ' : ''}Green = brand-new · Blue = existing student with new activity.</div>
      <div style="max-height:52vh;overflow:auto;border:1px solid var(--border);border-radius:8px">${list || '<div class="item-meta" style="padding:16px">Nothing to import.</div>'}</div>
      <div class="modal-row" style="margin-top:14px"><button class="tbtn" id="rvBack">← Back</button><button class="tbtn tbtn-primary" id="rvGo"${rows.length ? '' : ' disabled'}>Import ${rows.length.toLocaleString()}</button></div>`);
    $('rvBack').onclick = () => { if (_showImportPreview) _showImportPreview(); else closeModal(); };
    $('rvGo').onclick = () => runImport();
  }

  async function runImport() {
    const rows = _csvRows || []; if (!rows.length) return;
    const total = rows.length; let done = 0;
    const agg = { inserted: 0, updated: 0, new_starters: 0 };
    openModal(`<h3>Importing…</h3>
      <div class="item-meta" id="imProg">0 / ${total.toLocaleString()}</div>
      <div style="height:8px;background:var(--surface2);border-radius:999px;overflow:hidden;margin-top:10px"><div id="imBar" style="height:100%;width:0;background:var(--green);transition:width 0.2s"></div></div>`);
    try {
      for (let i = 0; i < total; i += CSV_BATCH) {
        const batch = rows.slice(i, i + CSV_BATCH);
        const j = await mcFetch('?api=import', { method: 'POST', body: JSON.stringify({ rows: batch }) });
        agg.inserted += j.inserted || 0; agg.updated += j.updated || 0; agg.new_starters += j.new_starters || 0;
        done += batch.length;
        const pct = Math.round((done / total) * 100);
        if ($('imProg')) $('imProg').textContent = `${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`;
        if ($('imBar')) $('imBar').style.width = pct + '%';
      }
      // Seal this week's stats snapshot with the freshly-imported activity.
      try { await mcFetch('?api=snapshot-week', { method: 'POST' }); } catch (_) {}
      openModal(`<h3>✓ Import complete</h3>
        <div class="item-meta" style="line-height:1.8">
          <b>${agg.updated.toLocaleString()}</b> students updated<br>
          <b>${agg.inserted.toLocaleString()}</b> new students added<br>
          <b>${agg.new_starters.toLocaleString()}</b> new Masterclass Starter(s) this week
        </div>
        <div class="modal-row" style="margin-top:14px"><button class="tbtn tbtn-primary" id="imDone">Done</button></div>`);
      $('imDone').onclick = closeModal;
      _csvRows = null;
      loadList(true); if (overviewMode) loadOverview();
    } catch (e) {
      openModal(`<h3>Import failed</h3><p class="item-meta" style="color:var(--red)">${esc(e.message)}</p><div class="item-meta">${done.toLocaleString()} of ${total.toLocaleString()} rows were processed before the error.</div><div class="modal-row" style="margin-top:12px"><button class="tbtn" id="imErr">Close</button></div>`);
      $('imErr').onclick = closeModal; loadList(true);
    }
  }

  // Multi-value email/phone add/remove (delegated once; profile re-renders often).
  $('mcProfile').addEventListener('click', (e) => {
    const add = e.target.closest('.multi-add');
    if (add) { const m = add.closest('.multi'); add.insertAdjacentHTML('beforebegin', multiRow(m.dataset.key === 'email' ? 'email' : 'tel', '')); return; }
    const del = e.target.closest('.multi-del');
    if (del) { const m = del.closest('.multi'); if (m.querySelectorAll('.multi-row').length > 1) del.closest('.multi-row').remove(); else m.querySelector('.multi-input').value = ''; }
    const tx = e.target.closest('.tag-x');
    if (tx) { tx.closest('.tag-chip').remove(); }
  });
  // Tags: add on Enter (dedup, case-insensitive).
  $('mcProfile').addEventListener('keydown', (e) => {
    if (e.target.id !== 'tagInput' || e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    const edit = $('tagEdit');
    const exists = [...edit.querySelectorAll('.tag-chip')].some(c => (c.dataset.tag || '').toLowerCase() === v.toLowerCase());
    if (!exists) e.target.insertAdjacentHTML('beforebegin', tagChip(v));
    e.target.value = '';
  });

  // ── Top bar wiring ──
  $('refreshBtn').addEventListener('click', () => { loadList(); loadRepData(); if (cur && cur.row.id) openStudent(cur.row.id); });
  $('newBtn').addEventListener('click', newStudent);
  $('signOutBtn').addEventListener('click', async () => { try { await supa.auth.signOut(); } catch (_) {} location.href = 'index.html'; });

  // ── Dashboard picker dropdown (nav-menu.js fills the menu; we wire open/close) ──
  $('navDropdownBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('navDropMenu');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', () => { const m = $('navDropMenu'); if (m) m.style.display = 'none'; });

  // ── Init ──
  (async function init() {
    const { data: { session } } = await supa.auth.getSession();
    if (session?.user) { const em = session.user.email || ''; $('userEmail').textContent = em; $('userAvatar').textContent = (em[0] || 'U').toUpperCase(); window.__RIDLEY_USER = session.user; }
    try { const j = await mcFetch('?api=reps'); reps = j.reps || []; } catch (_) {}
    fillFilterOptions();
    await loadList();
    loadRepData();
    await handleDeepLink(new URLSearchParams(location.search));
  })();

  // Open a student and, if the link points at a specific alert/turnover, the
  // matching pop-up. Used on load (?id=…&openAlert=…) and on SW notification
  // clicks while the page is already open.
  async function handleDeepLink(params) {
    const openId = Number(params.get('id') || 0);
    if (!openId) return;
    await openStudent(openId);
    if (params.get('openAlert')) openListModal('a');
    else if (params.get('openTurnover')) openListModal('t');
  }
  // When a notification is clicked and this page is already open, the service
  // worker posts {type:'open-link', link} instead of navigating.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'open-link' && e.data.link) {
        try { const u = new URL(e.data.link, location.origin); if (u.pathname.endsWith('masterclass.html')) handleDeepLink(u.searchParams); } catch (_) {}
      }
    });
  }
})();
