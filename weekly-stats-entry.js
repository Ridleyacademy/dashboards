// Weekly Stats · Data Entry page.
// One-stop form for filling in the week (or month) of manual metrics so
// the team never needs to touch a Google Sheet again. Backs onto the same
// `weekly-stats` edge function the analytics page uses.

const SUPABASE_URL      = 'https://pojqljrhhtnigyrtzdzz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos';
const API_BASE = SUPABASE_URL + '/functions/v1/weekly-stats';

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
});

// ── State ───────────────────────────────────────────────────────────
let currentSession = null;
let capabilities   = { is_admin: false, can_view: false, can_edit: false };
let catalog        = [];    // metric definitions
let snapshot       = [];    // { metric_key, label, division, unit, current, previous }
let dirty          = new Map();  // metric_key → string value (raw input)
let activePeriod   = 'weekly';
let activeStart    = '';

// Division ordering + display labels for the form.
const DIVISION_GROUPS = [
  { key: 'D2',       label: 'D2 · Phone Sales' },
  { key: 'D3',       label: 'D3 · Recurring & Refunds' },
  { key: 'D4',       label: 'D4 · Mentorship Delivery' },
  { key: 'D5',       label: 'D5 · Masterclass' },
  { key: 'monthly',  label: 'Monthly · Staff Meeting roll-up' },
];

// ── Helpers ─────────────────────────────────────────────────────────
const fmtMoney = (v) => v == null || v === '' ? '—' : '$' + Math.round(Number(v)).toLocaleString();
const fmtCount = (v) => v == null || v === '' ? '—' : Number(v).toLocaleString();
const fmtVal   = (v, unit) => unit === 'usd' ? fmtMoney(v) : fmtCount(v);
function isoDate(d) { return d.toISOString().slice(0, 10); }
function lastMondayUTC() {
  const d = new Date();
  d.setUTCHours(0,0,0,0);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return isoDate(d);
}
function thisMonthStartUTC() {
  const d = new Date();
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}
function shiftPeriod(iso, type, weeks) {
  const d = new Date(iso + 'T00:00:00Z');
  if (type === 'weekly') d.setUTCDate(d.getUTCDate() + weeks * 7);
  else                   d.setUTCMonth(d.getUTCMonth() + weeks);
  return isoDate(d);
}
function snapToBoundary(iso, type) {
  if (!iso) return iso;
  const d = new Date(iso + 'T00:00:00Z');
  if (type === 'monthly') return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return isoDate(d);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function setState(s) { document.body.dataset.state = s; }
function setBanner(msg, kind) {
  const el = document.getElementById('banners');
  if (!msg) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner banner-${kind || 'info'}">${escapeHtml(msg)}</div>`;
}

// ── Auth ────────────────────────────────────────────────────────────
async function initAuth() {
  const timeout = setTimeout(() => setState('login'), 8000);
  try {
    const { data: { session } } = await supa.auth.getSession();
    clearTimeout(timeout);
    if (session) { await onAuthed(session); return; }
    setState('login');
  } catch (_) { clearTimeout(timeout); setState('login'); }
  supa.auth.onAuthStateChange(async (_e, sess) => {
    if (sess) await onAuthed(sess); else setState('login');
  });
}

async function onAuthed(session) {
  currentSession = session;
  const email = session.user.email || '';
  document.getElementById('userEmail').textContent = email;
  document.getElementById('userAvatar').textContent = (email[0] || 'U').toUpperCase();

  if (!window.RidleyPerms.canOpen('weekly-stats.html', session.user)) {
    setState('denied');
    return;
  }
  setState('dashboard');

  // Default period: most recent Monday for weekly.
  activeStart = lastMondayUTC();
  document.getElementById('periodStart').value = activeStart;
  syncPeriodHint();

  await fetchCatalog();
  if (!capabilities.can_edit) {
    setBanner('You have view-only access — values are read-only. Ask an admin to grant weekly_stats.edit if you need to enter values.', 'warn');
  }
  await loadSnapshot();
}

// ── API ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const { data: { session: fresh } } = await supa.auth.getSession();
  if (!fresh) { setState('login'); throw new Error('No session'); }
  currentSession = fresh;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + fresh.access_token,
    ...(opts.headers || {}),
  };
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const text = await res.text();
  let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text }; }
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
  return j;
}

async function fetchCatalog() {
  const j = await apiFetch('?api=catalog');
  catalog = j.metrics || [];
  capabilities = j.capabilities || capabilities;
}

async function loadSnapshot() {
  setStatus('Loading…', '');
  try {
    const j = await apiFetch(`?api=snapshot&period_type=${activePeriod}&period_start=${activeStart}`);
    snapshot = j.metrics || [];
    dirty.clear();
    renderForm();
    setStatus('Idle', '');
    syncSaveBtn();
  } catch (e) {
    setBanner('Failed to load: ' + (e.message || e), 'error');
    setStatus('Load failed', 'error');
  }
}

