const SUPABASE_URL      = "https://pojqljrhhtnigyrtzdzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
const STUDENTS_BASE = SUPABASE_URL + '/functions/v1/students';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });

// ── Icon vocabulary (Lucide-stroke style, matches dashboard nav-menu icons) ──
function _svg(inner, size = 14) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">${inner}</svg>`;
}
const ICONS = {
  zoom:    (s=14)=>_svg('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>', s),
  bell:    (s=14)=>_svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', s),
  clipboard:(s=14)=>_svg('<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', s),
  film:    (s=14)=>_svg('<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>', s),
  fileText:(s=14)=>_svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', s),
  award:   (s=14)=>_svg('<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>', s),
  refresh: (s=14)=>_svg('<polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>', s),
  target:  (s=14)=>_svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', s),
  users:   (s=14)=>_svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', s),
  user:    (s=14)=>_svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', s),
  pulse:   (s=14)=>_svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', s),
  music:   (s=14)=>_svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', s),
  search:  (s=14)=>_svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s),
  barChart:(s=14)=>_svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', s),
  folder:  (s=14)=>_svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', s),
  calendar:(s=14)=>_svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', s),
  alertTri:(s=14)=>_svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', s),
  trash:   (s=14)=>_svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', s),
  edit:    (s=14)=>_svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', s),
  plus:    (s=14)=>_svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s),
  link:    (s=14)=>_svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', s),
  briefcase:(s=14)=>_svg('<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', s),
  check:   (s=14)=>_svg('<polyline points="20 6 9 17 4 12"/>', s),
  x:       (s=14)=>_svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),
};

function setState(s) { document.body.dataset.state = s; }
let currentSession = null;
let students = [];
let currentStudent = null;     // full row when one is selected
let mentors = [];
let coaches = [];
// MS rep only: read-only on the CRM except for resigns + alerts.
let isMsRepOnly = false;
// True when the signed-in user can VIEW the MS dashboard but should NOT be
// allowed to edit the profile sections (IDENTITY, ONBOARDING, PAUSES, COACH,
// ACTIVITY HISTORY, RESOURCES, ADMIN). Resigns + Alerts stay editable
// because they're the rep's primary workflow. Editors are: admin, coach,
// ms_ic, delivery_ic. Everyone else with board access (mentorship,
// sales_manager, ms_rep, etc.) is locked.
let isProfileReadOnly = false;
const STATUSES = ['Active', 'Paused', 'Graduated', 'Cancelled', 'Lead'];

// ── Theme (handled by theme.js but we keep the button working) ──
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') document.body.classList.add('light');
function syncThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌙' : '☀️';
}
syncThemeBtn();

// ── Auth ───────────────────────────────────────────────────────
async function initAuth() {
  const _safety = setTimeout(() => {
    if (document.body.dataset.state === 'loading') setState('login');
  }, 8000);
  try {
    const { data: { session }, error } = await supa.auth.getSession();
    clearTimeout(_safety);
    if (error) throw error;
    if (session) { await onAuthed(session); return; }
    setState('login');
  } catch(e) {
    clearTimeout(_safety);
    console.error('Auth init error:', e);
    setState('login');
  }
  supa.auth.onAuthStateChange(async (_e, sess) => {
    if (sess) await onAuthed(sess); else setState('login');
  });
}

async function onAuthed(session) {
  currentSession = session;
  const email = session.user.email || '';
  document.getElementById('userEmail').textContent = email;
  document.getElementById('userAvatar').textContent = (email[0] || 'U').toUpperCase();
  if (!window.RidleyPerms.canOpen('students.html', session.user)) {
    setState('denied'); return;
  }
  setState('dashboard');
  // Compute capability flags from EFFECTIVE perms — this honors "View as"
  // impersonation so an admin viewing as a non-editor gets the same lockdown
  // that user would see. Server-side enforcement (students fn v54+) still
  // blocks writes regardless, so this is purely a UI-mirror concern.
  const eff = window.RidleyPerms.effective(session.user);
  const isAdmin = eff.is_admin === true;
  const ps = Array.isArray(eff.permissions) ? eff.permissions : [];
  const isCoachOnly = !isAdmin && ps.includes('coach') && !ps.includes('mentorship') && !ps.includes('sales_manager');
  isMsRepOnly = !isAdmin && ps.includes('ms_rep')
    && !ps.includes('mentorship') && !ps.includes('sales_manager')
    && !ps.includes('coach') && !ps.includes('ms_ic') && !ps.includes('delivery_ic');
  // Only true editors can write the base profile. Primary gate is the
  // GRANULAR `students.edit` (admin always wins).
  //
  // Legacy fallback covers users whose JWT predates the permissions_v2
  // backfill: any of `coach` / `ms_ic` / `delivery_ic` in legacy
  // `permissions` gets edit rights — UNLESS the user also carries `rep`
  // or `ms_rep`, which vetoes the fallback. That veto is what keeps
  // chicca-style users (legacy `coach` derived from `coach.view` via
  // the ms_rep bundle) out of edit mode while still letting real
  // coaches edit immediately without having to re-sign-in.
  const v2 = Array.isArray(eff.permissions_v2) ? eff.permissions_v2 : [];
  const isRep = ps.includes('rep') || ps.includes('ms_rep');
  const canEditProfile = isAdmin
    || v2.includes('students.edit')
    || (!isRep && (ps.includes('coach') || ps.includes('ms_ic') || ps.includes('delivery_ic')));
  isProfileReadOnly = !canEditProfile;
  // Default-to-mine for both Coach and MS-Rep roles. Mentorship I/C and
  // Delivery I/C don't trigger the auto-filter — they see everyone by default.
  // _isMine matches the user against either coach OR rep on the student row.
  const isOwnerView = (isCoachOnly || isMsRepOnly)
    && !ps.includes('mentorship') && !ps.includes('ms_ic') && !ps.includes('delivery_ic');
  if (isOwnerView) {
    listFilter = 'mine';
    document.querySelectorAll('#listFilterBar [data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === 'mine'));
  }
  // Hide the New Student button for anyone who can't edit the profile —
  // there's no point letting them open an empty form they can't save.
  if (isProfileReadOnly) {
    const addBtn = document.getElementById('addStudentBtn'); if (addBtn) addBtn.style.display = 'none';
  }

  // Render from cache instantly so the page feels immediate.
  const cache = _readStudentsCache();
  if (cache && cache.user_id === session.user.id) {
    students = cache.rows;
    renderStudentList();
  }
  // mentors + coaches in parallel (small payloads), then await loadStudents
  // so any URL-hash openStudent below has the full list available.
  loadMentors();
  loadCoaches();
  await loadStudents();
  // URL params honored on first load:
  //   ?student=N&openAlert=K     open student then jump to a specific alert
  //   ?student=N&openAlerts=1    open student then open the alerts history modal
  //                              (used by the coach board's Alerts quick-jump button)
  //   ?student=N&openTurnover=K  open student then open the turnover history modal
  //                              (used by turnover notification bell deep-link)
  try {
    const u = new URL(window.location.href);
    const sid = parseInt(u.searchParams.get('student') || '0', 10);
    const aid = parseInt(u.searchParams.get('openAlert') || '0', 10);
    const tid = parseInt(u.searchParams.get('openTurnover') || '0', 10);
    const openAllAlerts = u.searchParams.get('openAlerts') === '1';
    if (sid) {
      await openStudent(sid);
      if (aid || openAllAlerts) setTimeout(() => { try { openAlertsHistoryModal(); } catch (_) {} }, 80);
      if (tid) setTimeout(() => { try { openTurnoversHistoryModal(); } catch (_) {} }, 80);
      history.replaceState({}, '', window.location.pathname);
    }
  } catch (_) {}
}

// Public hooks so notifications.js can jump in without a full reload.
window.openAlertById = async function(studentId, alertId) {
  if (!studentId) return;
  await openStudent(studentId);
  setTimeout(() => { try { openAlertsHistoryModal(); } catch (_) {} }, 80);
};
window.openTurnoverById = async function(studentId, turnoverId) {
  if (!studentId) return;
  await openStudent(studentId);
  setTimeout(() => { try { openTurnoversHistoryModal(); } catch (_) {} }, 80);
};

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const err = document.getElementById('loginError');
  const btn = document.getElementById('sendBtn');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
    onAuthed(data.session);
  } catch(e) { err.textContent = e.message || 'Invalid credentials'; }
  finally { btn.disabled = false; btn.textContent = 'Sign In'; }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  if (profileDirty) {
    const choice = await confirmLeaveUnsaved();
    if (choice === 'cancel') return;
    if (choice === 'save') { const ok = await saveStudent(); if (!ok) return; }
  }
  profileDirty = false;
  await supa.auth.signOut(); setState('login');
});
document.getElementById('deniedSignOutBtn').addEventListener('click', async () => {
  await supa.auth.signOut(); setState('login');
});
// Mobile-only: back button returns from profile → list
document.getElementById('crmBackBtn').addEventListener('click', async () => {
  // Honor unsaved-changes prompt
  if (profileDirty) {
    const choice = await confirmLeaveUnsaved();
    if (choice === 'cancel') return;
    if (choice === 'save') { const ok = await saveStudent(); if (!ok) return; }
    profileDirty = false;
  }
  document.body.removeAttribute('data-crm-view');
  _swapActiveRow(null);
  currentStudent = null;
  _openStudentLatestId = null;
});

