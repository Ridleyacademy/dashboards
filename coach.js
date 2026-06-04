const SUPABASE_URL = "https://pojqljrhhtnigyrtzdzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
const STUDENTS_BASE = SUPABASE_URL + '/functions/v1/students';
const ZOOM_MEETINGS_BASE = SUPABASE_URL + '/functions/v1/zoom-meetings';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }});

let currentSession = null;
let allStudents = [];
let selectedIds = new Set();
let pinnedIds = new Set();
let listFilter = 'all';
let isAdmin = false;
let isCoach = false;
let isPrivilegedViewer = false;  // admin / ms_ic / mentorship can pick any coach
// Coach-picker default: pure coaches start on "My students"; admins and
// other privileged viewers (ms_ic / mentorship) start on "All coaches".
// Resolved properly in populateCoachPicker() once perms are known.
let coachPick = '__mine__';
let _coachPickInitialized = false;
// Date range — filters students by first_purchase_date (joined date).
// Wide-open sentinels mean "no filter".
let drFrom = '0001-01-01', drTo = '9999-12-31';
let drActivePreset = 'all';

function setState(s) { document.body.dataset.state = s; }
function syncThemeBtn() {
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = document.body.classList.contains('light') ? '🌙' : '☀️';
}
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') document.body.classList.add('light');
syncThemeBtn();
document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
  syncThemeBtn();
});

// ── Auth ──────────────────────────────────────────────────────
async function initAuth() {
  const safety = setTimeout(() => { if (document.body.dataset.state === 'loading') setState('login'); }, 8000);
  try {
    const { data: { session } } = await supa.auth.getSession();
    clearTimeout(safety);
    if (session) { onAuthed(session); return; }
    setState('login');
  } catch(e) { clearTimeout(safety); setState('login'); }
  supa.auth.onAuthStateChange((_e, s) => { if (s) onAuthed(s); else setState('login'); });
}
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('loginErr'); err.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const { data, error } = await supa.auth.signInWithPassword({ email, password: pw });
  if (error) { err.textContent = error.message; return; }
  onAuthed(data.session);
});
document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supa.auth.signOut();
  setState('login');
});
// Dashboard picker dropdown
document.getElementById('navDropdownBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('navDropMenu').classList.toggle('open');
});
document.addEventListener('click', () => {
  document.getElementById('navDropMenu').classList.remove('open');
});