// ── Render ──────────────────────────────────────────────────────────
function renderForm() {
  // Filter to visible metrics for the active period:
  //   weekly  → everything except 'monthly'
  //   monthly → only 'monthly'
  const visible = catalog.filter(m => activePeriod === 'monthly' ? m.division === 'monthly' : m.division !== 'monthly');
  const bySnap  = new Map(snapshot.map(s => [s.metric_key, s]));

  const area = document.getElementById('formArea');
  if (!visible.length) { area.innerHTML = `<div style="color:var(--text-dim);font-size:0.86rem;padding:30px;text-align:center;">No metrics for this period type.</div>`; return; }

  const html = [];
  for (const grp of DIVISION_GROUPS) {
    const inGroup = visible.filter(m => m.division === grp.key);
    if (!inGroup.length) continue;
    html.push(`<div class="sec-label"><span class="sec-label-text">${escapeHtml(grp.label)}</span><div class="sec-label-line"></div></div>`);
    html.push(`<div class="group-card">`);
    for (const m of inGroup) {
      const snap = bySnap.get(m.key) || { current: null, previous: null };
      const isManual = m.source === 'manual';
      const readonly = !isManual || !capabilities.can_edit;
      const currentRaw = snap.current == null ? '' : String(snap.current);
      const prevDisplay = fmtVal(snap.previous, m.unit);
      html.push(`
        <div class="entry-row" data-key="${escapeHtml(m.key)}">
          <div class="entry-label">
            <div class="entry-label-text"><span class="src-tag ${isManual ? 'src-manual' : 'src-derived'}">${isManual ? 'manual' : 'auto'}</span>${escapeHtml(m.label)}</div>
            <div class="entry-meta">Prior ${activePeriod === 'weekly' ? 'week' : 'month'}: ${prevDisplay}${m.unit === 'usd' ? ' · USD' : ''}${isManual ? '' : ' · auto-computed, edit upstream'}</div>
          </div>
          <input type="number" step="${m.unit === 'usd' ? '0.01' : '1'}" class="entry-input"
            value="${escapeHtml(currentRaw)}"
            data-orig="${escapeHtml(currentRaw)}"
            ${readonly ? 'readonly' : ''}
            placeholder="${m.unit === 'usd' ? '$' : ''}—">
          <div class="save-cell">
            ${isManual && capabilities.can_edit ? `<button class="row-save-btn" data-row-save="${escapeHtml(m.key)}">Save</button>` : ''}
          </div>
        </div>
      `);
    }
    html.push(`</div>`);
  }
  area.innerHTML = html.join('');

  // Wire input change tracking + per-row save.
  area.querySelectorAll('.entry-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const row = inp.closest('.entry-row');
      const key = row.dataset.key;
      const orig = inp.dataset.orig || '';
      const cur  = inp.value.trim();
      inp.classList.remove('saved','error');
      if (cur === orig) {
        dirty.delete(key);
        inp.classList.remove('dirty');
        row.querySelector('.row-save-btn')?.classList.remove('active');
      } else {
        dirty.set(key, cur);
        inp.classList.add('dirty');
        row.querySelector('.row-save-btn')?.classList.add('active');
      }
      syncSaveBtn();
    });
  });
  area.querySelectorAll('[data-row-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.rowSave;
      if (!dirty.has(key)) return;
      await saveRows([key]);
    });
  });
}

function syncSaveBtn() {
  const btn = document.getElementById('saveAllBtn');
  const n = dirty.size;
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'Save all changes' : `Save all (${n} change${n === 1 ? '' : 's'})`;
  const status = document.getElementById('saveStatus');
  if (n === 0) { status.textContent = 'No unsaved changes'; status.className = 'status'; }
  else         { status.textContent = `${n} unsaved change${n === 1 ? '' : 's'}`; status.className = 'status dirty'; }
}

function setStatus(txt, cls) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = txt;
  el.className = 'status' + (cls ? ' ' + cls : '');
}