// ── Data ───────────────────────────────────────────────────────
// Stale-while-revalidate cache: render from localStorage instantly on warm
// reloads, then fetch fresh in the background and re-render if changed.
const STUDENTS_CACHE_KEY = 'crm_students_v2';
// Per-student detail cache: keyed by student id, ttl 1 hour. Used so opening
// a student we've seen before is instant; a background refresh still hits
// /api=get and updates the panel when the response lands.
const STUDENT_DETAILS_KEY = 'crm_student_details_v1';
const STUDENT_DETAILS_TTL = 60 * 60 * 1000;
function _readStudentDetailsCache(id) {
  try {
    const raw = localStorage.getItem(STUDENT_DETAILS_KEY); if (!raw) return null;
    const all = JSON.parse(raw); if (!all || typeof all !== 'object') return null;
    const e = all[String(id)]; if (!e || !e.ts || (Date.now() - e.ts) > STUDENT_DETAILS_TTL) return null;
    if (currentSession?.user?.id && e.user_id && e.user_id !== currentSession.user.id) return null;
    return e.data || null;
  } catch { return null; }
}
function _writeStudentDetailsCache(id, data) {
  try {
    const raw = localStorage.getItem(STUDENT_DETAILS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[String(id)] = { ts: Date.now(), user_id: currentSession?.user?.id || null, data };
    // Keep only the 30 most-recently-cached students to stay within ~5MB quota
    const ids = Object.keys(all);
    if (ids.length > 30) {
      ids.sort((a, b) => (all[a]?.ts || 0) - (all[b]?.ts || 0));
      while (ids.length > 30) { delete all[ids.shift()]; }
    }
    localStorage.setItem(STUDENT_DETAILS_KEY, JSON.stringify(all));
  } catch (_) { /* quota errors silently ignored */ }
}
function _bustStudentDetailsCache(id) {
  try {
    const raw = localStorage.getItem(STUDENT_DETAILS_KEY); if (!raw) return;
    const all = JSON.parse(raw); if (all && typeof all === 'object') {
      delete all[String(id)];
      localStorage.setItem(STUDENT_DETAILS_KEY, JSON.stringify(all));
    }
  } catch (_) {}
}
function _readStudentsCache() {
  try {
    const raw = localStorage.getItem(STUDENTS_CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.rows) || !j.user_id) return null;
    if (currentSession?.user?.id && j.user_id !== currentSession.user.id) return null;
    return j;
  } catch { return null; }
}
function _writeStudentsCache(rows) {
  try { localStorage.setItem(STUDENTS_CACHE_KEY, JSON.stringify({ rows, user_id: currentSession?.user?.id || null, ts: Date.now() })); }
  catch (_) {}
}
async function loadStudents() {
  const list = document.getElementById('studentList');

  // 1. Render from cache instantly (stays valid for 1 hour)
  const cache = _readStudentsCache();
  if (cache && (Date.now() - cache.ts) < 3600_000) {
    students = cache.rows;
    renderStudentList();
  } else if (!students.length) {
    list.innerHTML = '<div class="student-list-empty">Loading…</div>';
  }

  // 2. Always fetch fresh in the background
  try {
    const r = await fetch(STUDENTS_BASE + '?api=list', { headers: { Authorization: 'Bearer ' + currentSession.access_token } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    const rows = j.rows || [];
    const sigPrev = students.length + ':' + (students[0]?.id || '') + ':' + (students[students.length-1]?.id || '');
    const sigNew = rows.length + ':' + (rows[0]?.id || '') + ':' + (rows[rows.length-1]?.id || '');
    students = rows;
    _writeStudentsCache(rows);
    if (sigPrev !== sigNew || !cache) renderStudentList();
  } catch (e) {
    if (!students.length) {
      list.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'student-list-empty';
      div.style.color = 'var(--red)';
      div.textContent = e.message || 'Failed to load';
      list.appendChild(div);
    }
    console.warn('loadStudents background fetch failed', e);
  }
}

async function loadMentors() {
  try {
    const r = await fetch(STUDENTS_BASE + '?api=mentors', { headers: { Authorization: 'Bearer ' + currentSession.access_token } });
    const j = await r.json();
    if (r.ok) mentors = j.mentors || [];
  } catch (_) { /* non-fatal */ }
}
async function loadCoaches() {
  try {
    const r = await fetch(STUDENTS_BASE + '?api=coaches', { headers: { Authorization: 'Bearer ' + currentSession.access_token } });
    const j = await r.json();
    if (r.ok) {
      // Show first_name when present, otherwise email; both are valid coach identifiers.
      coaches = (j.coaches || []).map(c => c.first_name || c.email).filter(Boolean);
    }
  } catch (_) { /* non-fatal */ }
}

// ── Filter state ─────────────────────────────────────────────
let listFilter   = 'all';            // 'all' | 'mine' | 'stale' | 'duplicates'
let overviewMode = false;
const STALE_DAYS = 30;

// Advanced filter state. Multi-value fields are arrays; tri-state booleans
// use null = any, true = yes, false = no.
const advFilters = {
  coach:           [],
  mentor:          [],
  product:         [],
  derived_status:  [],
  level:           [],
  masterclass_level:[],
  coach_status:    [],
  months_count:    [],
  verified:        null,
  has_open_alerts: null,
  has_wins:        null,
  has_video:       null,
  has_survey:      null,
  has_gdrive:      null,
  // Buckets (multi-select) for the days-left/since-activity fields.
  days_left_bucket:        [],   // 'expired' | 'urgent' | 'soon' | 'active'
  inactive_days_bucket:    [],   // 'never' | '60+' | '30-60' | '0-30'
};

function _advFilterCount() {
  let n = 0;
  for (const k of Object.keys(advFilters)) {
    const v = advFilters[k];
    if (Array.isArray(v)) n += v.length;
    else if (v !== null && v !== undefined) n += 1;
  }
  return n;
}
function _clearAdvFilters() {
  for (const k of Object.keys(advFilters)) {
    advFilters[k] = Array.isArray(advFilters[k]) ? [] : null;
  }
}
function _toggleArrayFilter(key, value) {
  const arr = advFilters[key];
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1); else arr.push(value);
}
function _setTriFilter(key, value) {
  // Cycle through null → true → false → null when same button is clicked,
  // but here we just set explicitly from the button's data-val attr.
  if (advFilters[key] === value) advFilters[key] = null; // toggle off
  else advFilters[key] = value;
}

// Buckets for days_left
function _daysLeftBucket(s) {
  if (s.derived_status === 'Paused') return 'paused';
  if (s.derived_status === 'Delayed start') return 'delayed';
  if (s.days_left == null) return 'unknown';
  if (s.days_left < 0)  return 'expired';
  if (s.days_left <= 7) return 'urgent';   // ≤ 1 week
  if (s.days_left <= 30) return 'soon';    // ≤ 30 days
  return 'active';
}
function _daysSinceActivity(s) {
  const d = s.last_activity_date;
  if (!d) return null;
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return diff;
}
function _inactiveBucket(s) {
  const d = _daysSinceActivity(s);
  if (d == null) return 'never';
  if (d > 60) return '60+';
  if (d > 30) return '30-60';
  return '0-30';
}

function _applyAdvFilters(rows) {
  function matchArr(field, val) {
    const f = advFilters[field];
    if (!f.length) return true;
    return f.includes(val == null ? '' : String(val));
  }
  function matchTri(field, value) {
    const f = advFilters[field];
    if (f === null) return true;
    return !!value === f;
  }
  return rows.filter(s => {
    if (!matchArr('coach',          s.coach || '(unassigned)')) return false;
    if (!matchArr('mentor',         s.mentor || '(unassigned)')) return false;
    if (!matchArr('product',        s.product || '(none)')) return false;
    if (!matchArr('derived_status', s.derived_status || s.status || '(none)')) return false;
    if (!matchArr('level',          s.level || '(none)')) return false;
    if (!matchArr('masterclass_level', s.masterclass_level || '(none)')) return false;
    if (!matchArr('coach_status',   s.coach_status || '(none)')) return false;
    if (!matchArr('months_count',   String(s.months_count ?? 12))) return false;
    if (!matchTri('verified',        !!s.verified)) return false;
    if (!matchTri('has_open_alerts', (s.open_alerts_count || 0) > 0)) return false;
    if (!matchTri('has_wins',        (s.wins_count || 0) > 0)) return false;
    if (!matchTri('has_video',       !!(s.video_url || s.video_submitted_date))) return false;
    if (!matchTri('has_survey',      (s.surveys_count || 0) > 0 || !!s.survey_url || !!s.survey_submitted_date)) return false;
    if (!matchTri('has_gdrive',      !!s.gdrive_url)) return false;
    if (advFilters.days_left_bucket.length && !advFilters.days_left_bucket.includes(_daysLeftBucket(s))) return false;
    if (advFilters.inactive_days_bucket.length && !advFilters.inactive_days_bucket.includes(_inactiveBucket(s))) return false;
    return true;
  });
}

function _uniqueValues(field, fallback = '(none)') {
  const set = new Set();
  for (const s of students) {
    const v = s[field];
    set.add(v == null || v === '' ? fallback : String(v));
  }
  return [...set].sort((a, b) => {
    // Push fallback to the end
    if (a === fallback) return 1; if (b === fallback) return -1;
    return a.localeCompare(b);
  });
}

function renderAdvFilterPanel() {
  const panel = document.getElementById('advFilterPanel');
  if (!panel) return;

  const sectionMulti = (key, label, values, fallback = '(none)') => {
    const opts = values.map(v => {
      const active = advFilters[key].includes(v) ? ' active' : '';
      return `<button class="adv-filter-opt${active}" data-multi="${key}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
    }).join('');
    return `<div class="adv-filter-section">
      <div class="adv-filter-label">${label}</div>
      <div class="adv-filter-options">${opts || '<span style="color:var(--text-dim);font-size:0.7rem;">No values yet</span>'}</div>
    </div>`;
  };
  const sectionTri = (key, label) => {
    const cur = advFilters[key];
    return `<div class="adv-filter-section">
      <div class="adv-filter-label">${label}</div>
      <div class="adv-filter-options">
        <button class="adv-filter-opt${cur === true  ? ' active' : ''}" data-tri="${key}" data-val="true">Yes</button>
        <button class="adv-filter-opt${cur === false ? ' active' : ''}" data-tri="${key}" data-val="false">No</button>
      </div>
    </div>`;
  };
  const sectionBucket = (key, label, buckets) => {
    const opts = buckets.map(b => {
      const active = advFilters[key].includes(b.val) ? ' active' : '';
      return `<button class="adv-filter-opt${active}" data-multi="${key}" data-val="${escapeHtml(b.val)}">${escapeHtml(b.label)}</button>`;
    }).join('');
    return `<div class="adv-filter-section">
      <div class="adv-filter-label">${label}</div>
      <div class="adv-filter-options">${opts}</div>
    </div>`;
  };

  panel.innerHTML = `
    <div class="adv-filter-grid">
      ${sectionMulti('coach', ICONS.user() + ' Coach', _uniqueValues('coach', '(unassigned)'))}
      ${sectionMulti('mentor', ICONS.target() + ' Rep / Mentor', _uniqueValues('mentor', '(unassigned)'))}
    </div>
    ${sectionMulti('product', '📦 Product', _uniqueValues('product', '(none)'))}
    ${sectionMulti('derived_status', '🚦 Lifecycle status', _uniqueValues('derived_status', '(none)'))}
    ${sectionBucket('days_left_bucket', '⏱ Time until end', [
      { val: 'expired', label: 'Expired' },
      { val: 'urgent', label: '≤ 7 days' },
      { val: 'soon', label: '≤ 30 days' },
      { val: 'active', label: '> 30 days' },
      { val: 'paused', label: 'Paused' },
      { val: 'delayed', label: 'Delayed start' },
      { val: 'unknown', label: 'Not onboarded' },
    ])}
    ${sectionBucket('inactive_days_bucket', ICONS.calendar() + ' Days since last activity', [
      { val: '0-30', label: '≤ 30d' },
      { val: '30-60', label: '30–60d' },
      { val: '60+', label: '60d+' },
      { val: 'never', label: 'No activity ever' },
    ])}
    <div class="adv-filter-grid">
      ${sectionMulti('coach_status', ICONS.pulse() + ' Coach status', _uniqueValues('coach_status', '(none)'))}
      ${sectionMulti('level', '🎚 Level', _uniqueValues('level', '(none)'))}
    </div>
    <div class="adv-filter-grid">
      ${sectionMulti('masterclass_level', ICONS.music() + ' Masterclass level', _uniqueValues('masterclass_level', '(none)'))}
    </div>
    ${sectionMulti('months_count', '📆 Term length (months)', _uniqueValues('months_count', '12'))}
    <div class="adv-filter-grid">
      ${sectionTri('verified', '✓ Verified')}
      ${sectionTri('has_open_alerts', ICONS.alertTri() + ' Has open alerts')}
    </div>
    <div class="adv-filter-grid">
      ${sectionTri('has_wins', '★ Has wins')}
      ${sectionTri('has_video', ICONS.film() + ' Has video')}
    </div>
    <div class="adv-filter-grid">
      ${sectionTri('has_survey', ICONS.fileText() + ' Has survey')}
      ${sectionTri('has_gdrive', ICONS.folder() + ' Has Google Drive')}
    </div>
    <div class="adv-filter-actions">
      <span style="font-size:0.7rem;color:var(--text-dim);">${_advFilterCount()} filter${_advFilterCount()===1?'':'s'} applied</span>
      <button class="adv-filter-clearall" id="advFilterClearAll">Clear all</button>
    </div>`;

  panel.querySelectorAll('[data-multi]').forEach(btn => {
    btn.addEventListener('click', () => {
      _toggleArrayFilter(btn.dataset.multi, btn.dataset.val);
      _onAdvFiltersChanged();
    });
  });
  panel.querySelectorAll('[data-tri]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.val === 'true';
      _setTriFilter(btn.dataset.tri, v);
      _onAdvFiltersChanged();
    });
  });
  document.getElementById('advFilterClearAll')?.addEventListener('click', () => {
    _clearAdvFilters();
    _onAdvFiltersChanged();
  });
}

function _activeFilterChipLabel(key, val) {
  const labelMap = {
    coach: 'Coach', mentor: 'Rep', product: 'Product',
    derived_status: 'Status', level: 'Level',
    masterclass_level: 'Masterclass',
    coach_status: 'Coach status', months_count: 'Term',
    days_left_bucket: 'Time left', inactive_days_bucket: 'Inactive',
    verified: 'Verified', has_open_alerts: 'Alerts',
    has_wins: 'Wins', has_video: 'Video', has_survey: 'Survey', has_gdrive: 'Drive',
  };
  const bucketLabels = {
    expired: 'Expired', urgent: '≤ 7 days', soon: '≤ 30 days',
    active: '> 30 days', paused: 'Paused', delayed: 'Delayed', unknown: 'Not onboarded',
    'never': 'No activity', '60+': '60d+', '30-60': '30–60d', '0-30': '≤ 30d',
  };
  if (val === true || val === 'true') return `${labelMap[key]}: Yes`;
  if (val === false || val === 'false') return `${labelMap[key]}: No`;
  const display = bucketLabels[val] || val;
  return `${labelMap[key]}: ${display}`;
}

function renderActiveFiltersBar() {
  const bar = document.getElementById('activeFiltersBar');
  if (!bar) return;
  const chips = [];
  for (const key of Object.keys(advFilters)) {
    const v = advFilters[key];
    if (Array.isArray(v)) {
      for (const val of v) {
        chips.push(`<span class="active-filter-chip">${escapeHtml(_activeFilterChipLabel(key, val))} <button class="x" data-rm-multi="${key}" data-val="${escapeHtml(val)}" title="Remove">×</button></span>`);
      }
    } else if (v !== null && v !== undefined) {
      chips.push(`<span class="active-filter-chip">${escapeHtml(_activeFilterChipLabel(key, v))} <button class="x" data-rm-tri="${key}" title="Remove">×</button></span>`);
    }
  }
  if (!chips.length) {
    bar.classList.remove('has-active');
    bar.innerHTML = '';
    return;
  }
  bar.classList.add('has-active');
  bar.innerHTML = chips.join('') + ` <button class="adv-filter-clearall" style="margin-left:auto;" id="advFilterClearInline">Clear all</button>`;
  bar.querySelectorAll('[data-rm-multi]').forEach(b => b.addEventListener('click', () => {
    _toggleArrayFilter(b.dataset.rmMulti, b.dataset.val);
    _onAdvFiltersChanged();
  }));
  bar.querySelectorAll('[data-rm-tri]').forEach(b => b.addEventListener('click', () => {
    advFilters[b.dataset.rmTri] = null;
    _onAdvFiltersChanged();
  }));
  document.getElementById('advFilterClearInline')?.addEventListener('click', () => {
    _clearAdvFilters();
    _onAdvFiltersChanged();
  });
}

function _onAdvFiltersChanged() {
  // Update count badge on the toggle button
  const cnt = _advFilterCount();
  const badge = document.getElementById('cnt-active-filters');
  if (badge) {
    if (cnt > 0) { badge.style.display = ''; badge.textContent = String(cnt); }
    else badge.style.display = 'none';
  }
  // Re-render panel (keeps active states fresh) only if open
  if (document.getElementById('advFilterPanel')?.classList.contains('open')) {
    renderAdvFilterPanel();
  }
  renderActiveFiltersBar();
  renderStudentList();
}

function _myCoachIdentities() {
  // Honor impersonation: when an admin "Views as" madison, we want to filter
  // by HER identity, not the real admin's. RidleyPerms.effective() returns the
  // impersonated email when active, otherwise falls through to the real user.
  const eff = window.RidleyPerms?.effective(currentSession?.user);
  const em = (eff?.email || currentSession?.user?.email || '').toLowerCase().trim();
  // first_name is only on the real user_metadata, not in the impersonate
  // payload. Skip it when impersonating — the email local part covers it.
  const fn = (eff?.impersonated ? '' : (currentSession?.user?.user_metadata?.first_name || '')).toLowerCase().trim();
  const out = new Set();
  if (fn) out.add(fn);
  if (em) out.add(em);
  // Also try the email's local part (e.g. "madison@ridleyacademy.team" →
  // "madison"). Student rows usually store the coach as a first-name string
  // like "Madison", so this is what actually drives the match.
  if (em.includes('@')) {
    const local = em.split('@')[0].split(/[+._]/)[0];
    if (local) out.add(local);
  }
  return out;
}
function _isMine(s, mineSet) {
  // "Mine" matches the current user as the student's coach OR rep. Covers
  // coaches (default-filtered to coach match), MS reps (default-filtered to
  // rep match), and users who hold both roles. Mentorship I/C and Delivery
  // I/C never auto-filter — they see everyone by default.
  const c = (s.coach || '').toLowerCase().trim();
  const r = (s.rep   || '').toLowerCase().trim();
  if (c && mineSet.has(c)) return true;
  if (r && mineSet.has(r)) return true;
  return false;
}
function _staleDaysSince(s) {
  // Returns ∞ if no last_assignment_received; else days since then.
  if (!s.last_assignment_received) return Infinity;
  const d = new Date(String(s.last_assignment_received).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!Number.isFinite(d)) return Infinity;
  return Math.floor((Date.now() - d) / 86400000);
}
function _isStale(s) {
  // "Stale" = student is onboarded (lifecycle has started) but no recent
  // assignment received. New + not-onboarded students are NOT stale.
  if (!s.student_onboarded_date) return false;
  if (s.derived_status === 'Expired' || s.derived_status === 'Paused') return false;
  return _staleDaysSince(s) > STALE_DAYS;
}
function _computeDuplicateIds(allStudents) {
  const byEmail = new Map();
  const byName  = new Map();
  for (const s of allStudents) {
    const e = (s.email || '').toLowerCase().trim();
    const n = (s.name  || '').toLowerCase().trim();
    if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(s.id); }
    if (n) { if (!byName.has(n))  byName.set(n,  []); byName.get(n).push(s.id);  }
  }
  const dups = new Set();
  for (const ids of byEmail.values()) if (ids.length > 1) ids.forEach(id => dups.add(id));
  for (const ids of byName.values())  if (ids.length > 1) ids.forEach(id => dups.add(id));
  return dups;
}
let _dupCache = new Set();

function _updateChipCounts() {
  const mineSet = _myCoachIdentities();
  document.getElementById('cnt-all').textContent        = String(students.length);
  document.getElementById('cnt-mine').textContent       = String(students.filter(s => _isMine(s, mineSet)).length);
  document.getElementById('cnt-stale').textContent      = String(students.filter(_isStale).length);
  document.getElementById('cnt-duplicates').textContent = String(_dupCache.size);
}

function renderStudentList() {
  const list = document.getElementById('studentList');
  const q = (document.getElementById('studentSearch').value || '').toLowerCase().trim();
  // Recompute duplicate set whenever students change.
  _dupCache = _computeDuplicateIds(students);
  _updateChipCounts();

  // If overview mode is on, render the table instead of the list.
  if (overviewMode) renderOverviewPane();

  let rows = students;
  // Date range filter on joined_at. "All Time" sentinel range is wide
  // enough to include every realistic joined_at value, AND students with
  // no joined_at set are always shown (dateless rows shouldn't disappear
  // because of a date filter).
  const wideRange = drFrom === '0001-01-01' && drTo === '9999-12-31';
  if (!wideRange) {
    rows = rows.filter(s => {
      if (!s.joined_at) return true;
      const d = String(s.joined_at).slice(0, 10);
      return d >= drFrom && d <= drTo;
    });
  }
  // Apply chip filter.
  const mineSet = _myCoachIdentities();
  if (listFilter === 'mine')       rows = rows.filter(s => _isMine(s, mineSet));
  else if (listFilter === 'stale') rows = rows.filter(_isStale);
  else if (listFilter === 'duplicates') rows = rows.filter(s => _dupCache.has(s.id));

  if (q) rows = rows.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.email || '').toLowerCase().includes(q) ||
    (s.mentor || '').toLowerCase().includes(q) ||
    (s.coach || '').toLowerCase().includes(q) ||
    (s.product || '').toLowerCase().includes(q)
  );
  // Apply advanced filters last so they layer on top of search + chips
  rows = _applyAdvFilters(rows);
  document.getElementById('studentTotalCount').textContent =
    rows.length === students.length
      ? `${students.length} total`
      : `${rows.length} of ${students.length}`;
  if (!rows.length) {
    list.innerHTML = `<div class="student-list-empty">${students.length ? 'No matches.' : 'No students yet — click + New to add the first one.'}</div>`;
    return;
  }
  list.innerHTML = '';
  for (const s of rows) {
    const initials = (s.name || '?').split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
    const div = document.createElement('div');
    div.className = 'student-row' + (currentStudent && currentStudent.id === s.id ? ' active' : '');
    div.dataset.id = s.id;
    div.innerHTML = `
      <div class="student-av">${initials}</div>
      <div class="student-row-info">
        <div class="student-row-name"></div>
        <div class="student-row-meta"><span class="status-dot status-derived-${(s.derived_status||'Notonboarded').replace(/\s/g,'')}"></span><span class="meta-text"></span></div>
      </div>`;
    // Use textContent for user-supplied data
    const nameEl = div.querySelector('.student-row-name');
    nameEl.textContent = s.name || '(unnamed)';
    // Inline mini-badges next to name. ⚠ now means "has open alerts" — the
    // dot color carries lifecycle status (Expired = red dot etc.).
    const tinyBadges = [];
    if (s.wins_count) tinyBadges.push(`<span class="badge win" style="font-size:0.55rem;padding:1px 6px;margin-left:6px;vertical-align:middle;" title="${s.wins_count} win${s.wins_count !== 1 ? 's' : ''}">★ ${s.wins_count}</span>`);
    if (s.verified)        tinyBadges.push('<span class="badge ver" style="font-size:0.55rem;padding:1px 6px;margin-left:4px;vertical-align:middle;">✓</span>');
    if (s.open_alerts_count) tinyBadges.push(`<span class="badge exp" style="font-size:0.55rem;padding:1px 6px;margin-left:4px;vertical-align:middle;" title="${s.open_alerts_count} unresolved alert${s.open_alerts_count !== 1 ? 's' : ''}">⚠ ${s.open_alerts_count}</span>`);
    if (s.derived_status === 'Paused') tinyBadges.push('<span class="badge win" style="font-size:0.55rem;padding:1px 6px;margin-left:4px;vertical-align:middle;" title="Paused">⏸</span>');
    if (s.refunded_date) tinyBadges.push(`<span class="badge exp" style="font-size:0.55rem;padding:1px 6px;margin-left:4px;vertical-align:middle;background:rgba(244,114,182,0.18);color:#f472b6;" title="Refunded on ${s.refunded_date}${s.refunded_amount != null ? ' — $' + s.refunded_amount : ''}">↩ Refunded</span>`);
    if (_dupCache.has(s.id)) tinyBadges.push('<span class="badge exp" style="font-size:0.55rem;padding:1px 6px;margin-left:4px;vertical-align:middle;background:rgba(167,139,250,0.18);color:#a78bfa;" title="Possible duplicate of another student (same email or name)">⎘ dup</span>');
    if (tinyBadges.length) nameEl.insertAdjacentHTML('beforeend', tinyBadges.join(''));
    const metaParts = [];
    // Use computed status (Active/Expired/etc.) instead of free-text status
    if (s.derived_status)          metaParts.push(s.derived_status);
    else if (s.status)             metaParts.push(s.status);
    const coach = s.coach || s.mentor;
    if (coach)                     metaParts.push('· ' + coach);
    if (s.derived_status === 'Delayed start' && s.days_until_start != null) {
      metaParts.push('· ' + s.days_until_start + 'd to start');
    } else if (s.days_left != null && s.derived_status !== 'Not onboarded') {
      const dl = s.days_left;
      metaParts.push('· ' + (dl >= 0 ? `${dl}d left` : `${Math.abs(dl)}d ago`));
    } else if (s.months_count != null) {
      metaParts.push('· ' + s.months_count + 'mo');
    }
    div.querySelector('.meta-text').textContent = metaParts.join(' ');
    div.addEventListener('click', () => openStudent(s.id));
    list.appendChild(div);
  }
}

document.getElementById('studentSearch').addEventListener('input', renderStudentList);
document.getElementById('refreshBtn').addEventListener('click', loadStudents);
document.getElementById('addStudentBtn').addEventListener('click', () => openStudent(null));

// Advanced filter panel toggle
document.getElementById('advFilterToggleBtn')?.addEventListener('click', () => {
  const panel = document.getElementById('advFilterPanel');
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  if (opening) renderAdvFilterPanel();
  document.getElementById('advFilterToggleBtn').classList.toggle('active', opening || _advFilterCount() > 0);
});

// Filter chips
document.querySelectorAll('#listFilterBar [data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    listFilter = btn.dataset.filter;
    document.querySelectorAll('#listFilterBar [data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === listFilter));
    renderStudentList();
  });
});

// Overview toggle
document.getElementById('overviewToggleBtn').addEventListener('click', () => {
  overviewMode = !overviewMode;
  document.getElementById('overviewToggleBtn').classList.toggle('active', overviewMode);
  if (overviewMode) renderOverviewPane();
  else {
    // Restore the regular profile pane (re-render whatever is selected).
    if (currentStudent && currentStudent.id) renderProfile();
    else {
      const card = document.getElementById('profileCard');
      card.className = 'profile-card';
      card.id = 'profileCard';
      card.innerHTML = `<div class="profile-empty"><div class="profile-empty-icon">👈</div><div>Pick a student from the list, or click <strong>+ New</strong> to add one.</div></div>`;
    }
  }
});

function renderOverviewPane() {
  const card = document.getElementById('profileCard');
  // Build same filtered set as the sidebar list (search + chip + date range).
  const q = (document.getElementById('studentSearch').value || '').toLowerCase().trim();
  let rows = students.slice();
  const wideRange = drFrom === '0001-01-01' && drTo === '9999-12-31';
  if (!wideRange) rows = rows.filter(s => !s.joined_at || (String(s.joined_at).slice(0,10) >= drFrom && String(s.joined_at).slice(0,10) <= drTo));
  const mineSet = _myCoachIdentities();
  if (listFilter === 'mine')            rows = rows.filter(s => _isMine(s, mineSet));
  else if (listFilter === 'stale')      rows = rows.filter(_isStale);
  else if (listFilter === 'duplicates') rows = rows.filter(s => _dupCache.has(s.id));
  if (q) rows = rows.filter(s =>
    (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q) ||
    (s.coach||'').toLowerCase().includes(q) || (s.product||'').toLowerCase().includes(q));
  rows = _applyAdvFilters(rows);

  // Sort: stalest first (most days since last assignment), then by name.
  rows.sort((a, b) => {
    const da = _staleDaysSince(a), db = _staleDaysSince(b);
    if (da !== db) return db - da;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Recency pill helper
  const recencyHtml = (s) => {
    const d = _staleDaysSince(s);
    if (d === Infinity) return '<span class="ov-pill ov-recency-none">—</span>';
    if (d <= 7)   return `<span class="ov-pill ov-recency-fresh">${d}d ago</span>`;
    if (d <= 30)  return `<span class="ov-pill ov-recency-warn">${d}d ago</span>`;
    return                `<span class="ov-pill ov-recency-stale">${d}d ago</span>`;
  };

  const filterLabel = ({all:'All students',mine:'My students',stale:`Stale (>${STALE_DAYS}d)`,duplicates:'Duplicates'})[listFilter];

  card.className = 'overview-pane';
  card.innerHTML = `
    <div class="overview-head">
      <div>
        <div class="overview-title">📊 Coach overview</div>
        <div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">${filterLabel} — ${rows.length} student${rows.length !== 1 ? 's' : ''} · sorted by stalest first</div>
      </div>
    </div>
    <div class="overview-table-wrap">
      ${rows.length === 0 ? '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:0.86rem;">No students match the current filters.</div>' : `
      <table class="overview-table">
        <thead><tr>
          <th>Name</th>
          <th>Status</th>
          <th>Coach</th>
          <th>Level</th>
          <th>Masterclass</th>
          <th>Coach status</th>
          <th>Last assignment</th>
          <th>Last Zoom</th>
          <th>Alerts</th>
        </tr></thead>
        <tbody id="ovBody"></tbody>
      </table>`}
    </div>`;

  if (rows.length === 0) return;
  const body = document.getElementById('ovBody');
  for (const s of rows) {
    const tr = document.createElement('tr');
    tr.className = 'row-clickable';
    tr.dataset.id = s.id;
    tr.innerHTML = `
      <td><span class="ov-name"></span>${_dupCache.has(s.id) ? ' <span class="badge exp" style="font-size:0.55rem;padding:1px 6px;background:rgba(167,139,250,0.18);color:#a78bfa;" title="Possible duplicate">⎘</span>' : ''}</td>
      <td><span class="status-dot status-derived-${(s.derived_status||'Notonboarded').replace(/\s/g,'')}"></span> <span class="ov-status"></span></td>
      <td><span class="ov-coach"></span></td>
      <td><span class="ov-level"></span></td>
      <td><span class="ov-module"></span></td>
      <td><span class="ov-coachstatus"></span></td>
      <td>${recencyHtml(s)}</td>
      <td><span class="ov-zoom"></span></td>
      <td>${s.open_alerts_count ? `<span class="ov-pill ov-recency-stale">⚠ ${s.open_alerts_count}</span>` : ''}</td>`;
    tr.querySelector('.ov-name').textContent        = s.name || '(unnamed)';
    tr.querySelector('.ov-status').textContent      = s.derived_status || s.status || '';
    tr.querySelector('.ov-coach').textContent       = s.coach || '—';
    tr.querySelector('.ov-level').textContent       = s.level || '—';
    tr.querySelector('.ov-module').textContent      = s.masterclass_level || '—';
    tr.querySelector('.ov-coachstatus').textContent = s.coach_status || '—';
    tr.querySelector('.ov-zoom').textContent        = s.last_zoom_date ? String(s.last_zoom_date).slice(0,10) : '—';
    tr.addEventListener('click', () => {
      // Switch back to profile view and open the student.
      overviewMode = false;
      document.getElementById('overviewToggleBtn').classList.remove('active');
      openStudent(s.id);
    });
    body.appendChild(tr);
  }
}

// ── Date picker (filters by joined_at) ────────────────────────
function isoDate(d) { return d.toISOString().slice(0, 10); }
function getPresetRange(preset) {
  const today = new Date(); today.setHours(0,0,0,0);
  if (preset === 'all') return { from: '0001-01-01', to: '9999-12-31' };
  if (preset === 'last-30') {
    const f = new Date(today); f.setDate(today.getDate() - 29);
    return { from: isoDate(f), to: isoDate(today) };
  }
  if (preset === 'mtd') {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: isoDate(f), to: isoDate(today) };
  }
  // Thu-Wed weekly slot used across the app
  function weekRange(offsetWeeks) {
    const dow = today.getDay();             // 0 Sun .. 6 Sat
    // Days back to most recent Thursday
    const daysBackToThu = (dow >= 4) ? (dow - 4) : (dow + 3);
    const thu = new Date(today); thu.setDate(today.getDate() - daysBackToThu - 7 * offsetWeeks);
    const wed = new Date(thu);   wed.setDate(thu.getDate() + 6);
    return { from: isoDate(thu), to: isoDate(wed) };
  }
  if (preset === 'this-week') return weekRange(0);
  if (preset === 'last-week') return weekRange(1);
  return { from: '0001-01-01', to: '9999-12-31' };
}
const DR_LABELS = { 'all': 'All Time', 'last-30': 'Last 30 Days', 'this-week': 'This Week', 'last-week': 'Last Week', 'mtd': 'Month to Date' };
let drActivePreset = 'all';
let drFrom = '0001-01-01', drTo = '9999-12-31';
function drApplyPreset(preset, reload) {
  const r = getPresetRange(preset);
  drActivePreset = preset; drFrom = r.from; drTo = r.to;
  document.getElementById('dateFrom').value = preset === 'all' ? '' : r.from;
  document.getElementById('dateTo').value   = preset === 'all' ? '' : r.to;
  document.querySelectorAll('.dr-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  document.getElementById('drLabel').textContent = DR_LABELS[preset] || preset;
  document.getElementById('daterangePopup').classList.remove('open');
  if (reload) renderStudentList();
}
// Self-init: read saved preset (filters.js persists across dashboards).
(function(){
  let p = 'all';
  try {
    const s = JSON.parse(localStorage.getItem('ridley:dateRange:v2') || 'null');
    if (s && s.preset && ['all','this-week','last-week','mtd','last-30'].indexOf(s.preset) >= 0) p = s.preset;
  } catch (_) {}
  drApplyPreset(p, false);
})();
document.getElementById('daterangeBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('daterangePopup').classList.toggle('open');
});
document.getElementById('daterangePopup').addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => document.getElementById('daterangePopup').classList.remove('open'));
document.querySelectorAll('.dr-preset').forEach(btn => {
  btn.addEventListener('click', () => drApplyPreset(btn.dataset.preset, true));
});
document.getElementById('drApply').addEventListener('click', () => {
  const f = document.getElementById('dateFrom').value;
  const t = document.getElementById('dateTo').value;
  if (!f || !t) return;
  drActivePreset = null; drFrom = f; drTo = t;
  document.querySelectorAll('.dr-preset').forEach(b => b.classList.remove('active'));
  document.getElementById('drLabel').textContent = `${f} → ${t}`;
  document.getElementById('daterangePopup').classList.remove('open');
  renderStudentList();
});

// ── Profile ────────────────────────────────────────────────────
let currentPauses = [];
let currentResigns = [];
let currentAlerts = [];
let currentWins   = [];
let currentCoachNotes = [];
let currentTurnovers  = [];
let currentRepNotes   = [];
// Activity log: every zoom/assignment_sent/assignment_received event. Replaces
// the three single-value date columns as the source of truth (the columns
// still exist as cached MAX values maintained by a DB trigger).
let currentActivityLog = [];
let currentIcNotes    = [];
let profileDirty = false;

// Show a 3-way "save / leave without saving / cancel" modal. Resolves to
// 'save' | 'leave' | 'cancel'.
function confirmLeaveUnsaved() {
  return new Promise((resolve) => {
    document.getElementById('leaveConfirmModal')?.remove();
    const m = document.createElement('div');
    m.id = 'leaveConfirmModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
    m.innerHTML = `
      <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:440px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
        <div style="font-size:1.05rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:6px;">Unsaved changes</div>
        <div style="font-size:0.85rem;color:#c2c8e0;line-height:1.5;margin-bottom:18px;">You have unsaved changes on this student. Save them, or leave without saving?</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button data-act="cancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
          <button data-act="leave"  style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.4);color:#f87171;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Leave without saving</button>
          <button data-act="save" class="profile-save" style="padding:8px 18px;">Save</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    function done(v) { document.removeEventListener('keydown', onKey); m.remove(); resolve(v); }
    function onKey(e) { if (e.key === 'Escape') done('cancel'); }
    m.addEventListener('click', (e) => {
      if (e.target === m) return done('cancel');
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) done(act);
    });
    document.addEventListener('keydown', onKey);
  });
}