async function onAuthed(session) {
  currentSession = session;
  // Effective identity (handles impersonation transparently). Real session/JWT
  // is still used for server calls; this only swaps what the UI shows + which
  // controls are enabled.
  const eff = window.RidleyPerms.effective(session.user);
  const email = eff.email || session.user.email || '';
  document.getElementById('userEmail').textContent = email + (eff.impersonated ? ' (viewing as)' : '');
  document.getElementById('userAvatar').textContent = (email[0] || 'U').toUpperCase();
  const perms = Array.isArray(eff.permissions) ? eff.permissions : [];
  isAdmin = eff.is_admin === true;
  isCoach = perms.includes('coach');
  isPrivilegedViewer = isAdmin || perms.includes('ms_ic') || perms.includes('delivery_ic') || perms.includes('mentorship');
  if (!isAdmin && !isCoach && !isPrivilegedViewer) {
    document.getElementById('app').innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-dim)">You don\'t have access to the Coach Dashboard. Ask an admin to add the coach permission to your account.</div>';
    setState('dashboard');
    return;
  }
  setState('dashboard');
  // Render from cache (if any) before awaiting any network. This makes the
  // page appear instant on warm reloads.
  const cache = _readStudentsCache();
  if (cache && cache.user_id === currentSession.user.id) {
    allStudents = cache.rows;
    populateCoachPicker();
    renderAll();
  }
  // Kick off in parallel — students refresh + pins. Don't await both before
  // showing the page; let each update its slice as it returns.
  loadStudents();
  loadPins().then(() => { if (allStudents.length) renderAll(); });
  // Upcoming meetings is the slowest call (admins fetch from Zoom across all
  // users). Defer until after the first paint so the page feels responsive.
  setTimeout(() => loadUpcomingMeetings(), 50);
}
async function loadPins() {
  try {
    const { data, error } = await supa.rpc('my_pinned_students');
    if (error) throw error;
    pinnedIds = new Set((data || []).map(r => typeof r === 'object' ? r.my_pinned_students : r));
  } catch (e) { console.warn('loadPins failed', e); }
}
async function togglePin(studentId) {
  try {
    const { data, error } = await supa.rpc('toggle_student_pin', { p_student_id: studentId });
    if (error) throw error;
    if (data === true) pinnedIds.add(studentId);
    else pinnedIds.delete(studentId);
  } catch (e) { alert('Pin failed: ' + (e.message || e)); }
  renderAll();
}
async function quickAddCoachNote(studentId, text) {
  const r = await fetch(STUDENTS_BASE + '?api=add-coach-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
    body: JSON.stringify({ studentId, text }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Failed');
  return j;
}

// ── Load + render ─────────────────────────────────────────────
// Stale-while-revalidate cache for the student list — boots the page instantly
// from cached data, then re-fetches in the background and re-renders if anything
// changed.
const STUDENTS_CACHE_KEY = 'coachDash_students_v4';  // v4: turnover_dates[] added for "has a turnover in range" filter
// Legacy keys we still READ from (for instant first-paint after a key bump).
// The cached row shape hasn't changed — only the rendering logic that reads it
// — so falling back to v1 is safe. The next _writeStudentsCache() will save
// under v2 and the old entry quietly ages out.
// Always read whatever older cache exists for instant paint. The background
// fetch overwrites with fresh data 1-2s later; better to show *something*
// than block on the network.
const STUDENTS_CACHE_LEGACY_KEYS = ['coachDash_students_v3', 'coachDash_students_v2', 'coachDash_students_v1'];
function _readStudentsCache() {
  try {
    let raw = localStorage.getItem(STUDENTS_CACHE_KEY);
    if (!raw) {
      for (const k of STUDENTS_CACHE_LEGACY_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
    }
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.rows) || !j.user_id) return null;
    if (currentSession?.user?.id && j.user_id !== currentSession.user.id) return null; // wrong user
    return j;
  } catch { return null; }
}
function _writeStudentsCache(rows) {
  try { localStorage.setItem(STUDENTS_CACHE_KEY, JSON.stringify({ rows, user_id: currentSession?.user?.id || null, ts: Date.now() })); }
  catch (_) {}
}
async function loadStudents(opts) {
  const tbody = document.getElementById('studentTbody');
  const force = !!(opts && opts.force);

  // 1. Show cached data instantly (if fresh enough — 1 hour cap).
  // Reads STUDENTS_CACHE_KEY first, then falls back to legacy keys so an
  // upgrade never leaves the table blank.
  const cache = _readStudentsCache();
  if (!force && cache && (Date.now() - cache.ts) < 3600_000) {
    allStudents = cache.rows;
    populateCoachPicker();
    renderAll();
  } else if (!allStudents.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-dim);">Loading…</td></tr>';
  }

  // 2. Always fetch fresh in the background
  try {
    const r = await fetch(STUDENTS_BASE + '?api=list', {
      headers: { Authorization: 'Bearer ' + currentSession.access_token },
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    const rows = j.rows || [];
    const sigPrev = allStudents.length + ':' + (allStudents[0]?.id || '');
    const sigNew = rows.length + ':' + (rows[0]?.id || '');
    allStudents = rows;
    _writeStudentsCache(rows);
    if (sigPrev !== sigNew || force || !cache) {
      populateCoachPicker();
      renderAll();
    } else {
      renderAll();
    }
  } catch (e) {
    if (!allStudents.length) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#f87171;">Failed to load: ${escapeHtml(e.message || e)}</td></tr>`;
    console.warn('loadStudents background fetch failed', e);
  }
}
document.getElementById('refreshBtn').addEventListener('click', () => { loadStudents(); loadUpcomingMeetings(); });

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _myCoachIdentities() {
  // Honor impersonation: when an admin "Views as" a coach, we want to filter
  // by THAT coach's identity, not the real admin's.
  const eff = window.RidleyPerms?.effective(currentSession?.user);
  const em = (eff?.email || currentSession?.user?.email || '').toLowerCase().trim();
  // first_name is only on the real user_metadata, not in the impersonate payload.
  // It's only used as a secondary match anyway — coach assignment by email is
  // the primary path.
  const fn = (eff?.impersonated ? '' : (currentSession?.user?.user_metadata?.first_name || '')).toLowerCase().trim();
  const out = new Set();
  if (fn) out.add(fn);
  if (em) out.add(em);
  // Also try the local part of the email (e.g. "ange.bibou+test2" → "ange")
  if (em.includes('@')) {
    const local = em.split('@')[0].split(/[+._]/)[0];
    if (local) out.add(local);
  }
  return out;
}
function _isMine(s, mineSet) {
  const c = (s.coach || '').toLowerCase().trim();
  return c && (mineSet.has(c) || [...mineSet].some(m => c === m));
}

function populateCoachPicker() {
  const sel = document.getElementById('coachPicker');
  // Coaches see only themselves; privileged viewers see All + each coach
  if (!isPrivilegedViewer && isCoach) {
    sel.innerHTML = '<option value="__mine__">My students</option>';
    sel.disabled = true;
    coachPick = '__mine__';
    return;
  }
  const coaches = [...new Set(allStudents.map(s => (s.coach || '').trim()).filter(Boolean))].sort();
  const opts = ['<option value="__all__">All coaches</option>'];
  if (isCoach) opts.push('<option value="__mine__">My students</option>');
  for (const c of coaches) opts.push(`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  sel.innerHTML = opts.join('');
  sel.disabled = false;
  // First time we know perms: privileged viewers (admin / ms_ic / mentorship)
  // default to "All coaches" even if they also have the coach permission —
  // they're here to oversee, not to drill into their own roster.
  if (!_coachPickInitialized) {
    coachPick = isPrivilegedViewer ? '__all__' : '__mine__';
    _coachPickInitialized = true;
  }
  if (!coachPick || !sel.querySelector(`[value="${CSS.escape(coachPick)}"]`)) {
    coachPick = isPrivilegedViewer ? '__all__' : '__mine__';
  }
  sel.value = coachPick;
}
document.getElementById('coachPicker').addEventListener('change', (e) => {
  coachPick = e.target.value;
  selectedIds.clear();
  renderAll();
});

// Filter logic — returns rows + per-bucket counts (computed on the chosen-coach scope)
function _scopedRows() {
  const mine = _myCoachIdentities();
  const q = (document.getElementById('searchBox').value || '').toLowerCase().trim();
  let rows = allStudents.slice();
  // Coach scope
  if (coachPick === '__mine__') rows = rows.filter(s => _isMine(s, mine));
  else if (coachPick !== '__all__') rows = rows.filter(s => (s.coach || '').toLowerCase() === coachPick.toLowerCase());
  // NOTE: the date range filter is intentionally NOT applied here. KPIs,
  // charts, and chip counts always describe the full coach scope so the
  // status snapshot is stable. The date range is applied later, only to
  // the table list, and means "activity in range" — see _applyDateFilter.
  // Search
  if (q) rows = rows.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.email || '').toLowerCase().includes(q) ||
    (s.masterclass_level || '').toLowerCase().includes(q) ||
    (s.level || '').toLowerCase().includes(q));

  // Advanced filters (level, module, status, masterclass level, coach status, last-zoom bucket, etc.)
  rows = _applyAdvancedFilters(rows);

  // NOTE: the "Show expired" filter is intentionally NOT applied here so that
  // KPI tiles + the "Show expired" chip-count can always report the true
  // expired count in scope. The filter is applied later in _filterRows().
  return rows;
}

// Apply the "Show expired / refunded" visibility filters — used after KPIs are
// computed to drop those rows from the visible table when toggles are off.
function _applyShowExpiredFilter(rows) {
  let out = rows;
  if (!showExpired)  out = out.filter(s => s.derived_status !== 'Expired');
  if (!showRefunded) out = out.filter(s => s.derived_status !== 'Refunded');
  return out;
}

// Date range filter — applied ONLY to the table list, not to KPIs or charts.
// Semantics: a student is "in range" if any of their activity dates
// (last_zoom_date, last_assignment_received, last_assignment_sent) falls in
// [drFrom, drTo]. Students with no activity at all are dropped — they have
// nothing to say about activity in any range.
function _applyDateFilter(rows) {
  const wide = drFrom === '0001-01-01' && drTo === '9999-12-31';
  if (wide) return rows;
  return rows.filter(s => {
    const dates = [s.last_zoom_date, s.last_assignment_received, s.last_assignment_sent];
    return dates.some(d => {
      if (!d) return false;
      const iso = String(d).slice(0, 10);
      return iso >= drFrom && iso <= drTo;
    });
  });
}

// Advanced filter state — multi-select sets + buckets
const filters = {
  level: new Set(),
  coach_status: new Set(),
  masterclass_level: new Set(),
  status: new Set(),       // Active / Expiring soon / Paused (Expired handled separately)
  zoom_bucket: '',         // '' | 'never' | '7' | '30' | '90'
  asg_sent_bucket: '',     // '' | 'never' | '7' | '30'
  asg_recv_bucket: '',     // '' | 'never' | '7' | '30'
  has_email: '',           // '' | 'yes' | 'no'
  turnover_mode: '',       // '' | 'ever' | 'range'  — has a turnover (in range)
  turnover_from: '',       // ISO yyyy-mm-dd, used only when turnover_mode='range'
  turnover_to:   '',       // ISO yyyy-mm-dd, used only when turnover_mode='range'
  // "Expiring" threshold (days). Controls both the chip filter and the
  // Expiring KPI. Defaults to 30 so existing behaviour is unchanged.
  expiring_within_days: 30,
  // Used only when expiring_within_days === 'custom'.
  expiring_custom_days: '',
};
let showExpired = false;
let showRefunded = false;

function _filtersActiveCount() {
  let n = 0;
  for (const k of ['level','coach_status','masterclass_level','status']) n += filters[k].size > 0 ? 1 : 0;
  for (const k of ['zoom_bucket','asg_sent_bucket','asg_recv_bucket','has_email','turnover_mode']) n += filters[k] ? 1 : 0;
  return n;
}
function _bucketDays(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0,10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function _applyAdvancedFilters(rows) {
  if (filters.level.size) rows = rows.filter(s => filters.level.has(s.level || ''));
  if (filters.coach_status.size) rows = rows.filter(s => filters.coach_status.has(s.coach_status || ''));
  if (filters.masterclass_level.size) rows = rows.filter(s => filters.masterclass_level.has(s.masterclass_level || ''));
  if (filters.status.size) rows = rows.filter(s => filters.status.has(s.derived_status || ''));
  if (filters.zoom_bucket) rows = rows.filter(s => {
    // "Days since last zoom" filter is actually based on last activity
    // (zoom OR assignment received OR assignment sent — whichever is most recent).
    const days = _bucketDays(_lastActivityDate(s));
    if (filters.zoom_bucket === 'never') return days === null;
    if (filters.zoom_bucket === '7') return days !== null && days > 7;
    if (filters.zoom_bucket === '30') return days !== null && days > 30;
    if (filters.zoom_bucket === '90') return days !== null && days > 90;
    return true;
  });
  if (filters.asg_sent_bucket) rows = rows.filter(s => {
    const days = _bucketDays(s.last_assignment_sent);
    if (filters.asg_sent_bucket === 'never') return days === null;
    if (filters.asg_sent_bucket === '7') return days !== null && days > 7;
    if (filters.asg_sent_bucket === '30') return days !== null && days > 30;
    return true;
  });
  if (filters.asg_recv_bucket) rows = rows.filter(s => {
    const days = _bucketDays(s.last_assignment_received);
    if (filters.asg_recv_bucket === 'never') return days === null;
    if (filters.asg_recv_bucket === '7') return days !== null && days > 7;
    if (filters.asg_recv_bucket === '30') return days !== null && days > 30;
    return true;
  });
  if (filters.has_email === 'yes') rows = rows.filter(s => !!s.email);
  if (filters.has_email === 'no') rows = rows.filter(s => !s.email);
  // "Has a turnover" filter.
  //   'ever'  — student has at least one turnover on record
  //   'range' — student has at least one turnover with date in [from, to]
  // turnover_dates is an array of ISO yyyy-mm-dd strings from /api=list.
  if (filters.turnover_mode === 'ever') {
    rows = rows.filter(s => Array.isArray(s.turnover_dates) && s.turnover_dates.length > 0);
  } else if (filters.turnover_mode === 'range') {
    const tf = filters.turnover_from || '0001-01-01';
    const tt = filters.turnover_to   || '9999-12-31';
    rows = rows.filter(s => Array.isArray(s.turnover_dates) && s.turnover_dates.some(d => d >= tf && d <= tt));
  }
  return rows;
}

// ── Date Range Picker (mirrors the pattern in calls.html) ────
const DR_LABELS = { 'all': 'All Time', 'last-30': 'Last 30 Days', 'this-week': 'This Week', 'last-week': 'Last Week', 'mtd': 'Month to Date' };
function _drIso(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function _drFmt(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function _drPresetRange(preset) {
  const today = new Date();
  if (preset === 'all') return { from: '0001-01-01', to: '9999-12-31' };
  if (preset === 'last-30') {
    const f = new Date(today); f.setDate(f.getDate() - 30);
    return { from: _drIso(f), to: _drIso(today) };
  }
  if (preset === 'mtd') {
    return { from: _drIso(new Date(today.getFullYear(), today.getMonth(), 1)), to: _drIso(today) };
  }
  const sinceThu = (today.getDay() + 3) % 7;
  const thisThu = new Date(today); thisThu.setDate(today.getDate() - sinceThu);
  if (preset === 'this-week') return { from: _drIso(thisThu), to: _drIso(today) };
  if (preset === 'last-week') {
    const lThu = new Date(thisThu); lThu.setDate(thisThu.getDate() - 7);
    const lWed = new Date(lThu); lWed.setDate(lThu.getDate() + 6);
    return { from: _drIso(lThu), to: _drIso(lWed) };
  }
  return { from: _drIso(today), to: _drIso(today) };
}
function drApplyPreset(preset, reload) {
  const { from, to } = _drPresetRange(preset);
  drActivePreset = preset; drFrom = from; drTo = to;
  document.getElementById('dateFrom').value = (from === '0001-01-01' ? '' : from);
  document.getElementById('dateTo').value   = (to   === '9999-12-31' ? '' : to);
  document.querySelectorAll('.dr-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  document.getElementById('drLabel').textContent = DR_LABELS[preset] || preset;
  document.getElementById('daterangePopup').classList.remove('open');
  try { localStorage.setItem('coach:dateRange:v1', JSON.stringify({ preset, from, to })); } catch (_) {}
  if (reload) { selectedIds.clear(); renderAll(); }
}
// Restore last range
(function(){
  let p = 'all';
  try {
    const s = JSON.parse(localStorage.getItem('coach:dateRange:v1') || 'null');
    if (s && s.preset && Object.keys(DR_LABELS).includes(s.preset)) p = s.preset;
    else if (s && s.from && s.to) {
      drFrom = s.from; drTo = s.to; drActivePreset = null;
    }
  } catch (_) {}
  if (drActivePreset !== null) drApplyPreset(p, false);
  else {
    document.getElementById('dateFrom').value = drFrom;
    document.getElementById('dateTo').value = drTo;
    document.getElementById('drLabel').textContent = `${_drFmt(drFrom)} – ${_drFmt(drTo)}`;
    document.querySelectorAll('.dr-preset').forEach(b => b.classList.remove('active'));
  }
})();
document.getElementById('daterangeBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('daterangePopup').classList.toggle('open');
});
document.getElementById('daterangePopup').addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => document.getElementById('daterangePopup').classList.remove('open'));
document.querySelectorAll('.dr-preset').forEach(b => {
  b.addEventListener('click', () => drApplyPreset(b.dataset.preset, true));
});
document.getElementById('drApply').addEventListener('click', () => {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  if (!from || !to) return;
  drFrom = from; drTo = to; drActivePreset = null;
  document.querySelectorAll('.dr-preset').forEach(b => b.classList.remove('active'));
  document.getElementById('drLabel').textContent = `${_drFmt(from)} – ${_drFmt(to)}`;
  document.getElementById('daterangePopup').classList.remove('open');
  try { localStorage.setItem('coach:dateRange:v1', JSON.stringify({ preset: null, from, to })); } catch (_) {}
  selectedIds.clear(); renderAll();
});
function _daysSince(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (isNaN(t)) return null;
  const y = new Date(d).getFullYear();
  // Year sanity (e.g. "0206-04-29" typos)
  if (y < 2020 || y > 2100) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  // Future dates (M/D ↔ D/M swap victims, or genuine typos) — treat as missing
  // so averages and "stale" coloring stay sane. Allow 1 day of clock slack.
  if (days < -1) return null;
  return days;
}
// Most recent of zoom / assignment-received / assignment-sent. Used wherever
// we care about "when did this student last have ANY activity" rather than
// the specific event type.
function _lastActivityDate(s) {
  const toTs = (d) => { if (!d) return -Infinity; const t = new Date(d).getTime(); const y = new Date(d).getFullYear(); return (!isNaN(t) && y >= 2020 && y <= 2100) ? t : -Infinity; };
  const cands = [s.last_zoom_date, s.last_assignment_received, s.last_assignment_sent];
  let best = -Infinity, bestRaw = null;
  for (const d of cands) { const t = toTs(d); if (t > best) { best = t; bestRaw = d; } }
  return bestRaw;
}
function _daysSinceActivity(s) { return _daysSince(_lastActivityDate(s)); }
function _isAtRisk(s) {
  const dz = _daysSince(s.last_zoom_date);
  const da = _daysSince(s.last_assignment_received);
  const both14 = (dz === null || dz > 14) && (da === null || da > 14);
  // exclude already-expired or paused students from the at-risk view by default
  const status = s.derived_status;
  return both14 && status !== 'Expired' && status !== 'Paused' && status !== 'Not onboarded' && status !== 'Delayed start';
}
// Resolve the currently-selected "expiring within N days" threshold.
// Returns a positive integer; falls back to 30 if invalid.
function _expiringThreshold() {
  const v = filters.expiring_within_days;
  if (v === 'custom') {
    const t = parseInt(filters.expiring_custom_days, 10);
    return (Number.isFinite(t) && t > 0) ? t : 30;
  }
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 30;
}
function _isExpiring(s) {
  const t = _expiringThreshold();
  // Always include the explicit "Expiring soon" derived status, plus any
  // student whose days_left falls within the configured window.
  return s.derived_status === 'Expiring soon' || (s.days_left != null && s.days_left >= 0 && s.days_left <= t);
}
function _isNeedsAttention(s) {
  return (s.coach_status || '').toLowerCase() === 'needs attention';
}

function _filterRows(rows) {
  if (listFilter === 'all') return rows;
  if (listFilter === 'inactive') return rows.filter(s => s.derived_status === 'Inactive');
  if (listFilter === 'expiring') return rows.filter(_isExpiring);
  if (listFilter === 'needs') return rows.filter(_isNeedsAttention);
  return rows;
}

function _isExpired(s) { return s.derived_status === 'Expired'; }
function _isPaused(s)  { return s.derived_status === 'Paused'; }
// "Active" for stats means: not Expired and not Paused. Other statuses
// (Active, Expiring soon, Not onboarded, Delayed start) all count as live roster.
function _isActiveForStats(s) { return !_isExpired(s) && !_isPaused(s); }

function renderAll() {
  const scoped = _scopedRows();              // always includes expired (so KPIs see them)
  let rows = _filterRows(scoped);
  rows = _applyShowExpiredFilter(rows);      // hide expired from the table only when toggle is off

  // Buckets driven by derived_status — single source of truth.
  const statusOf  = (s) => s.derived_status || '';
  const expired   = scoped.filter(_isExpired);
  const paused    = scoped.filter(_isPaused);
  // Live coaching roster — only students who are currently being coached.
  // Excludes: Refunded, Expired, Paused, Not onboarded, Delayed start, Graduated, Cancelled.
  // Includes: Active, Inactive, Expiring soon (the latter is term-status, not
  // engagement-status — see below).
  const LIVE_COACHING = new Set(['Active','Inactive','Expiring soon']);
  const liveCoaching = scoped.filter(s => LIVE_COACHING.has(statusOf(s)));
  // Active / Inactive KPI rule (engagement-based, applied to ALL live coaching
  // students including Expiring-soon): activity in the last 7 days → Active,
  // otherwise → Inactive. This ensures Expiring-soon students who are still
  // engaged get credited to Active, and silent ones to Inactive — so Active +
  // Inactive sums to the live coaching roster.
  const _ACTIVE_WINDOW = 7;
  const _engaged = (s) => {
    const d = _daysSinceActivity(s);
    return d != null && d <= _ACTIVE_WINDOW;
  };
  const active    = liveCoaching.filter(_engaged);
  const inactive  = liveCoaching.filter(s => !_engaged(s));
  // "Live roster" = used as scope for the Expiring KPI.
  const liveRoster = scoped.filter(_isActiveForStats);

  // KPIs describe the filtered table view BEFORE the Show-expired toggle —
  // so the Expired tile always shows the real count even when expired rows
  // are hidden from the table.
  const preToggleRows = _filterRows(scoped);
  // Denominator for %-bearing tiles EXCLUDES Expired and Refunded — those
  // are reported as bare counts (no %) since they sit outside the active
  // book. Active / Inactive / Paused / Not onboarded / Delayed start then
  // partition this denominator cleanly.
  const denomRows  = preToggleRows.filter(s => !_isExpired(s) && statusOf(s) !== 'Refunded');
  const ptLive     = denomRows.filter(s => LIVE_COACHING.has(statusOf(s)));
  const rEngaged   = ptLive.filter(_engaged);
  const rInactive  = ptLive.filter(s => !_engaged(s));
  const rPaused    = denomRows.filter(_isPaused);
  const rNotOnb    = denomRows.filter(s => statusOf(s) === 'Not onboarded');
  const rDelayed   = denomRows.filter(s => statusOf(s) === 'Delayed start');
  // Expiring and Expired are reported as counts only — Expiring overlaps
  // with Active/Inactive (a student can be both), Expired sits outside the
  // book entirely. Both still show real counts regardless of toggle.
  const rExpiring  = preToggleRows.filter(_isExpiring).filter(_isActiveForStats);
  const rExpired   = preToggleRows.filter(_isExpired);
  const filteredDenom = denomRows.length;
  const pct = (n, d) => d ? Math.round(100 * n / d) + '%' : '0%';
  const setKPI = (id, count, denom, hidePct) => {
    const el  = document.getElementById('kpi-' + id);
    const pel = document.getElementById('kpi-' + id + '-pct');
    if (el)  el.textContent  = count;
    if (pel) pel.textContent = hidePct ? '' : pct(count, denom);
  };

  setKPI('active',       rEngaged.length,  filteredDenom);
  setKPI('inactive',     rInactive.length, filteredDenom);
  setKPI('expiring',     rExpiring.length, 0, true);  // count only — overlaps with Active/Inactive
  setKPI('expired',      rExpired.length,  0, true);  // count only — always shown, no %
  setKPI('paused',       rPaused.length,   filteredDenom);
  setKPI('notonboarded', rNotOnb.length,   filteredDenom);
  setKPI('delayed',      rDelayed.length,  filteredDenom);

  // Chip counts — preview of what each chip would show. Computed against
  // the full scoped roster (chips re-filter `scoped`), independent of the
  // currently-applied chip filter.
  const scopedInactive = liveCoaching.filter(s => !_engaged(s)).length;
  const scopedExpiring = liveRoster.filter(_isExpiring).length;
  document.getElementById('cnt-all').textContent = scoped.length;
  document.getElementById('cnt-inactive').textContent = scopedInactive;
  document.getElementById('cnt-expiring').textContent = scopedExpiring;
  document.getElementById('cnt-needs').textContent = liveCoaching.filter(_isNeedsAttention).length;
  // Show expired / refunded chip counts: number hidden in current scope when toggle is off
  const expiredCount  = scoped.filter(s => s.derived_status === 'Expired').length;
  const refundedCount = scoped.filter(s => s.derived_status === 'Refunded').length;
  const showExpEl  = document.getElementById('cnt-expired');
  const showRefEl  = document.getElementById('cnt-refunded');
  if (showExpEl) showExpEl.textContent = expiredCount;
  if (showRefEl) showRefEl.textContent = refundedCount;
  // Filters button badge
  const fc = document.getElementById('filtersCount');
  const n = _filtersActiveCount();
  if (fc) { fc.textContent = n; fc.style.display = n ? '' : 'none'; }

  // Render charts (computed on `scoped` — current coach scope, NO date range)
  renderCharts(scoped);

  // Apply the date-range filter only to the TABLE list — KPIs, charts, chip
  // counts above all ignore it. Filter is by activity (zoom / asg sent /
  // asg recv) falling in [drFrom, drTo].
  rows = _applyDateFilter(rows);

  // Sort: pinned first, then at-risk, then by days since zoom desc, then name
  rows.sort((a, b) => {
    const ap = pinnedIds.has(a.id) ? 1 : 0;
    const bp = pinnedIds.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    // Inactive students bubble to the top (replaces the old "at risk" sort priority).
    const ai = a.derived_status === 'Inactive' ? 1 : 0;
    const bi = b.derived_status === 'Inactive' ? 1 : 0;
    if (ai !== bi) return bi - ai;
    // Stale-activity first: sort by days since last activity (any of zoom / asg-recv / asg-sent), descending.
    const az = _daysSinceActivity(a); const bz = _daysSinceActivity(b);
    const av = az == null ? -1 : az; const bv = bz == null ? -1 : bz;
    if (av !== bv) return bv - av;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Render table
  const tbody = document.getElementById('studentTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-dim);">No students match.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(s => {
      const dz = _daysSince(s.last_zoom_date);
      const da = _daysSince(s.last_assignment_received);
      const ds = _daysSince(s.last_assignment_sent);
      const cls = (d) => d === null ? '' : (d <= 14 ? 'fresh' : d <= 30 ? 'stale' : 'dead');
      const fmt = (d, raw) => raw ? `<span class="dsince ${cls(d)}">${d}d</span>` : '<span class="dsince" style="opacity:.4">—</span>';
      const status = s.derived_status || "—";
      const statusClass = status === 'Expired' ? 'bad' : status === 'Expiring soon' ? 'warn' : status === 'Paused' ? 'muted' : status === 'Active' ? 'ok' : 'muted';
      const checked = selectedIds.has(s.id) ? 'checked' : '';
      const isPinned = pinnedIds.has(s.id);
      const noteCount = s.coach_notes_count || 0;
      const trClasses = [
        selectedIds.has(s.id) ? 'selected' : '',
        isPinned ? 'pinned' : '',
      ].filter(Boolean).join(' ');
      // Lucide-style stroke SVGs matching the dashboard's icon vocabulary
      const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`;
      const noteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`;
      const noteBadge = noteCount > 0 ? `<span class="note-badge">${noteCount}</span>` : '';
      return `<tr data-id="${s.id}" class="${trClasses}">
        <td class="col-check" data-label=""><input type="checkbox" data-rowsel="${s.id}" ${checked}></td>
        <td class="col-actions" data-label=""><div class="row-actions">
          <button data-pin="${s.id}" class="${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin from top' : 'Pin to top of list'}">${pinSvg}</button>
          <button data-note="${s.id}" title="${noteCount} coach note${noteCount===1?'':'s'} — click to view or add">${noteSvg}${noteBadge}</button>
        </div></td>
        <td class="col-name" data-label="Name"><strong>${escapeHtml(s.name || '(unnamed)')}</strong><br><span style="font-size:0.72rem;color:var(--text-dim);">${escapeHtml(s.email || '')}</span></td>
        <td data-label="Level">${escapeHtml(s.level || '—')}</td>
        <td data-label="Masterclass">${escapeHtml(s.masterclass_level || '—')}</td>
        <td data-label="Last Zoom">${fmt(dz, s.last_zoom_date)}</td>
        <td data-label="Asgmt Sent">${fmt(ds, s.last_assignment_sent)}</td>
        <td data-label="Asgmt Recv">${fmt(da, s.last_assignment_received)}</td>
        <td class="num" data-label="Days left">${s.days_left == null ? '—' : (s.days_left + 'd')}</td>
        <td data-label="Status"><span class="pill ${statusClass}">${escapeHtml(status)}</span></td>
      </tr>`;
    }).join('');
    // Wire row click → open profile modal (but ignore checkbox + action buttons)
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target?.tagName === 'INPUT') return;
        if (e.target?.closest?.('[data-pin], [data-note]')) return;
        const id = parseInt(tr.dataset.id, 10);
        openProfileModal(id);
      });
    });
    tbody.querySelectorAll('[data-rowsel]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.rowsel, 10);
        if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        e.target.closest('tr').classList.toggle('selected', e.target.checked);
        updateBulkbar();
      });
    });
    // Pin toggle
    tbody.querySelectorAll('[data-pin]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(b.dataset.pin, 10);
        togglePin(id);
      });
    });
    // Quick coach-note popover
    tbody.querySelectorAll('[data-note]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(b.dataset.note, 10);
        const s = allStudents.find(x => x.id === id);
        openQuickNotePopover(b, id, s?.name || '');
      });
    });
  }
  updateBulkbar();
}

document.getElementById('searchBox').addEventListener('input', renderAll);
document.querySelectorAll('.chip[data-filter]').forEach(b => {
  b.addEventListener('click', () => {
    listFilter = b.dataset.filter;
    document.querySelectorAll('.chip[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderAll();
  });
});
document.getElementById('showExpiredBtn').addEventListener('click', (e) => {
  showExpired = !showExpired;
  e.currentTarget.style.background = showExpired ? 'rgba(248,113,113,0.18)' : 'transparent';
  e.currentTarget.style.color = showExpired ? '#f87171' : 'var(--text-dim)';
  e.currentTarget.style.borderStyle = showExpired ? 'solid' : 'dashed';
  e.currentTarget.firstChild.textContent = (showExpired ? '✓ Showing expired ' : '+ Show expired ');
  renderAll();
});
document.getElementById('showRefundedBtn').addEventListener('click', (e) => {
  showRefunded = !showRefunded;
  e.currentTarget.style.background = showRefunded ? 'rgba(248,113,113,0.18)' : 'transparent';
  e.currentTarget.style.color = showRefunded ? '#f87171' : 'var(--text-dim)';
  e.currentTarget.style.borderStyle = showRefunded ? 'solid' : 'dashed';
  e.currentTarget.firstChild.textContent = (showRefunded ? '✓ Showing refunded ' : '+ Show refunded ');
  renderAll();
});
// "Expiring within" window selector — controls both the chip filter and
// the matching KPI tile so the count stays in sync with what's shown.
(function wireExpiringWindow() {
  const sel = document.getElementById('expiringWindowSel');
  const custom = document.getElementById('expiringCustomDays');
  if (!sel) return;
  const apply = () => {
    if (sel.value === 'custom') {
      custom.style.display = '';
      filters.expiring_within_days = 'custom';
      filters.expiring_custom_days = custom.value.trim();
    } else {
      custom.style.display = 'none';
      filters.expiring_within_days = parseInt(sel.value, 10) || 30;
    }
    renderAll();
  };
  sel.addEventListener('change', apply);
  custom.addEventListener('input', () => {
    filters.expiring_custom_days = custom.value.trim();
    renderAll();
  });
})();
document.getElementById('filtersBtn').addEventListener('click', openFiltersModal);
document.getElementById('checkAll').addEventListener('change', (e) => {
  // "Select all" matches what's visible in the table: scope + chip filter +
  // show-expired toggle + date range.
  const rows = _applyDateFilter(_applyShowExpiredFilter(_filterRows(_scopedRows())));
  if (e.target.checked) rows.forEach(s => selectedIds.add(s.id));
  else rows.forEach(s => selectedIds.delete(s.id));
  renderAll();
});

function updateBulkbar() {
  const bar = document.getElementById('bulkbar');
  bar.classList.toggle('visible', selectedIds.size > 0);
  document.getElementById('bulkCount').textContent = selectedIds.size + ' selected';
}
document.getElementById('bulkClearBtn').addEventListener('click', () => { selectedIds.clear(); renderAll(); });
document.getElementById('bulkApplyBtn').addEventListener('click', () => openBulkEditModal());

// ── Coach-notes popover (list + add — same data as the CRM) ──
async function openQuickNotePopover(anchorEl, studentId, studentName) {
  document.getElementById('quickNotePop')?.remove();
  const pop = document.createElement('div');
  pop.id = 'quickNotePop';
  pop.className = 'note-popover';
  pop.innerHTML = `
    <div class="np-head">
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        Coach notes · ${escapeHtml(studentName || '(unnamed)')}
      </span>
      <span class="np-count" id="qnCount">…</span>
      <span class="grow"></span>
      <a href="students.html?student=${studentId}" target="_blank" title="Open full profile in CRM">Open in CRM ↗</a>
    </div>
    <div class="np-list" id="qnList"></div>
    <div class="np-divider"></div>
    <textarea id="qnText" placeholder="Add a new note — observation, follow-up, win…  (Cmd/Ctrl+Enter to save, Esc to close)"></textarea>
    <div class="np-foot">
      <span class="msg" id="qnMsg"></span>
      <button class="btn-ghost" id="qnCancel">Close</button>
      <button class="btn-primary" id="qnSave">Save note</button>
    </div>`;
  document.body.appendChild(pop);

  // Position popover near the button (clamp to viewport)
  const r = anchorEl.getBoundingClientRect();
  const popW = 420;
  let left = Math.min(r.left, window.innerWidth - popW - 12);
  // Default below the button; if no room, place above
  pop.style.left = Math.max(12, left) + 'px';
  pop.style.top  = (r.bottom + 6) + 'px';
  // After render, re-check vertical fit
  requestAnimationFrame(() => {
    const ph = pop.offsetHeight;
    if (r.bottom + 6 + ph > window.innerHeight - 12) {
      pop.style.top = Math.max(12, r.top - ph - 6) + 'px';
    }
  });

  function close() {
    pop.remove();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside, true);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
  }
  function onOutside(e) { if (!pop.contains(e.target)) close(); }
  setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  document.addEventListener('keydown', onKey);
  document.getElementById('qnCancel').addEventListener('click', close);

  // Load existing notes from the same source the CRM uses (?api=get returns coach_notes)
  async function loadNotes() {
    try {
      const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(studentId), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      const notes = Array.isArray(j.coach_notes) ? j.coach_notes : [];
      document.getElementById('qnCount').textContent = notes.length;
      const list = document.getElementById('qnList');
      list.innerHTML = notes.map(n => {
        const when = n.note_date || n.created_at || '';
        const whenStr = when ? new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const who = n.created_by_email || 'unknown';
        return `<div class="np-note-row">
          <div class="np-note-meta">${escapeHtml(whenStr)} · ${escapeHtml(who)}</div>
          <div class="np-note-text">${escapeHtml(n.text || '')}</div>
        </div>`;
      }).join('');
      // Sync local cached count so the badge stays right
      const idx = allStudents.findIndex(x => x.id === studentId);
      if (idx >= 0) allStudents[idx].coach_notes_count = notes.length;
    } catch (e) {
      document.getElementById('qnList').innerHTML = `<div style="color:#f87171;font-size:0.78rem;padding:8px;">Failed to load: ${escapeHtml(e.message || e)}</div>`;
    }
  }
  loadNotes();
  setTimeout(() => document.getElementById('qnText').focus(), 50);

  async function save() {
    const ta = document.getElementById('qnText');
    const text = ta.value.trim();
    const msg = document.getElementById('qnMsg');
    msg.className = 'msg'; msg.textContent = '';
    if (!text) { msg.className = 'msg err'; msg.textContent = 'Note can\'t be empty.'; return; }
    msg.textContent = 'Saving…';
    try {
      await quickAddCoachNote(studentId, text);
      msg.className = 'msg ok'; msg.textContent = 'Saved.';
      ta.value = '';
      // Refresh the list inline (no popover close — encourage rapid logging)
      loadNotes();
      // Update the row's badge in the table without a full re-render
      const idx = allStudents.findIndex(x => x.id === studentId);
      if (idx >= 0) {
        allStudents[idx].coach_notes_count = (allStudents[idx].coach_notes_count || 0) + 1;
      }
      // Update just the badge on the originating button if it's still in DOM
      const btn = document.querySelector(`[data-note="${studentId}"]`);
      if (btn) {
        const cnt = (allStudents[idx]?.coach_notes_count || 0);
        let badge = btn.querySelector('.note-badge');
        if (cnt > 0) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'note-badge';
            btn.appendChild(badge);
          }
          badge.textContent = cnt;
        }
      }
      setTimeout(() => { msg.textContent = ''; msg.className = 'msg'; }, 1200);
    } catch (e) { msg.className = 'msg err'; msg.textContent = 'Save failed: ' + (e.message || e); }
  }
  document.getElementById('qnSave').addEventListener('click', save);
}

// ── Profile modal: minimal coach-relevant editor ──────────────
// Re-entrancy guards: only the LATEST click produces a modal. A previous
// in-flight fetch is aborted so its (stale) response cannot pop up over the
// user's current selection.
let _profileLatestId = null;
let _profileAbort = null;

async function openProfileModal(id) {
  _profileLatestId = id;
  if (_profileAbort) { try { _profileAbort.abort(); } catch (_) {} }
  const ac = new AbortController();
  _profileAbort = ac;

  document.getElementById('profileModal')?.remove();

  // Render the modal IMMEDIATELY from the row we already have in the list
  // (allStudents). activity_log starts empty and is patched in once the
  // network response lands. Avoids a 1-3s blank-screen wait while ?api=get
  // runs ~10 parallel DB queries.
  const cached = allStudents.find(s => s.id === id);
  let row = cached ? { ...cached } : null;
  let activityLog = [];
  if (!row) {
    // No cache (rare) — fall through to the fetch path which will alert on error.
    try {
      const r0 = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
        signal: ac.signal,
      });
      if (_profileLatestId !== id) return;
      const j0 = await r0.json();
      if (_profileLatestId !== id) return;
      if (!r0.ok) throw new Error(j0.error || 'Failed');
      row = j0.row;
      activityLog = Array.isArray(j0.activity_log) ? j0.activity_log : [];
    } catch (e) {
      if (e?.name === 'AbortError') return;
      alert('Failed to load: ' + (e.message || e));
      return;
    }
  }

  const m = document.createElement('div');
  m.id = 'profileModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h2>${escapeHtml(row.name || '(unnamed)')}</h2>
        <button type="button" class="btn-ghost pf-jump-alerts" title="Open alerts for this student in the CRM" style="padding:6px 12px;font-size:0.78rem;">
          🔔 Alerts${(row.open_alerts_count|0) > 0 ? ` <span style="background:#f87171;color:#1a0f0f;border-radius:9px;padding:1px 7px;margin-left:4px;font-size:0.7rem;font-weight:800;">${row.open_alerts_count}</span>` : ''}
        </button>
        <button type="button" class="btn-ghost pf-jump-logs" title="View / add logs (coach notes, wins, rep notes, IC notes, turnovers)" style="padding:6px 12px;font-size:0.78rem;">
          📋 Logs${(row.coach_notes_count|0) > 0 ? ` <span style="background:rgba(34,211,238,0.18);color:#22d3ee;border-radius:9px;padding:1px 7px;margin-left:4px;font-size:0.7rem;font-weight:800;">${row.coach_notes_count}</span>` : ''}
        </button>
        ${(row.lessons_total|0) > 0 ? `
        <span class="pf-lessons" title="Lessons done = assignments received from this student${(row.lessons_total - (row.lessons_received_count|0)) ? ' (' + (row.lessons_received_count|0) + ' logged + ' + (row.lessons_total - (row.lessons_received_count|0)) + ' backlog)' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:0.78rem;background:rgba(107,158,255,0.14);color:#6b9eff;border:1px solid rgba(107,158,255,0.35);border-radius:8px;font-weight:700;">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          ${row.lessons_total} lesson${row.lessons_total !== 1 ? 's' : ''}
        </span>` : ''}
        <a href="students.html?student=${row.id}" target="_blank" class="btn-ghost" title="Open in full CRM">Full profile ↗</a>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body">
        <div><label>Email</label><input id="pf-email" value="${escapeHtml(row.email||'')}" readonly></div>
        <div><label>Coach</label><input id="pf-coach" value="${escapeHtml(row.coach||'')}" readonly title="Coach is managed in the full CRM"></div>
        <div><label>Level</label>
          <select id="pf-level">
            <option value="">—</option><option ${row.level==='Beginner'?'selected':''}>Beginner</option>
            <option ${row.level==='Intermediate'?'selected':''}>Intermediate</option>
            <option ${row.level==='Advanced'?'selected':''}>Advanced</option>
          </select></div>
        <div><label>Coach status</label>
          <select id="pf-coach_status">
            <option value="">—</option>
            <option ${row.coach_status==='All good'?'selected':''}>All good</option>
            <option ${row.coach_status==='Needs attention'?'selected':''}>Needs attention</option>
          </select></div>
        <div><label>Masterclass level</label>
          <select id="pf-masterclass_level">
            <option value="">—</option>
            ${['INTRODUCTION','LEVEL 1','LEVEL 2','LEVEL 3','LEVEL 4','LEVEL 5','LEVEL 6','LEVEL 7','LEVEL 8','LEVEL 9','LEVEL 10'].map(v => `<option value="${v}" ${row.masterclass_level===v?'selected':''}>${v}</option>`).join('')}
          </select></div>
        <div class="full"><label>Activity history</label>
          <div id="pf-activity" class="pf-activity"></div>
        </div>
        <div><label>Schedule</label><input id="pf-preferred_time_slot" value="${escapeHtml(row.preferred_time_slot||'')}" placeholder="e.g. Tue/Thu 6pm CET"></div>
        <div class="full"><label>Concern</label><textarea id="pf-concern" placeholder="Practice constraints, problem areas…">${escapeHtml(row.concern||'')}</textarea></div>
        <div class="full"><label>Goal</label><textarea id="pf-goal" placeholder="What are they working toward?">${escapeHtml(row.goal||'')}</textarea></div>
      </div>
      <div class="modal-foot">
        <span class="msg" id="pf-msg"></span>
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="pf-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  // Header quick-access buttons
  m.querySelector('.pf-jump-alerts')?.addEventListener('click', () => {
    openCoachAlertsModal(row.id, row.name || '');
  });
  m.querySelector('.pf-jump-logs')?.addEventListener('click', (e) => {
    openCoachLogsModal(row.id, row.name || '', e.currentTarget);
  });
  // Render the activity-history block (replaces the three single-date inputs).
  // The last_* date columns on mentorship_students are auto-maintained by a
  // trigger that recomputes MAX(activity_date) per kind on every insert/delete
  // against mentorship_activity_log — so we never POST those columns from this
  // modal anymore. The log is the source of truth.
  renderActivityHistory();

  // Background refresh: pull the activity_log from the server and re-render
  // the Activity History section once it lands. Other fields are already
  // accurate from the list cache, so we don't disturb the rest of the modal.
  if (cached) {
    (async () => {
      try {
        const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(id), {
          headers: { Authorization: 'Bearer ' + currentSession.access_token },
          signal: ac.signal,
        });
        if (_profileLatestId !== id) return;
        const j = await r.json();
        if (_profileLatestId !== id) return;
        if (!r.ok) return;
        const log = Array.isArray(j.activity_log) ? j.activity_log : [];
        // Only re-render if the modal is still ours and the log actually has new entries.
        if (!document.getElementById('profileModal')) return;
        if (log.length === activityLog.length) return;
        activityLog = log;
        renderActivityHistory();
      } catch (e) { /* swallow — partial view is still usable */ }
    })();
  }

  function renderActivityHistory() {
    const wrap = document.getElementById('pf-activity');
    if (!wrap) return;
    const KINDS = [
      { key: 'zoom',                 label: 'Zoom calls',            cached: row.last_zoom_date },
      { key: 'assignment_sent',      label: 'Assignment sent',       cached: row.last_assignment_sent },
      { key: 'assignment_received',  label: 'Assignment received',   cached: row.last_assignment_received },
    ];
    const grouped = { zoom: [], assignment_sent: [], assignment_received: [] };
    for (const e of activityLog) { if (grouped[e.kind]) grouped[e.kind].push(e); }
    // Each kind is sorted newest-first by the backend already.
    const today = new Date().toISOString().slice(0, 10);
    wrap.innerHTML = KINDS.map(k => {
      const list = grouped[k.key] || [];
      const latest = list[0]?.activity_date || k.cached || '—';
      return `
        <div class="pf-act-block" data-kind="${k.key}">
          <div class="pf-act-head">
            <div class="pf-act-title">${escapeHtml(k.label)}</div>
            <div class="pf-act-latest">Latest: <strong>${latest ? escapeHtml(latest) : '—'}</strong> <span class="pf-act-count">(${list.length} entr${list.length===1?'y':'ies'})</span></div>
            <button class="btn-ghost pf-act-toggle" data-kind="${k.key}" type="button">${list.length ? '▾ History' : '+ Add'}</button>
          </div>
          <div class="pf-act-body" data-kind="${k.key}" style="display:none;">
            <div class="pf-act-add">
              <input type="date" class="pf-act-date" data-kind="${k.key}" value="${today}">
              <input type="text" class="pf-act-notes" data-kind="${k.key}" placeholder="Optional note (assignment #, topic…)" maxlength="200">
              <button class="btn-primary pf-act-add-btn" data-kind="${k.key}" type="button">Add</button>
            </div>
            <div class="pf-act-list" data-kind="${k.key}">
              ${list.length === 0 ? '<div class="pf-act-empty">No history yet.</div>' : list.map(e => `
                <div class="pf-act-row" data-id="${e.id}">
                  <div class="pf-act-row-date">${escapeHtml(e.activity_date || '')}</div>
                  <div class="pf-act-row-notes">${escapeHtml(e.notes || '')}</div>
                  <div class="pf-act-row-meta">${escapeHtml((e.created_by_email || e.source || '').toString())}</div>
                  <button class="pf-act-del" data-id="${e.id}" data-kind="${k.key}" title="Delete this entry" type="button">×</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;
    }).join('');

    // Toggle disclosure
    wrap.querySelectorAll('.pf-act-toggle').forEach(b => b.addEventListener('click', () => {
      const k = b.getAttribute('data-kind');
      const body = wrap.querySelector(`.pf-act-body[data-kind="${k}"]`);
      const show = body.style.display === 'none';
      body.style.display = show ? '' : 'none';
    }));

    // Add a new log entry
    wrap.querySelectorAll('.pf-act-add-btn').forEach(b => b.addEventListener('click', async () => {
      const k = b.getAttribute('data-kind');
      const dateEl  = wrap.querySelector(`.pf-act-date[data-kind="${k}"]`);
      const notesEl = wrap.querySelector(`.pf-act-notes[data-kind="${k}"]`);
      const date = dateEl.value;
      if (!date) return;
      b.disabled = true; b.textContent = '…';
      try {
        const r = await fetch(STUDENTS_BASE + '?api=add-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ studentId: row.id, kind: k, activity_date: date, notes: notesEl.value.trim() || null }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        activityLog.unshift({ id: j.id, student_id: row.id, kind: k, activity_date: date, source: 'manual_entry', notes: notesEl.value.trim() || null, created_by_email: currentSession?.user?.email || null });
        // Update cached row + the dashboard row so the table reflects the new max.
        if (k === 'zoom')                  row.last_zoom_date           = activityLog.filter(e=>e.kind==='zoom').map(e=>e.activity_date).sort().slice(-1)[0] || null;
        if (k === 'assignment_sent')       row.last_assignment_sent     = activityLog.filter(e=>e.kind==='assignment_sent').map(e=>e.activity_date).sort().slice(-1)[0] || null;
        if (k === 'assignment_received')   row.last_assignment_received = activityLog.filter(e=>e.kind==='assignment_received').map(e=>e.activity_date).sort().slice(-1)[0] || null;
        const idx = allStudents.findIndex(s => s.id === row.id);
        if (idx >= 0) Object.assign(allStudents[idx], { last_zoom_date: row.last_zoom_date, last_assignment_sent: row.last_assignment_sent, last_assignment_received: row.last_assignment_received });
        notesEl.value = '';
        renderActivityHistory();
        // Keep the just-edited section open
        wrap.querySelector(`.pf-act-body[data-kind="${k}"]`).style.display = '';
      } catch (e) { alert('Add failed: ' + (e.message || e)); }
      finally { b.disabled = false; b.textContent = 'Add'; }
    }));

    // Delete an entry
    wrap.querySelectorAll('.pf-act-del').forEach(b => b.addEventListener('click', async () => {
      const eid = Number(b.getAttribute('data-id'));
      const k = b.getAttribute('data-kind');
      if (!confirm('Delete this entry? The cached "Latest" value will roll back to the next most-recent date.')) return;
      try {
        const r = await fetch(STUDENTS_BASE + '?api=delete-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: eid }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        activityLog = activityLog.filter(e => e.id !== eid);
        const list = activityLog.filter(e => e.kind === k).map(e => e.activity_date).sort();
        const newest = list.slice(-1)[0] || null;
        if (k === 'zoom')                row.last_zoom_date           = newest;
        if (k === 'assignment_sent')     row.last_assignment_sent     = newest;
        if (k === 'assignment_received') row.last_assignment_received = newest;
        const idx = allStudents.findIndex(s => s.id === row.id);
        if (idx >= 0) Object.assign(allStudents[idx], { last_zoom_date: row.last_zoom_date, last_assignment_sent: row.last_assignment_sent, last_assignment_received: row.last_assignment_received });
        renderActivityHistory();
        wrap.querySelector(`.pf-act-body[data-kind="${k}"]`).style.display = '';
      } catch (e) { alert('Delete failed: ' + (e.message || e)); }
    }));
  }

  document.getElementById('pf-save').addEventListener('click', async () => {
    // last_zoom_date / last_assignment_sent / last_assignment_received are now
    // managed by the activity log — they're NOT in this payload.
    // coach is intentionally omitted — read-only in the coach dashboard;
    // coach assignment changes happen in the full CRM (or by an admin).
    const fields = ['level','coach_status','masterclass_level','preferred_time_slot','concern','goal'];
    const payload = { id: row.id };
    fields.forEach(f => { payload[f] = document.getElementById('pf-'+f).value || null; });
    const msg = document.getElementById('pf-msg'); msg.className='msg'; msg.textContent='Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      msg.className='msg ok'; msg.textContent='Saved';
      // update local state
      Object.assign(row, payload);
      const idx = allStudents.findIndex(s => s.id === row.id);
      if (idx >= 0) Object.assign(allStudents[idx], payload);
      renderAll();
      setTimeout(close, 600);
    } catch (e) { msg.className='msg err'; msg.textContent='Save failed: ' + (e.message || e); }
  });
}

// ── Bulk edit modal ───────────────────────────────────────────
// ── Coach-board inline Logs chooser ────────────────────────────────────
// Mirrors the CRM's openLogsChooserModal. Shows counts for the 5 log types
// for this student. Clicking 'Coach notes' opens the existing inline
// quick-note popover (the most common case). Other types link to the CRM
// where their full add/edit forms live.
let _logsLatestId = null;
let _logsAbort = null;

async function openCoachLogsModal(studentId, studentName, anchorEl) {
  _logsLatestId = studentId;
  if (_logsAbort) { try { _logsAbort.abort(); } catch (_) {} }
  const ac = new AbortController();
  _logsAbort = ac;

  // Render immediately with the count we already know (coach_notes from the
  // list cache) and 'loading' placeholders for the other 4 types. Avoids the
  // 1-3s blank-screen wait while ?api=get runs.
  document.getElementById('coachLogsModal')?.remove();
  const cached = allStudents.find(s => s.id === studentId);
  let coachNotesCount = cached?.coach_notes_count || 0;
  let winsCount       = cached?.wins_count       || 0;
  let repNotesCount   = cached?.rep_notes_count   || 0;
  let icNotesCount    = cached?.ic_notes_count    || 0;
  let turnoversCount  = cached?.turnovers_count   || 0;

  const m = document.createElement('div');
  m.id = 'coachLogsModal';
  m.className = 'modal-bg';
  m.style.zIndex = '10100';
  const card = (icon, label, count, act, color, sub) => `
    <button type="button" class="log-card" data-act="${act}" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:10px;background:transparent;cursor:pointer;text-align:left;color:inherit;font:inherit;width:100%;margin-bottom:8px;transition:border-color 0.12s,background 0.12s;">
      <span style="font-size:1.3rem;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:0.92rem;">${label}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">${sub}</div>
      </div>
      <span style="background:${count ? color : 'rgba(255,255,255,0.05)'};color:${count ? '#0b0c14' : 'var(--text-dim)'};border-radius:999px;padding:2px 9px;font-size:0.74rem;font-weight:800;min-width:24px;text-align:center;">${count}</span>
    </button>`;
  m.innerHTML = `
    <div class="modal-card" style="max-width:560px;">
      <div class="modal-head">
        <h2>📋 Logs · ${escapeHtml(studentName || '(unnamed)')}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;" id="coachLogsBody">
        ${card('📝', 'Coach notes',  coachNotesCount, 'notes',     '#a78bfa', 'Session notes, observations, follow-ups.')}
        ${card('🏆', 'Wins',         winsCount,       'wins',      '#fbbf24', 'Milestones, auditions, breakthroughs.')}
        ${card('💼', 'Rep notes',    repNotesCount,   'repnotes',  '#60a5fa', 'Notes from REGs / sales reps.')}
        ${card('🎯', 'I/C notes',    icNotesCount,    'icnotes',   '#f472b6', 'Initial-call notes — onboarding, intent, fit.')}
        ${card('🔄', 'Turnovers',    turnoversCount,  'turnovers', '#34d399', 'Hand-offs to a rep — log + outcome.')}
      </div>
      <div class="modal-foot">
        <span class="msg"></span>
        <button class="btn-ghost" data-x>Close</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.matches('[data-x]')) { m.remove(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    m.remove();
    if (act === 'notes') {
      // Coach notes — keep the lightweight inline add-popover behaviour
      // (faster for the most common flow), anchored to the Logs button.
      const anchor = document.querySelector('.pf-jump-logs') || anchorEl || document.body;
      openQuickNotePopover(anchor, studentId, studentName);
    } else if (act === 'icnotes' || act === 'repnotes' || act === 'wins') {
      // IC notes / rep notes / wins — show inline history modal with
      // add + delete (same pattern as openCoachAlertsModal). No more
      // jumping to a new tab.
      const kind =
        act === 'icnotes'  ? 'ic'   :
        act === 'repnotes' ? 'rep'  :
        /* wins */           'win';
      openCoachNoteListModal(studentId, studentName, kind);
    } else if (act === 'turnovers') {
      // Turnovers — inline modal (list + add + set-result + delete).
      // Same pattern as Alerts. No more jumping to a new tab.
      openCoachTurnoverListModal(studentId, studentName);
    } else {
      // Unknown action — fall back to the CRM in a new tab.
      window.open(`students.html?student=${studentId}`, '_blank');
    }
  });
  // Hover affordance
  m.querySelectorAll('.log-card').forEach(b => {
    b.addEventListener('mouseenter', () => { b.style.borderColor = 'var(--accent2, #22d3ee)'; b.style.background = 'rgba(255,255,255,0.03)'; });
    b.addEventListener('mouseleave', () => { b.style.borderColor = 'var(--border)'; b.style.background = 'transparent'; });
  });

  // Background refresh — fetch authoritative counts and re-render the cards
  // if anything changed. Skipped if the user has since clicked elsewhere
  // (another student, closed the modal, etc.).
  (async () => {
    try {
      const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(studentId), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
        signal: ac.signal,
      });
      if (_logsLatestId !== studentId) return;
      const j = await r.json();
      if (_logsLatestId !== studentId) return;
      if (!r.ok) return;
      const wins = j.wins || [], coachNotes = j.coach_notes || [], repNotes = j.rep_notes || [];
      const icNotes = j.ic_notes || [], turnovers = j.turnovers || [];
      // Only re-render if our modal is still mounted AND a count actually changed
      const body = document.getElementById('coachLogsBody');
      if (!body) return;
      const changed = coachNotes.length !== coachNotesCount || wins.length !== winsCount
        || repNotes.length !== repNotesCount || icNotes.length !== icNotesCount || turnovers.length !== turnoversCount;
      if (!changed) return;
      coachNotesCount = coachNotes.length; winsCount = wins.length; repNotesCount = repNotes.length;
      icNotesCount = icNotes.length; turnoversCount = turnovers.length;
      body.innerHTML = [
        card('📝', 'Coach notes',  coachNotesCount, 'notes',     '#a78bfa', 'Session notes, observations, follow-ups.'),
        card('🏆', 'Wins',         winsCount,       'wins',      '#fbbf24', 'Milestones, auditions, breakthroughs.'),
        card('💼', 'Rep notes',    repNotesCount,   'repnotes',  '#60a5fa', 'Notes from REGs / sales reps.'),
        card('🎯', 'I/C notes',    icNotesCount,    'icnotes',   '#f472b6', 'Initial-call notes — onboarding, intent, fit.'),
        card('🔄', 'Turnovers',    turnoversCount,  'turnovers', '#34d399', 'Hand-offs to a rep — log + outcome.'),
      ].join('');
      // Re-wire hover handlers on the new buttons
      body.querySelectorAll('.log-card').forEach(b => {
        b.addEventListener('mouseenter', () => { b.style.borderColor = 'var(--accent2, #22d3ee)'; b.style.background = 'rgba(255,255,255,0.03)'; });
        b.addEventListener('mouseleave', () => { b.style.borderColor = 'var(--border)'; b.style.background = 'transparent'; });
      });
    } catch (_) { /* abort or network noise — leave the cached counts in place */ }
  })();
}

// ── Coach-board inline Notes / Wins modal ──────────────────────────────
// Generic over the three "list-of-text-entries" log types so the coach can
// view + add + delete without leaving the dashboard (same as Alerts).
//   kind = 'coach' | 'rep' | 'ic'   → mentorship_*_notes  (text + note_date)
//   kind = 'win'                    → mentorship_wins     (text + win_date)
let _noteListLatestId = null;
let _noteListAbort = null;

async function openCoachNoteListModal(studentId, studentName, kind) {
  const META = {
    coach: { label: 'Coach notes',  emoji: '📝', addApi: 'add-coach-note',   delApi: 'delete-coach-note',   listKey: 'coach_notes', dateField: 'note_date' },
    rep:   { label: 'Rep notes',    emoji: '💼', addApi: 'add-rep-note',     delApi: 'delete-rep-note',     listKey: 'rep_notes',   dateField: 'note_date' },
    ic:    { label: 'I/C notes',    emoji: '🎯', addApi: 'add-ic-note',      delApi: 'delete-ic-note',      listKey: 'ic_notes',    dateField: 'note_date' },
    win:   { label: 'Wins',         emoji: '🏆', addApi: 'add-win',          delApi: 'delete-win',          listKey: 'wins',        dateField: 'win_date'  },
  };
  const meta = META[kind]; if (!meta) return;

  _noteListLatestId = studentId;
  if (_noteListAbort) { try { _noteListAbort.abort(); } catch (_) {} }
  const ac = new AbortController();
  _noteListAbort = ac;
  document.getElementById('coachNoteListModal')?.remove();
  const m = document.createElement('div');
  m.id = 'coachNoteListModal';
  m.className = 'modal-bg';
  m.style.zIndex = '10100';
  m.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-head">
        <h2>${meta.emoji} ${meta.label} · ${escapeHtml(studentName || '(unnamed)')}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" id="cnlBody" style="grid-template-columns:1fr;">
        <div style="color:var(--text-dim);">Loading…</div>
      </div>
      <div class="modal-foot">
        <span class="msg" id="cnlMsg"></span>
        <button class="btn-ghost" data-x>Close</button>
        <button class="btn-primary" id="cnlAddBtn">+ New ${kind === 'win' ? 'win' : 'note'}</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) m.remove(); });

  async function load() {
    const body = document.getElementById('cnlBody');
    if (body) body.innerHTML = '<div style="color:var(--text-dim);">Loading…</div>';
    let rows = [];
    try {
      const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(studentId), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
        signal: ac.signal,
      });
      if (_noteListLatestId !== studentId) return;
      const j = await r.json();
      if (_noteListLatestId !== studentId) return;
      if (r.ok) rows = j[meta.listKey] || [];
    } catch (e) { if (e?.name === 'AbortError') return; }
    if (!body) return;
    // Sort by date desc (date field varies)
    rows.sort((a, b) => String(b[meta.dateField] || b.created_at || '').localeCompare(String(a[meta.dateField] || a.created_at || '')));
    if (!rows.length) {
      body.innerHTML = `<div style="color:var(--text-dim);font-size:0.86rem;padding:18px 0;">No ${kind === 'win' ? 'wins' : 'notes'} yet. Click "+ New ${kind === 'win' ? 'win' : 'note'}" to add one.</div>`;
      return;
    }
    body.innerHTML = rows.map(n => {
      const dateStr = (n[meta.dateField] || '').slice(0, 10);
      const created = n.created_at ? new Date(n.created_at).toLocaleString() : '';
      return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;position:relative;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            ${dateStr ? `<span class="pill" style="font-size:0.7rem;">${escapeHtml(dateStr)}</span>` : ''}
            <span style="color:var(--text-dim);font-size:0.72rem;">by ${escapeHtml(n.created_by_email || 'unknown')}</span>
            <span style="margin-left:auto;color:var(--text-dim);font-size:0.7rem;">${escapeHtml(created)}</span>
          </div>
          <div style="white-space:pre-wrap;font-size:0.88rem;line-height:1.4;">${escapeHtml(n.text || '')}</div>
          <button class="btn-ghost cnl-del" data-nid="${n.id}" title="Delete" style="position:absolute;top:8px;right:8px;padding:2px 8px;font-size:0.72rem;color:var(--red);">×</button>
        </div>`;
    }).join('');
    body.querySelectorAll('.cnl-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Delete this ${kind === 'win' ? 'win' : 'note'}? This cannot be undone.`)) return;
      const nid = Number(b.getAttribute('data-nid'));
      const msg = document.getElementById('cnlMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Deleting…'; }
      try {
        const r = await fetch(STUDENTS_BASE + '?api=' + meta.delApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: nid }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        await load();
        if (msg) { msg.className = 'msg ok'; msg.textContent = 'Deleted'; setTimeout(() => msg.textContent = '', 1500); }
      } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
    }));
  }

  document.getElementById('cnlAddBtn').addEventListener('click', async () => {
    const text = prompt(`${meta.label.slice(0, -1)} text (required):`);
    if (!text || !text.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const dateInput = prompt(`Date (YYYY-MM-DD, default ${today}):`, today);
    const date = (dateInput && dateInput.trim()) ? dateInput.trim() : today;
    const msg = document.getElementById('cnlMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Saving…'; }
    try {
      const body = { studentId, text: text.trim() };
      body[meta.dateField] = date;
      const r = await fetch(STUDENTS_BASE + '?api=' + meta.addApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      await load();
      if (msg) { msg.className = 'msg ok'; msg.textContent = 'Saved'; setTimeout(() => msg.textContent = '', 1500); }
    } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
  });

  load();
}

// ── Coach-board inline Turnovers modal ───────────────────────────────────
// Lists this student's turnovers (with optional result), lets the coach
// file a new one (rep_name dropdown from /mentors), set / clear a result,
// and delete. Mirrors openCoachAlertsModal — no more new-tab jump.
let _turnoverLatestId = null;
let _turnoverAbort = null;
let _turnoverMentorsCache = null;

async function openCoachTurnoverListModal(studentId, studentName) {
  _turnoverLatestId = studentId;
  if (_turnoverAbort) { try { _turnoverAbort.abort(); } catch (_) {} }
  const ac = new AbortController();
  _turnoverAbort = ac;
  document.getElementById('coachTurnoverModal')?.remove();
  const m = document.createElement('div');
  m.id = 'coachTurnoverModal';
  m.className = 'modal-bg';
  m.style.zIndex = '10100';
  m.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-head">
        <h2>🔄 Turnovers · ${escapeHtml(studentName || '(unnamed)')}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" id="ctBody" style="grid-template-columns:1fr;">
        <div style="color:var(--text-dim);">Loading…</div>
      </div>
      <div class="modal-foot">
        <span class="msg" id="ctMsg"></span>
        <button class="btn-ghost" data-x>Close</button>
        <button class="btn-primary" id="ctAddBtn">+ New turnover</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) m.remove(); });

  async function getMentors() {
    if (_turnoverMentorsCache) return _turnoverMentorsCache;
    try {
      const r = await fetch(STUDENTS_BASE + '?api=mentors', {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
      });
      const j = await r.json();
      _turnoverMentorsCache = Array.isArray(j.mentors) ? j.mentors : [];
    } catch (_) { _turnoverMentorsCache = []; }
    return _turnoverMentorsCache;
  }

  async function load() {
    const body = document.getElementById('ctBody');
    if (body) body.innerHTML = '<div style="color:var(--text-dim);">Loading…</div>';
    let turnovers = [];
    try {
      const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(studentId), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
        signal: ac.signal,
      });
      if (_turnoverLatestId !== studentId) return;
      const j = await r.json();
      if (_turnoverLatestId !== studentId) return;
      if (r.ok) turnovers = j.turnovers || [];
    } catch (e) { if (e?.name === 'AbortError') return; }
    if (!body) return;
    const sorted = [...turnovers].sort((a, b) => {
      // Pending result first, then most recent
      const ao = a.result ? 1 : 0, bo = b.result ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return String(b.turnover_date || b.created_at || '').localeCompare(String(a.turnover_date || a.created_at || ''));
    });
    if (sorted.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);font-size:0.86rem;padding:18px 0;">No turnovers yet. Click "+ New turnover" to log one.</div>';
      return;
    }
    body.innerHTML = sorted.map(t => {
      const hasResult = !!(t.result && String(t.result).trim());
      const dateStr = (t.turnover_date || '').slice(0, 10);
      const created = t.created_at ? new Date(t.created_at).toLocaleString() : '';
      const resultAt = t.result_at ? new Date(t.result_at).toLocaleString() : '';
      return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;${hasResult ? '' : 'background:rgba(52,211,153,0.06);'}position:relative;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span class="pill ${hasResult ? 'ok' : 'bad'}" style="font-size:0.7rem;">${hasResult ? '✓ Has result' : '⏳ Pending result'}</span>
            <strong>${escapeHtml(t.rep_name || '(no rep)')}</strong>
            ${dateStr ? `<span class="pill" style="font-size:0.7rem;">${escapeHtml(dateStr)}</span>` : ''}
            <span style="margin-left:auto;color:var(--text-dim);font-size:0.72rem;">${escapeHtml(created)}</span>
          </div>
          ${t.note ? `<div style="color:var(--text-dim);font-size:0.82rem;margin-bottom:6px;white-space:pre-wrap;">${escapeHtml(t.note)}</div>` : ''}
          <div style="font-size:0.72rem;color:var(--text-dim);">By ${escapeHtml(t.created_by_email || 'unknown')}</div>
          ${hasResult ? `<div style="font-size:0.78rem;color:var(--text-dim);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);"><strong>Result:</strong> <span style="white-space:pre-wrap;">${escapeHtml(t.result)}</span>${resultAt ? `<div style="font-size:0.7rem;margin-top:2px;">on ${escapeHtml(resultAt)}${t.result_by_email ? ' by ' + escapeHtml(t.result_by_email) : ''}</div>` : ''}</div>` : ''}
          <div style="margin-top:8px;display:flex;gap:6px;">
            <button class="btn-ghost ct-result" data-tid="${t.id}" style="padding:5px 12px;font-size:0.76rem;">${hasResult ? 'Edit result' : 'Set result'}</button>
            <button class="btn-ghost ct-del" data-tid="${t.id}" title="Delete" style="padding:5px 12px;font-size:0.76rem;color:var(--red);margin-left:auto;">Delete</button>
          </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.ct-result').forEach(b => b.addEventListener('click', async () => {
      const tid = Number(b.getAttribute('data-tid'));
      const current = sorted.find(x => x.id === tid)?.result || '';
      const result = prompt('Result (leave empty to clear):', current);
      if (result === null) return;
      const msg = document.getElementById('ctMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Saving…'; }
      try {
        const r = await fetch(STUDENTS_BASE + '?api=set-turnover-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: tid, result: result.trim() }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        await load();
        if (msg) { msg.className = 'msg ok'; msg.textContent = 'Saved'; setTimeout(() => msg.textContent = '', 1500); }
      } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
    }));
    body.querySelectorAll('.ct-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this turnover? This cannot be undone.')) return;
      const tid = Number(b.getAttribute('data-tid'));
      const msg = document.getElementById('ctMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Deleting…'; }
      try {
        const r = await fetch(STUDENTS_BASE + '?api=delete-turnover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: tid }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        await load();
        if (msg) { msg.className = 'msg ok'; msg.textContent = 'Deleted'; setTimeout(() => msg.textContent = '', 1500); }
      } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
    }));
  }

  document.getElementById('ctAddBtn').addEventListener('click', async () => {
    const mentors = await getMentors();
    // Inline add form rendered in place of the body so we can use a real
    // <select> for rep_name (multiple prompts felt clunky for 3 fields).
    document.getElementById('coachTurnoverModal')?.remove();
    const f = document.createElement('div');
    f.id = 'coachTurnoverModal';
    f.className = 'modal-bg';
    f.style.zIndex = '10100';
    const today = new Date().toISOString().slice(0, 10);
    f.innerHTML = `
      <div class="modal-card" style="max-width:520px;">
        <div class="modal-head">
          <h2>🔄 New turnover · ${escapeHtml(studentName || '(unnamed)')}</h2>
          <button class="close" data-x>×</button>
        </div>
        <div class="modal-body" style="grid-template-columns:1fr;display:grid;gap:10px;">
          <label style="display:grid;gap:4px;font-size:0.78rem;color:var(--text-dim);">Rep
            <select id="ctfRep" style="padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);">
              <option value="">— select rep —</option>
              ${mentors.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
            </select>
          </label>
          <label style="display:grid;gap:4px;font-size:0.78rem;color:var(--text-dim);">Date
            <input type="date" id="ctfDate" value="${today}" style="padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);">
          </label>
          <label style="display:grid;gap:4px;font-size:0.78rem;color:var(--text-dim);">Note (optional)
            <textarea id="ctfNote" rows="4" placeholder="Why are you turning this student over?" style="padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);resize:vertical;"></textarea>
          </label>
        </div>
        <div class="modal-foot">
          <span class="msg" id="ctfMsg"></span>
          <button class="btn-ghost" data-x>Cancel</button>
          <button class="btn-primary" id="ctfSave">Save</button>
        </div>
      </div>`;
    document.body.appendChild(f);
    f.addEventListener('click', e => {
      if (e.target === f || e.target.matches('[data-x]')) {
        f.remove();
        // Re-open the list modal so the coach lands back where they started.
        openCoachTurnoverListModal(studentId, studentName);
      }
    });
    document.getElementById('ctfSave').addEventListener('click', async () => {
      const rep_name      = (document.getElementById('ctfRep').value || '').trim();
      const turnover_date = (document.getElementById('ctfDate').value || '').trim();
      const note          = (document.getElementById('ctfNote').value || '').trim();
      const msg = document.getElementById('ctfMsg');
      if (!rep_name) { msg.className = 'msg err'; msg.textContent = 'Rep is required'; return; }
      msg.className = 'msg'; msg.textContent = 'Saving…';
      try {
        const r = await fetch(STUDENTS_BASE + '?api=add-turnover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ studentId, rep_name, note: note || null, turnover_date: turnover_date || null }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        f.remove();
        openCoachTurnoverListModal(studentId, studentName);
      } catch (e) { msg.className = 'msg err'; msg.textContent = e.message || e; }
    });
  });

  load();
}