// ── Save ────────────────────────────────────────────────────────────
async function saveRows(keys) {
  if (!keys.length) return;
  setStatus(`Saving ${keys.length}…`, '');
  // Build rows; treat empty string as null (clear the entry).
  const rows = keys.map(k => {
    const raw = dirty.get(k);
    const value = (raw == null || raw === '') ? null : Number(raw);
    return { metric_key: k, period_type: activePeriod, period_start: activeStart, value_num: value };
  });

  // Validate numbers locally before sending so we can highlight bad rows.
  const bad = rows.filter(r => r.value_num != null && !Number.isFinite(r.value_num));
  if (bad.length) {
    for (const r of bad) {
      const inp = document.querySelector(`.entry-row[data-key="${CSS.escape(r.metric_key)}"] .entry-input`);
      inp?.classList.add('error');
    }
    setStatus('Some values aren’t numbers — fix and retry', 'dirty');
    return;
  }

  try {
    const j = await apiFetch('?api=bulk-import', { method: 'POST', body: JSON.stringify({ rows }) });
    // Mark each input saved, refresh `orig`, drop from dirty set.
    for (const k of keys) {
      const inp = document.querySelector(`.entry-row[data-key="${CSS.escape(k)}"] .entry-input`);
      if (inp) {
        inp.dataset.orig = inp.value.trim();
        inp.classList.remove('dirty');
        inp.classList.add('saved');
        setTimeout(() => inp.classList.remove('saved'), 1200);
      }
      const btn = document.querySelector(`[data-row-save="${CSS.escape(k)}"]`);
      btn?.classList.remove('active');
      dirty.delete(k);
    }
    setStatus(`Saved ${j.upserted || keys.length} · ${new Date().toLocaleTimeString()}`, 'saved');
    syncSaveBtn();
  } catch (e) {
    setStatus('Save failed: ' + (e.message || e), 'error');
    setBanner('Save failed: ' + (e.message || e), 'error');
  }
}

document.getElementById('saveAllBtn').addEventListener('click', () => {
  saveRows([...dirty.keys()]);
});
document.getElementById('reloadBtn').addEventListener('click', async () => {
  if (dirty.size && !confirm('Discard unsaved changes?')) return;
  await loadSnapshot();
});

// ── Period selector ─────────────────────────────────────────────────
function syncPeriodHint() {
  const hint = document.getElementById('periodHint');
  const inp  = document.getElementById('periodStart');
  if (!inp.value) { hint.textContent = ''; return; }
  if (activePeriod === 'weekly') {
    const start = new Date(inp.value + 'T00:00:00Z');
    const end   = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    hint.textContent = `Week: ${isoDate(start)} → ${isoDate(end)}`;
  } else {
    const start = new Date(inp.value + 'T00:00:00Z');
    const end   = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    hint.textContent = `Month: ${start.toLocaleDateString('en', { month: 'long', year: 'numeric' })} (${isoDate(start)} → ${isoDate(end)})`;
  }
}

document.getElementById('periodType').addEventListener('change', (e) => {
  if (dirty.size && !confirm('Switching period type will discard unsaved changes. Continue?')) {
    e.target.value = activePeriod; return;
  }
  activePeriod = e.target.value;
  activeStart = snapToBoundary(activeStart || (activePeriod === 'monthly' ? thisMonthStartUTC() : lastMondayUTC()), activePeriod);
  if (activePeriod === 'monthly' && !activeStart) activeStart = thisMonthStartUTC();
  if (activePeriod === 'weekly'  && !activeStart) activeStart = lastMondayUTC();
  document.getElementById('periodStart').value = activeStart;
  syncPeriodHint();
  loadSnapshot();
});

document.getElementById('periodStart').addEventListener('change', (e) => {
  if (dirty.size && !confirm('Switching period will discard unsaved changes. Continue?')) {
    e.target.value = activeStart; return;
  }
  const snapped = snapToBoundary(e.target.value, activePeriod);
  activeStart = snapped;
  e.target.value = snapped;
  syncPeriodHint();
  loadSnapshot();
});

document.getElementById('periodQuick').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-quick]'); if (!btn) return;
  if (dirty.size && !confirm('Switching period will discard unsaved changes. Continue?')) return;
  document.querySelectorAll('#periodQuick button').forEach(b => b.classList.toggle('active', b === btn));
  const base = activePeriod === 'monthly' ? thisMonthStartUTC() : lastMondayUTC();
  const offsetMap = { 'this': 0, 'last': -1, 'prev2': -2, 'prev3': -3 };
  const offset = offsetMap[btn.dataset.quick] ?? 0;
  activeStart = shiftPeriod(base, activePeriod, offset);
  document.getElementById('periodStart').value = activeStart;
  syncPeriodHint();
  loadSnapshot();
});

// ── Theme + sign-out + nav ──────────────────────────────────────────
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') document.body.classList.add('light');
function syncThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌙' : '☀️';
}
syncThemeBtn();
document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
  syncThemeBtn();
});
document.getElementById('signOutBtn').addEventListener('click', async () => { await supa.auth.signOut(); location.href = 'home.html'; });
document.getElementById('deniedSignOutBtn').addEventListener('click', async () => { await supa.auth.signOut(); location.href = 'home.html'; });

document.getElementById('navDropdownBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('navDropdownMenu').classList.toggle('open');
});
document.addEventListener('click', e => {
  const menu = document.getElementById('navDropdownMenu');
  const wrap = document.getElementById('navDropdown');
  if (menu.classList.contains('open') && !wrap.contains(e.target)) menu.classList.remove('open');
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('sendBtn'); const err = document.getElementById('loginError');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (e) {
    err.textContent = e.message || 'Sign-in failed';
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});

// ── Warn on leave with unsaved changes ──────────────────────────────
window.addEventListener('beforeunload', (e) => {
  if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
});

initAuth();