// Browser-level warning on hard reload / tab close while dirty.
window.addEventListener('beforeunload', (e) => {
  if (profileDirty) { e.preventDefault(); e.returnValue = ''; }
});
// Race-safe student loading: track the latest-clicked id and discard stale responses
// so rapid clicks (A → B → C) always end with C displayed, not whichever fetch happens
// to return last. Also avoid the heavy full-list re-render on every open — a lightweight
// active-class swap is enough.
let _openStudentLatestId = null;
let _openStudentAbort = null;
function _swapActiveRow(id) {
  document.querySelectorAll('#studentList .student-row').forEach(r => {
    r.classList.toggle('active', String(id) === r.dataset.id);
  });
}
async function openStudent(id) {
  // Unsaved-changes guard: only prompt when navigating to a *different* student
  // (or the "new student" form) — re-loading the same student after a save or
  // a sub-record mutation must not prompt.
  const sameStudent = (id != null && currentStudent && currentStudent.id === id);
  if (profileDirty && !sameStudent) {
    const choice = await confirmLeaveUnsaved();
    if (choice === 'cancel') return;
    if (choice === 'save')   { const ok = await saveStudent(); if (!ok) return; }
    profileDirty = false;
  }
  if (id === null) {
    _openStudentLatestId = null;
    if (_openStudentAbort) { try { _openStudentAbort.abort(); } catch(_){} _openStudentAbort = null; }
    currentStudent = { id: null, name: '', status: 'Active', metadata: {} };
    currentPauses = []; currentResigns = []; currentAlerts = []; currentWins = []; currentCoachNotes = []; currentTurnovers = []; currentRepNotes = []; currentIcNotes = []; currentActivityLog = [];
    profileDirty = false;
    renderProfile();
    _swapActiveRow(null);
    document.body.setAttribute('data-crm-view', 'profile'); // 'New student' form is also profile view
    document.getElementById('crmBackName').textContent = 'New student';
    return;
  }
  // Mark this click as the latest; any previous in-flight request gets superseded
  _openStudentLatestId = id;
  if (_openStudentAbort) { try { _openStudentAbort.abort(); } catch(_){} }
  const ac = new AbortController();
  _openStudentAbort = ac;
  // Immediately reflect the click in the list so it feels responsive
  _swapActiveRow(id);
  // Mobile: switch to profile view + show student name in the back-bar
  document.body.setAttribute('data-crm-view', 'profile');
  const stu = students.find(s => s.id === id);
  if (stu) document.getElementById('crmBackName').textContent = stu.name || '(unnamed)';

  // INSTANT FEEDBACK: render the profile from the list row + any cached
  // sub-records, then refresh from the network in the background. Without
  // this the user sees a blank pane while the round-trip + 10 DB queries
  // complete (often 1-3s).
  const cached = _readStudentDetailsCache(id);
  if (stu) {
    currentStudent = { ...(stu), ...(cached?.row || {}) };
    currentPauses    = cached?.pauses     || [];
    currentResigns   = cached?.resigns    || [];
    currentAlerts    = cached?.alerts     || [];
    currentWins      = cached?.wins       || [];
    currentCoachNotes = cached?.coach_notes || [];
    currentTurnovers  = cached?.turnovers   || [];
    currentRepNotes   = cached?.rep_notes   || [];
    currentIcNotes    = cached?.ic_notes    || [];
    currentActivityLog = cached?.activity_log || [];
    currentStudent.surveys = cached?.surveys || [];
    profileDirty = false;
    renderProfile();
  }

  try {
    const r = await fetch(STUDENTS_BASE + '?api=get&id=' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + currentSession.access_token },
      signal: ac.signal,
    });
    // Stale-response guard: if a newer click happened, drop this one
    if (_openStudentLatestId !== id) return;
    const j = await r.json();
    if (_openStudentLatestId !== id) return;
    if (!r.ok) throw new Error(j.error || 'Failed');
    currentStudent = j.row || null;
    currentPauses  = Array.isArray(j.pauses)  ? j.pauses  : [];
    currentResigns = Array.isArray(j.resigns) ? j.resigns : [];
    currentAlerts  = Array.isArray(j.alerts)  ? j.alerts  : [];
    currentWins    = Array.isArray(j.wins)    ? j.wins    : [];
    currentCoachNotes = Array.isArray(j.coach_notes) ? j.coach_notes : [];
    currentTurnovers  = Array.isArray(j.turnovers)   ? j.turnovers   : [];
    currentRepNotes   = Array.isArray(j.rep_notes)   ? j.rep_notes   : [];
    currentIcNotes    = Array.isArray(j.ic_notes)    ? j.ic_notes    : [];
    currentActivityLog = Array.isArray(j.activity_log) ? j.activity_log : [];
    if (currentStudent) currentStudent.surveys = Array.isArray(j.surveys) ? j.surveys : [];
    profileDirty = false;
    renderProfile();
    // Save to per-student cache so the next click is instant.
    _writeStudentDetailsCache(id, {
      row: j.row, pauses: j.pauses, resigns: j.resigns, alerts: j.alerts,
      wins: j.wins, coach_notes: j.coach_notes, turnovers: j.turnovers,
      rep_notes: j.rep_notes, ic_notes: j.ic_notes, surveys: j.surveys,
      activity_log: j.activity_log,
    });
  } catch (e) {
    if (e?.name === 'AbortError') return; // superseded by a later click
    alert('Failed to load student: ' + (e.message || e));
  } finally {
    if (_openStudentAbort === ac) _openStudentAbort = null;
  }
}

// Field map: each section is [title, [{key, label, type, full?, opts?}]].
// Mirrors the Google sheet column groupings. type: 'text' | 'email' | 'tel'
// | 'date' | 'textarea' | 'select' | 'checkbox' | 'number'. `full` makes
// the field span both grid columns.
const SECTIONS = [
  ['Identity', [
    { k: 'name',    label: 'Name *',          type: 'text',  full: true },
    { k: 'email',   label: 'Email',           type: 'email' },
    { k: 'phone',   label: 'Phone',           type: 'tel'   },
    { k: 'rep',     label: 'Rep',         type: 'text'  },
    { k: 'status',  label: 'Status',          type: 'select', opts: STATUSES },
  ]],
  ['Purchase', [
    { k: 'first_purchase_date', label: '1st purchase date',          type: 'date' },
    { k: 'months_count',        label: 'How many months (initial)',  type: 'number' },
  ]],
  ['Onboarding', [
    { k: 'welcome_call_date',      label: 'Welcome call date',          type: 'date' },
    { k: 'welcome_zoom_confirmed', label: 'Welcome Zoom w/ Stephen',    type: 'checkbox' },
    { k: 'survey_submitted_date',  label: 'Survey submitted',           type: 'date' },
    { k: 'video_submitted_date',   label: 'Video submitted',            type: 'date' },
    { k: 'coach',                  label: 'Coach',                      type: 'datalist', opts: 'coaches', placeholder: 'Type a coach name…' },
    { k: 'community_url',          label: 'Community / Circle URL',     type: 'url', full: true, placeholder: 'https://www.ridleyacademy.com/products/communities/...' },
    { k: 'student_onboarded_date', label: 'Student onboarded date',     type: 'date' },
    { k: 'delayed_start_date',     label: 'Delayed start (optional)',   type: 'date' },
  ]],
  // Pauses get their own custom widget (multiple rows). Section title still
  // appears via SECTION_RENDERERS below.
  ['Coach', [
    { k: 'level',                  label: 'Level',                      type: 'select',   opts: ['Beginner', 'Intermediate', 'Advanced'] },
    { k: 'masterclass_level',      label: 'Masterclass level',          type: 'select',   opts: ['INTRODUCTION', 'LEVEL 1', 'LEVEL 2', 'LEVEL 3', 'LEVEL 4', 'LEVEL 5', 'LEVEL 6', 'LEVEL 7', 'LEVEL 8', 'LEVEL 9', 'LEVEL 10'] },
    { k: 'coach_status',           label: 'Coach status',               type: 'select',   opts: ['All good', 'Needs attention'] },
    // The three single-value last_* date fields are handled by the
    // Activity History panel appended after this section — every event is
    // logged in mentorship_activity_log; the cached MAX columns on the
    // student row keep dashboards working unchanged.
    { k: 'preferred_time_slot',    label: 'Schedule',                   type: 'text', placeholder: 'e.g. Tue/Thu 6pm CET, weekends only…' },
    { k: 'concern',                label: 'Concern',                    type: 'textarea', full: true, placeholder: 'Practice constraints, problem areas…' },
    { k: 'goal',                   label: 'Goal',                       type: 'textarea', full: true, placeholder: 'What are they working toward?' },
  ]],
  ['Resources', [
    { k: 'gdrive_url',    label: 'Google Drive doc',       type: 'url', placeholder: 'https://docs.google.com/...' },
  ]],
  ['Admin', [
    { k: 'end_date',                 label: 'Manual end date (override)', type: 'date' },
    { k: 'survey_9month_submitted',  label: '9-month survey submitted',   type: 'checkbox' },
    { k: 'refunded_date',            label: 'Refunded — date',            type: 'date' },
    { k: 'refunded_amount',          label: 'Refunded — amount ($)',      type: 'number', placeholder: 'e.g. 4990' },
    { k: 'last_activity_date',       label: 'Last activity date',         type: 'date' },
    { k: 'verified',                 label: 'Verified',                   type: 'checkbox' },
  ]],
];