// ── Coach-board inline Alerts modal ─────────────────────────────────────
// Lists this student's alerts (open + resolved), lets the coach file a new
// one and resolve open ones, all without leaving the dashboard. Same actions
// the CRM's openAlertsHistoryModal exposes; uses the same edge-function
// endpoints (add-alert / resolve-alert).
let _alertsLatestId = null;
let _alertsAbort = null;

async function openCoachAlertsModal(studentId, studentName) {
  _alertsLatestId = studentId;
  if (_alertsAbort) { try { _alertsAbort.abort(); } catch (_) {} }
  const ac = new AbortController();
  _alertsAbort = ac;
  document.getElementById('coachAlertsModal')?.remove();
  const m = document.createElement('div');
  m.id = 'coachAlertsModal';
  m.className = 'modal-bg';
  m.style.zIndex = '10100';  // above the underlying profile modal
  m.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-head">
        <h2>🔔 Alerts · ${escapeHtml(studentName || '(unnamed)')}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" id="caBody" style="grid-template-columns:1fr;">
        <div style="color:var(--text-dim);">Loading…</div>
      </div>
      <div class="modal-foot">
        <span class="msg" id="caMsg"></span>
        <button class="btn-ghost" data-x>Close</button>
        <button class="btn-primary" id="caAddBtn">+ New alert</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) m.remove(); });

  async function load() {
    const body = document.getElementById('caBody');
    if (body) body.innerHTML = '<div style="color:var(--text-dim);">Loading…</div>';
    let alerts = [];
    try {
      const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(studentId), {
        headers: { Authorization: 'Bearer ' + currentSession.access_token },
        signal: ac.signal,
      });
      if (_alertsLatestId !== studentId) return;
      const j = await r.json();
      if (_alertsLatestId !== studentId) return;
      if (r.ok) alerts = j.alerts || [];
    } catch (e) { if (e?.name === 'AbortError') return; }
    const sorted = [...alerts].sort((a, b) => {
      const ao = a.status === 'open' ? 0 : 1, bo = b.status === 'open' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    if (!body) return;
    if (sorted.length === 0) {
      body.innerHTML = '<div style="color:var(--text-dim);font-size:0.86rem;padding:18px 0;">No alerts yet. Click "+ New alert" to file one.</div>';
    } else {
      body.innerHTML = sorted.map(a => {
        const open = a.status === 'open';
        const when = a.created_at ? new Date(a.created_at).toLocaleString() : '';
        return `
          <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;${open ? 'background:rgba(248,113,113,0.06);' : ''}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <span class="pill ${open ? 'bad' : 'ok'}" style="font-size:0.7rem;">${open ? '🔔 Open' : '✓ Resolved'}</span>
              <strong>${escapeHtml(a.title || '')}</strong>
              <span style="margin-left:auto;color:var(--text-dim);font-size:0.72rem;">${escapeHtml(when)}</span>
            </div>
            ${a.description ? `<div style="color:var(--text-dim);font-size:0.82rem;margin-bottom:6px;white-space:pre-wrap;">${escapeHtml(a.description)}</div>` : ''}
            <div style="font-size:0.72rem;color:var(--text-dim);">By ${escapeHtml(a.created_by_email || 'unknown')}</div>
            ${!open && a.resolution_note ? `<div style="font-size:0.78rem;color:var(--text-dim);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);"><strong>Resolution:</strong> ${escapeHtml(a.resolution_note)}</div>` : ''}
            ${open ? `<button class="btn-ghost ca-resolve" data-aid="${a.id}" style="margin-top:8px;padding:5px 12px;font-size:0.76rem;">Mark resolved</button>` : ''}
          </div>`;
      }).join('');
      body.querySelectorAll('.ca-resolve').forEach(b => b.addEventListener('click', async () => {
        const aid = Number(b.getAttribute('data-aid'));
        const note = prompt('Resolution note (required):');
        if (!note || !note.trim()) return;
        const msg = document.getElementById('caMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Resolving…'; }
        try {
          const r = await fetch(STUDENTS_BASE + '?api=resolve-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
            body: JSON.stringify({ id: aid, resolution_note: note.trim() }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Failed');
          await load();
          if (msg) { msg.className = 'msg ok'; msg.textContent = 'Resolved'; setTimeout(() => msg.textContent = '', 1500); }
        } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
      }));
    }
  }

  document.getElementById('caAddBtn').addEventListener('click', async () => {
    const title = prompt('Alert title (required):');
    if (!title || !title.trim()) return;
    const description = prompt('Details (optional):') || null;
    const msg = document.getElementById('caMsg'); if (msg) { msg.className = 'msg'; msg.textContent = 'Filing…'; }
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId, title: title.trim(), description }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      await load();
      if (msg) { msg.className = 'msg ok'; msg.textContent = `Alert filed (${j.recipients_count || 0} notified)`; setTimeout(() => msg.textContent = '', 1500); }
    } catch (e) { if (msg) { msg.className = 'msg err'; msg.textContent = e.message || e; } }
  });

  load();
}