function _syncUrlOpenButton(inputEl) {
  if (!inputEl) return;
  const wrap = inputEl.closest('.field-url-wrap'); if (!wrap) return;
  const a = wrap.querySelector('.field-url-open'); if (!a) return;
  const v = (inputEl.value || '').trim();
  // Only show + link when it looks like an http(s) URL.
  if (/^https?:\/\//i.test(v)) {
    a.href = v;
    a.style.display = 'inline-flex';
  } else {
    a.removeAttribute('href');
    a.style.display = 'none';
  }
}

function _buildField(field, value) {
  const id = 'f-' + field.k;
  if (field.type === 'checkbox') {
    return `<label class="field-checkbox${value ? ' checked' : ''}" data-cb-for="${field.k}">
      <input type="checkbox" id="${id}" data-key="${field.k}"${value ? ' checked' : ''}>
      <span>${field.label}</span>
    </label>`;
  }
  let inner = '';
  if (field.type === 'select') {
    const opts = field.opts === 'mentors' ? mentors : (field.opts || []);
    let optHtml = '<option value="">— None —</option>';
    if (Array.isArray(opts)) {
      optHtml = opts.map(o => `<option value="${o}">${o}</option>`).join('');
      if (field.opts !== 'mentors') optHtml = '<option value=""></option>' + optHtml;
    }
    inner = `<select class="field-select" id="${id}" data-key="${field.k}">${optHtml}</select>`;
  } else if (field.type === 'datalist') {
    const opts = field.opts === 'coaches' ? coaches : (Array.isArray(field.opts) ? field.opts : []);
    const dlId = 'dl-' + field.k;
    const optHtml = (opts || []).map(o => `<option value="${String(o).replace(/"/g,'&quot;')}"></option>`).join('');
    inner = `<input class="field-input" type="text" id="${id}" data-key="${field.k}" list="${dlId}"${field.placeholder ? ` placeholder="${field.placeholder}"` : ''}><datalist id="${dlId}">${optHtml}</datalist>`;
  } else if (field.type === 'textarea') {
    inner = `<textarea class="field-textarea" id="${id}" data-key="${field.k}"></textarea>`;
  } else {
    const t = field.type === 'number' ? 'number' : (field.type === 'tel' ? 'tel' : (field.type === 'email' ? 'email' : (field.type === 'date' ? 'date' : (field.type === 'url' ? 'url' : 'text'))));
    if (field.type === 'url') {
      // URL input + ↗ open-in-new-tab button. Empty button is hidden until
      // a value is set (renderProfile / input handler toggles it).
      inner = `<div class="field-url-wrap" style="display:flex;gap:6px;align-items:stretch;">
        <input class="field-input field-url-input" type="url" id="${id}" data-key="${field.k}"${field.placeholder ? ` placeholder="${field.placeholder}"` : ''} style="flex:1;min-width:0;">
        <a class="field-url-open" data-for="${id}" target="_blank" rel="noopener noreferrer" style="display:none;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:0 12px;color:var(--text-muted);font-size:0.78rem;font-weight:700;text-decoration:none;white-space:nowrap;" title="Open in new tab">↗ Open</a>
      </div>`;
    } else if (field.k === 'last_zoom_date') {
      // Date input + 🎥 history button so coaches can see all past Zoom sessions.
      inner = `<div style="display:flex;gap:6px;align-items:stretch;">
        <input class="field-input" type="date" id="${id}" data-key="${field.k}" style="flex:1;min-width:0;">
        <button type="button" class="zoom-history-btn" title="See all Zoom sessions this student attended" style="background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.4);border-radius:10px;padding:0 12px;color:#22d3ee;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;">${ICONS.zoom()} History</button>
      </div>`;
    } else {
      inner = `<input class="field-input" type="${t}" id="${id}" data-key="${field.k}"${field.placeholder ? ` placeholder="${field.placeholder}"` : ''}>`;
    }
  }
  return `<div class="field${field.full ? ' field-full' : ''}">
    <div class="field-label">${field.label}</div>${inner}
  </div>`;
}

function _buildPausesPanel(_section, _openAttr) {
  const sorted = [...currentPauses].sort((a, b) =>
    String(b.start_date || '').localeCompare(String(a.start_date || '')));
  const rows = sorted.map(p => {
    const isActive = !p.end_date;
    const days = isActive
      ? '∞ ongoing'
      : (() => {
          const ms = Date.parse(p.end_date) - Date.parse(p.start_date);
          const d = Math.max(0, Math.round(ms / 86400000));
          return d + 'd';
        })();
    return `<tr data-pause-id="${p.id}" ${isActive ? 'style="background:rgba(251,191,36,0.06);"' : ''}>
      <td style="padding:6px 8px;"><input type="date" class="field-input pause-start" value="${p.start_date || ''}" data-pid="${p.id}"></td>
      <td style="padding:6px 8px;"><input type="date" class="field-input pause-end"   value="${p.end_date   || ''}" data-pid="${p.id}" placeholder="ongoing"></td>
      <td style="padding:6px 8px;"><input type="text" class="field-input pause-notes" value="" data-pid="${p.id}" placeholder="Notes"></td>
      <td style="padding:6px 8px;color:#7880a8;font-size:0.78rem;white-space:nowrap;">${days}${isActive ? ' <span style="color:#fbbf24;font-weight:700;">⏸ active</span>' : ''}</td>
      <td style="padding:6px 8px;text-align:right;"><button class="profile-delete pause-del" data-pid="${p.id}" style="padding:4px 10px;font-size:0.72rem;">✕</button></td>
    </tr>`;
  }).join('');
  const inner = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button class="profile-save" id="addPauseBtn" style="padding:6px 14px;font-size:0.78rem;">+ Add pause</button>
    </div>
    ${currentPauses.length === 0
      ? '<div style="padding:12px;color:var(--text-muted);font-size:0.84rem;background:var(--surface2);border-radius:10px;">No pauses yet. The student\'s lifecycle is computed straight from their onboarded date + months count.</div>'
      : `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead style="background:var(--surface2);color:var(--text-dim);font-size:0.66rem;text-transform:uppercase;letter-spacing:0.06em;">
              <tr>
                <th style="padding:8px;text-align:left;">Start</th>
                <th style="padding:8px;text-align:left;">End <span style="color:var(--text-dim);text-transform:none;font-weight:400;">(blank = ongoing)</span></th>
                <th style="padding:8px;text-align:left;">Notes</th>
                <th style="padding:8px;text-align:left;">Length</th>
                <th style="padding:8px;text-align:right;">&nbsp;</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}`;
  return _section('Pauses', inner);
}

function _wirePauses() {
  // Populate notes (kept out of innerHTML for safety)
  for (const p of currentPauses) {
    const el = document.querySelector(`.pause-notes[data-pid="${p.id}"]`);
    if (el) el.value = p.notes || '';
  }
  // Save on change/blur
  ['pause-start', 'pause-end', 'pause-notes'].forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(el => {
      el.addEventListener('change', () => savePauseField(el));
    });
  });
  document.querySelectorAll('.pause-del').forEach(btn => {
    btn.addEventListener('click', () => deletePause(Number(btn.dataset.pid)));
  });
  const addBtn = document.getElementById('addPauseBtn');
  if (addBtn) addBtn.addEventListener('click', addPause);
}

async function savePauseField(el) {
  const id = Number(el.dataset.pid);
  const fieldKey = el.classList.contains('pause-start') ? 'start_date'
                  : el.classList.contains('pause-end')  ? 'end_date'
                  : 'notes';
  const body = { id };
  body[fieldKey] = el.value || null;
  if (fieldKey === 'start_date' && !body[fieldKey]) {
    alert('A pause needs a start date.');
    // Reload to revert
    const sid = currentStudent?.id; if (sid) await openStudent(sid);
    return;
  }
  try {
    const r = await fetch(STUDENTS_BASE + '?api=update-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    // Reload so derived lifecycle refreshes
    if (currentStudent?.id) {
      await openStudent(currentStudent.id);
      await loadStudents();
    }
  } catch (e) { alert('Pause save failed: ' + (e.message || e)); }
}

function addPause() {
  if (!currentStudent || !currentStudent.id) {
    alert('Save the student first, then add pauses.');
    return;
  }
  // Remove any existing modal
  document.getElementById('pauseModal')?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const m = document.createElement('div');
  m.id = 'pauseModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:420px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Add a pause</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Lifecycle freezes during a pause and the effective end date shifts forward by the pause length.</div>

      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Start date *</div>
        <input class="field-input" type="date" id="pauseModalStart" value="${today}" required>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">End date <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(leave blank = ongoing)</span></div>
        <input class="field-input" type="date" id="pauseModalEnd">
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Notes</div>
        <textarea class="field-textarea" id="pauseModalNotes" placeholder="Why is this student pausing?" style="min-height:80px;"></textarea>
      </div>
      <div id="pauseModalErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="pauseModalCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="pauseModalSave" class="profile-save" style="padding:8px 18px;">Save pause</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('pauseModalCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  // Esc to close
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);

  const startEl = document.getElementById('pauseModalStart');
  const endEl   = document.getElementById('pauseModalEnd');
  const notesEl = document.getElementById('pauseModalNotes');
  const errEl   = document.getElementById('pauseModalErr');
  const saveBtn = document.getElementById('pauseModalSave');
  startEl.focus(); startEl.select();

  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const start = startEl.value;
    const end   = endEl.value || null;
    const notes = notesEl.value.trim() || null;
    if (!start) { errEl.textContent = 'Start date is required.'; return; }
    if (end && end < start) { errEl.textContent = "End date can't be before the start date."; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, start_date: start, end_date: end, notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Save pause';
    }
  });
}

async function deletePause(id) {
  if (!confirm('Delete this pause?')) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
  } catch (e) { alert('Delete pause failed: ' + (e.message || e)); }
}

function _buildActivityHistoryPanel(_section, _openAttr) {
  const KINDS = [
    { key: 'zoom',                label: 'Zoom calls',          cached: currentStudent?.last_zoom_date },
    { key: 'assignment_sent',     label: 'Assignment sent',     cached: currentStudent?.last_assignment_sent },
    { key: 'assignment_received', label: 'Assignment received', cached: currentStudent?.last_assignment_received },
  ];
  const grouped = { zoom: [], assignment_sent: [], assignment_received: [] };
  for (const e of (currentActivityLog || [])) { if (grouped[e.kind]) grouped[e.kind].push(e); }
  const today = new Date().toISOString().slice(0, 10);
  const inner = KINDS.map(k => {
    const list = grouped[k.key] || [];
    const latest = list[0]?.activity_date || k.cached || '—';
    const rows = list.length === 0
      ? '<div style="padding:10px;color:var(--text-muted);font-size:0.82rem;background:var(--surface2);border-radius:8px;">No history yet.</div>'
      : `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:260px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead style="background:var(--surface2);color:var(--text-dim);font-size:0.66rem;text-transform:uppercase;letter-spacing:0.06em;position:sticky;top:0;">
              <tr><th style="padding:6px 8px;text-align:left;">Date</th><th style="padding:6px 8px;text-align:left;">Notes</th><th style="padding:6px 8px;text-align:left;">Source</th><th></th></tr>
            </thead>
            <tbody>${list.map(e => `
              <tr data-act-id="${e.id}">
                <td style="padding:6px 8px;font-weight:600;">${escapeHtml(e.activity_date || '')}</td>
                <td style="padding:6px 8px;color:var(--text-muted);">${escapeHtml(e.notes || '')}</td>
                <td style="padding:6px 8px;color:var(--text-muted);font-size:0.72rem;">${escapeHtml((e.created_by_email || e.source || '').toString())}</td>
                <td style="padding:6px 8px;text-align:right;"><button class="profile-delete act-del" data-aid="${e.id}" data-kind="${k.key}" style="padding:4px 10px;font-size:0.72rem;">✕</button></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
    return `
      <details class="act-block" data-kind="${k.key}" open style="margin-bottom:14px;">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:6px 0;">
          <span style="font-size:0.86rem;font-weight:700;color:var(--text);">${escapeHtml(k.label)}</span>
          <span style="font-size:0.78rem;color:var(--text-muted);">Latest: <strong style="color:var(--text);font-weight:700;">${latest ? escapeHtml(latest) : '—'}</strong></span>
          <span style="font-size:0.72rem;color:var(--text-muted);opacity:0.7;">(${list.length} entr${list.length===1?'y':'ies'})</span>
          <span style="margin-left:auto;color:var(--text-muted);">▾</span>
        </summary>
        <div style="display:grid;grid-template-columns:160px 1fr auto;gap:8px;margin:8px 0;">
          <input type="date" class="field-input act-date" data-kind="${k.key}" value="${today}">
          <input type="text" class="field-input act-notes" data-kind="${k.key}" placeholder="Optional note (assignment #, topic…)" maxlength="200">
          <button class="profile-save act-add-btn" data-kind="${k.key}" style="padding:6px 14px;font-size:0.78rem;">+ Add</button>
        </div>
        ${rows}
      </details>`;
  }).join('');
  return _section('Activity history', inner);
}

function _wireActivityHistory() {
  if (!currentStudent || !currentStudent.id) return;
  document.querySelectorAll('.act-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const k = btn.getAttribute('data-kind');
      const dateEl  = document.querySelector(`.act-date[data-kind="${k}"]`);
      const notesEl = document.querySelector(`.act-notes[data-kind="${k}"]`);
      const date = dateEl?.value;
      if (!date) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        const r = await fetch(STUDENTS_BASE + '?api=add-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ studentId: currentStudent.id, kind: k, activity_date: date, notes: notesEl.value.trim() || null }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        currentActivityLog.unshift({ id: j.id, student_id: currentStudent.id, kind: k, activity_date: date, source: 'manual_entry', notes: notesEl.value.trim() || null, created_by_email: currentSession?.user?.email || null });
        _refreshCachedFromLog();
        renderProfile();
      } catch (e) { alert('Add failed: ' + (e.message || e)); btn.disabled = false; btn.textContent = '+ Add'; }
    });
  });
  document.querySelectorAll('.act-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      const aid = Number(btn.getAttribute('data-aid'));
      try {
        const r = await fetch(STUDENTS_BASE + '?api=delete-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: aid }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed');
        currentActivityLog = currentActivityLog.filter(e => e.id !== aid);
        _refreshCachedFromLog();
        renderProfile();
      } catch (e) { alert('Delete failed: ' + (e.message || e)); }
    });
  });
}

function _refreshCachedFromLog() {
  // Mirror the DB trigger client-side so the UI updates instantly without a refetch.
  const maxBy = (k) => currentActivityLog.filter(e => e.kind === k).map(e => e.activity_date).sort().slice(-1)[0] || null;
  currentStudent.last_zoom_date           = maxBy('zoom');
  currentStudent.last_assignment_sent     = maxBy('assignment_sent');
  currentStudent.last_assignment_received = maxBy('assignment_received');
  const idx = students.findIndex(s => s.id === currentStudent.id);
  if (idx >= 0) Object.assign(students[idx], {
    last_zoom_date: currentStudent.last_zoom_date,
    last_assignment_sent: currentStudent.last_assignment_sent,
    last_assignment_received: currentStudent.last_assignment_received,
  });
}

function _buildResignsPanel(_section, _openAttr) {
  const fmtMoney = n => n == null ? '—' : '$' + Number(n).toLocaleString();
  const sorted = [...currentResigns].sort((a, b) =>
    String(b.resign_date || '').localeCompare(String(a.resign_date || '')));
  const totalAdded = sorted.reduce((s, r) => s + (Number(r.months_added) || 0), 0);
  const rows = sorted.map(r => `
    <tr data-resign-id="${r.id}">
      <td style="padding:6px 8px;"><input type="date"   class="field-input resign-date"   value="${r.resign_date || ''}" data-rid="${r.id}"></td>
      <td style="padding:6px 8px;"><input type="number" class="field-input resign-months" value="${r.months_added || 0}" data-rid="${r.id}" min="1" step="1" style="max-width:90px;"></td>
      <td style="padding:6px 8px;"><input type="number" class="field-input resign-amount" value="${r.amount != null ? r.amount : ''}" data-rid="${r.id}" min="0" step="0.01" placeholder="(optional)" style="max-width:120px;"></td>
      <td style="padding:6px 8px;"><input type="text"   class="field-input resign-notes"  value="" data-rid="${r.id}" placeholder="Notes"></td>
      <td style="padding:6px 8px;text-align:right;"><button class="profile-delete resign-del" data-rid="${r.id}" style="padding:4px 10px;font-size:0.72rem;">✕</button></td>
    </tr>`).join('');
  const titleHtml = `Resigns${totalAdded ? `<span style="color:var(--text-muted);font-weight:600;text-transform:none;letter-spacing:0;font-size:0.72rem;margin-left:8px;">+${totalAdded} months total</span>` : ''}`;
  const inner = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button class="profile-save" id="addResignBtn" style="padding:6px 14px;font-size:0.78rem;">+ Add resign</button>
    </div>
    ${currentResigns.length === 0
      ? '<div style="padding:12px;color:var(--text-muted);font-size:0.84rem;background:var(--surface2);border-radius:10px;">No resigns yet. Each resign extends the course duration by the number of months you specify.</div>'
      : `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead style="background:var(--surface2);color:var(--text-dim);font-size:0.66rem;text-transform:uppercase;letter-spacing:0.06em;">
              <tr>
                <th style="padding:8px;text-align:left;">Date</th>
                <th style="padding:8px;text-align:left;">Months added</th>
                <th style="padding:8px;text-align:left;">Amount</th>
                <th style="padding:8px;text-align:left;">Notes</th>
                <th style="padding:8px;text-align:right;">&nbsp;</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`}`;
  // Inline title HTML uses the simple section helper, manual replace because
  // we need raw HTML (the totalAdded chip) inside the title cell.
  const html = _section('Resigns', inner, titleHtml);
  return html;
}

function _wireResigns() {
  // Populate notes via .value (user-supplied — never innerHTML)
  for (const r of currentResigns) {
    const el = document.querySelector(`.resign-notes[data-rid="${r.id}"]`);
    if (el) el.value = r.notes || '';
  }
  ['resign-date','resign-months','resign-amount','resign-notes'].forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(el => {
      el.addEventListener('change', () => saveResignField(el));
    });
  });
  document.querySelectorAll('.resign-del').forEach(btn => {
    btn.addEventListener('click', () => deleteResign(Number(btn.dataset.rid)));
  });
  const addBtn = document.getElementById('addResignBtn');
  if (addBtn) addBtn.addEventListener('click', addResign);
}

async function saveResignField(el) {
  const id = Number(el.dataset.rid);
  const fieldKey = el.classList.contains('resign-date')   ? 'resign_date'
                  : el.classList.contains('resign-months') ? 'months_added'
                  : el.classList.contains('resign-amount') ? 'amount'
                  : 'notes';
  const body = { id };
  if (fieldKey === 'months_added') {
    const v = Number(el.value); if (!v || v <= 0) { alert('Months must be a positive number.'); return; }
    body[fieldKey] = v;
  } else if (fieldKey === 'amount') {
    body[fieldKey] = el.value === '' ? null : Number(el.value);
  } else {
    body[fieldKey] = el.value || null;
    if (fieldKey === 'resign_date' && !body[fieldKey]) {
      alert('A resign needs a date.');
      if (currentStudent?.id) await openStudent(currentStudent.id);
      return;
    }
  }
  try {
    const r = await fetch(STUDENTS_BASE + '?api=update-resign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    if (currentStudent?.id) {
      await openStudent(currentStudent.id);
      await loadStudents();
    }
  } catch (e) { alert('Resign save failed: ' + (e.message || e)); }
}

function addResign() {
  if (!currentStudent || !currentStudent.id) {
    alert('Save the student first, then add resigns.');
    return;
  }
  document.getElementById('resignModal')?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const defaultMonths = Number(currentStudent.months_count) || 12;
  const m = document.createElement('div');
  m.id = 'resignModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:440px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">Add a resign</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Extends the course by the number of months you choose. The student's effective end date moves out automatically.</div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Resign date *</div>
        <input class="field-input" type="date" id="resignModalDate" value="${today}" required>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Months added *</div>
        <input class="field-input" type="number" id="resignModalMonths" value="${defaultMonths}" min="1" step="1" required>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Amount paid <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <input class="field-input" type="number" id="resignModalAmount" min="0" step="0.01" placeholder="e.g. 1500">
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Notes</div>
        <textarea class="field-textarea" id="resignModalNotes" placeholder="Plan / instalments / anything to remember…" style="min-height:80px;"></textarea>
      </div>
      <div id="resignModalErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="resignModalCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="resignModalSave" class="profile-save" style="padding:8px 18px;">Save resign</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('resignModalCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);

  const dateEl  = document.getElementById('resignModalDate');
  const monEl   = document.getElementById('resignModalMonths');
  const amtEl   = document.getElementById('resignModalAmount');
  const notesEl = document.getElementById('resignModalNotes');
  const errEl   = document.getElementById('resignModalErr');
  const saveBtn = document.getElementById('resignModalSave');
  dateEl.focus();

  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const resign_date = dateEl.value;
    const months_added = Number(monEl.value);
    const amount = amtEl.value === '' ? null : Number(amtEl.value);
    const notes = notesEl.value.trim() || null;
    if (!resign_date) { errEl.textContent = 'Resign date is required.'; return; }
    if (!months_added || months_added <= 0) { errEl.textContent = 'Months added must be a positive number.'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, resign_date, months_added, amount, notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Save resign';
    }
  });
}

async function deleteResign(id) {
  if (!confirm('Delete this resign? The course duration will shrink back accordingly.')) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete-resign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
  } catch (e) { alert('Delete resign failed: ' + (e.message || e)); }
}

function renderProfile() {
  const card = document.getElementById('profileCard');
  // Reset class in case we were just in overview mode.
  card.className = 'profile-card';
  if (!currentStudent) {
    card.innerHTML = '<div class="profile-empty">Pick a student from the list to see their profile.</div>';
    return;
  }
  const s = currentStudent;
  const isNew = !s.id;
  const initials = (s.name || '?').split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase() || '?';

  // Read collapsed state from localStorage so toggles persist across loads.
  const collapsed = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('crm-collapsed-sections') || '[]')); }
    catch { return new Set(); }
  })();
  const _openAttr = (title) => collapsed.has(title) ? '' : 'open';
  const _section = (title, innerHTML, titleHtml) => `
    <details class="profile-section" data-section="${title}" ${_openAttr(title)}>
      <summary>
        <div class="profile-section-title">${titleHtml || title}</div>
        <div class="profile-section-line"></div>
        <span class="profile-section-caret">▾</span>
      </summary>
      ${innerHTML}
    </details>`;
  const sectionsHtml = SECTIONS.map(([title, fields]) => {
    const grid = `<div class="profile-grid">${fields.map(f => _buildField(f, s[f.k])).join('')}</div>`;
    let html = _section(title, grid);
    if (title === 'Purchase' && !isNew) html += _buildResignsPanel(_section, _openAttr);
    if (title === 'Onboarding' && !isNew) html += _buildPausesPanel(_section, _openAttr);
    if (title === 'Coach' && !isNew) html += _buildActivityHistoryPanel(_section, _openAttr);
    return html;
  }).join('');

  // Status badges in header — computed lifecycle is the source of truth.
  const badges = [];
  const ds = s.derived_status || 'Not onboarded';
  const dsClass = ds === 'Active' ? 'ver' : ds === 'Expiring soon' ? 'win' : ds === 'Expired' ? 'exp' : ds === 'Paused' ? 'win' : ds === 'Delayed start' ? 'ver' : 'exp';
  const dsLabel = ds === 'Active' ? '● Active'
    : ds === 'Expiring soon' ? `⚠ Expiring soon (${s.days_left}d left)`
    : ds === 'Expired'       ? `⚠ Expired (${Math.abs(s.days_left || 0)}d ago)`
    : ds === 'Paused'        ? '⏸ Paused'
    : ds === 'Delayed start' ? `⏳ Delayed start (${s.days_until_start}d to go${s.delayed_start_date ? ' — ' + s.delayed_start_date : ''})`
    : 'Not onboarded';
  const dsStyle = ds === 'Delayed start' ? ' style="background:rgba(96,165,250,0.18);color:#60a5fa;"' : '';
  badges.push(`<span class="badge ${dsClass}"${dsStyle}>${dsLabel}</span>`);
  if (s.effective_end_date) {
    badges.push(`<span class="badge ver" style="background:rgba(120,128,168,0.18);color:#7880a8;">Ends ${s.effective_end_date}</span>`);
  }
  if (s.paused_days_total) {
    badges.push(`<span class="badge ver" style="background:rgba(120,128,168,0.18);color:#7880a8;">${s.paused_days_total}d paused total</span>`);
  }
  if (currentWins.length) badges.push(`<span class="badge win">★ ${currentWins.length} win${currentWins.length !== 1 ? 's' : ''}</span>`);
  if (s.verified)         badges.push('<span class="badge ver">✓ Verified</span>');
  if (s.refunded_date) {
    const amt = s.refunded_amount != null ? ` — $${Number(s.refunded_amount).toLocaleString()}` : '';
    badges.push(`<span class="badge exp" style="background:rgba(244,114,182,0.18);color:#f472b6;border:1px solid rgba(244,114,182,0.4);">↩ Refunded ${s.refunded_date}${amt}</span>`);
  }

  card.innerHTML = `
    <div class="profile-head">
      <div class="profile-av" id="prof-av">${initials}</div>
      <div class="profile-title">
        <div class="profile-name" id="prof-display-name">${isNew ? 'New student' : ''}</div>
        <div class="profile-sub" id="prof-sub"></div>
        <div class="badges" id="prof-badges">${badges.join('')}</div>
      </div>
      <div class="profile-actions">
        ${!isNew ? `
          <button class="alert-btn-list" id="prof-list-alerts" title="Service alerts for this student (open + resolved history)">
            ${ICONS.bell()} Alerts <span class="alert-badge${(currentAlerts.filter(a=>a.status==='open').length>0)?' has-open':''}">${currentAlerts.filter(a=>a.status==='open').length}</span>
          </button>
          <button class="win-btn-list" id="prof-list-logs" title="Wins, notes, and turnovers for this student">
            ${ICONS.clipboard()} Logs <span class="win-badge${(currentWins.length+currentCoachNotes.length+currentTurnovers.length+currentRepNotes.length+currentIcNotes.length)>0?' has-any':''}">${currentWins.length+currentCoachNotes.length+currentTurnovers.length+currentRepNotes.length+currentIcNotes.length}</span>
          </button>
          <button class="win-btn-list" id="prof-list-videos" title="Open this student's videos from Dropbox">
            ${ICONS.film()} Videos
          </button>
          <button class="win-btn-list" id="prof-list-surveys" title="View Typeform survey responses for this student">
            ${ICONS.fileText()} Surveys <span class="win-badge${(s.surveys_count||0)>0?' has-any':''}">${s.surveys_count||0}</span>
          </button>
          <button class="win-btn-list" id="prof-list-emails" title="Every email this student has received from the system, with open/click status">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg> Emails
          </button>` : ''}
        <button class="profile-save" id="prof-save">${isNew ? 'Create' : 'Save'}</button>
        ${!isNew ? '<button class="profile-delete" id="prof-delete">Delete</button>' : ''}
        <span class="profile-msg" id="prof-msg"></span>
      </div>
    </div>
    ${sectionsHtml}
  `;

  // Populate values (textContent / .value — never innerHTML for user data)
  for (const [, fields] of SECTIONS) {
    for (const f of fields) {
      const el = document.getElementById('f-' + f.k);
      if (!el) continue;
      const v = s[f.k];
      if (f.type === 'checkbox') {
        el.checked = !!v;
      } else if (f.type === 'date') {
        el.value = v ? String(v).slice(0, 10) : '';
      } else if (f.type === 'select') {
        // For coach: ensure saved value exists as option even if not in mentors
        if (f.k === 'coach' && v && Array.isArray(mentors) && !mentors.includes(v)) {
          const opt = document.createElement('option'); opt.value = v; opt.textContent = v;
          el.appendChild(opt);
        }
        el.value = v == null ? '' : String(v);
      } else if (f.type === 'number') {
        el.value = v == null ? '' : String(v);
      } else if (f.type === 'url') {
        el.value = v == null ? '' : String(v);
        _syncUrlOpenButton(el);
      } else {
        el.value = v == null ? '' : String(v);
      }
    }
  }
  // Live-sync the ↗ Open button as the user types / pastes.
  card.querySelectorAll('.field-url-input').forEach(inp => {
    inp.addEventListener('input', () => _syncUrlOpenButton(inp));
  });
  // 🎥 History button next to Last Zoom
  card.querySelectorAll('.zoom-history-btn').forEach(btn => {
    btn.addEventListener('click', () => openZoomHistoryModal());
  });
  // Status default
  const statusEl = document.getElementById('f-status');
  if (statusEl && !STATUSES.includes(statusEl.value)) statusEl.value = 'Active';

  // Header sub-line
  if (!isNew) {
    document.getElementById('prof-display-name').textContent = s.name || '(unnamed)';
    const subParts = [];
    if (s.status)            subParts.push(s.status);
    if (s.coach || s.mentor) subParts.push('Coach: ' + (s.coach || s.mentor));
    if (s.months_count != null) subParts.push(s.months_count + ' months');
    if (s.email)             subParts.push(s.email);
    document.getElementById('prof-sub').textContent = subParts.join(' · ');
  } else {
    document.getElementById('prof-sub').textContent = 'Fill in what you know and click Create.';
  }

  // Live header updates
  document.getElementById('f-name').addEventListener('input', () => {
    const n = document.getElementById('f-name').value || '?';
    document.getElementById('prof-av').textContent = n.split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase() || '?';
    if (!isNew) document.getElementById('prof-display-name').textContent = n;
  });
  // Visual feedback on checkboxes
  card.querySelectorAll('.field-checkbox input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.parentElement.classList.toggle('checked', cb.checked);
    });
  });
  // Auto-fill months_count from first_purchase_date when months is empty
  const fpd = document.getElementById('f-first_purchase_date');
  const mc  = document.getElementById('f-months_count');
  if (fpd && mc) {
    fpd.addEventListener('change', () => {
      if (!fpd.value) return;
      const f = new Date(fpd.value + 'T00:00:00');
      const now = new Date();
      const months = (now.getFullYear() - f.getFullYear()) * 12 + (now.getMonth() - f.getMonth());
      if (months >= 0 && (!mc.value || mc.value === '0')) mc.value = String(months);
    });
  }

  document.getElementById('prof-save')?.addEventListener('click', saveStudent);
  // Track dirty state on any field input/change inside the profile card.
  const dirtyHandler = (e) => {
    const t = e.target;
    if (t && t.id && t.id.startsWith('f-')) profileDirty = true;
  };
  card.addEventListener('input',  dirtyHandler);
  card.addEventListener('change', dirtyHandler);
  if (!isNew) document.getElementById('prof-delete')?.addEventListener('click', deleteStudent);

  // Profile lockdown: disable every base-field input + hide save/delete for
  // anyone who can VIEW the board but isn't a profile editor (admin / coach /
  // ms_ic / delivery_ic). Resigns + Alerts stay editable — they're the rep's
  // primary workflow.
  if (isProfileReadOnly) {
    card.querySelectorAll('input, select, textarea').forEach(el => {
      // Spare resign rows (.resign-* classes) — they need to be editable.
      if (el.closest('table') && (el.classList.contains('resign-date') || el.classList.contains('resign-months') || el.classList.contains('resign-amount') || el.classList.contains('resign-notes'))) return;
      // Field-level inputs are tagged with id="f-*" — that's the entire
      // IDENTITY / ONBOARDING / PAUSES / COACH / ACTIVITY HISTORY /
      // RESOURCES / ADMIN surface.
      if (el.id && el.id.startsWith('f-')) {
        el.disabled = true;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.readOnly = true;
      }
    });
    // Hide Save + Delete; show a small badge instead.
    const saveBtn = document.getElementById('prof-save'); if (saveBtn) saveBtn.style.display = 'none';
    const delBtn  = document.getElementById('prof-delete'); if (delBtn)  delBtn.style.display  = 'none';
    const msg = document.getElementById('prof-msg');
    if (msg && !msg.textContent) {
      msg.textContent = isMsRepOnly ? 'Read-only (MS rep)' : 'Read-only';
      msg.style.color = 'var(--text-dim)';
    }
  }
  if (!isNew) {
    _wirePauses();
    _wireResigns();
    _wireActivityHistory();
    document.getElementById('prof-list-alerts')?.addEventListener('click', openAlertsHistoryModal);
    document.getElementById('prof-list-logs')?.addEventListener('click', openLogsChooserModal);
    document.getElementById('prof-list-videos')?.addEventListener('click', openDropboxVideosModal);
    document.getElementById('prof-list-surveys')?.addEventListener('click', openSurveysHistoryModal);
    document.getElementById('prof-list-emails')?.addEventListener('click', openEmailHistoryModal);
  }
  // Persist collapse state per section title
  card.querySelectorAll('details.profile-section').forEach(d => {
    d.addEventListener('toggle', () => {
      let s; try { s = new Set(JSON.parse(localStorage.getItem('crm-collapsed-sections') || '[]')); } catch { s = new Set(); }
      const t = d.dataset.section;
      if (!t) return;
      if (d.open) s.delete(t); else s.add(t);
      localStorage.setItem('crm-collapsed-sections', JSON.stringify([...s]));
    });
  });
}

// ── Wins ───────────────────────────────────────────────────────
function openAddWinModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('winAddModal')?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const m = document.createElement('div');
  m.id = 'winAddModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;display:flex;align-items:center;gap:8px;">${ICONS.award(16)} Add a win</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Anything worth celebrating: first gig, audition, milestone, breakthrough.</div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Win *</div>
        <textarea class="field-textarea" id="winModalText" placeholder="What did they accomplish?" style="min-height:100px;" required></textarea>
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Date <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <input class="field-input" type="date" id="winModalDate" value="${today}">
      </div>
      <div id="winAddErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="winAddCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="winAddSave" class="profile-save" style="padding:8px 18px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b0c14;">Log win</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('winAddCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  const textEl = document.getElementById('winModalText');
  const dateEl = document.getElementById('winModalDate');
  const errEl  = document.getElementById('winAddErr');
  const saveBtn = document.getElementById('winAddSave');
  textEl.focus();
  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const text = textEl.value.trim();
    if (!text) { errEl.textContent = 'A win description is required.'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-win', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, text, win_date: dateEl.value || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
      // If wins history modal is open, re-render it
      if (document.getElementById('winListModal')) renderWinList();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Log win';
    }
  });
}

function openWinsHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('winListModal')?.remove();
  const m = document.createElement('div');
  m.id = 'winListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.award(16)} Wins for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="winListCount"></div>
        </div>
        <button class="profile-save" id="winListAdd" style="padding:7px 14px;font-size:0.78rem;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b0c14;">+ Add win</button>
        <button id="winListClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="winListBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('winListClose').addEventListener('click', close);
  document.getElementById('winListAdd').addEventListener('click', () => openAddWinModal());
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  renderWinList();
}

function renderWinList() {
  const body = document.getElementById('winListBody');
  const cnt  = document.getElementById('winListCount');
  if (!body) return;
  if (cnt) cnt.textContent = `${currentWins.length} win${currentWins.length !== 1 ? 's' : ''}`;
  if (!currentWins.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No wins yet. Click + Add win to log the first one.</div>';
    return;
  }
  body.innerHTML = currentWins.map(w => {
    const created = w.created_at ? new Date(w.created_at).toLocaleString() : '';
    return `<div class="win-row" data-wid="${w.id}" style="border:1px solid rgba(251,191,36,0.35);border-radius:12px;padding:14px;margin-bottom:12px;background:rgba(251,191,36,0.04);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div class="win-text-cell" style="flex:1;font-weight:600;font-size:0.92rem;line-height:1.5;white-space:pre-wrap;"></div>
        <button class="profile-delete win-del" data-wid="${w.id}" style="padding:4px 10px;font-size:0.72rem;flex-shrink:0;">✕</button>
      </div>
      <div style="font-size:0.7rem;color:#7880a8;">${w.win_date ? '📅 ' + w.win_date + ' · ' : ''}Logged ${created}${w.created_by_email ? ' by ' + w.created_by_email : ''}</div>
    </div>`;
  }).join('');
  // Fill text via textContent so user input can never inject HTML
  for (const w of currentWins) {
    const cell = body.querySelector(`.win-row[data-wid="${w.id}"] .win-text-cell`);
    if (cell) cell.textContent = w.text || '';
  }
  body.querySelectorAll('.win-del').forEach(btn => {
    btn.addEventListener('click', () => deleteWin(Number(btn.dataset.wid)));
  });
}

async function deleteWin(id) {
  if (!confirm('Delete this win?')) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete-win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
    if (document.getElementById('winListModal')) renderWinList();
  } catch (e) { alert('Delete failed: ' + (e.message || e)); }
}

// ── Coach Notes ───────────────────────────────────────────────
function openAddCoachNoteModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('noteAddModal')?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const m = document.createElement('div');
  m.id = 'noteAddModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;display:flex;align-items:center;gap:8px;">${ICONS.fileText(16)} Add a coach note</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Session notes, observations, follow-ups — anything coach-relevant.</div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Note *</div>
        <textarea class="field-textarea" id="noteModalText" placeholder="What happened in the session?" style="min-height:140px;" required></textarea>
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Date <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <input class="field-input" type="date" id="noteModalDate" value="${today}">
      </div>
      <div id="noteAddErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="noteAddCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="noteAddSave" class="profile-save" style="padding:8px 18px;background:linear-gradient(135deg,#a78bfa,#6b9eff);color:#0b0c14;">Save note</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('noteAddCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  const textEl = document.getElementById('noteModalText');
  const dateEl = document.getElementById('noteModalDate');
  const errEl  = document.getElementById('noteAddErr');
  const saveBtn = document.getElementById('noteAddSave');
  textEl.focus();
  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const text = textEl.value.trim();
    if (!text) { errEl.textContent = 'A note is required.'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-coach-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, text, note_date: dateEl.value || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
      if (document.getElementById('noteListModal')) renderCoachNoteList();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Save note';
    }
  });
}

function openCoachNotesHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('noteListModal')?.remove();
  const m = document.createElement('div');
  m.id = 'noteListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.fileText(16)} Coach notes for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="noteListCount"></div>
        </div>
        <button class="profile-save" id="noteListAdd" style="padding:7px 14px;font-size:0.78rem;background:linear-gradient(135deg,#a78bfa,#6b9eff);color:#0b0c14;">+ Add note</button>
        <button id="noteListClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="noteListBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('noteListClose').addEventListener('click', close);
  document.getElementById('noteListAdd').addEventListener('click', () => openAddCoachNoteModal());
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  renderCoachNoteList();
}

function renderCoachNoteList() {
  const body = document.getElementById('noteListBody');
  const cnt  = document.getElementById('noteListCount');
  if (!body) return;
  if (cnt) cnt.textContent = `${currentCoachNotes.length} note${currentCoachNotes.length !== 1 ? 's' : ''}`;
  if (!currentCoachNotes.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No coach notes yet. Click + Add note to log the first one.</div>';
    return;
  }
  // Sort newest first by note_date, then created_at
  const sorted = [...currentCoachNotes].sort((a, b) => {
    const ad = a.note_date || a.created_at || '';
    const bd = b.note_date || b.created_at || '';
    return bd.localeCompare(ad);
  });
  body.innerHTML = sorted.map(n => {
    const created = n.created_at ? new Date(n.created_at).toLocaleString() : '';
    return `<div class="note-row" data-nid="${n.id}" style="border:1px solid rgba(167,139,250,0.35);border-radius:12px;padding:14px;margin-bottom:12px;background:rgba(167,139,250,0.05);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div class="note-text-cell" style="flex:1;font-weight:500;font-size:0.92rem;line-height:1.5;white-space:pre-wrap;"></div>
        <button class="profile-delete note-del" data-nid="${n.id}" style="padding:4px 10px;font-size:0.72rem;flex-shrink:0;">✕</button>
      </div>
      <div style="font-size:0.7rem;color:#7880a8;">${n.note_date ? '📅 ' + n.note_date + ' · ' : ''}Logged ${created}${n.created_by_email ? ' by ' + n.created_by_email : ''}</div>
    </div>`;
  }).join('');
  for (const n of sorted) {
    const cell = body.querySelector(`.note-row[data-nid="${n.id}"] .note-text-cell`);
    if (cell) cell.textContent = n.text || '';
  }
  body.querySelectorAll('.note-del').forEach(btn => {
    btn.addEventListener('click', () => deleteCoachNote(Number(btn.dataset.nid)));
  });
}

async function deleteCoachNote(id) {
  if (!confirm('Delete this note?')) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete-coach-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
    if (document.getElementById('noteListModal')) renderCoachNoteList();
  } catch (e) { alert('Delete failed: ' + (e.message || e)); }
}

// ── Generic note-list UI (used for Rep notes + I/C notes) ────
// kind: 'rep' | 'ic'  → drives endpoint paths + which state array to use.
function _notesGetList(kind) { return kind === 'rep' ? currentRepNotes : currentIcNotes; }
function _notesConfig(kind) {
  return kind === 'rep'
    ? { label: 'Rep notes',  emoji: ICONS.briefcase(16), color: '#60a5fa', addApi: 'add-rep-note',  delApi: 'delete-rep-note',  modalId: 'repNoteListModal',  addModalId: 'repNoteAddModal',  bodyId: 'repNoteListBody', cntId: 'repNoteListCount', addBtnId: 'repNoteListAdd', closeBtnId: 'repNoteListClose' }
    : { label: 'I/C notes',  emoji: ICONS.target(16),    color: '#f472b6', addApi: 'add-ic-note',   delApi: 'delete-ic-note',   modalId: 'icNoteListModal',   addModalId: 'icNoteAddModal',   bodyId: 'icNoteListBody',  cntId: 'icNoteListCount',  addBtnId: 'icNoteListAdd',  closeBtnId: 'icNoteListClose'  };
}
function openRepNotesHistoryModal() { _openNotesHistoryModal('rep'); }
function openIcNotesHistoryModal()  { _openNotesHistoryModal('ic');  }
function _openNotesHistoryModal(kind) {
  if (!currentStudent || !currentStudent.id) return;
  const c = _notesConfig(kind);
  document.getElementById(c.modalId)?.remove();
  const m = document.createElement('div');
  m.id = c.modalId;
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;">${c.emoji} ${c.label} for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="${c.cntId}"></div>
        </div>
        <button class="profile-save" id="${c.addBtnId}" style="padding:7px 14px;font-size:0.78rem;background:${c.color};color:#0b0c14;">+ Add note</button>
        <button id="${c.closeBtnId}" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="${c.bodyId}" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById(c.closeBtnId).addEventListener('click', close);
  document.getElementById(c.addBtnId).addEventListener('click', () => _openAddNoteModal(kind));
  m.addEventListener('click', e => { if (e.target === m) close(); });
  _renderNoteList(kind);
}
function _openAddNoteModal(kind) {
  if (!currentStudent || !currentStudent.id) return;
  const c = _notesConfig(kind);
  document.getElementById(c.addModalId)?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const m = document.createElement('div');
  m.id = c.addModalId;
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">${c.emoji} Add ${c.label.toLowerCase()}</div>
      <div class="field" style="margin-top:14px;margin-bottom:12px;">
        <div class="field-label">Note *</div>
        <textarea class="field-textarea" id="_noteAddText" style="min-height:140px;" required></textarea>
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Date <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <input class="field-input" type="date" id="_noteAddDate" value="${today}">
      </div>
      <div id="_noteAddErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="_noteAddCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="_noteAddSave" class="profile-save" style="padding:8px 18px;background:${c.color};color:#0b0c14;">Save note</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('_noteAddCancel').addEventListener('click', close);
  const txt = document.getElementById('_noteAddText'); txt.focus();
  document.getElementById('_noteAddSave').addEventListener('click', async () => {
    const errEl = document.getElementById('_noteAddErr'); errEl.textContent = '';
    const text = txt.value.trim();
    if (!text) { errEl.textContent = 'A note is required.'; return; }
    try {
      const r = await fetch(STUDENTS_BASE + '?api=' + c.addApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, text, note_date: document.getElementById('_noteAddDate').value || null }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
      if (document.getElementById(c.modalId)) _renderNoteList(kind);
    } catch (e) { errEl.textContent = e.message || 'Failed'; }
  });
}
function _renderNoteList(kind) {
  const c = _notesConfig(kind);
  const list = _notesGetList(kind);
  const body = document.getElementById(c.bodyId);
  const cnt  = document.getElementById(c.cntId);
  if (!body) return;
  if (cnt) cnt.textContent = `${list.length} note${list.length !== 1 ? 's' : ''}`;
  if (!list.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No notes yet. Click + Add note to log the first one.</div>';
    return;
  }
  const sorted = [...list].sort((a, b) => {
    const ad = a.note_date || a.created_at || '';
    const bd = b.note_date || b.created_at || '';
    return bd.localeCompare(ad);
  });
  body.innerHTML = sorted.map(n => {
    const created = n.created_at ? new Date(n.created_at).toLocaleString() : '';
    return `<div class="_note-row" data-nid="${n.id}" style="border:1px solid ${c.color}59;border-radius:12px;padding:14px;margin-bottom:12px;background:${c.color}0d;">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div class="_note-text-cell" style="flex:1;font-weight:500;font-size:0.92rem;line-height:1.5;white-space:pre-wrap;"></div>
        <button class="profile-delete _note-del" data-nid="${n.id}" style="padding:4px 10px;font-size:0.72rem;flex-shrink:0;">✕</button>
      </div>
      <div style="font-size:0.7rem;color:#7880a8;">${n.note_date ? '📅 ' + n.note_date + ' · ' : ''}Logged ${created}${n.created_by_email ? ' by ' + n.created_by_email : ''}</div>
    </div>`;
  }).join('');
  for (const n of sorted) {
    const cell = body.querySelector(`._note-row[data-nid="${n.id}"] ._note-text-cell`);
    if (cell) cell.textContent = n.text || '';
  }
  body.querySelectorAll('._note-del').forEach(btn => {
    btn.addEventListener('click', () => _deleteNote(kind, Number(btn.dataset.nid)));
  });
}
async function _deleteNote(kind, id) {
  if (!confirm('Delete this note?')) return;
  const c = _notesConfig(kind);
  try {
    const r = await fetch(STUDENTS_BASE + '?api=' + c.delApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
    if (document.getElementById(c.modalId)) _renderNoteList(kind);
  } catch (e) { alert('Delete failed: ' + (e.message || e)); }
}

// ── Surveys (Typeform) ────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// ── Email history for the currently-open student ────────────────────────────
async function openEmailHistoryModal() {
  if (!currentStudent?.email) { alert('This student has no email on file, so no history is available.'); return; }
  const EA_BASE = SUPABASE_URL + '/functions/v1/email-automations';
  let rows = [];
  try {
    const r = await fetch(EA_BASE + '?api=history-by-email&email=' + encodeURIComponent(currentStudent.email), { headers: { Authorization: 'Bearer ' + (await supa.auth.getSession()).data.session.access_token } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'load failed');
    rows = j.rows || [];
  } catch (e) { alert('Failed to load email history: ' + (e.message || e)); return; }
  const existing = document.getElementById('emailHistoryModal'); if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'emailHistoryModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML = `
    <div style="background:#0f1120;border:1px solid #1f2438;border-radius:16px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;color:#eaecf8;font-family:inherit;">
      <div style="padding:16px 20px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <h2 style="margin:0;font-size:1rem;font-weight:800;">📧 Email history</h2>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:2px;">${escapeHtml(currentStudent.email)} · last ${rows.length} email${rows.length === 1 ? '' : 's'}</div>
        </div>
        <button data-x style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;">×</button>
      </div>
      <div style="padding:8px 12px;overflow-y:auto;flex:1;">
        ${rows.length ? rows.map(r => {
          const opened = r.opened_at ? `<span title="Opened ${new Date(r.opened_at).toLocaleString()}" style="color:#34d399;font-size:0.74rem;">👁 opened</span>` : '';
          const clicked = r.clicked_at ? `<span title="Clicked ${new Date(r.clicked_at).toLocaleString()}" style="color:#6b9eff;font-size:0.74rem;">🖱 clicked</span>` : '';
          const bounced = r.bounced_at ? `<span title="${escapeHtml(r.bounce_reason || 'bounced')}" style="color:#f87171;font-size:0.74rem;">⚠ bounced</span>` : '';
          return `<div style="padding:10px 10px;border-bottom:1px solid #1f2438;display:flex;align-items:flex-start;gap:10px;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.62rem;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;background:${r.status === 'sent' ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'};color:${r.status === 'sent' ? '#34d399' : '#f87171'};flex-shrink:0;">${r.status}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.88rem;font-weight:600;">${escapeHtml(r.subject || '(no subject)')}</div>
              <div style="font-size:0.72rem;color:#7880a8;margin-top:2px;">from "${escapeHtml(r.automation_name)}"${r.error ? ' · ' + escapeHtml(r.error) : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
              <div style="font-size:0.7rem;color:#7880a8;">${new Date(r.sent_at).toLocaleString()}</div>
              <div style="display:flex;gap:6px;">${opened} ${clicked} ${bounced}</div>
            </div>
          </div>`;
        }).join('') : '<div style="padding:30px;color:#7880a8;text-align:center;font-size:0.86rem;">No emails on file for this student yet.</div>'}
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
}