function openBulkEditModal() {
  if (!selectedIds.size) return;
  document.getElementById('bulkModal')?.remove();
  const m = document.createElement('div');
  m.id = 'bulkModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:520px;">
      <div class="modal-head">
        <h2>Apply to ${selectedIds.size} student${selectedIds.size===1?'':'s'}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div><label>Field to update</label>
          <select id="bf-field">
            <option value="last_zoom_date">Last Zoom date</option>
            <option value="last_assignment_sent">Last assignment sent</option>
            <option value="last_assignment_received">Last assignment received</option>
            <option value="level">Level</option>
            <option value="coach_status">Coach status</option>
            <option value="coach">Coach</option>
            <option value="masterclass_level">Masterclass level</option>
            <option value="preferred_time_slot">Schedule</option>
            <option value="concern">Concern (replaces)</option>
            <option value="goal">Goal (replaces)</option>
          </select></div>
        <div id="bf-value-wrap"></div>
        <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.5;">
          The selected field will be set to this value on every selected student. Empty value clears the field. Concern/Goal replace existing text.
        </div>
      </div>
      <div class="modal-foot">
        <span class="msg" id="bf-msg"></span>
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="bf-apply">Apply to ${selectedIds.size}</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  function buildValueInput() {
    const f = document.getElementById('bf-field').value;
    const wrap = document.getElementById('bf-value-wrap');
    let html = '<label>Value</label>';
    if (['last_zoom_date','last_assignment_sent','last_assignment_received'].includes(f)) {
      html += `<input id="bf-value" type="date">`;
    } else if (f === 'level') {
      html += `<select id="bf-value"><option value="">— clear —</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>`;
    } else if (f === 'masterclass_level') {
      const opts = ['INTRODUCTION','LEVEL 1','LEVEL 2','LEVEL 3','LEVEL 4','LEVEL 5','LEVEL 6','LEVEL 7','LEVEL 8','LEVEL 9','LEVEL 10'];
      html += `<select id="bf-value"><option value="">— clear —</option>${opts.map(o => `<option>${o}</option>`).join('')}</select>`;
    } else if (f === 'coach_status') {
      html += `<select id="bf-value"><option value="">— clear —</option><option>All good</option><option>Needs attention</option></select>`;
    } else if (['concern','goal'].includes(f)) {
      html += `<textarea id="bf-value" style="min-height:80px;"></textarea>`;
    } else {
      html += `<input id="bf-value" type="text">`;
    }
    wrap.innerHTML = html;
  }
  buildValueInput();
  document.getElementById('bf-field').addEventListener('change', buildValueInput);

  document.getElementById('bf-apply').addEventListener('click', async () => {
    const field = document.getElementById('bf-field').value;
    const valEl = document.getElementById('bf-value');
    const value = (valEl?.value || '').trim();
    const ids = [...selectedIds];
    const msg = document.getElementById('bf-msg'); msg.className='msg'; msg.textContent='Applying…';
    // For the three activity-tracked date fields, write through the activity
    // log (not the cached column). The DB trigger updates the cached column
    // afterward, so KPIs/charts stay consistent and we preserve history.
    const ACTIVITY_MAP = {
      last_zoom_date:           'zoom',
      last_assignment_sent:     'assignment_sent',
      last_assignment_received: 'assignment_received',
    };
    if (ACTIVITY_MAP[field]) {
      if (!value) { msg.className='msg err'; msg.textContent='A date is required when bulk-setting an activity field.'; return; }
      const kind = ACTIVITY_MAP[field];
      let okCount = 0; let failCount = 0;
      // Fire in parallel batches of 10 to keep the edge function happy.
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map(sid => fetch(STUDENTS_BASE + '?api=add-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ studentId: sid, kind, activity_date: value, notes: 'Bulk assigned' }),
        }).then(r => r.json().then(j => ({ ok: r.ok, j })))));
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.ok) okCount++; else failCount++;
        }
        msg.textContent = `Logging ${i + batch.length} / ${ids.length}…`;
      }
      msg.className = failCount ? 'msg err' : 'msg ok';
      msg.textContent = `Logged ${okCount} entr${okCount===1?'y':'ies'}${failCount ? `; ${failCount} failed` : ''}`;
      await loadStudents();
      selectedIds.clear();
      setTimeout(close, 1000);
      return;
    }
    try {
      const { data, error } = await supa.rpc('bulk_update_students_field', {
        p_ids: ids, p_field: field, p_value: value || null,
      });
      if (error) throw error;
      const updated = data?.updated ?? 0;
      msg.className='msg ok'; msg.textContent = `Updated ${updated} student${updated===1?'':'s'}`;
      await loadStudents();
      selectedIds.clear();
      setTimeout(close, 700);
    } catch (e) { msg.className='msg err'; msg.textContent='Failed: ' + (e.message || e); }
  });
}