async function openSurveysHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  const sid = currentStudent.id;
  const sname = currentStudent.name || '(unnamed)';
  // Always re-fetch so we see freshly-added legacy links without a page reload.
  let list = null;
  let loadFailed = false;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=surveys&student_id=' + encodeURIComponent(sid), {
      headers: { Authorization: 'Bearer ' + currentSession.access_token },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); list = j.rows || [];
    if (currentStudent) currentStudent.surveys = list;
  } catch (e) { loadFailed = true; list = []; console.warn('survey list fetch failed', e); }
  document.getElementById('surveysHistoryModal')?.remove();
  const m = document.createElement('div');
  m.id = 'surveysHistoryModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  const cardCss = 'flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #1f2438;border-radius:12px;background:#0f1019;cursor:pointer;text-align:left;color:inherit;font:inherit;transition:border-color 0.12s, background 0.12s;width:100%;margin-bottom:8px;';
  const rowsHtml = (list || []).map(s => {
    const when = s.submitted_at || s.created_at;
    const w = when ? new Date(when).toLocaleString() : '—';
    const src = s.source || 'survey';
    const isLink = !!s.external_url;
    const icon = isLink ? ICONS.link(20) : ICONS.fileText(20);
    const titleLine = isLink
      ? (s.title || s.external_url)
      : `${src} · ${s.qa_count || 0} question${(s.qa_count===1)?'':'s'}`;
    return `<div data-survey-id="${s.id}" data-is-link="${isLink ? '1' : '0'}" data-url="${isLink ? escapeHtml(s.external_url) : ''}" style="${cardCss}">
      <span style="display:inline-flex;align-items:center;color:#a78bfa;">${icon}</span>
      <span style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:0.95rem;${isLink ? 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' : ''}">${escapeHtml(titleLine)}</div>
        <div style="font-size:0.78rem;color:#7880a8;margin-top:2px;">${escapeHtml(w)}${isLink ? ' · legacy link' : ''}</div>
      </span>
      <button data-action="delete-survey" data-survey-id="${s.id}" title="Remove" style="background:transparent;border:none;color:#7880a8;cursor:pointer;padding:6px 8px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;">${ICONS.trash()}</button>
      <span style="color:#7880a8;font-size:1.2rem;">›</span>
    </div>`;
  }).join('');
  const empty = (list && list.length === 0)
    ? `<div style="padding:24px;text-align:center;color:#7880a8;font-size:0.88rem;">No survey responses received yet for this student.${loadFailed ? '<br><em style="opacity:.7;">(failed to load — check console)</em>' : ''}</div>`
    : '';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:560px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.fileText(16)} Surveys — ${escapeHtml(sname)}</div>
        <button id="surveysHistoryClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div style="padding:18px 22px;">
        <button id="addSurveyLinkBtn" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border:1px dashed #3a4060;border-radius:10px;background:#0f1019;cursor:pointer;color:#a3a8c4;font:inherit;font-size:0.88rem;margin-bottom:14px;">
          <span style="display:inline-flex;align-items:center;">${ICONS.plus()}</span>
          <span>Add legacy survey link (Google Doc, etc.)</span>
        </button>
        ${rowsHtml}${empty}
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById('surveysHistoryClose').addEventListener('click', close);
  document.getElementById('addSurveyLinkBtn').addEventListener('click', () => { close(); openAddSurveyLinkModal(); });
  m.addEventListener('click', async (e) => {
    if (e.target === m) return close();
    const delBtn = e.target.closest('[data-action="delete-survey"]');
    if (delBtn) {
      e.stopPropagation();
      const sid = parseInt(delBtn.dataset.surveyId, 10);
      if (!confirm('Remove this survey entry? This cannot be undone.')) return;
      try {
        const r = await fetch(STUDENTS_BASE + '?api=delete-survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
          body: JSON.stringify({ id: sid }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        close(); openSurveysHistoryModal();
      } catch (err) { alert('Delete failed: ' + (err.message || err)); }
      return;
    }
    const card = e.target.closest('[data-survey-id]');
    if (!card) return;
    const id = parseInt(card.dataset.surveyId, 10);
    const isLink = card.dataset.isLink === '1';
    const url = card.dataset.url || '';
    if (isLink && url) {
      // Legacy link: just open in a new tab.
      window.open(url, '_blank', 'noopener');
    } else {
      close();
      openSurveyDocModal(id);
    }
  });
  m.querySelectorAll('[data-survey-id]').forEach(b => {
    b.addEventListener('mouseenter', () => { b.style.borderColor = '#3a4060'; });
    b.addEventListener('mouseleave', () => { b.style.borderColor = '#1f2438'; });
  });
}

function openAddSurveyLinkModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('addSurveyLinkModal')?.remove();
  const m = document.createElement('div');
  m.id = 'addSurveyLinkModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:520px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;">🔗 Add legacy survey link</div>
        <button id="addSurveyLinkClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px;">
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:0.78rem;color:#7880a8;font-weight:600;">URL *</span>
          <input id="addSurveyLinkUrl" type="url" placeholder="https://docs.google.com/document/d/..." style="background:#0f1019;border:1px solid #1f2438;border-radius:8px;padding:10px;color:#eaecf8;font:inherit;font-size:0.9rem;">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:0.78rem;color:#7880a8;font-weight:600;">Label (optional)</span>
          <input id="addSurveyLinkTitle" type="text" placeholder="Old onboarding survey, 9-month review, etc." style="background:#0f1019;border:1px solid #1f2438;border-radius:8px;padding:10px;color:#eaecf8;font:inherit;font-size:0.9rem;">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:0.78rem;color:#7880a8;font-weight:600;">Date submitted (optional)</span>
          <input id="addSurveyLinkDate" type="date" style="background:#0f1019;border:1px solid #1f2438;border-radius:8px;padding:10px;color:#eaecf8;font:inherit;font-size:0.9rem;">
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
          <button id="addSurveyLinkCancel" style="background:#0f1019;border:1px solid #1f2438;color:#a3a8c4;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;font-size:0.85rem;">Cancel</button>
          <button id="addSurveyLinkSave" style="background:linear-gradient(135deg,#34d399,#10b981);border:none;color:#0b0c14;border-radius:8px;padding:8px 16px;cursor:pointer;font:inherit;font-size:0.85rem;font-weight:700;">Save link</button>
        </div>
        <div id="addSurveyLinkErr" style="color:#fb7185;font-size:0.8rem;display:none;"></div>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('addSurveyLinkClose').addEventListener('click', close);
  document.getElementById('addSurveyLinkCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('addSurveyLinkUrl').focus();
  document.getElementById('addSurveyLinkSave').addEventListener('click', async () => {
    const url = document.getElementById('addSurveyLinkUrl').value.trim();
    const title = document.getElementById('addSurveyLinkTitle').value.trim();
    const date = document.getElementById('addSurveyLinkDate').value;
    const err = document.getElementById('addSurveyLinkErr');
    err.style.display = 'none';
    if (!url) { err.textContent = 'URL is required.'; err.style.display = 'block'; return; }
    if (!/^https?:\/\//i.test(url)) { err.textContent = 'URL must start with http:// or https://'; err.style.display = 'block'; return; }
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-survey-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, url, title: title || null, submitted_at: date || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      close(); openSurveysHistoryModal();
    } catch (e) {
      err.textContent = 'Save failed: ' + (e.message || e);
      err.style.display = 'block';
    }
  });
}

async function openSurveyDocModal(surveyId) {
  let row;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=survey&id=' + encodeURIComponent(surveyId), {
      headers: { Authorization: 'Bearer ' + currentSession.access_token },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); row = j.row;
  } catch (e) { alert('Failed to load survey: ' + (e.message || e)); return; }
  if (!row) return;
  const when = row.submitted_at || row.created_at;
  const w = when ? new Date(when).toLocaleString() : '—';
  const qa = Array.isArray(row.content_qa) ? row.content_qa : [];
  const docHtml = qa.map(({ q, a }) => `
    <div style="margin-bottom:18px;">
      <div style="font-weight:700;font-size:0.92rem;color:#eaecf8;margin-bottom:5px;">${escapeHtml(q || '(untitled)')}</div>
      <div style="white-space:pre-wrap;color:#cbd1ee;line-height:1.5;font-size:0.88rem;">${a ? escapeHtml(a) : '<em style="opacity:.5;">(no answer)</em>'}</div>
    </div>`).join('');
  const empty = qa.length === 0 ? '<div style="color:#7880a8;padding:24px;text-align:center;">No questions captured.</div>' : '';
  document.getElementById('surveyDocModal')?.remove();
  const m = document.createElement('div');
  m.id = 'surveyDocModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:780px;width:100%;max-height:90vh;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.fileText(16)} Survey response · ${escapeHtml(row.source || 'survey')}</div>
        <button id="surveyDocClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div style="padding:18px 22px;overflow:auto;flex:1;">
        <div style="font-size:0.78rem;color:#7880a8;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #1f2438;">Submitted: ${escapeHtml(w)}${row.form_id ? ' · form ' + escapeHtml(row.form_id) : ''}</div>
        ${docHtml}${empty}
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById('surveyDocClose').addEventListener('click', close);
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
}

// ── Logs chooser ──────────────────────────────────────────────
// ── Dropbox videos ────────────────────────────────────────────
const DROPBOX_PROXY_BASE = SUPABASE_URL + '/functions/v1/dropbox-proxy';

function _humanSize(b) {
  if (b == null) return '';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/(1024*1024)).toFixed(1) + ' MB';
  return (b/(1024*1024*1024)).toFixed(2) + ' GB';
}

async function openDropboxVideosModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('videosModal')?.remove();

  const m = document.createElement('div');
  m.id = 'videosModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:780px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.film(16)} Dropbox videos for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="videosCount">Loading…</div>
        </div>
        <button id="videosSetUrlBtn" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:8px;padding:6px 10px;font-weight:700;font-size:0.72rem;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;" title="Manually set or change the stored video URL">${ICONS.edit()} Set URL</button>
        <button id="videosClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="videosBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('videosClose').addEventListener('click', close);
  document.getElementById('videosSetUrlBtn').addEventListener('click', async () => {
    const current = currentStudent.video_url || '';
    const next = window.prompt('Paste the student\'s video URL (Dropbox / YouTube / etc.). Leave blank to clear.', current);
    if (next === null) return;                              // cancelled
    const trimmed = (next || '').trim();
    if (trimmed === current) return;                        // no change
    try {
      const r = await fetch(STUDENTS_BASE + '?api=upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ id: currentStudent.id, video_url: trimmed || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      currentStudent.video_url = trimmed || null;
      // Re-render the modal so the new URL appears as a row.
      close();
      openDropboxVideosModal();
    } catch (e) {
      alert('Could not save URL: ' + (e.message || e));
    }
  });

  const email = (currentStudent.email || '').toLowerCase().trim();
  const q = [email, email.replace('@','-'), (currentStudent.name||'').toLowerCase().trim()].filter(Boolean).join(' ');

  const tok = (await supa.auth.getSession()).data.session?.access_token;
  if (!tok) { document.getElementById('videosBody').innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Not authenticated.</div>'; return; }

  let files = [];
  let dropboxFailed = false;
  try {
    const r = await fetch(DROPBOX_PROXY_BASE + '?api=list&q=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + tok } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    files = j.files || [];
    document.getElementById('videosCount').textContent = `${files.length} file${files.length !== 1 ? 's' : ''} matching · ${j.total} in folder`;
  } catch (e) {
    dropboxFailed = true;
    document.getElementById('videosCount').textContent = 'Dropbox lookup failed — showing stored URL fallback if any';
  }

  // Fallback: if Dropbox returned nothing (or errored) but the profile has
  // a stored video_url (e.g. imported from Sheet 2), surface it as a single
  // row so the coach still has a way to play the video.
  const storedUrl = (currentStudent.video_url || '').toString().trim();
  const usingStoredFallback = !files.length && storedUrl;
  if (usingStoredFallback) {
    files = [{
      _stored_url: storedUrl,
      path: '__stored__',
      name: storedUrl.split('/').pop()?.split('?')[0] || 'Stored video',
      size: null,
      server_modified: currentStudent.video_submitted_date ? new Date(currentStudent.video_submitted_date).toISOString() : null,
    }];
    document.getElementById('videosCount').textContent = 'No Dropbox match — using stored video URL from profile';
  }

  const body = document.getElementById('videosBody');
  if (!files.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:0.86rem;">No videos found in Dropbox matching this student\'s email or name, and no stored video URL on the profile.<br><br>Use the <strong>Set URL</strong> button above to paste a URL manually.</div>';
    return;
  }

  body.innerHTML = files.map((f, i) => `
    <div class="video-row" data-idx="${i}" style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--surface2);display:flex;gap:12px;align-items:center;">
      <div style="display:inline-flex;align-items:center;flex-shrink:0;color:#22d3ee;">${f._stored_url ? ICONS.link(22) : ICONS.film(22)}</div>
      <div style="flex:1;min-width:0;">
        <div class="video-name" style="font-weight:700;font-size:0.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
        <div style="font-size:0.7rem;color:#7880a8;margin-top:2px;">${f._stored_url ? 'From profile · ' : ''}${f.size ? _humanSize(f.size) + ' · ' : ''}${f.server_modified ? 'modified ' + new Date(f.server_modified).toLocaleString() : ''}</div>
      </div>
      <button class="video-open" style="background:rgba(52,211,153,0.15);border:1px solid #34d399;color:#34d399;border-radius:8px;padding:6px 12px;font-weight:700;font-size:0.74rem;cursor:pointer;white-space:nowrap;">▶ Open</button>
    </div>`).join('');

  files.forEach((f, i) => {
    const row = body.querySelector(`.video-row[data-idx="${i}"]`);
    if (row) row.querySelector('.video-name').textContent = f.name;
  });

  body.querySelectorAll('.video-open').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.video-row');
      const i = parseInt(row.dataset.idx, 10);
      const f = files[i];
      const name = row.querySelector('.video-name')?.textContent || 'Video';
      btn.disabled = true; btn.textContent = '…';
      // Stored-URL fallback path: convert Dropbox share links to direct
      // streaming URLs (?dl=0 → ?raw=1) so the inline <video> can play them.
      if (f._stored_url) {
        let playable = f._stored_url;
        if (/dropbox\.com\//i.test(playable)) {
          if (/[?&]dl=0\b/.test(playable))      playable = playable.replace(/([?&])dl=0\b/, '$1raw=1');
          else if (/[?&]dl=1\b/.test(playable)) playable = playable.replace(/([?&])dl=1\b/, '$1raw=1');
          else                                  playable += (playable.includes('?') ? '&' : '?') + 'raw=1';
        }
        openInlineVideoPlayer(name, playable, f._stored_url, tok);
        btn.disabled = false; btn.textContent = '▶ Open';
        return;
      }
      const path = f.path;
      try {
        const r = await fetch(DROPBOX_PROXY_BASE + '?api=temp-link&path=' + encodeURIComponent(path), { headers: { Authorization: 'Bearer ' + tok } });
        const j = await r.json();
        if (!r.ok || !j.link) throw new Error(j.error || 'No link returned');
        openInlineVideoPlayer(name, j.link, path, tok);
      } catch (e) {
        alert('Could not open: ' + (e.message || e));
      } finally {
        btn.disabled = false; btn.textContent = '▶ Open';
      }
    });
  });
}

// Inline HTML5 video player. Works inside the PWA on iOS without launching
// Safari. Has a "Share link" button as a fallback in case the inline stream
// can't decode (rare codecs).
function openInlineVideoPlayer(title, src, path, sessionTok) {
  document.getElementById('videoPlayerModal')?.remove();
  const m = document.createElement('div');
  m.id = 'videoPlayerModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10010;display:flex;align-items:center;justify-content:center;padding:0;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column;color:#eaecf8;">
      <div style="padding:14px 18px;display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.6);">
        <div class="vp-title" style="flex:1;min-width:0;font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
        <button id="vpShareBtn" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#eaecf8;border-radius:8px;padding:6px 12px;font-weight:700;font-size:0.74rem;cursor:pointer;white-space:nowrap;">↗ Share link</button>
        <button id="vpClose" style="background:transparent;border:none;color:#eaecf8;font-size:1.6rem;cursor:pointer;padding:0 8px;line-height:1;">×</button>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;background:#000;">
        <video id="vpVideo" controls autoplay playsinline preload="metadata" style="max-width:100%;max-height:100%;outline:none;background:#000;"></video>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('.vp-title').textContent = title || 'Video';
  const v = document.getElementById('vpVideo');
  v.src = src;
  function close() {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {}
    document.removeEventListener('keydown', onKey);
    m.remove();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById('vpClose').addEventListener('click', close);
  // Backdrop click closes (but ignore clicks on the video element).
  m.addEventListener('click', (e) => { if (e.target === m || e.target === m.firstElementChild) close(); });

  // Share-link fallback: for Dropbox paths, request a public share URL.
  // For stored URLs (already a public URL), just open it directly.
  document.getElementById('vpShareBtn').addEventListener('click', async () => {
    if (typeof path === 'string' && /^https?:\/\//i.test(path)) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const r = await fetch(DROPBOX_PROXY_BASE + '?api=share&path=' + encodeURIComponent(path), { headers: { Authorization: 'Bearer ' + sessionTok } });
      const j = await r.json();
      if (!r.ok || !j.link) throw new Error(j.error || 'No link returned');
      window.open(j.link, '_blank', 'noopener,noreferrer');
    } catch (e) { alert('Share failed: ' + (e.message || e)); }
  });
}

// ── Zoom history (auto-recorded from meeting.ended webhook) ─────
function openZoomHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('zoomHistoryModal')?.remove();
  const m = document.createElement('div');
  m.id = 'zoomHistoryModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:680px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.zoom(16)} Zoom history for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="zoomHistCount">Loading…</div>
        </div>
        <button id="zoomHistClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="zoomHistBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById('zoomHistClose').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });

  (async () => {
    const body = document.getElementById('zoomHistBody');
    const cnt = document.getElementById('zoomHistCount');
    try {
      const { data, error } = await supa.rpc('student_zoom_history', { p_student_id: currentStudent.id, p_limit: 500 });
      if (error) throw error;
      const rows = data || [];
      cnt.textContent = `${rows.length} session${rows.length===1?'':'s'} recorded`;
      if (!rows.length) {
        body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No Zoom sessions recorded yet. Sessions are added automatically when a Zoom meeting ends and the student\'s email matches.</div>';
        return;
      }
      body.innerHTML = rows.map(r => {
        const dur = r.participant_duration_seconds ? Math.round(r.participant_duration_seconds/60) + ' min in call' : (r.duration_minutes ? r.duration_minutes + ' min total' : '');
        const start = r.start_time ? new Date(r.start_time).toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit'}) : '';
        return `<div style="border:1px solid rgba(34,211,238,0.30);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:rgba(34,211,238,0.05);display:flex;align-items:center;gap:14px;">
          <div style="min-width:110px;">
            <div style="font-weight:700;color:#22d3ee;font-size:0.92rem;">${(r.attended_on||'').replace(/[<>]/g,'')}</div>
            <div style="font-size:0.7rem;color:#7880a8;">${start}</div>
          </div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9rem;">${(r.topic||'(no topic)').replace(/[<>]/g,'')}</div>
            <div style="font-size:0.72rem;color:#7880a8;margin-top:2px;">${dur}${r.zoom_meeting_id ? ' · Meeting #' + (r.zoom_meeting_id+'').replace(/[<>]/g,'') : ''}</div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      body.innerHTML = '<div style="padding:32px;text-align:center;color:#f87171;font-size:0.86rem;">Failed to load history: ' + ((e.message||String(e)).replace(/[<>]/g,'')) + '</div>';
    }
  })();
}

function openLogsChooserModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('logsChooserModal')?.remove();
  const m = document.createElement('div');
  m.id = 'logsChooserModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  const cardCss = 'flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:18px;border:1px solid #1f2438;border-radius:14px;background:#0f1019;cursor:pointer;text-align:left;color:inherit;font:inherit;transition:border-color 0.12s, background 0.12s;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.clipboard(16)} Logs for ${currentStudent.name || ''}</div>
        <button id="logsChooserClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div style="padding:18px 22px;display:flex;flex-direction:column;gap:12px;">
        <button data-act="wins" style="${cardCss}">
          <div style="font-size:1.0rem;font-weight:700;display:flex;align-items:center;gap:10px;">${ICONS.award()} Wins <span style="background:${currentWins.length?'#fbbf24':'#1f2438'};color:${currentWins.length?'#0b0c14':'#7880a8'};border-radius:999px;padding:1px 8px;font-size:0.7rem;font-weight:800;">${currentWins.length}</span></div>
          <div style="font-size:0.78rem;color:#7880a8;">Milestones, auditions, breakthroughs.</div>
        </button>
        <button data-act="notes" style="${cardCss}">
          <div style="font-size:1.0rem;font-weight:700;display:flex;align-items:center;gap:10px;">${ICONS.fileText()} Coach notes <span style="background:${currentCoachNotes.length?'#a78bfa':'#1f2438'};color:${currentCoachNotes.length?'#0b0c14':'#7880a8'};border-radius:999px;padding:1px 8px;font-size:0.7rem;font-weight:800;">${currentCoachNotes.length}</span></div>
          <div style="font-size:0.78rem;color:#7880a8;">Session notes, observations, follow-ups.</div>
        </button>
        <button data-act="repnotes" style="${cardCss}">
          <div style="font-size:1.0rem;font-weight:700;display:flex;align-items:center;gap:10px;">${ICONS.briefcase()} Rep notes <span style="background:${currentRepNotes.length?'#60a5fa':'#1f2438'};color:${currentRepNotes.length?'#0b0c14':'#7880a8'};border-radius:999px;padding:1px 8px;font-size:0.7rem;font-weight:800;">${currentRepNotes.length}</span></div>
          <div style="font-size:0.78rem;color:#7880a8;">Notes from REGs / sales reps about this student.</div>
        </button>
        <button data-act="icnotes" style="${cardCss}">
          <div style="font-size:1.0rem;font-weight:700;display:flex;align-items:center;gap:10px;">${ICONS.target()} I/C notes <span style="background:${currentIcNotes.length?'#f472b6':'#1f2438'};color:${currentIcNotes.length?'#0b0c14':'#7880a8'};border-radius:999px;padding:1px 8px;font-size:0.7rem;font-weight:800;">${currentIcNotes.length}</span></div>
          <div style="font-size:0.78rem;color:#7880a8;">Initial-call notes — onboarding, intent, fit.</div>
        </button>
        <button data-act="turnovers" style="${cardCss}">
          <div style="font-size:1.0rem;font-weight:700;display:flex;align-items:center;gap:10px;">${ICONS.refresh()} Turnovers <span style="background:${currentTurnovers.length?'#34d399':'#1f2438'};color:${currentTurnovers.length?'#0b0c14':'#7880a8'};border-radius:999px;padding:1px 8px;font-size:0.7rem;font-weight:800;">${currentTurnovers.length}</span></div>
          <div style="font-size:0.78rem;color:#7880a8;">Hand-offs to a rep — log the rep, note, and outcome.</div>
        </button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.getElementById('logsChooserClose').addEventListener('click', close);
  m.addEventListener('click', (e) => {
    if (e.target === m) return close();
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    btn.style.borderColor = '#34d399';
    close();
    if (act === 'wins')          openWinsHistoryModal();
    else if (act === 'notes')    openCoachNotesHistoryModal();
    else if (act === 'repnotes') openRepNotesHistoryModal();
    else if (act === 'icnotes')  openIcNotesHistoryModal();
    else if (act === 'turnovers') openTurnoversHistoryModal();
  });
  // Hover-style fallback inline
  m.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('mouseenter', () => { b.style.borderColor = '#3a4060'; b.style.background = '#13141f'; });
    b.addEventListener('mouseleave', () => { b.style.borderColor = '#1f2438'; b.style.background = '#0f1019'; });
  });
}

// ── Turnovers ─────────────────────────────────────────────────
function openAddTurnoverModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('turnAddModal')?.remove();
  const today = new Date().toISOString().slice(0, 10);
  const datalistId = 'turnRepList';
  const optsHtml = (mentors || []).map(m => `<option value="${String(m).replace(/"/g,'&quot;')}"></option>`).join('');
  const m = document.createElement('div');
  m.id = 'turnAddModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;display:flex;align-items:center;gap:8px;">${ICONS.refresh(16)} Turnover sale to a rep</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Hand this student off to a rep. Pick from the list or type a new name.</div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Rep *</div>
        <input class="field-input" id="turnModalRep" list="${datalistId}" placeholder="Pick or type a rep name" required>
        <datalist id="${datalistId}">${optsHtml}</datalist>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Note <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <textarea class="field-textarea" id="turnModalNote" placeholder="Why is this being turned over? Context for the rep." style="min-height:100px;"></textarea>
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Date <span style="text-transform:none;font-weight:500;color:var(--text-dim);">(optional)</span></div>
        <input class="field-input" type="date" id="turnModalDate" value="${today}">
      </div>
      <div id="turnAddErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="turnAddCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="turnAddSave" class="profile-save" style="padding:8px 18px;background:linear-gradient(135deg,#34d399,#10b981);color:#0b0c14;">Log turnover</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('turnAddCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  const repEl  = document.getElementById('turnModalRep');
  const noteEl = document.getElementById('turnModalNote');
  const dateEl = document.getElementById('turnModalDate');
  const errEl  = document.getElementById('turnAddErr');
  const saveBtn = document.getElementById('turnAddSave');
  repEl.focus();
  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const rep_name = repEl.value.trim();
    if (!rep_name) { errEl.textContent = 'A rep name is required.'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-turnover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, rep_name, note: noteEl.value, turnover_date: dateEl.value || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
      if (document.getElementById('turnListModal')) renderTurnoverList();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Log turnover';
    }
  });
}

function openTurnoversHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('turnListModal')?.remove();
  const m = document.createElement('div');
  m.id = 'turnListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.refresh(16)} Turnovers for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;" id="turnListCount"></div>
        </div>
        <button class="profile-save" id="turnListAdd" style="padding:7px 14px;font-size:0.78rem;background:linear-gradient(135deg,#34d399,#10b981);color:#0b0c14;">+ Add turnover</button>
        <button id="turnListClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="turnListBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('turnListClose').addEventListener('click', close);
  document.getElementById('turnListAdd').addEventListener('click', () => openAddTurnoverModal());
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  renderTurnoverList();
}