// ── Charts ────────────────────────────────────────────────────
let _charts = { status: null, zoom: null, level: null };
const CHART_COLORS = {
  green:'#34d399', cyan:'#22d3ee', blue:'#6b9eff', purple:'#a78bfa',
  pink:'#f472b6', red:'#f87171', gold:'#fbbf24', dim:'#3e4668',
};
function _chartTextColor() {
  return document.body.classList.contains('light') ? '#0f1220' : '#eaecf8';
}
function _chartGridColor() {
  return document.body.classList.contains('light') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
}
function renderCharts(scoped) {
  if (!window.Chart) return;
  // Common defaults
  Chart.defaults.color = _chartTextColor();
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', sans-serif";

  // 1) Status distribution (donut) — every student lands in exactly ONE slice.
  // For students in the live coaching roster (derived_status ∈ {Active,
  // Inactive, Expiring soon}), the slice is determined by engagement so the
  // Active/Inactive donut counts match the Active/Inactive KPIs exactly.
  // Expiring-soon is tracked separately via its own KPI tile — it's a
  // term-status overlay, not a slice on this chart.
  const STATUS_ORDER = [
    ['Inactive',      CHART_COLORS.red],     // needs outreach now
    ['Expired',       CHART_COLORS.pink],
    ['Active',        CHART_COLORS.green],
    ['Paused',        CHART_COLORS.dim],
    ['Not onboarded', CHART_COLORS.blue],
    ['Delayed start', CHART_COLORS.purple],
    ['Graduated',     CHART_COLORS.cyan],
    ['Refunded',      CHART_COLORS.dim],
    ['Cancelled',     CHART_COLORS.dim],
  ];
  const LIVE_COACHING_DONUT = new Set(['Active','Inactive','Expiring soon']);
  const _DONUT_WINDOW = 7;
  const _donutEngaged = (s) => {
    const d = _daysSinceActivity(s);
    return d != null && d <= _DONUT_WINDOW;
  };
  const tally = new Map();
  for (const s of scoped) {
    let k = s.derived_status || '(unknown)';
    // Re-bucket live coaching roster by engagement so slices match the KPIs.
    if (LIVE_COACHING_DONUT.has(k)) k = _donutEngaged(s) ? 'Active' : 'Inactive';
    // Hide Expired / Refunded slices unless their toggles are on (matches table behavior).
    if (k === 'Expired'  && !showExpired)  continue;
    if (k === 'Refunded' && !showRefunded) continue;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  const statuses = []; const statusColors = []; const statusCounts = [];
  for (const [name, color] of STATUS_ORDER) {
    if (tally.has(name)) {
      statuses.push(name); statusColors.push(color); statusCounts.push(tally.get(name));
      tally.delete(name);
    }
  }
  // Surface anything else that's actually in the data (future-proof) instead of hiding it as "Other"
  for (const [name, count] of tally) {
    statuses.push(name); statusColors.push(CHART_COLORS.dim); statusCounts.push(count);
  }

  // Percentages are over the sum of currently-visible slices (matches the
  // KPI tile denominator). With Expired/Refunded toggled off, the
  // remaining visible slices still sum to 100%.
  const donutDenom = statusCounts.reduce((a, b) => a + b, 0) || 1;

  if (_charts.status) _charts.status.destroy();
  _charts.status = new Chart(document.getElementById('chartStatus'), {
    type: 'doughnut',
    data: { labels: statuses, datasets: [{ data: statusCounts, backgroundColor: statusColors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} (${Math.round(100*ctx.parsed/donutDenom)}%)` } },
      },
    },
  });

  // 2) Days-since-last-activity histogram — restricted to the full LIVE
  // coaching roster (Active + Inactive + Expiring soon). The Active/Inactive
  // KPIs are now engagement-based across this same roster, so the "0–7d"
  // bucket equals the Active KPI exactly and "8d+" buckets sum to Inactive.
  // "Activity" = max(last_zoom_date, last_assignment_received, last_assignment_sent).
  const buckets = [
    { label: '0–7d',  test: d => d != null && d <= 7,  color: CHART_COLORS.green },
    { label: '8–14d', test: d => d != null && d <= 14 && d > 7,  color: CHART_COLORS.cyan },
    { label: '15–30d',test: d => d != null && d <= 30 && d > 14, color: CHART_COLORS.gold },
    { label: '31–60d',test: d => d != null && d <= 60 && d > 30, color: '#f59e0b' },
    { label: '60d+',  test: d => d != null && d > 60,  color: CHART_COLORS.red },
    { label: 'Never', test: d => d == null,            color: CHART_COLORS.dim },
  ];
  const LIVE_COACHING_HIST = new Set(['Active','Inactive','Expiring soon']);
  const active = scoped.filter(s => LIVE_COACHING_HIST.has(s.derived_status || ''));
  const zoomDaysAll = active.map(_daysSinceActivity);
  const zoomCounts = buckets.map(b => zoomDaysAll.filter(b.test).length);
  if (_charts.zoom) _charts.zoom.destroy();
  _charts.zoom = new Chart(document.getElementById('chartZoom'), {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ data: zoomCounts, backgroundColor: buckets.map(b => b.color), borderRadius: 6, borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} student${ctx.parsed.y===1?'':'s'}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: _chartGridColor() } },
      },
    },
  });

  // 3) Level breakdown (active-only)
  const levels = ['Beginner','Intermediate','Advanced','Unknown'];
  const levelColors = [CHART_COLORS.cyan, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.dim];
  const levelCounts = levels.map(L =>
    L === 'Unknown' ? active.filter(s => !s.level).length : active.filter(s => s.level === L).length
  );
  if (_charts.level) _charts.level.destroy();
  _charts.level = new Chart(document.getElementById('chartLevel'), {
    type: 'doughnut',
    data: { labels: levels, datasets: [{ data: levelCounts, backgroundColor: levelColors, borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} (${Math.round(100*ctx.parsed/Math.max(1,active.length))}%)` } },
      },
    },
  });
}
// Re-render charts when theme toggles (the text+grid colors change)
document.getElementById('themeBtn').addEventListener('click', () => {
  if (allStudents.length) setTimeout(() => renderAll(), 50);
});

// ── Zoom scheduling ───────────────────────────────────────────
let upcomingMeetings = [];

async function _zoomFetch(api, opts = {}) {
  const url = ZOOM_MEETINGS_BASE + '?api=' + api;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + currentSession.access_token,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

async function loadUpcomingMeetings() {
  if (!currentSession) return;
  try {
    if (isPrivilegedViewer) {
      // Privileged users see ALL upcoming meetings on the Zoom account
      // (including ones scheduled directly in zoom.us, not just via this system).
      const j = await _zoomFetch('list-all');
      upcomingMeetings = (j.meetings || [])
        .filter(m => m.status !== 'cancelled')
        .filter(m => {
          const t = m.scheduled_start_time ? Date.parse(m.scheduled_start_time) : 0;
          return !t || t > Date.now() - 60 * 60 * 1000;
        });
    } else {
      const fromIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const j = await _zoomFetch('list&from=' + encodeURIComponent(fromIso));
      upcomingMeetings = (j.meetings || []).filter(m => m.status === 'scheduled');
    }
    renderUpcomingMeetings();
  } catch (e) {
    console.warn('loadUpcomingMeetings failed', e);
  }
}

// All Zoom meeting times are shown in America/Chicago (the team's working
// timezone) so every viewer sees the same time the host originally meant,
// regardless of where they happen to be browsing. The timezone short-name
// is appended so there's no ambiguity ("3:00 PM CDT" not just "3:00 PM").
// Previously this used the browser's local zone, which made a UTC-stored
// meeting (e.g. 20:00 UTC) display as 2 AM next day for someone browsing
// in UTC+6, even though the host scheduled it for "3 PM CT".
const MEETING_TZ = 'America/Chicago';
// Convert a naive "YYYY-MM-DDTHH:MM" string (which the user typed thinking
// of MEETING_TZ) into the correct UTC ISO. Used by the Create + Edit
// modals so a value the user enters as "3:00 PM Central" lands at the
// right UTC moment in the DB regardless of the user's own browser zone.
function _meetingLocalToUTC(localStr) {
  if (!localStr) return null;
  const seed = new Date(localStr + ':00Z');                            // treat input AS UTC for now
  if (isNaN(seed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEETING_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(seed);
  const m = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
  if (m.hour === '24') m.hour = '00';
  const projUTC = Date.parse(`${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`);
  const offsetMs = projUTC - seed.getTime();
  return new Date(seed.getTime() - offsetMs).toISOString();
}
function _fmtMeetingTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: MEETING_TZ });
  const timeOnly = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: MEETING_TZ });
  // Pull the timezone abbreviation (CDT/CST) from the same formatter
  const tzAbbr = (function () {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: MEETING_TZ, timeZoneName: 'short' }).formatToParts(d);
      const z = parts.find(p => p.type === 'timeZoneName');
      return z ? z.value : '';
    } catch (_) { return ''; }
  })();
  const time = tzAbbr ? `${timeOnly} ${tzAbbr}` : timeOnly;
  return { date, time };
}

function _myZoomEmail() {
  const e = currentSession?.user?.app_metadata?.zoom_host_email;
  return (typeof e === 'string' && e.trim()) ? e.trim().toLowerCase() : null;
}
function _isMyMeeting(m) {
  if (!currentSession?.user) return false;
  if (m.created_by === currentSession.user.id) return true;
  const me = _myZoomEmail();
  if (me && m.host_email && String(m.host_email).toLowerCase() === me) return true;
  return false;
}
function _meetingCardHtml(m, opts) {
  const t = _fmtMeetingTime(m.scheduled_start_time);
  const invited = (m.invited_student_ids || []).length;
  const accent = opts?.highlight ? 'background:rgba(34,211,238,0.08);border-color:rgba(34,211,238,0.4);' : '';
  const isZoomOnly = m.source === 'zoom';
  const sourceTag = isZoomOnly ? `<span style="display:inline-block;background:rgba(96,165,250,0.15);color:#60a5fa;border-radius:6px;padding:1px 7px;font-size:0.65rem;font-weight:700;margin-left:6px;vertical-align:middle;">From Zoom</span>` : '';
  const hostLine = m.host_email ? `<small>Hosted by ${escapeHtml(m.host_email)}${invited ? ` · ${invited} invitee${invited===1?'':'s'}` : ''}</small>` : `<small>${invited} invitee${invited===1?'':'s'}</small>`;
  return `<div class="upcoming-card" style="${accent}">
      <div class="upcoming-when">${escapeHtml(t.time)}<small>${escapeHtml(t.date)} · ${m.scheduled_duration_minutes||60} min</small></div>
      <div class="upcoming-topic">${escapeHtml(m.topic || 'Meeting')}${sourceTag}${hostLine}</div>
      <div class="upcoming-actions">
        ${m.join_url ? `<button data-zm-open="${m.id}" title="Open the Zoom meeting">Open Zoom</button>` : ''}
        <button data-zm-invitees="${m.id}" title="See invited students">Invitees</button>
        ${m.join_url ? `<button data-zm-copy="${m.id}" title="Copy join link">Copy link</button>` : ''}
        ${m.start_url ? `<button data-zm-start="${m.id}" title="Open host start URL">Start as host</button>` : ''}
        ${!isZoomOnly ? `<button data-zm-edit="${m.id}" title="Edit meeting (topic, time, recurrence, settings)">Edit</button>` : ''}
        <button class="danger" data-zm-cancel="${m.id}">Cancel</button>
      </div>
    </div>`;
}
function renderUpcomingMeetings() {
  const wrap = document.getElementById('upcomingZoom');
  const list = document.getElementById('upcomingZoomList');
  if (!upcomingMeetings.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  // Coaches (no privileged role) see only meetings they host. Privileged roles see all.
  let visible = upcomingMeetings;
  if (!isPrivilegedViewer) visible = upcomingMeetings.filter(_isMyMeeting);
  if (!visible.length) { wrap.style.display = 'none'; return; }

  // Highlighted "Next session" card:
  // - Coaches: their own next meeting
  // - Admins / privileged: the next meeting overall (across the whole account)
  let next = null;
  let highlightLabel = 'Your next session';
  if (isPrivilegedViewer) {
    next = visible[0] || null; // already sorted by scheduled_start_time ascending
    highlightLabel = 'Next session on the account';
  } else {
    const mine = visible.filter(_isMyMeeting);
    next = mine[0] || null;
  }
  const others = visible.filter(m => m !== next);

  let html = '';
  if (next) {
    const t = _fmtMeetingTime(next.scheduled_start_time);
    const invited = (next.invited_student_ids || []).length;
    const hostLine = next.host_email ? `<div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">Hosted by ${escapeHtml(next.host_email)}</div>` : '';
    html += `<div style="background:linear-gradient(135deg,rgba(34,211,238,0.10),rgba(167,139,250,0.10));border:1px solid rgba(34,211,238,0.45);border-radius:14px;padding:18px 20px;margin-bottom:14px;">
      <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent2);margin-bottom:8px;">${highlightLabel}</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
        <div style="min-width:130px;">
          <div style="font-size:1.2rem;font-weight:800;color:var(--accent2);">${escapeHtml(t.time)}</div>
          <div style="font-size:0.78rem;color:var(--text-dim);">${escapeHtml(t.date)} · ${next.scheduled_duration_minutes||60} min</div>
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:1rem;font-weight:700;">${escapeHtml(next.topic || 'Meeting')}</div>
          <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px;">${invited} invitee${invited===1?'':'s'}</div>
          ${hostLine}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${next.start_url && _isMyMeeting(next) ? `<button data-zm-start="${next.id}" class="btn-primary" style="padding:9px 16px;font-size:0.85rem;">Start as host →</button>` : ''}
          ${next.join_url ? `<button data-zm-open="${next.id}" class="btn-ghost" style="padding:9px 16px;font-size:0.85rem;">Open Zoom</button>` : ''}
          <button data-zm-invitees="${next.id}" class="btn-ghost" style="padding:9px 16px;font-size:0.85rem;">Invitees (${invited})</button>
          <button data-zm-cancel="${next.id}" class="btn-ghost" style="padding:9px 16px;font-size:0.85rem;color:#f87171;border-color:rgba(248,113,113,0.4);">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  if (others.length) {
    html += `<details style="margin-top:8px;">
      <summary style="cursor:pointer;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;font-size:0.82rem;font-weight:700;color:var(--text-dim);list-style:none;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:0;height:0;border-left:5px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform 0.15s;" class="caret"></span>
        Show all upcoming meetings (${others.length})
      </summary>
      <div style="margin-top:8px;">${others.map(m => _meetingCardHtml(m)).join('')}</div>
    </details>
    <style>details[open] > summary .caret{transform:rotate(90deg);}</style>`;
  }
  list.innerHTML = html;

  list.querySelectorAll('[data-zm-cancel]').forEach(b => b.addEventListener('click', () => cancelMeeting(b.dataset.zmCancel)));
  list.querySelectorAll('[data-zm-edit]').forEach(b => b.addEventListener('click', () => openEditMeetingModal(parseInt(b.dataset.zmEdit,10))));
  list.querySelectorAll('[data-zm-copy]').forEach(b => b.addEventListener('click', () => {
    const m = upcomingMeetings.find(x => x.id == b.dataset.zmCopy);
    if (m?.join_url) { navigator.clipboard.writeText(m.join_url); b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy link',1200); }
  }));
  list.querySelectorAll('[data-zm-open]').forEach(b => b.addEventListener('click', () => {
    const m = upcomingMeetings.find(x => x.id == b.dataset.zmOpen);
    if (m?.join_url) window.open(m.join_url, '_blank');
  }));
  list.querySelectorAll('[data-zm-start]').forEach(b => b.addEventListener('click', () => {
    const m = upcomingMeetings.find(x => x.id == b.dataset.zmStart);
    if (m?.start_url) window.open(m.start_url, '_blank');
  }));
  list.querySelectorAll('[data-zm-invitees]').forEach(b => b.addEventListener('click', () => {
    const m = upcomingMeetings.find(x => x.id == b.dataset.zmInvitees);
    if (m) openInviteesModal(m);
  }));
}

function openInviteesModal(meeting) {
  document.getElementById('inviteesModal')?.remove();
  const t = _fmtMeetingTime(meeting.scheduled_start_time);
  const regs = meeting.registrants || [];
  // Detect any invite emails that failed (rate-limit etc.) so we can show
  // a one-click "Resend failed emails" button.
  const failedCount = regs.filter(r => r && r.email && r.join_url && (r.email_sent === false || (r.email_error && /rate|429/i.test(String(r.email_error))))).length;
  // We now support cancel + add-students for externally-created (zoom-only)
  // meetings too — the edge function adopts the meeting into our DB on first
  // add. Keep the flag for downstream conditionals but always allow these.
  const isSystemMeeting = true;
  // Recurring meeting? Render a per-occurrence pane so coaches can see
  // exactly what's been sent for each future class (invite + 24h/1h/live
  // reminders). The actual sending is handled autonomously by the
  // zoom-scheduler cron job every 15 min — this pane is read-only status
  // plus a manual "Sync from Zoom" / "Resend invite" escape hatch.
  const isRecurring = !!meeting.is_recurring;
  const occurrences = Array.isArray(meeting.occurrences) ? meeting.occurrences.slice() : [];
  // Sort chronologically (defensive — they should already be ordered)
  occurrences.sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
  // Only show future occurrences in the pane — past ones just clutter the
  // panel. "Past" = start_time + duration < now.
  const nowMs = Date.now();
  const futureOccs = occurrences.filter(o => {
    if (!o?.start_time) return false;
    const endMs = Date.parse(o.start_time) + (Number(o.duration_minutes || 60) * 60_000);
    return endMs > nowMs;
  });
  const m = document.createElement('div');
  m.id = 'inviteesModal'; m.className = 'modal-bg';
  // Build the recurring-occurrences pane if applicable. Each row shows the
  // occurrence date + four pills (invite / 24h / 1h / live) — green when
  // sent_at is stamped, dim when still pending. The first upcoming
  // occurrence also gets a "Resend invite" link to re-fire emails for that
  // single occurrence if something failed.
  const occurrencesPane = (isRecurring && futureOccs.length) ? `
    <div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;background:var(--bg);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:0.82rem;font-weight:600;color:var(--text);">Recurring schedule</div>
          <div style="font-size:0.72rem;color:var(--text-dim);">${futureOccs.length} upcoming · auto-sends 4 days before each class</div>
        </div>
        <button id="inv-sync-occ-btn" class="btn-ghost" style="padding:5px 10px;font-size:0.72rem;" title="Re-fetch occurrence list from Zoom (in case the host rescheduled).">↻ Sync from Zoom</button>
      </div>
      <div style="max-height:240px;overflow-y:auto;">
        ${futureOccs.slice(0, 20).map((occ, i) => {
          const d = new Date(occ.start_time);
          const dateStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' });
          const timeStr = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZone:'UTC' }) + ' UTC';
          const pill = (sent, label) => sent
            ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.15);color:#10b981;font-size:0.68rem;font-weight:700;" title="Sent ${escapeHtml(sent)}">✓ ${label}</span>`
            : `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.08);color:var(--text-dim);font-size:0.68rem;font-weight:600;">${label}</span>`;
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.82rem;font-weight:600;">${escapeHtml(dateStr)}</div>
              <div style="font-size:0.7rem;color:var(--text-dim);">${escapeHtml(timeStr)}</div>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
              ${pill(occ.invite_sent_at, 'invite')}
              ${pill(occ.reminder_24h_sent_at, '24h')}
              ${pill(occ.reminder_1h_sent_at, '1h')}
              ${pill(occ.reminder_live_sent_at, 'live')}
            </div>
          </div>`;
        }).join('')}
        ${futureOccs.length > 20 ? `<div style="padding:8px 12px;text-align:center;font-size:0.72rem;color:var(--text-dim);">+${futureOccs.length - 20} more occurrences…</div>` : ''}
      </div>
    </div>` : '';

  m.innerHTML = `
    <div class="modal-card" style="max-width:620px;">
      <div class="modal-head">
        <h2>Invitees · ${escapeHtml(meeting.topic||'Meeting')}${isRecurring ? ' <span style="font-size:0.65rem;font-weight:700;color:#a78bfa;background:rgba(167,139,250,0.12);padding:3px 7px;border-radius:6px;margin-left:6px;vertical-align:middle;">RECURRING</span>' : ''}</h2>
        ${failedCount > 0 ? `<button id="inv-resend-btn" class="btn-ghost" style="padding:7px 12px;font-size:0.78rem;background:rgba(251,191,36,0.10);border-color:rgba(251,191,36,0.4);color:#fbbf24;" title="Re-send the invite email + reminders for invitees whose email failed (typically rate-limit). Zoom registrations stay intact.">↻ Resend ${failedCount} failed</button>` : ''}
        ${isSystemMeeting ? `<button id="inv-edit-btn" class="btn-ghost" style="padding:7px 12px;font-size:0.78rem;" title="Edit topic, date/time, duration, recurrence, advanced settings">✎ Edit</button>` : ''}
        ${isSystemMeeting ? `<button id="inv-add-btn" class="btn-primary" style="padding:7px 14px;font-size:0.78rem;">+ Add students</button>` : ''}
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:10px;">${escapeHtml(t.date)} · ${escapeHtml(t.time)} · ${meeting.scheduled_duration_minutes||60} min · ${regs.length} invitee${regs.length===1?'':'s'}${isRecurring && futureOccs.length ? ` · ${futureOccs.length} upcoming classes` : ''}</div>
        <div style="border:1px solid var(--border);border-radius:10px;max-height:380px;overflow-y:auto;background:var(--bg);">
          ${regs.length ? regs.map(r => {
            const stu = allStudents.find(s => s.id === r.student_id);
            const name = stu?.name || (r.email||'').split('@')[0] || 'Unknown';
            const ok = r.email_sent === true;
            const status = ok
              ? `<span style="color:var(--accent2);font-size:0.72rem;font-weight:700;">✓ Email sent</span>`
              : (r.error
                  ? `<span style="color:#f87171;font-size:0.72rem;font-weight:700;">✗ ${escapeHtml(r.error)}</span>`
                  : (r.email_error ? `<span style="color:#f87171;font-size:0.72rem;font-weight:700;">✗ ${escapeHtml(r.email_error)}</span>` : `<span style="color:var(--text-dim);font-size:0.72rem;">No status</span>`));
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);">
              <div style="flex:1;">
                <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(name)}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);">${escapeHtml(r.email||'(no email)')}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">${status}
                ${r.join_url ? `<button data-copy-link="${escapeHtml(r.join_url)}" style="background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:6px;padding:3px 8px;font-size:0.7rem;cursor:pointer;">Copy personal link</button>` : ''}
              </div>
              ${r.email ? `<button data-remove-reg="${escapeHtml(r.email)}" data-remove-name="${escapeHtml(name)}" title="Un-invite this student (cancels their Zoom registration + stops reminders)" style="background:transparent;border:none;color:#f87171;cursor:pointer;font-size:1.1rem;padding:4px 6px;border-radius:6px;line-height:1;">×</button>` : ''}
            </div>`;
          }).join('') : '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:0.86rem;">No invitees on this meeting.</div>'}
        </div>
        ${occurrencesPane}
      </div>
      <div class="modal-foot">
        ${isSystemMeeting ? `<button id="inv-cancel-btn" class="btn-ghost" style="color:#f87171;border-color:rgba(248,113,113,0.4);">Cancel meeting</button>` : ''}
        <button class="btn-ghost" data-x style="margin-left:auto;">Close</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  m.querySelectorAll('[data-copy-link]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard.writeText(b.dataset.copyLink);
    const orig = b.textContent; b.textContent = 'Copied!'; setTimeout(() => b.textContent = orig, 1200);
  }));
  document.getElementById('inv-add-btn')?.addEventListener('click', () => { close(); openAddInviteesModal(meeting); });
  document.getElementById('inv-edit-btn')?.addEventListener('click', () => { close(); openEditMeetingModal(meeting.id); });
  // Inline un-invite buttons on each invitee row.
  m.querySelectorAll('[data-remove-reg]').forEach(b => b.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const email = btn.dataset.removeReg;
    const name = btn.dataset.removeName || email;
    if (!confirm(`Un-invite ${name}? Their Zoom registration will be cancelled and future reminders for this meeting will stop.`)) return;
    btn.disabled = true; btn.textContent = '…';
    try {
      const body = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5), email }
        : { id: Number(meeting.id), email };
      await _zoomFetch('remove-student', { method:'POST', body });
      await loadUpcomingMeetings();
      const refreshed = (upcomingMeetings || []).find(x => String(x.id) === String(meeting.id));
      close();
      if (refreshed) openInviteesModal(refreshed);
    } catch (e2) {
      btn.disabled = false; btn.textContent = '×';
      alert('Remove failed: ' + (e2.message || e2));
    }
  }));
  document.getElementById('inv-resend-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Resending…';
    try {
      const body = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5) }
        : { id: Number(meeting.id) };
      const j = await _zoomFetch('resend-failed-emails', { method: 'POST', body });
      const msg = `Resent ${j.resent} email${j.resent === 1 ? '' : 's'}` + (j.still_failed ? ` · ${j.still_failed} still failed` : '');
      btn.textContent = '✓ ' + msg;
      // Refresh the modal so statuses update.
      await loadUpcomingMeetings();
      const refreshed = (upcomingMeetings || []).find(x => String(x.id) === String(meeting.id));
      if (refreshed) {
        setTimeout(() => { close(); openInviteesModal(refreshed); }, 1500);
      }
    } catch (e2) {
      btn.disabled = false; btn.textContent = original;
      alert('Resend failed: ' + (e2.message || e2));
    }
  });
  document.getElementById('inv-sync-occ-btn')?.addEventListener('click', async (e) => {
    // Manual escape hatch: re-fetch the occurrence list from Zoom. Useful
    // if the host changed the recurrence in Zoom directly (we don't get
    // webhook events, so the DB drifts otherwise). Backend merges so we
    // preserve sent_at stamps for occurrences we already had.
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Syncing…';
    try {
      const body = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5) }
        : { id: Number(meeting.id) };
      const j = await _zoomFetch('sync-occurrences', { method:'POST', body });
      btn.textContent = `✓ ${j.total} occ · +${j.added}/-${j.removed}`;
      await loadUpcomingMeetings();
      const refreshed = (upcomingMeetings || []).find(x => String(x.id) === String(meeting.id));
      if (refreshed) setTimeout(() => { close(); openInviteesModal(refreshed); }, 1200);
    } catch (e2) {
      btn.disabled = false; btn.textContent = original;
      alert('Sync failed: ' + (e2.message || e2));
    }
  });
  document.getElementById('inv-cancel-btn')?.addEventListener('click', async () => {
    if (!confirm(`Cancel "${meeting.topic || 'this meeting'}"? Registered students will be notified.`)) return;
    try {
      const body = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5) }
        : { id: Number(meeting.id) };
      await _zoomFetch('cancel', { method:'POST', body });
      close();
      await loadUpcomingMeetings();
    } catch (e) { alert('Cancel failed: ' + (e.message || e)); }
  });
}