function renderTurnoverList() {
  const body = document.getElementById('turnListBody');
  const cnt  = document.getElementById('turnListCount');
  if (!body) return;
  if (cnt) cnt.textContent = `${currentTurnovers.length} turnover${currentTurnovers.length !== 1 ? 's' : ''}`;
  if (!currentTurnovers.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No turnovers yet. Click + Add turnover to log the first one.</div>';
    return;
  }
  const sorted = [...currentTurnovers].sort((a, b) => {
    const ad = a.turnover_date || a.created_at || '';
    const bd = b.turnover_date || b.created_at || '';
    return bd.localeCompare(ad);
  });
  body.innerHTML = sorted.map(t => {
    const created = t.created_at ? new Date(t.created_at).toLocaleString() : '';
    const hasResult = !!(t.result && String(t.result).trim());
    const resultMeta = hasResult && t.result_at
      ? `<div style="font-size:0.68rem;color:#7880a8;margin-top:4px;">Result added ${new Date(t.result_at).toLocaleString()}${t.result_by_email ? ' by ' + t.result_by_email : ''}</div>`
      : '';
    const resultBlock = hasResult
      ? `<div style="margin-top:10px;padding:10px 12px;border-left:3px solid #34d399;background:rgba(52,211,153,0.08);border-radius:6px;">
           <div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#34d399;margin-bottom:4px;">Result</div>
           <div class="turn-result-cell" style="font-size:0.86rem;color:#eaecf8;line-height:1.5;white-space:pre-wrap;"></div>
           ${resultMeta}
           <div style="margin-top:8px;display:flex;gap:8px;">
             <button class="turn-result-edit" data-tid="${t.id}" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:7px;padding:3px 10px;font-weight:600;font-size:0.72rem;cursor:pointer;">Edit result</button>
           </div>
         </div>`
      : `<div style="margin-top:10px;">
           <button class="turn-result-add" data-tid="${t.id}" style="background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:8px;padding:5px 12px;font-weight:700;font-size:0.74rem;cursor:pointer;">+ Add result</button>
         </div>`;
    return `<div class="turn-row" data-tid="${t.id}" style="border:1px solid rgba(52,211,153,0.35);border-radius:12px;padding:14px;margin-bottom:12px;background:rgba(52,211,153,0.05);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.92rem;">→ <span class="turn-rep-cell"></span></div>
          <div class="turn-note-cell" style="margin-top:4px;font-size:0.86rem;color:#c2c8e0;line-height:1.5;white-space:pre-wrap;"></div>
        </div>
        <button class="profile-delete turn-del" data-tid="${t.id}" style="padding:4px 10px;font-size:0.72rem;flex-shrink:0;">✕</button>
      </div>
      <div style="font-size:0.7rem;color:#7880a8;">${t.turnover_date ? '📅 ' + t.turnover_date + ' · ' : ''}Logged ${created}${t.created_by_email ? ' by ' + t.created_by_email : ''}</div>
      ${resultBlock}
    </div>`;
  }).join('');
  for (const t of sorted) {
    const row = body.querySelector(`.turn-row[data-tid="${t.id}"]`);
    if (!row) continue;
    const repCell = row.querySelector('.turn-rep-cell');
    if (repCell) repCell.textContent = t.rep_name || '';
    const noteCell = row.querySelector('.turn-note-cell');
    if (noteCell) noteCell.textContent = t.note || '';
    const resultCell = row.querySelector('.turn-result-cell');
    if (resultCell) resultCell.textContent = t.result || '';
  }
  body.querySelectorAll('.turn-del').forEach(btn => {
    btn.addEventListener('click', () => deleteTurnover(Number(btn.dataset.tid)));
  });
  body.querySelectorAll('.turn-result-add, .turn-result-edit').forEach(btn => {
    btn.addEventListener('click', () => openTurnoverResultModal(Number(btn.dataset.tid)));
  });
}

function openTurnoverResultModal(turnoverId) {
  const t = currentTurnovers.find(x => Number(x.id) === Number(turnoverId));
  if (!t) return;
  document.getElementById('turnResultModal')?.remove();
  const m = document.createElement('div');
  m.id = 'turnResultModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10006;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;">${t.result ? 'Edit' : 'Add'} turnover result</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:14px;">Hand-off to <strong style="color:#eaecf8;" id="trResultRep"></strong> — what was the outcome?</div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Result *</div>
        <textarea class="field-textarea" id="trResultText" placeholder="Closed / not interested / scheduling / refunded / etc." style="min-height:120px;"></textarea>
      </div>
      <div id="trResultErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
        ${t.result ? '<button id="trResultClear" style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.4);color:#f87171;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;margin-right:auto;">Clear result</button>' : ''}
        <button id="trResultCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="trResultSave" class="profile-save" style="padding:8px 18px;background:linear-gradient(135deg,#34d399,#10b981);color:#0b0c14;">Save result</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  document.getElementById('trResultRep').textContent = t.rep_name || '';
  const txt = document.getElementById('trResultText');
  txt.value = t.result || '';
  txt.focus();
  function close() { document.removeEventListener('keydown', onKey); m.remove(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('trResultCancel').addEventListener('click', close);
  document.getElementById('trResultSave').addEventListener('click', async () => {
    const errEl = document.getElementById('trResultErr');
    errEl.textContent = '';
    const result = txt.value.trim();
    if (!result) { errEl.textContent = 'A result is required (or use Clear result).'; return; }
    await saveTurnoverResult(turnoverId, result, close, errEl);
  });
  if (t.result) {
    document.getElementById('trResultClear').addEventListener('click', async () => {
      if (!confirm('Clear this turnover result?')) return;
      await saveTurnoverResult(turnoverId, '', close, document.getElementById('trResultErr'));
    });
  }
}

async function saveTurnoverResult(id, result, onSuccess, errEl) {
  try {
    const r = await fetch(STUDENTS_BASE + '?api=set-turnover-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id, result }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    onSuccess();
    await openStudent(currentStudent.id);
    if (document.getElementById('turnListModal')) renderTurnoverList();
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Failed';
  }
}

async function deleteTurnover(id) {
  if (!confirm('Delete this turnover?')) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete-turnover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    await openStudent(currentStudent.id);
    await loadStudents();
    if (document.getElementById('turnListModal')) renderTurnoverList();
  } catch (e) { alert('Delete failed: ' + (e.message || e)); }
}

// ── Alerts ─────────────────────────────────────────────────────
function openAddAlertModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('alertAddModal')?.remove();
  const m = document.createElement('div');
  m.id = 'alertAddModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;padding:24px 26px;max-width:460px;width:100%;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);">
      <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px;display:flex;align-items:center;gap:8px;">${ICONS.alertTri(16)} Open a service alert</div>
      <div style="font-size:0.78rem;color:#7880a8;margin-bottom:18px;">Track an unresolved issue for this student. Resolve it later with a note explaining what was done.</div>
      <div class="field" style="margin-bottom:12px;">
        <div class="field-label">Title *</div>
        <input class="field-input" type="text" id="alertModalTitle" placeholder="e.g. Refund pending, missed welcome call…" required>
      </div>
      <div class="field" style="margin-bottom:18px;">
        <div class="field-label">Details</div>
        <textarea class="field-textarea" id="alertModalDesc" placeholder="Context, history, what needs to happen…" style="min-height:110px;"></textarea>
      </div>
      <div id="alertAddErr" style="color:var(--red);font-size:0.78rem;min-height:1em;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="alertAddCancel" style="background:transparent;border:1px solid #1f2438;color:#7880a8;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="alertAddSave" class="alert-btn-add" style="padding:8px 18px;">Open alert</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('alertAddCancel').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  const titleEl = document.getElementById('alertModalTitle');
  const descEl  = document.getElementById('alertModalDesc');
  const errEl   = document.getElementById('alertAddErr');
  const saveBtn = document.getElementById('alertAddSave');
  titleEl.focus();
  saveBtn.addEventListener('click', async () => {
    errEl.textContent = '';
    const title = titleEl.value.trim();
    if (!title) { errEl.textContent = 'Title is required.'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Opening…';
    try {
      const r = await fetch(STUDENTS_BASE + '?api=add-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ studentId: currentStudent.id, title, description: descEl.value.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      close();
      await openStudent(currentStudent.id);
      await loadStudents();
    } catch (e) {
      errEl.textContent = e.message || 'Failed';
      saveBtn.disabled = false; saveBtn.textContent = 'Open alert';
    }
  });
}

function openAlertsHistoryModal() {
  if (!currentStudent || !currentStudent.id) return;
  document.getElementById('alertListModal')?.remove();
  const m = document.createElement('div');
  m.id = 'alertListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(8,9,18,0.78);backdrop-filter:blur(8px);z-index:10005;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;';
  const openCount     = currentAlerts.filter(a => a.status === 'open').length;
  const resolvedCount = currentAlerts.length - openCount;
  m.innerHTML = `
    <div style="background:#13141f;border:1px solid #1f2438;border-radius:18px;max-width:640px;width:100%;max-height:85vh;display:flex;flex-direction:column;color:#eaecf8;box-shadow:0 24px 60px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid #1f2438;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:1.0rem;font-weight:800;letter-spacing:-0.02em;display:flex;align-items:center;gap:8px;">${ICONS.bell(16)} Alerts for ${currentStudent.name || ''}</div>
          <div style="font-size:0.74rem;color:#7880a8;margin-top:3px;">${openCount} open · ${resolvedCount} resolved</div>
        </div>
        <button class="alert-btn-add" id="alertListAdd" style="padding:7px 14px;font-size:0.78rem;">+ Open alert</button>
        <button id="alertListClose" style="background:transparent;border:none;color:#7880a8;font-size:1.5rem;cursor:pointer;padding:0 8px;">×</button>
      </div>
      <div id="alertListBody" style="flex:1;overflow-y:auto;padding:14px 22px;"></div>
    </div>`;
  document.body.appendChild(m);
  function close() { m.remove(); }
  document.getElementById('alertListClose').addEventListener('click', close);
  document.getElementById('alertListAdd').addEventListener('click', () => { close(); openAddAlertModal(); });
  m.addEventListener('click', e => { if (e.target === m) close(); });
  function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
  document.addEventListener('keydown', onKey);
  renderAlertList();
}

function renderAlertList() {
  const body = document.getElementById('alertListBody');
  if (!body) return;
  if (!currentAlerts.length) {
    body.innerHTML = '<div style="padding:32px;text-align:center;color:#7880a8;font-size:0.86rem;">No alerts yet.</div>';
    return;
  }
  // Open first, then resolved by most-recent
  const sorted = [...currentAlerts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  body.innerHTML = sorted.map(a => {
    const isOpen = a.status === 'open';
    const created = a.created_at ? new Date(a.created_at).toLocaleString() : '';
    const resolved = a.resolved_at ? new Date(a.resolved_at).toLocaleString() : '';
    return `
      <div class="alert-row" data-aid="${a.id}" style="border:1px solid ${isOpen ? 'rgba(248,113,113,0.35)' : '#1f2438'};border-radius:12px;padding:14px;margin-bottom:12px;background:${isOpen ? 'rgba(248,113,113,0.04)' : 'transparent'};">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
          <div style="font-weight:800;font-size:0.92rem;flex:1;" class="alert-title-cell"></div>
          <span class="badge ${isOpen ? 'exp' : 'ver'}" style="font-size:0.6rem;">${isOpen ? '⚠ OPEN' : '✓ RESOLVED'}</span>
        </div>
        ${a.description ? `<div class="alert-desc-cell" style="color:#cbd1ee;font-size:0.84rem;line-height:1.5;margin-bottom:8px;white-space:pre-wrap;"></div>` : ''}
        <div style="font-size:0.7rem;color:#7880a8;">Opened ${created}${a.created_by_email ? ' by ' + a.created_by_email : ''}</div>
        ${!isOpen ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid #1f2438;">
            <div style="font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#34d399;margin-bottom:4px;">Resolution</div>
            <div class="alert-resnote-cell" style="color:#cbd1ee;font-size:0.84rem;line-height:1.5;white-space:pre-wrap;"></div>
            <div style="font-size:0.7rem;color:#7880a8;margin-top:6px;">Resolved ${resolved}${a.resolved_by_email ? ' by ' + a.resolved_by_email : ''}</div>
          </div>` : ''}
        ${isOpen ? `
          <div style="margin-top:12px;display:flex;gap:8px;align-items:flex-start;flex-direction:column;">
            <textarea class="field-textarea alert-resolve-note" data-aid="${a.id}" placeholder="Explain how this was resolved (required)…" style="min-height:60px;width:100%;"></textarea>
            <div style="display:flex;gap:8px;width:100%;">
              <button class="profile-save alert-resolve-btn" data-aid="${a.id}" style="padding:7px 14px;font-size:0.78rem;">✓ Resolve</button>
            </div>
          </div>` : ''}
      </div>`;
  }).join('');
  // Fill user-supplied content via textContent to dodge any HTML in title/desc/note
  for (const a of sorted) {
    const row = body.querySelector(`.alert-row[data-aid="${a.id}"]`); if (!row) continue;
    row.querySelector('.alert-title-cell').textContent = a.title || '';
    const dc = row.querySelector('.alert-desc-cell');
    if (dc) dc.textContent = a.description || '';
    const rc = row.querySelector('.alert-resnote-cell');
    if (rc) rc.textContent = a.resolution_note || '';
  }
  body.querySelectorAll('.alert-resolve-btn').forEach(btn => {
    btn.addEventListener('click', () => resolveAlert(Number(btn.dataset.aid)));
  });
}

async function resolveAlert(id) {
  const note = (document.querySelector(`.alert-resolve-note[data-aid="${id}"]`)?.value || '').trim();
  if (!note) { alert('A resolution note is required.'); return; }
  try {
    const r = await fetch(STUDENTS_BASE + '?api=resolve-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id, resolution_note: note }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    // Reload student so currentAlerts refreshes, then re-render the modal contents
    await openStudent(currentStudent.id);
    await loadStudents();
    if (document.getElementById('alertListModal')) renderAlertList();
  } catch (e) {
    alert('Failed to resolve: ' + (e.message || e));
  }
}

async function saveStudent() {
  const btn = document.getElementById('prof-save');
  const msg = document.getElementById('prof-msg');
  msg.textContent = ''; msg.style.color = '';

  const payload = { id: currentStudent.id || undefined };
  for (const [, fields] of SECTIONS) {
    for (const f of fields) {
      const el = document.getElementById('f-' + f.k);
      if (!el) continue;
      if (f.type === 'checkbox') {
        payload[f.k] = el.checked;
      } else if (f.type === 'number') {
        const v = el.value.trim();
        payload[f.k] = v === '' ? null : Number(v);
      } else {
        const v = (el.value || '').trim();
        payload[f.k] = v === '' ? null : v;
      }
    }
  }
  if (!payload.name) {
    msg.textContent = 'Name is required'; msg.style.color = 'var(--red)';
    return false;
  }
  btn.disabled = true; btn.textContent = 'Saving…';
  let ok = false;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    currentStudent.id = j.id;
    profileDirty = false;
    msg.textContent = '✓ Saved'; msg.style.color = 'var(--green)';
    await loadStudents();
    await openStudent(j.id);
    ok = true;
  } catch (e) {
    msg.textContent = e.message || 'Failed';
    msg.style.color = 'var(--red)';
  } finally {
    btn.disabled = false;
    btn.textContent = currentStudent && currentStudent.id ? 'Save' : 'Create';
    setTimeout(() => { msg.textContent = ''; }, 4000);
  }
  return ok;
}

async function deleteStudent() {
  if (!currentStudent || !currentStudent.id) return;
  if (!confirm(`Delete ${currentStudent.name}? This can't be undone.`)) return;
  try {
    const r = await fetch(STUDENTS_BASE + '?api=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
      body: JSON.stringify({ id: currentStudent.id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed');
    currentStudent = null;
    await loadStudents();
    renderProfile();
  } catch (e) {
    alert('Delete failed: ' + (e.message || e));
  }
}

// ── Picker dropdown ────────────────────────────────────────────
document.getElementById('navDropdownBtn').addEventListener('click', e => {
  e.stopPropagation();
  const m = document.getElementById('navDropMenu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', () => {
  const m = document.getElementById('navDropMenu');
  if (m) m.style.display = 'none';
});

setState('loading');
initAuth().catch(e => { console.error('Unhandled auth error:', e); setState('login'); });