async function openAddInviteesModal(meeting) {
  document.getElementById('addInviteesModal')?.remove();
  const alreadyInvited = new Set((meeting.invited_student_ids || []).map(Number));

  // Pool recompute — respects coach scoping + the global advanced filters +
  // showExpired toggle. Excludes already-invited students.
  let pool = [];
  function recomputePool() {
    let basePool = allStudents.slice();
    if (!isPrivilegedViewer) {
      const mine = _myCoachIdentities();
      basePool = basePool.filter(s => _isMine(s, mine));
    }
    basePool = _applyAdvancedFilters(basePool);
    if (!showExpired) basePool = basePool.filter(s => s.derived_status !== 'Expired');
    pool = basePool.filter(s => !alreadyInvited.has(s.id)).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  }
  recomputePool();

  const sel = new Set();
  const m = document.createElement('div');
  m.id = 'addInviteesModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:560px;">
      <div class="modal-head">
        <h2>Add students to meeting</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:6px;">${escapeHtml(meeting.topic || 'Meeting')} · ${alreadyInvited.size} already invited</div>
        <div>
          <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
            <input id="ai-search" type="search" placeholder="Search by name or email…" style="flex:1;">
            <button type="button" id="ai-filters-btn" class="btn-ghost" style="padding:7px 12px;font-size:0.78rem;border-radius:8px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filters<span id="ai-filters-count" style="display:none;background:var(--accent2);color:#06231a;border-radius:999px;padding:1px 6px;font-size:0.62rem;font-weight:800;">0</span></button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">
            <span id="ai-count">0 selected</span>
            <span id="ai-eligible">${pool.length} eligible</span>
          </div>
          <div class="sz-students" id="ai-students"></div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">Each picked student gets a personal join link emailed to them.</div>
        </div>
        <div id="ai-result-wrap"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="ai-add" disabled>Add &amp; invite (0)</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  const listEl = document.getElementById('ai-students');
  const countEl = document.getElementById('ai-count');
  const addBtn = document.getElementById('ai-add');
  const search = document.getElementById('ai-search');

  function updateFiltersBadge() {
    const fc = document.getElementById('ai-filters-count');
    const n = _filtersActiveCount();
    if (fc) { fc.textContent = n; fc.style.display = n ? '' : 'none'; }
  }
  updateFiltersBadge();
  document.getElementById('ai-filters-btn').addEventListener('click', () => openFiltersModal(() => {
    recomputePool();
    document.getElementById('ai-eligible').textContent = pool.length + ' eligible';
    updateFiltersBadge();
    render();
  }));

  function render() {
    const q = (search.value || '').trim().toLowerCase();
    let rows = pool;
    if (q) rows = rows.filter(s => (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q));
    const selRows = rows.filter(s => sel.has(s.id));
    const otherRows = rows.filter(s => !sel.has(s.id)).slice(0, 200 - selRows.length);
    const visible = [...selRows, ...otherRows];
    if (!visible.length) { listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;padding:6px;">No matches.</div>'; return; }
    listEl.innerHTML = visible.map(s =>
      `<label><input type="checkbox" data-aid="${s.id}" ${sel.has(s.id)?'checked':''}> ${escapeHtml(s.name||'(unnamed)')} <span style="color:var(--text-dim);">${escapeHtml(s.email||'no email')}</span></label>`
    ).join('');
    if (rows.length > visible.length) listEl.innerHTML += `<div style="color:var(--text-dim);font-size:0.72rem;padding:6px;">+ ${rows.length - visible.length} more — refine search.</div>`;
    listEl.querySelectorAll('input[data-aid]').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(cb.dataset.aid, 10);
        if (e.target.checked) sel.add(id); else sel.delete(id);
        countEl.textContent = sel.size + ' selected';
        addBtn.textContent = `Add & invite (${sel.size})`;
        addBtn.disabled = sel.size === 0;
      });
    });
  }
  render();
  search.addEventListener('input', render);

  addBtn.addEventListener('click', async () => {
    const ids = [...sel];
    if (!ids.length) return;
    const wrap = document.getElementById('ai-result-wrap');
    addBtn.disabled = true; addBtn.textContent = 'Adding…';
    try {
      const reqBody = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5), student_ids: ids, topic: meeting.topic, scheduled_start_time: meeting.scheduled_start_time, scheduled_duration_minutes: meeting.scheduled_duration_minutes, host_email: meeting.host_email }
        : { id: Number(meeting.id), student_ids: ids };
      const j = await _zoomFetch('add-students', { method:'POST', body: reqBody });
      const ok = (j.meeting?.registrants || []).filter(r => ids.includes(r.student_id) && !r.error).length;
      const fail = (j.meeting?.registrants || []).filter(r => ids.includes(r.student_id) && r.error);
      let html = `<div class="sz-result">✓ Added ${ok} student${ok===1?'':'s'}. Invitation emails sent.</div>`;
      if (fail.length) html += `<div class="sz-result err">${fail.length} could not be added: ${fail.map(f=>escapeHtml((allStudents.find(s=>s.id===f.student_id)?.name)||'?')+': '+escapeHtml(f.error||'unknown')).join('; ')}</div>`;
      wrap.innerHTML = html;
      await loadUpcomingMeetings();
      // Re-open invitees modal with the freshest data
      const refreshed = upcomingMeetings.find(x => x.id === meeting.id);
      setTimeout(() => { close(); if (refreshed) openInviteesModal(refreshed); }, 1400);
    } catch (e) {
      wrap.innerHTML = `<div class="sz-result err">Failed: ${escapeHtml(e.message || String(e))}</div>`;
      addBtn.disabled = false; addBtn.textContent = `Add & invite (${ids.length})`;
    }
  });
}

async function cancelMeeting(id) {
  // id may be a numeric DB row id, the same as a string, or "zoom-<zoomMeetingId>"
  // for externally-created meetings. Match either way.
  const m = upcomingMeetings.find(x => String(x.id) === String(id));
  if (!confirm(`Cancel "${m?.topic || 'this meeting'}"? Registered students will be notified by Zoom.`)) return;
  try {
    const body = (typeof id === 'string' && id.startsWith('zoom-'))
      ? { zoom_meeting_id: id.slice(5) }
      : { id: Number(id) };
    await _zoomFetch('cancel', { method:'POST', body });
    await loadUpcomingMeetings();
  } catch (e) { alert('Cancel failed: ' + (e.message || e)); }
}

async function openScheduleZoomModal(prefilledIds) {
  // Don't block the modal on loading hosts — render immediately and populate
  // the "Host as (coach)" dropdown when the request resolves. zoomHosts is
  // already pre-warmed at page-init, so the modal usually has it instantly.
  const hostsLoading = isPrivilegedViewer && !zoomHosts.length
    ? loadZoomHosts().catch(() => {})
    : null;
  document.getElementById('szModal')?.remove();
  // Default: 24h from now, rounded to next 15-min mark — formatted as
  // Chicago-local so the datetime-local input shows the team's working
  // timezone regardless of where the user is browsing from.
  const def = new Date(Date.now() + 24*60*60*1000);
  def.setMinutes(Math.ceil(def.getMinutes()/15)*15, 0, 0);
  const pad = n => String(n).padStart(2,'0');
  const ctSeed = (function () {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MEETING_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(def);
    const o = {};
    for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
    if (o.hour === '24') o.hour = '00';
    return o;
  })();
  const localDtVal = `${ctSeed.year}-${ctSeed.month}-${ctSeed.day}T${ctSeed.hour}:${ctSeed.minute}`;

  // Pool = ALL students for privileged viewers; ONLY my students for coaches.
  // Prefilled IDs (from bulk select) come pre-checked.
  const preset = new Set((prefilledIds || []).map(Number));
  let basePool = allStudents;
  let scopedToMine = false;
  if (!isPrivilegedViewer) {
    const mine = _myCoachIdentities();
    basePool = allStudents.filter(s => _isMine(s, mine));
    scopedToMine = true;
  }
  // Apply the global advanced filters too (so Schedule Zoom respects them)
  basePool = _applyAdvancedFilters(basePool);
  if (!showExpired) basePool = basePool.filter(s => s.derived_status !== 'Expired');
  const pool = [...basePool].sort((a,b) => {
    const ap = preset.has(a.id) ? 0 : 1, bp = preset.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.name||'').localeCompare(b.name||'');
  });
  // Selection state lives outside DOM so it survives search-filtering
  const szSelected = new Set(preset);

  const m = document.createElement('div');
  m.id = 'szModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:560px;">
      <div class="modal-head">
        <h2>Schedule Zoom meeting</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        ${isPrivilegedViewer ? `
        <div id="sz-host-wrap"><label>Host as (coach)</label>
          <select id="sz-host">
            <option value="">— Me (${escapeHtml(currentSession.user.email||'')}) —</option>
            ${zoomHosts.filter(h => h.id !== currentSession.user.id).map(h => `<option value="${h.id}" ${h.zoom_host_email ? '' : 'disabled'}>${escapeHtml(_hostLabel(h))}${h.zoom_host_email ? '' : ' — no Zoom email mapped'}</option>`).join('')}
          </select>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">As an admin/I-C, you can schedule on a coach's behalf. The meeting will be hosted under their Zoom account.</div>
        </div>` : ''}
        <div><label>Topic</label>
          <input id="sz-topic" type="text" placeholder="e.g. Weekly check-in — Module 5" value="Mentorship Zoom — ${new Date().toLocaleDateString()}"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
          <div><label>Start (US Central time)</label>
            <input id="sz-start" type="datetime-local" value="${localDtVal}"></div>
          <div><label>Duration (min)</label>
            <input id="sz-duration" type="number" min="15" step="15" value="60"></div>
        </div>
        <div>
          <label>Invite students (auto-emails personal join link)</label>
          ${scopedToMine ? `<div style="font-size:0.74rem;color:var(--accent2);background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.3);border-radius:6px;padding:6px 10px;margin-bottom:8px;">Showing only your students (${pool.length}).</div>` : ''}
          <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
            <input id="sz-search" type="search" placeholder="Search by name or email…" style="flex:1;">
            <button type="button" id="sz-filters-btn" class="btn-ghost" style="padding:7px 12px;font-size:0.78rem;border-radius:8px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filters<span id="sz-filters-count" style="display:none;background:var(--accent2);color:#06231a;border-radius:999px;padding:1px 6px;font-size:0.62rem;font-weight:800;">0</span></button>
            <select id="sz-group" style="flex:0 0 180px;font-size:0.82rem;">
              <option value="">— Use a group —</option>
              ${(sessionGroups||[]).slice().sort((a,b)=> (a.name||'').localeCompare(b.name||'')).map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${(g.student_ids||[]).length})</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">
            <span id="sz-count">${szSelected.size} selected</span>
            <button type="button" id="sz-clear" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;text-decoration:underline;font-size:0.72rem;padding:0;">Clear all</button>
          </div>
          <div class="sz-students" id="sz-students"></div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">Students without an email will be skipped.</div>
        </div>
        <div><label>Notes (internal, not sent to students)</label>
          <textarea id="sz-notes" style="min-height:60px;" placeholder="Optional"></textarea></div>
        <details id="sz-advanced">
          <summary class="sz-adv-summary">
            <span class="sz-adv-caret"></span>
            <span>Advanced Zoom settings</span>
            <span class="sz-adv-hint">click to expand</span>
          </summary>
          <div class="sz-adv-body">
            <div class="sz-adv-toggles">
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-waiting" checked><span>Waiting room</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-jbh"><span>Allow join before host</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-mute" checked><span>Mute participants on entry</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-host-video"><span>Start with host video on</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-part-video"><span>Start with participants' video on</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-passcode" checked><span>Require passcode</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-captions"><span>Enable live captions / transcription</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-auth"><span>Require Zoom login to join</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-rename" checked><span>Let participants rename themselves</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-watermark"><span>Watermark on screen-share</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-e2ee"><span>End-to-end encryption</span></label>
              <label class="sz-adv-toggle"><input type="checkbox" id="sz-chat" checked><span>Allow chat in meeting</span></label>
            </div>
            <div class="sz-adv-field">
              <label>Audio options</label>
              <select id="sz-audio">
                <option value="both" selected>Telephone &amp; computer audio</option>
                <option value="voip">Computer audio (VoIP) only</option>
                <option value="telephony">Telephone only</option>
              </select>
              <div class="sz-adv-help">Computer-only keeps phone dial-in numbers out of the invitation email.</div>
            </div>
            <div class="sz-adv-field">
              <label>Invitation email language</label>
              <select id="sz-emailLang">
                <option value="en-US" selected>English</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="it-IT">Italian</option>
                <option value="pt-PT">Portuguese</option>
                <option value="nl-NL">Dutch</option>
                <option value="pl-PL">Polish</option>
                <option value="ru-RU">Russian</option>
                <option value="tr-TR">Turkish</option>
                <option value="vi-VN">Vietnamese</option>
                <option value="id-ID">Indonesian</option>
                <option value="jp-JP">Japanese</option>
                <option value="ko-KO">Korean</option>
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="zh-TW">Chinese (Traditional)</option>
              </select>
              <div class="sz-adv-help">Used for any Zoom-side notifications. Our own invite email always uses English.</div>
            </div>
            <div class="sz-adv-field" id="sz-passcode-wrap">
              <label>Custom passcode (optional)</label>
              <input id="sz-customPasscode" type="text" placeholder="Leave blank to auto-generate" maxlength="10">
              <div class="sz-adv-help">Letters and numbers, max 10 characters. Easier to share verbally than auto-generated codes.</div>
            </div>
            <div class="sz-adv-field">
              <label>Timezone</label>
              <select id="sz-timezone"></select>
              <div class="sz-adv-help">The meeting time displays in this timezone in Zoom. Defaults to your local timezone.</div>
            </div>
            <div class="sz-adv-field">
              <label>Recurring meeting</label>
              <select id="sz-recurrence">
                <option value="" selected>One-time meeting</option>
                <option value="daily">Repeat daily</option>
                <option value="weekly">Repeat weekly</option>
                <option value="biweekly">Repeat every 2 weeks</option>
                <option value="monthly">Repeat monthly</option>
              </select>
              <div id="sz-recurrence-end" style="display:none;margin-top:8px;display:none;">
                <label style="margin-top:6px;">End after</label>
                <div style="display:flex;gap:8px;align-items:center;">
                  <select id="sz-rec-end-type" style="flex:0 0 140px;">
                    <option value="count" selected>Number of sessions</option>
                    <option value="date">By date</option>
                  </select>
                  <input id="sz-rec-end-count" type="number" min="2" max="50" value="4" style="flex:1;">
                  <input id="sz-rec-end-date" type="date" style="flex:1;display:none;">
                </div>
                <div class="sz-adv-help">Each session uses the same Zoom link. Students get one invitation that covers the whole series.</div>
              </div>
            </div>
            <div class="sz-adv-field">
              <label>Auto-recording</label>
              <select id="sz-record">
                <option value="none" selected>None</option>
                <option value="local">Local</option>
                <option value="cloud">Cloud</option>
              </select>
            </div>
            <div class="sz-adv-field">
              <label>Approval type</label>
              <select id="sz-approval">
                <option value="0" selected>Automatically approve registrants</option>
                <option value="1">Manually approve registrants</option>
              </select>
            </div>
            <div class="sz-adv-field">
              <label>Alternative hosts (comma-separated emails)</label>
              <input id="sz-altHosts" type="text" placeholder="e.g. carlos@ridleyacademy.team, dan@ridleyacademy.team">
              <div class="sz-adv-help">Each email must be a Licensed Zoom user on this account.</div>
            </div>
          </div>
        </details>
        <div id="sz-result-wrap"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="sz-create">Create meeting & invite</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  // If we deferred loading the hosts list, refresh the dropdown when it lands.
  if (hostsLoading) {
    hostsLoading.then(() => {
      const sel = document.getElementById('sz-host');
      if (!sel || !zoomHosts.length) return;
      const prev = sel.value;
      sel.innerHTML = `<option value="">— Me (${escapeHtml(currentSession.user.email||'')}) —</option>` +
        zoomHosts.filter(h => h.id !== currentSession.user.id).map(h =>
          `<option value="${h.id}" ${h.zoom_host_email ? '' : 'disabled'}>${escapeHtml(_hostLabel(h))}${h.zoom_host_email ? '' : ' — no Zoom email mapped'}</option>`
        ).join('');
      if (prev) sel.value = prev;
    });
  }

  const listEl = document.getElementById('sz-students');
  const countEl = document.getElementById('sz-count');
  const searchEl = document.getElementById('sz-search');
  function renderStudentChoices() {
    const q = (searchEl.value || '').trim().toLowerCase();
    let rows = pool;
    if (q) rows = rows.filter(s => (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q));
    // Cap to 200 results visible to keep the modal snappy; selected always shown
    const selectedRows = rows.filter(s => szSelected.has(s.id));
    const otherRows = rows.filter(s => !szSelected.has(s.id)).slice(0, 200 - selectedRows.length);
    const visible = [...selectedRows, ...otherRows];
    if (!visible.length) { listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;padding:6px;">No matches.</div>'; return; }
    listEl.innerHTML = visible.map(s =>
      `<label><input type="checkbox" data-szid="${s.id}" ${szSelected.has(s.id)?'checked':''}> ${escapeHtml(s.name||'(unnamed)')} <span style="color:var(--text-dim);">${escapeHtml(s.email||'no email')}</span></label>`
    ).join('');
    if (rows.length > visible.length) listEl.innerHTML += `<div style="color:var(--text-dim);font-size:0.72rem;padding:6px;">+ ${rows.length - visible.length} more — refine search to see them.</div>`;
    listEl.querySelectorAll('input[data-szid]').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(cb.dataset.szid, 10);
        if (e.target.checked) szSelected.add(id); else szSelected.delete(id);
        countEl.textContent = szSelected.size + ' selected';
      });
    });
  }
  renderStudentChoices();
  searchEl.addEventListener('input', renderStudentChoices);

  // Populate timezone picker (common ones + user's local)
  (() => {
    const tzSel = document.getElementById('sz-timezone');
    if (!tzSel) return;
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const common = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Mexico_City','America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Berlin','Europe/Rome','Europe/Madrid','Europe/Amsterdam','Europe/Stockholm','Europe/Athens','Africa/Cairo','Africa/Johannesburg','Asia/Dubai','Asia/Tashkent','Asia/Karachi','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Australia/Sydney','Australia/Melbourne','Pacific/Auckland'];
    const set = new Set([localTz, ...common]);
    const list = [...set].sort();
    tzSel.innerHTML = list.map(t => `<option value="${t}" ${t === localTz ? 'selected' : ''}>${t}${t === localTz ? ' (your timezone)' : ''}</option>`).join('');
  })();

  // Filters button — opens the same advanced filter modal, then rebuilds the pool
  function _szRebuildPool() {
    let np = isPrivilegedViewer ? allStudents.slice() : allStudents.filter(s => _isMine(s, _myCoachIdentities()));
    np = _applyAdvancedFilters(np);
    if (!showExpired) np = np.filter(s => s.derived_status !== 'Expired');
    np.sort((a,b) => {
      const ap = szSelected.has(a.id) ? 0 : 1, bp = szSelected.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.name||'').localeCompare(b.name||'');
    });
    pool.length = 0;
    for (const s of np) pool.push(s);
    renderStudentChoices();
    const fc = document.getElementById('sz-filters-count');
    const n = _filtersActiveCount();
    if (fc) { fc.textContent = n; fc.style.display = n ? '' : 'none'; }
  }
  const szFiltersBtn = document.getElementById('sz-filters-btn');
  if (szFiltersBtn) szFiltersBtn.addEventListener('click', () => openFiltersModal(_szRebuildPool));
  // Initialize the count badge
  _szRebuildPool();

  // Toggle recurrence end-controls
  const recSel = document.getElementById('sz-recurrence');
  const recEndWrap = document.getElementById('sz-recurrence-end');
  const recEndType = document.getElementById('sz-rec-end-type');
  const recEndCount = document.getElementById('sz-rec-end-count');
  const recEndDate = document.getElementById('sz-rec-end-date');
  recSel.addEventListener('change', () => {
    recEndWrap.style.display = recSel.value ? 'block' : 'none';
  });
  recEndType.addEventListener('change', () => {
    if (recEndType.value === 'count') { recEndCount.style.display = ''; recEndDate.style.display = 'none'; }
    else { recEndCount.style.display = 'none'; recEndDate.style.display = ''; }
  });
  document.getElementById('sz-clear').addEventListener('click', () => {
    szSelected.clear();
    countEl.textContent = '0 selected';
    renderStudentChoices();
  });
  // Group picker: replace selection with the group's students (or add to existing if shift-key)
  const groupSel = document.getElementById('sz-group');
  groupSel?.addEventListener('change', e => {
    const gid = e.target.value;
    if (!gid) return;
    const g = (sessionGroups || []).find(x => String(x.id) === String(gid));
    if (!g) return;
    szSelected.clear();
    for (const id of (g.student_ids || [])) szSelected.add(Number(id));
    countEl.textContent = szSelected.size + ' selected';
    renderStudentChoices();
    // reset to placeholder so the same group can be re-applied
    e.target.value = '';
  });

  document.getElementById('sz-create').addEventListener('click', async () => {
    const topic = document.getElementById('sz-topic').value.trim();
    const localStart = document.getElementById('sz-start').value;
    const duration = parseInt(document.getElementById('sz-duration').value, 10);
    const notes = document.getElementById('sz-notes').value.trim() || null;
    const student_ids = [...szSelected];
    const wrap = document.getElementById('sz-result-wrap');
    if (!topic || !localStart || !duration) { wrap.innerHTML = '<div class="sz-result err">Topic, start time, and duration are required.</div>'; return; }
    // local datetime → UTC ISO
    const startIso = _meetingLocalToUTC(localStart);
    const hostSel = document.getElementById('sz-host');
    const host_user_id = hostSel?.value || null;
    // Advanced settings
    const recVal = document.getElementById('sz-recurrence').value;
    let recurrence = null;
    if (recVal) {
      const endTypeVal = document.getElementById('sz-rec-end-type').value;
      recurrence = {
        type: recVal, // 'daily' | 'weekly' | 'biweekly' | 'monthly'
        end_type: endTypeVal,
        end_count: endTypeVal === 'count' ? parseInt(document.getElementById('sz-rec-end-count').value, 10) || 4 : null,
        end_date: endTypeVal === 'date' ? (document.getElementById('sz-rec-end-date').value || null) : null,
      };
    }
    const advanced = {
      waiting_room: document.getElementById('sz-waiting').checked,
      join_before_host: document.getElementById('sz-jbh').checked,
      mute_upon_entry: document.getElementById('sz-mute').checked,
      host_video: document.getElementById('sz-host-video').checked,
      participant_video: document.getElementById('sz-part-video').checked,
      passcode: document.getElementById('sz-passcode').checked,
      custom_passcode: (document.getElementById('sz-customPasscode').value || '').trim(),
      auto_recording: document.getElementById('sz-record').value,
      approval_type: parseInt(document.getElementById('sz-approval').value, 10),
      alternative_hosts: (document.getElementById('sz-altHosts').value || '').trim(),
      timezone: document.getElementById('sz-timezone').value || 'UTC',
      live_captions: document.getElementById('sz-captions').checked,
      meeting_authentication: document.getElementById('sz-auth').checked,
      allow_rename: document.getElementById('sz-rename').checked,
      watermark: document.getElementById('sz-watermark').checked,
      e2ee: document.getElementById('sz-e2ee').checked,
      chat: document.getElementById('sz-chat').checked,
      audio: document.getElementById('sz-audio').value,
      email_language: document.getElementById('sz-emailLang').value,
      recurrence,
    };
    const btn = document.getElementById('sz-create'); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const j = await _zoomFetch('create', { method:'POST', body:{ topic, start_time: startIso, duration, student_ids, notes, host_user_id, advanced } });
      const ok = (j.meeting?.registrants || []).filter(r => !r.error).length;
      const fail = (j.meeting?.registrants || []).filter(r => r.error);
      let html = `<div class="sz-result">✓ Meeting created. ${ok} student${ok===1?'':'s'} invited via Zoom email.</div>`;
      if (fail.length) html += `<div class="sz-result err">${fail.length} could not be invited: ${fail.map(f=>escapeHtml((allStudents.find(s=>s.id===f.student_id)?.name)||'?')+': '+escapeHtml(f.error||'unknown')).join('; ')}</div>`;
      wrap.innerHTML = html;
      await loadUpcomingMeetings();
      setTimeout(close, 1800);
    } catch (e) {
      wrap.innerHTML = `<div class="sz-result err">Failed: ${escapeHtml(e.message || String(e))}</div>`;
      btn.disabled = false; btn.textContent = 'Create meeting & invite';
    }
  });
}

// Edit an already-created meeting in one place: topic, date/time, duration,
// recurrence on/off + cadence + end, and the common advanced toggles. Calls
// `api=update` on save — backend PATCHes Zoom, re-syncs occurrences[] for
// recurring meetings, and dispatches `zoom_rescheduled` to every existing
// invitee with the new ICS attached.
function openEditMeetingModal(idOrMeeting) {
  const meeting = (typeof idOrMeeting === 'object' && idOrMeeting !== null)
    ? idOrMeeting
    : upcomingMeetings.find(x => x.id === idOrMeeting || x.id === Number(idOrMeeting));
  if (!meeting) { alert('Meeting not found in the upcoming list.'); return; }
  document.getElementById('szModal')?.remove();

  // Build the datetime-local pre-fill in America/Chicago so the user sees
  // the SAME time the meeting was originally created with (matches the
  // dashboard display + the calendar invite that went out).
  const cur = new Date(meeting.scheduled_start_time || Date.now());
  const pad = n => String(n).padStart(2,'0');
  const ctParts = (function () {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(cur);
    const map = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    // hour can be "24" at midnight in some implementations
    if (map.hour === '24') map.hour = '00';
    return map;
  })();
  const curVal = `${ctParts.year}-${ctParts.month}-${ctParts.day}T${ctParts.hour}:${ctParts.minute}`;

  // Read existing recurrence so we can pre-select the cadence dropdown. Zoom
  // returns { type: 1|2|3, weekly_days, repeat_interval, end_times, end_date_time }.
  // type 2 + repeat_interval 1 = weekly; type 2 + repeat_interval 2 = biweekly.
  const rec = meeting.recurrence || null;
  let recDefault = '';
  if (rec) {
    if (rec.type === 1) recDefault = 'daily';
    else if (rec.type === 2 && (rec.repeat_interval || 1) === 1) recDefault = 'weekly';
    else if (rec.type === 2) recDefault = 'biweekly';
    else if (rec.type === 3) recDefault = 'monthly';
  }
  const recEndCount = rec?.end_times || 4;
  const recEndDate  = rec?.end_date_time ? rec.end_date_time.slice(0, 10) : '';
  const recHadEndDate = !!rec?.end_date_time;

  // Default advanced values — only changed-from-default get sent so we don't
  // overwrite Zoom settings the user never touched. We don't have the full
  // current `settings` from Zoom hydrated locally, so the Advanced block
  // here is opt-in: a separate "Override advanced settings" toggle.
  const m = document.createElement('div');
  m.id = 'szModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:560px;">
      <div class="modal-head">
        <h2>Edit · ${escapeHtml(meeting.topic || 'Meeting')}</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div><label>Topic</label><input id="ed-topic" type="text" value="${escapeHtml(meeting.topic || '')}"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
          <div><label>Start (US Central time)</label><input id="ed-start" type="datetime-local" value="${curVal}"></div>
          <div><label>Duration (min)</label><input id="ed-duration" type="number" min="15" step="15" value="${meeting.scheduled_duration_minutes || 60}"></div>
        </div>
        <div>
          <label>Recurrence</label>
          <select id="ed-recurrence">
            <option value="" ${recDefault === '' ? 'selected' : ''}>None — one-off meeting</option>
            <option value="daily" ${recDefault === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${recDefault === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="biweekly" ${recDefault === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option>
            <option value="monthly" ${recDefault === 'monthly' ? 'selected' : ''}>Monthly</option>
          </select>
        </div>
        <div id="ed-recurrence-end" style="display:${recDefault ? 'block' : 'none'};border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg);">
          <label style="font-size:0.78rem;">End the series</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;margin-top:4px;">
            <div>
              <select id="ed-rec-end-type">
                <option value="count" ${!recHadEndDate ? 'selected' : ''}>After N sessions</option>
                <option value="date" ${recHadEndDate ? 'selected' : ''}>On a specific date</option>
              </select>
            </div>
            <div>
              <input id="ed-rec-end-count" type="number" min="2" max="50" value="${recEndCount}" style="display:${!recHadEndDate ? '' : 'none'};">
              <input id="ed-rec-end-date" type="date" value="${recEndDate}" style="display:${recHadEndDate ? '' : 'none'};">
            </div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">Up to 50 sessions or 2 years out.</div>
        </div>
        <details id="ed-advanced" style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
          <summary style="cursor:pointer;font-size:0.84rem;font-weight:600;">Override advanced settings <span style="color:var(--text-dim);font-weight:400;font-size:0.74rem;">(leave closed to keep current)</span></summary>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:0.82rem;">
            <label><input type="checkbox" id="ed-waiting" checked> Waiting room</label>
            <label><input type="checkbox" id="ed-jbh"> Allow join before host</label>
            <label><input type="checkbox" id="ed-mute" checked> Mute participants on entry</label>
            <label><input type="checkbox" id="ed-passcode" checked> Require passcode</label>
            <label>Auto-record:
              <select id="ed-record" style="margin-left:6px;">
                <option value="none">Off</option>
                <option value="local">Local</option>
                <option value="cloud">Cloud</option>
              </select>
            </label>
            <label>Custom passcode (optional):<input id="ed-customPasscode" type="text" maxlength="10" placeholder="leave blank to keep current" style="margin-left:6px;"></label>
            <label>Alternative hosts (comma-separated emails):<input id="ed-altHosts" type="text" placeholder="" style="margin-left:6px;"></label>
          </div>
        </details>
        <div style="font-size:0.74rem;color:var(--text-dim);">
          Material changes (topic / time / duration / recurrence) send a single "meeting updated" email + fresh calendar attachment to existing invitees.
        </div>
        <div id="ed-result-wrap"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="ed-save">Save changes</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  // Toggle the end-controls block when recurrence changes
  const recSel = document.getElementById('ed-recurrence');
  const recEndWrap = document.getElementById('ed-recurrence-end');
  const recEndTypeSel = document.getElementById('ed-rec-end-type');
  const recEndCountEl = document.getElementById('ed-rec-end-count');
  const recEndDateEl = document.getElementById('ed-rec-end-date');
  recSel.addEventListener('change', () => { recEndWrap.style.display = recSel.value ? 'block' : 'none'; });
  recEndTypeSel.addEventListener('change', () => {
    if (recEndTypeSel.value === 'count') { recEndCountEl.style.display = ''; recEndDateEl.style.display = 'none'; }
    else { recEndCountEl.style.display = 'none'; recEndDateEl.style.display = ''; }
  });

  document.getElementById('ed-save').addEventListener('click', async () => {
    const btn = document.getElementById('ed-save');
    const wrap = document.getElementById('ed-result-wrap');
    const topic = document.getElementById('ed-topic').value.trim();
    const localStart = document.getElementById('ed-start').value;
    const duration = parseInt(document.getElementById('ed-duration').value, 10);
    if (!topic || !localStart || !duration) {
      wrap.innerHTML = '<div class="sz-result err">Topic, start, and duration are required.</div>'; return;
    }
    const startIso = _meetingLocalToUTC(localStart);

    // Build recurrence change instructions. If the user has set the cadence
    // to none AND the meeting was previously recurring → ask to REMOVE; if
    // they set a cadence → SET; if neither → don't touch recurrence.
    let recurrence_change = null;
    const wasRecurring = !!meeting.is_recurring;
    const newRecVal = recSel.value;
    if (wasRecurring && !newRecVal) {
      recurrence_change = { action: 'remove' };
    } else if (newRecVal) {
      const endTypeVal = recEndTypeSel.value;
      recurrence_change = {
        action: 'set',
        config: {
          type: newRecVal,
          end_type: endTypeVal,
          end_count: endTypeVal === 'count' ? parseInt(recEndCountEl.value, 10) || 4 : null,
          end_date: endTypeVal === 'date' ? (recEndDateEl.value || null) : null,
        },
      };
    }

    // Advanced block only if the user opened/edited the override.
    const advDetails = document.getElementById('ed-advanced');
    let advanced = null;
    if (advDetails.open) {
      advanced = {
        waiting_room: document.getElementById('ed-waiting').checked,
        join_before_host: document.getElementById('ed-jbh').checked,
        mute_upon_entry: document.getElementById('ed-mute').checked,
        passcode: document.getElementById('ed-passcode').checked,
        auto_recording: document.getElementById('ed-record').value,
        custom_passcode: document.getElementById('ed-customPasscode').value.trim(),
        alternative_hosts: document.getElementById('ed-altHosts').value.trim(),
      };
    }

    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const body = (typeof meeting.id === 'string' && meeting.id.startsWith('zoom-'))
        ? { zoom_meeting_id: meeting.id.slice(5) }
        : { id: Number(meeting.id) };
      body.topic = topic;
      body.start_time = startIso;
      body.duration = duration;
      if (recurrence_change) body.recurrence_change = recurrence_change;
      if (advanced) body.advanced = advanced;
      const j = await _zoomFetch('update', { method:'POST', body });
      const changedList = (j.changed || []).join(', ') || 'no material changes';
      const sentMsg = j.notified ? ` · ${j.notified.sent} notified${j.notified.failed ? ' / ' + j.notified.failed + ' failed' : ''}` : '';
      wrap.innerHTML = `<div class="sz-result">✓ Saved (${escapeHtml(changedList)})${escapeHtml(sentMsg)}.</div>`;
      await loadUpcomingMeetings();
      setTimeout(close, 1500);
    } catch (e) {
      wrap.innerHTML = `<div class="sz-result err">Failed: ${escapeHtml(e.message || String(e))}</div>`;
      btn.disabled = false; btn.textContent = 'Save changes';
    }
  });
}
// Back-compat alias — older callers still reference openRescheduleModal.
const openRescheduleModal = openEditMeetingModal;

document.getElementById('bulkScheduleZoomBtn').addEventListener('click', () => {
  if (!selectedIds.size) return;
  openScheduleZoomModal([...selectedIds]);
});
document.getElementById('scheduleZoomTopBtn').addEventListener('click', () => openScheduleZoomModal(null));

// ── Session groups (preset student groups for re-use) ───────────
let sessionGroups = [];
let zoomHosts = []; // privileged-only: list of users + their zoom_host_email
async function loadSessionGroups() {
  try {
    const { data, error } = await supa.rpc('list_session_groups');
    if (error) throw error;
    sessionGroups = data || [];
  } catch (e) { console.warn('loadSessionGroups failed', e); sessionGroups = []; }
}
async function loadZoomHosts() {
  if (!isPrivilegedViewer) return;
  try {
    const { data, error } = await supa.rpc('list_zoom_hosts');
    if (error) throw error;
    zoomHosts = data || [];
  } catch (e) { console.warn('loadZoomHosts failed', e); zoomHosts = []; }
}
function _hostLabel(u) {
  const fn = u.first_name || (u.email||'').split('@')[0];
  return fn + (u.email ? ' · ' + u.email : '');
}

function _canEditGroup(g) {
  // Privileged viewers (admin / ms_ic / delivery_ic / mentorship) can edit any
  // group. Regular coaches can edit groups they own OR groups they originally
  // created on behalf of someone else (created_by).
  const uid = currentSession?.user?.id;
  if (isPrivilegedViewer) return true;
  if (!uid) return false;
  return g.owner_id === uid || g.created_by === uid;
}

// Click-lock so rapid clicks on the Groups button don't stack multiple modals.
let _groupsOpening = false;

async function openGroupsModal() {
  if (_groupsOpening) return;
  _groupsOpening = true;
  document.getElementById('groupsModal')?.remove();

  // 1. Render the modal IMMEDIATELY using whatever we already have in
  //    sessionGroups (populated on dashboard boot). Avoids the 1-3s wait for
  //    the list_session_groups RPC to roundtrip before the user sees anything.
  const m = document.createElement('div');
  m.id = 'groupsModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:620px;">
      <div class="modal-head">
        <h2>Saved student groups</h2>
        <button id="groupNewBtn" class="btn-primary" style="padding:7px 14px;font-size:0.8rem;">+ New group</button>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div id="groupsList" style="display:flex;flex-direction:column;gap:8px;max-height:480px;overflow-y:auto;"></div>
        <div id="groupsEmpty" style="display:none;text-align:center;color:var(--text-dim);padding:18px;font-size:0.86rem;">No groups yet. Click <strong>+ New group</strong> to create one.</div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Close</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  _groupsOpening = false;
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  document.getElementById('groupNewBtn').addEventListener('click', () => { close(); openGroupEditor(null); });

  // Render whatever sessionGroups has now (might be empty on cold boot)
  renderGroupsList();

  // 2. Background refresh — fetch authoritative list; only re-render if it
  //    changed since the snapshot we rendered from.
  const snapshotKey = JSON.stringify((sessionGroups || []).map(g => g.id + ':' + (g.student_ids||[]).length).sort());
  try {
    await loadSessionGroups();
    const newKey = JSON.stringify((sessionGroups || []).map(g => g.id + ':' + (g.student_ids||[]).length).sort());
    if (newKey !== snapshotKey && document.getElementById('groupsModal') === m) renderGroupsList();
  } catch (_) { /* keep showing the cached list */ }

  function renderGroupsList() {
    const myId = currentSession?.user?.id;
    const mineFirst = [...sessionGroups].sort((a,b) => {
      // "Mine" = I own it OR I created it (so groups I built for another coach
      // also surface at the top of my list).
      const am = (a.owner_id === myId || a.created_by === myId) ? 0 : 1;
      const bm = (b.owner_id === myId || b.created_by === myId) ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.name||'').localeCompare(b.name||'');
    });
    const list = document.getElementById('groupsList');
    const empty = document.getElementById('groupsEmpty');
    if (!list) return;
    if (mineFirst.length === 0) { list.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    list.innerHTML = mineFirst.map(g => {
      const ids = g.student_ids || [];
      const names = ids.map(id => allStudents.find(s => s.id === id)?.name).filter(Boolean);
      const ownerLabel = g.owner_id === myId ? 'You' : (g.owner_email || 'Unknown');
      // Surface the creator when it isn't the owner so it's clear this group
      // was made on someone else's behalf (e.g. an MS-IC building a group for a coach).
      const creatorLabel = (g.created_by && g.created_by !== g.owner_id)
        ? ' · Made by: ' + escapeHtml(g.created_by === myId ? 'You' : (g.created_by_email || 'Unknown'))
        : '';
      const canEdit = _canEditGroup(g);
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:var(--surface);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(g.name)}</div>
            <div style="font-size:0.74rem;color:var(--text-dim);">${ids.length} student${ids.length===1?'':'s'} · Owner: ${escapeHtml(ownerLabel)}${creatorLabel}${g.description ? ' · ' + escapeHtml(g.description) : ''}</div>
            ${names.length ? `<div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">${escapeHtml(names.slice(0,5).join(', '))}${names.length>5 ? ' +' + (names.length-5) + ' more' : ''}</div>` : ''}
          </div>
          ${canEdit ? `<button data-edit-group="${g.id}" class="btn-ghost" style="padding:6px 12px;font-size:0.75rem;">Edit</button>` : ''}
          ${canEdit ? `<button data-delete-group="${g.id}" class="btn-ghost" style="padding:6px 10px;font-size:0.75rem;color:#f87171;">Delete</button>` : ''}
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-edit-group]').forEach(b => b.addEventListener('click', () => {
      const g = sessionGroups.find(x => String(x.id) === b.dataset.editGroup);
      if (g) { close(); openGroupEditor(g); }
    }));
    list.querySelectorAll('[data-delete-group]').forEach(b => b.addEventListener('click', async () => {
      const g = sessionGroups.find(x => String(x.id) === b.dataset.deleteGroup);
      if (!g) return;
      if (!confirm(`Delete group "${g.name}"? This can't be undone.`)) return;
      try {
        const { error } = await supa.from('mentorship_session_groups').delete().eq('id', g.id);
        if (error) throw error;
        // Refresh the list in place rather than closing-and-reopening.
        await loadSessionGroups();
        renderGroupsList();
      } catch (e) { alert('Delete failed: ' + (e.message || e)); }
    }));
  }
}

async function openGroupEditor(group) {
  if (isPrivilegedViewer && !zoomHosts.length) { try { await loadZoomHosts(); } catch (_) {} }
  document.getElementById('groupEditModal')?.remove();
  const isNew = !group;
  const groupSel = new Set((group?.student_ids || []).map(Number));
  const myId = currentSession.user.id;
  const initialOwnerId = group?.owner_id || myId;
  const ownerPickerHtml = isPrivilegedViewer && zoomHosts.length ? `
    <div><label>Owner (coach)</label>
      <select id="ge-owner">
        ${zoomHosts.map(h => `<option value="${h.id}" ${h.id === initialOwnerId ? 'selected' : ''}>${escapeHtml(_hostLabel(h))}${h.id === myId ? ' (you)' : ''}</option>`).join('')}
      </select>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">As an admin/I-C, you can create or edit groups on a coach's behalf.</div>
    </div>` : '';
  const m = document.createElement('div');
  m.id = 'groupEditModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:580px;">
      <div class="modal-head">
        <h2>${isNew ? 'New' : 'Edit'} group</h2>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        ${ownerPickerHtml}
        <div><label>Group name *</label>
          <input id="ge-name" type="text" placeholder="e.g. Tuesday afternoon cohort" value="${escapeHtml(group?.name || '')}"></div>
        <div><label>Description (optional)</label>
          <input id="ge-desc" type="text" placeholder="e.g. Beginners weekly group" value="${escapeHtml(group?.description || '')}"></div>
        <div><label>Students *</label>
          <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
            <input id="ge-search" type="search" placeholder="Search by name or email…" style="flex:1;">
            <button type="button" id="ge-filters-btn" class="btn-ghost" style="padding:7px 12px;font-size:0.78rem;border-radius:8px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Filters<span id="ge-filters-count" style="display:none;background:var(--accent2);color:#06231a;border-radius:999px;padding:1px 6px;font-size:0.62rem;font-weight:800;">0</span></button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">
            <span id="ge-count">${groupSel.size} selected</span>
            <button type="button" id="ge-clear" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;text-decoration:underline;font-size:0.72rem;padding:0;">Clear all</button>
          </div>
          <div class="sz-students" id="ge-students"></div>
        </div>
        <div id="ge-result-wrap"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="ge-save">${isNew ? 'Create group' : 'Save changes'}</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  const listEl = document.getElementById('ge-students');
  const countEl = document.getElementById('ge-count');
  const searchEl = document.getElementById('ge-search');
  function renderChoices() {
    const q = (searchEl.value || '').trim().toLowerCase();
    let basePool = allStudents;
    if (!isPrivilegedViewer) {
      const mine = _myCoachIdentities();
      basePool = allStudents.filter(s => _isMine(s, mine));
    }
    // Apply advanced filters
    basePool = _applyAdvancedFilters(basePool);
    if (!showExpired) basePool = basePool.filter(s => s.derived_status !== 'Expired');
    const pool = [...basePool].sort((a,b) => {
      const ap = groupSel.has(a.id) ? 0 : 1;
      const bp = groupSel.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.name||'').localeCompare(b.name||'');
    });
    // Update filter count badge
    const fc = document.getElementById('ge-filters-count');
    const fn = _filtersActiveCount();
    if (fc) { fc.textContent = fn; fc.style.display = fn ? '' : 'none'; }
    let rows = pool;
    if (q) rows = rows.filter(s => (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q));
    const selRows = rows.filter(s => groupSel.has(s.id));
    const otherRows = rows.filter(s => !groupSel.has(s.id)).slice(0, 200 - selRows.length);
    const visible = [...selRows, ...otherRows];
    if (!visible.length) { listEl.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;padding:6px;">No matches.</div>'; return; }
    listEl.innerHTML = visible.map(s =>
      `<label><input type="checkbox" data-geid="${s.id}" ${groupSel.has(s.id)?'checked':''}> ${escapeHtml(s.name||'(unnamed)')} <span style="color:var(--text-dim);">${escapeHtml(s.email||'no email')}</span></label>`
    ).join('');
    if (rows.length > visible.length) listEl.innerHTML += `<div style="color:var(--text-dim);font-size:0.72rem;padding:6px;">+ ${rows.length - visible.length} more — refine search.</div>`;
    listEl.querySelectorAll('input[data-geid]').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(cb.dataset.geid, 10);
        if (e.target.checked) groupSel.add(id); else groupSel.delete(id);
        countEl.textContent = groupSel.size + ' selected';
      });
    });
  }
  renderChoices();
  searchEl.addEventListener('input', renderChoices);
  document.getElementById('ge-clear').addEventListener('click', () => { groupSel.clear(); countEl.textContent = '0 selected'; renderChoices(); });
  const geFiltersBtn = document.getElementById('ge-filters-btn');
  if (geFiltersBtn) geFiltersBtn.addEventListener('click', () => openFiltersModal(renderChoices));

  document.getElementById('ge-save').addEventListener('click', async () => {
    const name = document.getElementById('ge-name').value.trim();
    const description = document.getElementById('ge-desc').value.trim() || null;
    const ids = [...groupSel];
    const ownerSel = document.getElementById('ge-owner');
    const pickedOwnerId = ownerSel ? ownerSel.value : myId;
    const wrap = document.getElementById('ge-result-wrap');
    if (!name) { wrap.innerHTML = '<div class="sz-result err">Name is required.</div>'; return; }
    if (!ids.length) { wrap.innerHTML = '<div class="sz-result err">Pick at least one student.</div>'; return; }
    try {
      const payload = { name, description, student_ids: ids };
      if (isNew) {
        payload.owner_id   = pickedOwnerId;
        // Always stamp the actual creator so they keep access even when they
        // assign ownership to a different coach.
        payload.created_by = myId;
        const { error } = await supa.from('mentorship_session_groups').insert(payload);
        if (error) throw error;
      } else {
        if (isPrivilegedViewer && pickedOwnerId !== group.owner_id) payload.owner_id = pickedOwnerId;
        const { error } = await supa.from('mentorship_session_groups').update(payload).eq('id', group.id);
        if (error) throw error;
      }
      wrap.innerHTML = '<div class="sz-result">✓ Saved.</div>';
      await loadSessionGroups();
      setTimeout(() => { close(); openGroupsModal(); }, 600);
    } catch (e) { wrap.innerHTML = `<div class="sz-result err">Failed: ${escapeHtml(e.message || String(e))}</div>`; }
  });
}

document.getElementById('manageGroupsBtn').addEventListener('click', openGroupsModal);

// Pre-load groups + hosts in background so modals render instantly.
// Kicked off without delay so a quick click on Schedule Zoom doesn't
// race past these and miss the Host-as picker / Group dropdown.
loadSessionGroups();
loadZoomHosts();

// ── Advanced filters modal ─────────────────────────────────────
function _uniqueValuesFor(field) {
  const set = new Set();
  for (const s of allStudents) {
    const v = s[field];
    if (v && String(v).trim()) set.add(String(v).trim());
  }
  return [...set].sort();
}
function openFiltersModal(onApply) {
  document.getElementById('filtersModal')?.remove();
  const m = document.createElement('div');
  m.id = 'filtersModal'; m.className = 'modal-bg';
  const levels = _uniqueValuesFor('level');
  const masterclass = _uniqueValuesFor('masterclass_level');
  const coachStatuses = ['All good', 'Needs attention'];
  // Every possible derived_status value the lifecycle computer can produce,
  // ordered by triage urgency. Expired + Refunded are intentionally NOT here
  // because they're surfaced via dedicated chip-bar toggles ('+ Show expired'
  // / '+ Show refunded') alongside the main filter chips.
  const statuses = [
    'Inactive',
    'Expiring soon',
    'Active',
    'Paused',
    'Not onboarded',
    'Delayed start',
    'Graduated',
    'Cancelled',
  ];
  const mkChips = (key, options) => options.map(opt => {
    const checked = filters[key].has(opt);
    return `<button type="button" data-fkey="${key}" data-fval="${escapeHtml(opt)}" class="filter-chip ${checked?'on':''}">${escapeHtml(opt || '(blank)')}</button>`;
  }).join('');
  m.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-head">
        <h2>Filters</h2>
        <button type="button" class="btn-ghost" id="filterReset" style="padding:6px 12px;font-size:0.78rem;">Reset all</button>
        <button class="close" data-x>×</button>
      </div>
      <div class="modal-body" style="grid-template-columns:1fr;">
        <div><label>Level</label><div class="filter-chips">${mkChips('level', levels) || '<span style="color:var(--text-dim);font-size:0.78rem;">No data.</span>'}</div></div>
        <div><label>Masterclass level</label><div class="filter-chips">${mkChips('masterclass_level', masterclass) || '<span style="color:var(--text-dim);font-size:0.78rem;">No data.</span>'}</div></div>
        <div><label>Coach status</label><div class="filter-chips">${mkChips('coach_status', coachStatuses)}</div></div>
        <div><label>Lifecycle status</label><div class="filter-chips">${mkChips('status', statuses)}<span style="font-size:0.72rem;color:var(--text-dim);margin-left:8px;">(Expired toggled separately on the chip bar)</span></div></div>
        <div><label>Last activity (zoom or assignment)</label>
          <select id="filt-zoom"><option value="">Any</option><option value="never" ${filters.zoom_bucket==='never'?'selected':''}>Never had any activity</option><option value="7" ${filters.zoom_bucket==='7'?'selected':''}>More than 7 days ago</option><option value="30" ${filters.zoom_bucket==='30'?'selected':''}>More than 30 days ago</option><option value="90" ${filters.zoom_bucket==='90'?'selected':''}>More than 90 days ago</option></select>
        </div>
        <div><label>Last assignment sent</label>
          <select id="filt-asgsent"><option value="">Any</option><option value="never" ${filters.asg_sent_bucket==='never'?'selected':''}>Never sent</option><option value="7" ${filters.asg_sent_bucket==='7'?'selected':''}>More than 7 days ago</option><option value="30" ${filters.asg_sent_bucket==='30'?'selected':''}>More than 30 days ago</option></select>
        </div>
        <div><label>Last assignment received</label>
          <select id="filt-asgrecv"><option value="">Any</option><option value="never" ${filters.asg_recv_bucket==='never'?'selected':''}>Never received</option><option value="7" ${filters.asg_recv_bucket==='7'?'selected':''}>More than 7 days ago</option><option value="30" ${filters.asg_recv_bucket==='30'?'selected':''}>More than 30 days ago</option></select>
        </div>
        <div><label>Has email</label>
          <select id="filt-email"><option value="">Any</option><option value="yes" ${filters.has_email==='yes'?'selected':''}>Has email</option><option value="no" ${filters.has_email==='no'?'selected':''}>No email</option></select>
        </div>
        <div><label>Has a turnover</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select id="filt-turnover" style="min-width:160px;">
              <option value="">Any</option>
              <option value="ever"  ${filters.turnover_mode==='ever' ?'selected':''}>Ever (any turnover)</option>
              <option value="range" ${filters.turnover_mode==='range'?'selected':''}>In date range…</option>
            </select>
            <span id="filt-turnover-range" style="display:${filters.turnover_mode==='range'?'inline-flex':'none'};gap:6px;align-items:center;">
              <input type="date" id="filt-turnover-from" value="${escapeHtml(filters.turnover_from || '')}" style="padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.82rem;">
              <span style="color:var(--text-dim);font-size:0.78rem;">to</span>
              <input type="date" id="filt-turnover-to"   value="${escapeHtml(filters.turnover_to   || '')}" style="padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.82rem;">
            </span>
          </div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">Shows only students with at least one turnover (optionally within the date range).</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Close</button>
        <button class="btn-primary" id="filterApply">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  // Multi-select chips
  m.querySelectorAll('[data-fkey]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.fkey, v = btn.dataset.fval;
      if (filters[k].has(v)) filters[k].delete(v); else filters[k].add(v);
      btn.classList.toggle('on');
    });
  });
  document.getElementById('filterReset').addEventListener('click', () => {
    filters.level.clear(); filters.coach_status.clear();
    filters.masterclass_level.clear(); filters.status.clear();
    filters.zoom_bucket = ''; filters.asg_sent_bucket = ''; filters.asg_recv_bucket = ''; filters.has_email = '';
    filters.turnover_mode = ''; filters.turnover_from = ''; filters.turnover_to = '';
    close(); renderAll();
    if (typeof onApply === 'function') onApply();
  });
  // Show/hide the turnover date-range inputs based on the mode dropdown.
  m.querySelector('#filt-turnover')?.addEventListener('change', (e) => {
    const span = document.getElementById('filt-turnover-range');
    if (span) span.style.display = (e.target.value === 'range') ? 'inline-flex' : 'none';
  });
  document.getElementById('filterApply').addEventListener('click', () => {
    filters.zoom_bucket = document.getElementById('filt-zoom').value;
    filters.asg_sent_bucket = document.getElementById('filt-asgsent').value;
    filters.asg_recv_bucket = document.getElementById('filt-asgrecv').value;
    filters.has_email = document.getElementById('filt-email').value;
    filters.turnover_mode = document.getElementById('filt-turnover').value;
    filters.turnover_from = (document.getElementById('filt-turnover-from')?.value || '').trim();
    filters.turnover_to   = (document.getElementById('filt-turnover-to')?.value   || '').trim();
    close(); renderAll();
    if (typeof onApply === 'function') onApply();
  });
}

initAuth();
