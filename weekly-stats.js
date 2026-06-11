// Weekly Stats Dashboard — page logic.
// Talks to the `weekly-stats` edge function (catalog / series / snapshot /
// upsert / bulk-import / delete) and renders a chart-per-metric grid grouped
// by Division, matching the Google Data Studio report it replaces.

const SUPABASE_URL      = 'https://pojqljrhhtnigyrtzdzz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos';
const API_BASE = SUPABASE_URL + '/functions/v1/weekly-stats';

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
});

// ── App state ───────────────────────────────────────────────────────
let currentSession = null;
let capabilities   = { is_admin: false, can_view: false, can_edit: false, can_import: false };
let catalog        = [];   // [{key,label,division,unit,source,...}]
let seriesByMetric = new Map();  // key → [{period_start, value}, ...]
let activePeriod   = 'weekly';
let activeDivision = 'all';
let dateFrom       = '';
let dateTo         = '';
let chartInstances = new Map();  // metric_key → Chart.js instance
let drillChartInst = null;

// Top KPI metric keys per division — the ones that get the prominent strip.
const HIGHLIGHT_KEYS = {
  all:           ['phone_sales_total_gi','mentorship_gi_overall','refunds_salvaged_amount','disputes_won'],
  staff_meeting: ['phone_sales_total_gi','mentorship_gi_overall','refunds_salvaged_amount','students_onboarded'],
  D2:            ['phone_sales_total_gi','phone_sales_recurrent_gi','mentorship_gi_overall','masterclass_gi_phone'],
  D3:            ['refunds_salvaged_amount','refunds_approved_amount','disputes_won','recovered_failed_rebills'],
  D4:            ['mentorship_wins','mentorship_resigns_weekly','students_onboarded','students_completed_mentorship'],
  D5:            ['masterclass_starters','masterclass_purchasers','masterclass_gi_phone','active_masterclass_students'],
};

// ── Formatters ──────────────────────────────────────────────────────
const fmtMoney = (v) => v == null ? '—' : '$' + Math.round(Number(v)).toLocaleString();
const fmtCount = (v) => v == null ? '—' : Number(v).toLocaleString();
// Percentages render with one decimal and a % suffix; values stored as the
// raw percent (so 47.5 means 47.5%, not 0.475 — keeps manual entry sane).
const fmtPctVal = (v) => v == null ? '—' : Number(v).toFixed(1) + '%';
const fmtVal   = (v, unit) => unit === 'usd' ? fmtMoney(v) : (unit === 'pct' ? fmtPctVal(v) : fmtCount(v));
const fmtPct   = (cur, prev, invert = false) => {
  // For inverted (lower-is-better) metrics, a drop is an improvement, so the
  // displayed % is sign-flipped: e.g. raw -83% reads as +83%.
  if (prev == null || prev === 0) return cur > 0 ? (invert ? '-∞' : '+∞') : '0%';
  let pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (invert) pct = -pct;
  return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
};

// Arrow + color class + signed % for a delta, accounting for lower-is-better
// (inverted) metrics where a decrease is good (green ▲) and an increase is
// bad (red ▼). `flatCls` lets callers pick the zero-change class ('' vs 'flat').
function deltaParts(current, previous, invert, flatCls = 'flat') {
  const dir = invert ? (previous - current) : (current - previous); // >0 = good
  const cls = dir > 0 ? 'up' : dir < 0 ? 'down' : flatCls;
  const arrow = dir > 0 ? '▲' : dir < 0 ? '▼' : '–';
  return { cls, arrow, pct: fmtPct(current, previous, invert) };
}

// ── State machine ───────────────────────────────────────────────────
function setState(s) { document.body.dataset.state = s; }

// ── Auth ────────────────────────────────────────────────────────────
async function initAuth() {
  const timeout = setTimeout(() => setState('login'), 8000);
  try {
    const { data: { session } } = await supa.auth.getSession();
    clearTimeout(timeout);
    if (session) { await onAuthed(session); return; }
    setState('login');
  } catch (e) {
    clearTimeout(timeout);
    setState('login');
  }
  supa.auth.onAuthStateChange(async (_e, sess) => {
    if (sess) await onAuthed(sess);
    else setState('login');
  });
}

async function onAuthed(session) {
  currentSession = session;
  const email = session.user.email || '';
  document.getElementById('userEmail').textContent = email;
  document.getElementById('userAvatar').textContent = (email[0] || 'U').toUpperCase();

  // Permission gate. RidleyPerms decides if the page is even viewable; the
  // edge function double-checks on every request so the UI is just a hint.
  if (!window.RidleyPerms.canOpen('weekly-stats.html', session.user)) {
    setState('denied');
    return;
  }
  setState('dashboard');

  // Restore saved range, default to last 13 weeks if nothing saved.
  loadStoredRange();
  await fetchCatalog();
  applyEditCapabilityToButtons();
  await loadData();
  setupRealtime();
}

// ── Date range presets ──────────────────────────────────────────────
const ONE_DAY = 86400000;
function isoDate(d) { return d.toISOString().slice(0, 10); }
function presetRange(name) {
  const now = new Date();
  now.setUTCHours(0,0,0,0);
  const from = new Date(now);
  switch (name) {
    // Standard presets — match income.html / coach.html / calls.html etc.
    case 'last-30': from.setUTCDate(now.getUTCDate() - 30); break;
    case 'this-week': {
      // Current Thu-Wed business week. `from` = the Thursday that opened it.
      const dow = now.getUTCDay();
      const back = (dow - 4 + 7) % 7;
      from.setUTCDate(now.getUTCDate() - back);
      break;
    }
    case 'last-week': {
      const dow = now.getUTCDay();
      const back = (dow - 4 + 7) % 7 + 7;
      from.setUTCDate(now.getUTCDate() - back);
      const t = new Date(from); t.setUTCDate(from.getUTCDate() + 6);
      return { from: isoDate(from), to: isoDate(t), preset: name };
    }
    case 'mtd':      from.setUTCDate(1); break;
    // Weekly Stats-specific (longer trends)
    case 'last-4w':  from.setUTCDate(now.getUTCDate() - 28); break;
    case 'last-13w': from.setUTCDate(now.getUTCDate() - 91); break;
    case 'last-26w': from.setUTCDate(now.getUTCDate() - 182); break;
    case 'ytd':      from.setUTCMonth(0); from.setUTCDate(1); break;
    case 'last-4m':  from.setUTCMonth(now.getUTCMonth() - 4); break;
    case 'last-6m':  from.setUTCMonth(now.getUTCMonth() - 6); break;
    case 'last-12m': from.setUTCMonth(now.getUTCMonth() - 12); break;
    default:         from.setUTCDate(now.getUTCDate() - 91);
  }
  return { from: isoDate(from), to: isoDate(now), preset: name };
}
function loadStoredRange() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('weekly-stats:range') || 'null'); } catch (_) {}
  const preset = stored?.preset || 'last-13w';
  const r = presetRange(preset);
  dateFrom = stored?.from || r.from;
  dateTo   = stored?.to   || r.to;
  document.getElementById('dateFrom').value = dateFrom;
  document.getElementById('dateTo').value   = dateTo;
  document.querySelectorAll('.dr-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
  document.getElementById('drLabel').textContent = labelForPreset(preset, dateFrom, dateTo);
}
function labelForPreset(preset, from, to) {
  const map = {
    'last-30':'Last 30 Days','this-week':'This Week (Thu–Wed)','last-week':'Last Week (Thu–Wed)','mtd':'Month to Date',
    'last-4w':'Last 4 Weeks','last-13w':'Last 13 Weeks','last-26w':'Last 26 Weeks','ytd':'Year to Date','last-4m':'Last 4 Months','last-6m':'Last 6 Months','last-12m':'Last 12 Months',
  };
  return map[preset] || `${from} → ${to}`;
}

// ── API helpers ─────────────────────────────────────────────────────
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
  let j;
  try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text }; }
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
  return j;
}

async function fetchCatalog() {
  const j = await apiFetch('?api=catalog');
  catalog = j.metrics || [];
  capabilities = j.capabilities || capabilities;
  populateAddMetricSelect();
}

// Cache key: any series payload is fully determined by (period, from, to).
// We always fetch ALL metrics — division filtering happens client-side so
// switching tabs is free (no network call).
let _seriesCache = new Map();           // "period|from|to" → series Map
function _seriesCacheKey() { return `${activePeriod}|${dateFrom}|${dateTo}`; }

async function loadData(force) {
  setBanner('');
  const key = _seriesCacheKey();
  // Cache hit — paint instantly from memory.
  if (!force && _seriesCache.has(key)) {
    seriesByMetric = _seriesCache.get(key);
    renderAll();
    return;
  }
  // Cache miss — show skeleton cards while the network runs.
  renderSkeleton();
  spin(true);
  try {
    // No `division=` param — fetch everything and filter client-side.
    // Server-side division filter would re-hit the network on every tab
    // switch; client-side filter makes tab switching instant.
    const url = `?api=series&period=${activePeriod}&from=${dateFrom}&to=${dateTo}`;
    const j = await apiFetch(url);
    seriesByMetric = new Map((j.series || []).map(s => [s.metric_key, s.points]));
    _seriesCache.set(key, seriesByMetric);
    renderAll();
  } catch (e) {
    setBanner('Failed to load: ' + (e.message || e), 'error');
  } finally {
    spin(false);
  }
}

// Invalidate the cache whenever the user makes a mutation that could change
// values: upsert, delete, bulk-import, create-metric, reorder, edit-metric.
// Called from every save handler.
function _invalidateSeriesCache() { _seriesCache.clear(); }

// Render shimmering placeholder cards while we wait for the API.
function renderSkeleton() {
  const visible = catalog.filter(m => {
    if (activeDivision === 'staff_meeting') return !!m.in_staff_meeting;
    if (activePeriod === 'weekly' && m.division === 'monthly') return false;
    if (activeDivision === 'all') return true;
    const allTabs = [m.division, ...(Array.isArray(m.extra_tabs) ? m.extra_tabs : [])];
    return allTabs.includes(activeDivision);
  });
  const count = Math.max(4, visible.length || 6);
  const kpi = document.getElementById('kpiGrid');
  const grid = document.getElementById('chartGrid');
  if (kpi) {
    kpi.innerHTML = Array.from({ length: 4 }).map(() =>
      `<div class="kpi-card skel-card" aria-hidden="true"></div>`
    ).join('');
  }
  if (grid) {
    grid.innerHTML = Array.from({ length: count }).map(() =>
      `<div class="chart-card skel-card" aria-hidden="true" style="height:236px;"></div>`
    ).join('');
  }
}

function spin(on) {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;
  btn.disabled = on;
  btn.style.opacity = on ? 0.6 : 1;
}

function setBanner(msg, kind) {
  const el = document.getElementById('banners');
  if (!msg) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner banner-${kind || 'info'}">${escapeHtml(msg)}</div>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Render ──────────────────────────────────────────────────────────
function renderAll() {
  // Filter catalog to the active division + period. Monthly view shows only
  // 'monthly' metrics; weekly shows everything else.
  const visible = catalog.filter(m => {
    // Weekly view hides EOM-snapshot metrics (active rosters etc. that
    // only make sense monthly). Monthly view shows everything — weekly
    // data is rolled up on the server. Exception: the Staff Meeting tab
    // explicitly INCLUDES monthly-flagged metrics (active rosters are
    // part of the standing report) so we don't apply that filter there.
    if (activeDivision === 'staff_meeting') return !!m.in_staff_meeting;
    if (activePeriod === 'weekly' && m.division === 'monthly') return false;
    if (activeDivision === 'all') return true;
    // A metric appears in its primary division AND any extra_tabs the
    // catalog says it belongs to — lets the same metric show under D4
    // AND Staff Meeting AND e.g. D5 without storing values twice.
    const allTabs = [m.division, ...(Array.isArray(m.extra_tabs) ? m.extra_tabs : [])];
    return allTabs.includes(activeDivision);
  });
  // Sort by the catalog's sort_order so the persisted order (set via the
  // Reorder Mode + ?api=reorder) shows up here too.
  visible.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  updateCurrentPeriodBtn();
  renderKpiStrip(visible);
  renderChartGrid(visible);
}

function pickHighlights(visible) {
  // For "all" view, prefer hand-picked HIGHLIGHT_KEYS, fall back to first 4.
  const keys = HIGHLIGHT_KEYS[activeDivision] || [];
  const byKey = new Map(visible.map(m => [m.key, m]));
  const out = [];
  for (const k of keys) if (byKey.has(k)) out.push(byKey.get(k));
  while (out.length < 4 && visible[out.length]) out.push(visible[out.length]);
  return out.slice(0, 4);
}

function lastTwoValues(points) {
  if (!points || !points.length) return { current: 0, previous: 0 };
  const current  = points[points.length - 1]?.value ?? 0;
  const previous = points.length >= 2 ? points[points.length - 2].value : 0;
  return { current, previous };
}

// ── Reorder mode ────────────────────────────────────────────────────
// Explicit toggle to keep drag-and-drop predictable: cards are only
// draggable when reorder mode is on. Drops just rearrange DOM (no
// re-render, no network call). On Save we collect the final key order
// and POST to ?api=reorder. On Cancel we reload from server.
let _reorderMode = false;
let _reorderDragEl = null;            // the currently-dragged .chart-card element

// ── Current-period visibility toggle ─────────────────────────────────
// OFF by default: the current, still-in-progress week/month is hidden
// from the big numbers, KPI strip, and chart lines (it's incomplete and
// reads as a misleading drop). Flip ON to surface it. Persisted across
// tab switches (module global) and reloads (localStorage).
let _showCurrentPeriod = (localStorage.getItem('weekly-stats:showCurrentPeriod') === '1');

// ISO (YYYY-MM-DD) period_start of the CURRENT period for the active view:
// the Wednesday that closes the in-progress Thu→Wed week, or the 1st of the
// current month. Matches how rows are anchored server-side / in Add-entry.
function currentPeriodStartISO() {
  const now = new Date();
  if (activePeriod === 'monthly') {
    return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  }
  const dow = now.getUTCDay();
  const forward = (3 - dow + 7) % 7;          // days until (or on) Wednesday
  const wed = new Date(now); wed.setUTCDate(now.getUTCDate() + forward);
  return isoDate(wed);
}

// Return points with the current in-progress period dropped when the toggle
// is OFF. Only trims if the LAST point actually IS the current period.
function displayPoints(points) {
  if (_showCurrentPeriod || !points || !points.length) return points || [];
  const last = points[points.length - 1];
  if (last && String(last.period_start).slice(0, 10) === currentPeriodStartISO()) {
    return points.slice(0, -1);
  }
  return points;
}

function updateCurrentPeriodBtn() {
  const b = document.getElementById('currentWeekBtn');
  if (!b) return;
  const unit = activePeriod === 'monthly' ? 'month' : 'week';
  const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"';
  const eyeOn  = `<svg ${svgAttrs}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeOff = `<svg ${svgAttrs}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  b.innerHTML = (_showCurrentPeriod ? eyeOn : eyeOff) + 'Current ' + unit + ': ' + (_showCurrentPeriod ? 'On' : 'Off');
  if (_showCurrentPeriod) { b.style.borderColor = 'var(--gold)'; b.style.color = 'var(--gold)'; }
  else { b.style.borderColor = ''; b.style.color = ''; }
}

function _enterReorderMode() {
  _reorderMode = true;
  document.body.classList.add('reordering');
  document.getElementById('reorderBar').style.display = 'flex';
  document.getElementById('reorderBtn').style.display = 'none';
  // Re-render the grid so the drag listeners get wired and the click
  // handler picks up the _reorderMode flag. The chart instances are
  // re-built, which is fine — we want a clean slate for the mode.
  renderAll();
}
function _exitReorderMode(reloadFromServer) {
  _reorderMode = false;
  _reorderDragEl = null;
  document.body.classList.remove('reordering');
  document.getElementById('reorderBar').style.display = 'none';
  document.getElementById('reorderBtn').style.display = '';
  if (reloadFromServer) {
    // Cancel — discard local changes by re-fetching the catalog so the
    // sort_order column drives the next render.
    fetchCatalog().then(renderAll).catch(() => renderAll());
  } else {
    renderAll();
  }
}

function _attachReorderListeners(grid) {
  // Native HTML5 drag-and-drop. Each card is draggable; on drop we move
  // the dragged element before the drop target (or after, if dropped on
  // the latter half of the target). No DB calls happen here — Save
  // commits the final order.
  grid.querySelectorAll('.chart-card').forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', (e) => {
      _reorderDragEl = card;
      card.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.dataset.key || ''); } catch (_) {}
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.chart-card.drop-target').forEach(c => c.classList.remove('drop-target'));
      _reorderDragEl = null;
    });
    card.addEventListener('dragover', (e) => {
      if (!_reorderDragEl || _reorderDragEl === card) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
      card.classList.add('drop-target');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop-target');
      if (!_reorderDragEl || _reorderDragEl === card) return;
      // Decide BEFORE vs AFTER based on the cursor position relative to
      // the target's vertical center — feels natural when moving cards
      // within a vertical column.
      const rect = card.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      if (after) card.parentNode.insertBefore(_reorderDragEl, card.nextSibling);
      else        card.parentNode.insertBefore(_reorderDragEl, card);
    });
  });
}

async function _saveReorder() {
  const btn = document.getElementById('reorderSaveBtn');
  const grid = document.getElementById('chartGrid');
  // Read the current DOM order — this is the user's chosen order.
  const visibleOrder = Array.from(grid.querySelectorAll('.chart-card')).map(c => c.dataset.key).filter(Boolean);
  if (!visibleOrder.length) { _exitReorderMode(false); return; }
  // Compute the FULL catalog order: keep the user's choices for visible
  // cards, then append every other metric in its existing sort_order.
  const visibleSet = new Set(visibleOrder);
  const otherKeys = catalog
    .filter(m => !visibleSet.has(m.key))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(m => m.key);
  const fullOrder = [...visibleOrder, ...otherKeys];

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await apiFetch('?api=reorder', { method: 'POST', body: JSON.stringify({ ordered_keys: fullOrder }) });
    // Update local sort_order so we don't need a full refetch.
    fullOrder.forEach((k, i) => {
      const m = catalog.find(x => x.key === k);
      if (m) m.sort_order = 100 + i * 10;
    });
    btn.textContent = '✓ Saved';
    setTimeout(() => _exitReorderMode(false), 600);
  } catch (e) {
    btn.disabled = false; btn.textContent = '✓ Save order';
    setBanner('Save failed: ' + (e.message || e), 'error');
  }
}

function renderKpiStrip(visible) {
  const grid = document.getElementById('kpiGrid');
  const picks = pickHighlights(visible);
  if (!picks.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-dim);font-size:0.84rem;padding:24px;text-align:center;">No metrics for this view.</div>`;
    return;
  }
  const colors = ['var(--green)','var(--blue)','var(--purple)','var(--gold)'];
  const glows  = ['var(--green-glow)','var(--blue-glow)','rgba(167,139,250,0.3)','rgba(251,191,36,0.3)'];
  grid.innerHTML = picks.map((m, i) => {
    const pts = displayPoints(seriesByMetric.get(m.key) || []);
    const { current, previous } = lastTwoValues(pts);
    const { cls, arrow, pct } = deltaParts(current, previous, !!m.invert_chart, 'flat');
    return `
      <div class="kpi-card" style="--c-color:${colors[i]};--c-glow:${glows[i]};">
        <div class="kpi-label">${escapeHtml(m.label)}</div>
        <div class="kpi-value">${fmtVal(current, m.unit)}</div>
        <div class="kpi-delta ${cls}">${arrow} ${pct} <span style="color:var(--text-dim);font-weight:600;margin-left:4px;">vs prior ${activePeriod === 'weekly' ? 'week' : 'month'}</span></div>
      </div>`;
  }).join('');
}

function renderChartGrid(visible) {
  const grid = document.getElementById('chartGrid');
  // Tear down old Chart.js instances — they leak memory otherwise.
  for (const [, inst] of chartInstances) { try { inst.destroy(); } catch (_) {} }
  chartInstances.clear();

  if (!visible.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-dim);font-size:0.84rem;padding:36px;text-align:center;">No metrics in this view yet.</div>`;
    return;
  }

  grid.innerHTML = visible.map(m => {
    const pts = displayPoints(seriesByMetric.get(m.key) || []);
    const { current, previous } = lastTwoValues(pts);
    const { cls, arrow } = deltaParts(current, previous, !!m.invert_chart, '');
    const pct = fmtPct(current, previous, !!m.invert_chart);
    return `
      <div class="chart-card" data-key="${escapeHtml(m.key)}" style="position:relative;">
        <div class="reorder-handle" title="Drag to move">⋮⋮</div>
        <div class="chart-card-head">
          <div class="chart-card-title">${escapeHtml(m.label)}</div>
          <div class="chart-card-source ${m.source === 'derived' ? 'src-derived' : 'src-manual'}">${m.source}</div>
        </div>
        <div class="chart-card-now">
          <span class="chart-card-value">${fmtVal(current, m.unit)}</span>
          <span class="chart-card-delta ${cls}">${arrow} ${pct}</span>
        </div>
        <div class="chart-card-wrap"><canvas id="c-${cssId(m.key)}"></canvas></div>
        <div class="chart-card-foot">${pts.length} ${activePeriod === 'weekly' ? 'weeks' : 'months'} · ${m.division} · click to expand</div>
      </div>`;
  }).join('');

  // Mount Chart.js instances after the DOM has the canvases.
  for (const m of visible) {
    const ctx = document.getElementById(`c-${cssId(m.key)}`);
    if (!ctx) continue;
    chartInstances.set(m.key, makeMiniChart(ctx, displayPoints(seriesByMetric.get(m.key) || []), m));
  }

  // Click-to-drilldown — disabled in reorder mode so a stray click doesn't
  // open the modal mid-drag. Reorder mode wires its own drag listeners on
  // each card via _attachReorderListeners(grid).
  grid.querySelectorAll('.chart-card').forEach(card => {
    card.addEventListener('click', () => {
      if (_reorderMode) return;
      openDrilldown(card.dataset.key);
    });
  });
  if (_reorderMode) _attachReorderListeners(grid);
}

function cssId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

function makeMiniChart(canvas, points, metric) {
  const ctx = canvas.getContext('2d');
  const isUsd = metric.unit === 'usd';
  const isPct = metric.unit === 'pct';
  // Per-segment trend colouring — soft cream for up, coral for down. The
  // line carries the trend story; the FILL beneath stays neutral (a faint
  // slate wash) so a down-then-up series doesn't read as "all bad" just
  // because the overall delta was negative.
  // Clean two-tone line: theme-aware "up" colour (white on dark, near-
  // black on light), red on every down segment regardless of theme. No
  // outline, no fill, no point clutter — the line itself does all the
  // work. Theme is determined the same way the page does it.
  const isLight = document.body.classList.contains('light');
  const UP   = isLight ? '#0f172a' : '#ffffff';        // slate-900 / white
  const DOWN = '#ef4444';                              // red-500 down

  const seriesData = points.map(p => p.value);
  // Pre-compute a "nice" Y-axis: rounded min/max + a stepSize that all
  // gridlines land on. Sharing one stepSize between bounds and ticks
  // guarantees evenly-spaced horizontal lines (e.g. 0 / 5 / 10 / 15 / 20)
  // instead of Chart.js's auto-spacing which can drift on tight ranges.
  const yScale = (function () {
    const nums = (points || []).map(p => Number(p.value)).filter(n => Number.isFinite(n));
    if (!nums.length) return null;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    if (lo === hi) {
      const pad = Math.max(1, Math.abs(lo) * 0.12);
      const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(pad))));
      return {
        min: Math.floor((lo - pad) / step) * step,
        max: Math.ceil ((hi + pad) / step) * step,
        stepSize: step,
      };
    }
    const span = hi - lo;
    // Step ≈ 1/4 of the span, rounded to a power of 10.
    // span 8 → step 1; span 50 → 10; span 12 000 → 1 000.
    const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(span / 4))));
    const pad = span * 0.12;
    let yMin = Math.floor((lo - pad) / step) * step;
    let yMax = Math.ceil ((hi + pad) / step) * step;
    if (lo >= 0 && yMin < 0) yMin = 0;
    if (metric.unit === 'pct') { yMax = Math.min(100, yMax); yMin = Math.max(0, yMin); }
    return { min: yMin, max: yMax, stepSize: step };
  })();

  // Plugin: draws each data point's value above the point. Activated only
  // when metric.show_point_labels is true. Mimics the Data Studio report
  // we replaced — useful on charts where the team reads exact weekly
  // numbers off the chart at a glance.
  const pointLabelsPlugin = {
    id: 'pointLabels_' + metric.key,
    afterDatasetDraw(chart, args) {
      if (!metric.show_point_labels) return;
      if (args.index !== 0) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const c = chart.ctx;
      c.save();
      c.font = '600 10px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillStyle   = isLight ? '#0f172a' : '#e5e7eb';
      c.strokeStyle = isLight ? 'rgba(255,255,255,0.85)' : 'rgba(15,18,32,0.85)';
      c.lineWidth = 3;
      const area = chart.chartArea;
      // Track every rectangle we've already drawn so we can skip any new
      // label that would collide with one of them. Result: every value
      // that's actually drawn stays fully legible — overlapping labels
      // are dropped rather than stacked on top of each other.
      const drawn = [];
      const overlaps = (a, b) =>
        a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y;
      // Always prefer drawing the LAST (most recent) point's label, then
      // the first, then sweep middle. That way the rightmost / leftmost
      // values are guaranteed visible and the rest fill in where they fit.
      const order = [];
      const n = meta.data.length;
      if (n) { order.push(n - 1); if (n > 1) order.push(0); }
      for (let i = 1; i < n - 1; i++) order.push(i);
      for (const i of order) {
        const pt = meta.data[i];
        if (!pt || pt.skip) continue;
        const raw = chart.data.datasets[0].data[i];
        if (raw == null || !Number.isFinite(Number(raw))) continue;
        const txt = fmtVal(raw, metric.unit);
        const w = c.measureText(txt).width;
        const h = 12;
        // Clamp the label horizontally so it can't bleed out of the card
        // even when a point sits at the very edge of the chart area.
        const padX = 2;
        let tx = pt.x;
        const halfW = w / 2 + padX;
        if (tx - halfW < area.left)  tx = area.left  + halfW;
        if (tx + halfW > area.right) tx = area.right - halfW;
        // Try ABOVE first, then BELOW. We keep the first candidate that
        // (a) stays inside the chart area vertically and
        // (b) doesn't overlap any previously-drawn label rect.
        const candidates = [];
        const aboveTy = pt.y - 6;
        if (aboveTy - h > area.top + 2) candidates.push(aboveTy);
        const belowTy = pt.y + 14;
        if (belowTy < area.bottom - 2) candidates.push(belowTy);
        let placed = null;
        for (const ty of candidates) {
          const rect = { x: tx - w / 2, y: ty - h, w, h };
          let blocked = false;
          for (const r of drawn) { if (overlaps(rect, r)) { blocked = true; break; } }
          if (!blocked) { placed = { tx, ty, rect }; break; }
        }
        if (!placed) continue;
        // Stroke first (halo) so the label stays legible over the line.
        c.strokeText(txt, placed.tx, placed.ty);
        c.fillText(txt, placed.tx, placed.ty);
        drawn.push(placed.rect);
      }
      c.restore();
    },
  };

  return new Chart(ctx, {
    type: 'line',
    plugins: [pointLabelsPlugin],
    data: {
      labels: points.map(p => p.period_start),
      datasets: [
        {
          label: metric.label || 'value',
          data: seriesData,
          backgroundColor: 'transparent',
          borderColor: UP,                             // default; segments override
          borderWidth: 2,
          borderCapStyle: 'round',
          borderJoinStyle: 'round',
          fill: false,
          tension: 0,
          segment: {
            borderColor: (s) => {
              const a = s.p0?.parsed?.y;
              const b = s.p1?.parsed?.y;
              if (a == null || b == null) return UP;
              // "Lower is better" metrics flip the semantic — a rising value
              // is the bad direction (e.g., more refunds → red). Default
              // case: a falling value is bad.
              const isBad = metric.invert_chart ? (b > a) : (b < a);
              return isBad ? DOWN : UP;
            },
          },
          pointRadius: 0,                              // no clutter — hover reveals
          pointHoverRadius: 4,
          pointHoverBackgroundColor: UP,
          pointHoverBorderColor: isLight ? '#ffffff' : '#0f1220',
          pointHoverBorderWidth: 2,
          spanGaps: true,
          borderDash: metric.source === 'manual' ? [4, 3] : [],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, right: 6, bottom: 2, left: 2 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,18,32,0.95)',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 8,
          titleColor: '#e5e7eb',
          bodyColor: '#cbd5e1',
          titleFont: { size: 11, weight: '600' },
          bodyFont: { size: 11 },
          displayColors: false,
          callbacks: {
            title: (ctxs) => {
              if (!ctxs.length) return '';
              const d = new Date(ctxs[0].label);
              if (isNaN(d)) return ctxs[0].label;
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            },
            label: (c) => fmtVal(c.raw, metric.unit),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#8a93b8',
            font: { size: 9, weight: '500' },
            autoSkip: false,                          // show EVERY week
            maxRotation: 50,
            minRotation: 50,
            padding: 4,
            // Compact M/D so 13+ weekly labels fit when rotated 50deg.
            callback: function (val) {
              const raw = this.getLabelForValue(val);
              const d = new Date(raw);
              if (isNaN(d)) return raw;
              return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
            },
          },
          grid: { display: false, drawTicks: true, tickColor: 'rgba(255,255,255,0.12)', tickLength: 4 },
          border: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          ticks: {
            color: '#8a93b8',
            font: { size: 10 },
            padding: 6,
            // Force ticks to land exactly on multiples of the niceStep so
            // every horizontal gridline sits at an even interval.
            stepSize: yScale?.stepSize,
            callback: (v) => {
              // Round every tick label to a clean integer (or 1 decimal for
              // pct) — defensive, in case Chart.js emits a fractional tick.
              if (isUsd) return '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'k' : Math.round(v));
              if (isPct) return (Math.round(v * 10) / 10) + '%';
              return Math.round(v);
            },
          },
          grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
          border: { display: false },
          ...(yScale ? { min: yScale.min, max: yScale.max } : { beginAtZero: true }),
          // "Lower is better" metrics flip the axis so a rising chart still
          // reads as good. Combined with our existing red-down / white-up
          // segment colour, a refund spike now draws DOWNWARD-and-red.
          reverse: !!metric.invert_chart,
        },
      },
    },
  });
}

// ── Drill-down modal ────────────────────────────────────────────────
function openDrilldown(metricKey) {
  const m = catalog.find(x => x.key === metricKey);
  if (!m) return;
  const pts = seriesByMetric.get(metricKey) || [];
  document.getElementById('drillTitle').textContent = m.label;
  document.getElementById('drillSub').textContent = `${m.division} · ${m.source === 'derived' ? 'auto-computed from existing data' : 'manually entered / imported'} · ${pts.length} data points${m.invert_chart ? ' · lower-is-better (Y-axis inverted)' : ''}`;

  // Edit-metric button + form: only visible for users who can edit.
  const editBtn = document.getElementById('drillEditBtn');
  const editForm = document.getElementById('drillEditForm');
  editForm.style.display = 'none';
  if (editBtn) {
    editBtn.style.display = capabilities.can_edit ? '' : 'none';
    editBtn.dataset.metricKey = metricKey;
  }
  // Pre-fill the form for this metric (in case the user opens it).
  document.getElementById('drillEditLabel').value = m.label || '';
  document.getElementById('drillEditInvert').checked = !!m.invert_chart;
  document.getElementById('drillEditPointLabels').checked = !!m.show_point_labels;
  document.getElementById('drillEditStaff').checked = !!m.in_staff_meeting;
  // Tab multi-checkbox — disable the "home" tab (you can't remove a metric
  // from its primary division here; use the home dropdown via SQL if needed).
  const currentExtras = new Set(Array.isArray(m.extra_tabs) ? m.extra_tabs : []);
  document.querySelectorAll('#drillEditTabs input[data-tab]').forEach(cb => {
    const t = cb.dataset.tab;
    cb.checked = currentExtras.has(t);
    cb.disabled = (t === m.division);
    // Visually mark the home tab as "already shown there".
    cb.parentElement.style.opacity = (t === m.division) ? '0.5' : '1';
    cb.parentElement.title = (t === m.division) ? 'This metric\'s home tab' : '';
  });
  document.getElementById('drillEditMsg').textContent = '';

  // Big chart — respects the Current-period toggle (hide the in-progress
  // week/month when it's off), same as the dashboard cards. The editable
  // table below still lists every row so the current period stays editable.
  if (drillChartInst) { try { drillChartInst.destroy(); } catch (_) {} drillChartInst = null; }
  const canvas = document.getElementById('drillChart');
  drillChartInst = makeMiniChart(canvas, displayPoints(pts), m);

  // Raw rows table — editable for manual metrics, "Add new" row on top.
  const wrap = document.getElementById('drillTableWrap');
  const headerLabel = activePeriod === 'weekly' ? 'Week ending (Wed)' : 'Month';
  const rows = pts.slice().reverse(); // most recent first
  const canMutate = capabilities.can_edit;
  // Default "Add new" date = current period anchor. The bulk-import endpoint
  // accepts derived keys as overrides, so this works for any metric.
  const defaultNewDate = (() => {
    const now = new Date();
    if (activePeriod === 'weekly') {
      const dow = now.getUTCDay();
      const forward = (3 - dow + 7) % 7;
      const d = new Date(now); d.setUTCDate(now.getUTCDate() + forward);
      return d.toISOString().slice(0, 10);
    }
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  })();
  const showActions = canMutate;  // both manual + derived: we allow override via bulk-import
  wrap.innerHTML = `
    <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raw values${m.source === 'derived' ? ' · derived metric — your entries OVERRIDE the auto-computed value for that period' : ''}</div>
    <table class="raw-table">
      <thead><tr><th>${headerLabel}</th><th style="text-align:right;">Value</th>${showActions ? '<th style="text-align:right;">Actions</th>' : ''}</tr></thead>
      <tbody>
        ${canMutate ? `
          <tr id="addRow" style="background:var(--surface2);">
            <td><input type="date" id="addRowDate" class="row-edit" style="width:140px;text-align:left;" value="${defaultNewDate}"></td>
            <td class="td-num"><input type="number" step="0.01" id="addRowValue" class="row-edit" placeholder="${m.unit === 'usd' ? '$' : ''}new value"></td>
            <td style="text-align:right;"><button class="row-save-btn" id="addRowSave" style="background:rgba(52,211,153,0.18);border:1px solid rgba(52,211,153,0.4);color:var(--green);border-radius:6px;padding:4px 12px;font-size:0.72rem;font-weight:800;cursor:pointer;font-family:inherit;">+ Add</button></td>
          </tr>
        ` : ''}
        ${rows.map(p => `
          <tr data-period="${p.period_start}">
            <td>${p.period_start}</td>
            <td class="td-num">${
              canMutate
                ? `<input type="number" step="0.01" class="row-edit" value="${p.value ?? ''}" data-orig="${p.value ?? ''}">`
                : fmtVal(p.value, m.unit)
            }</td>
            ${showActions ? `<td style="text-align:right;"><button class="btn-ghost row-save" style="padding:4px 10px;font-size:0.72rem;">Save</button> <button class="btn-danger row-del" style="padding:4px 10px;font-size:0.72rem;">×</button></td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Wire "Add new" row.
  if (canMutate) {
    document.getElementById('addRowSave')?.addEventListener('click', async () => {
      const dateInput = document.getElementById('addRowDate');
      const valInput  = document.getElementById('addRowValue');
      let dateVal = dateInput.value;
      const v = valInput.value.trim();
      if (!dateVal) { dateInput.style.borderColor = 'var(--red)'; return; }
      if (v === '') { valInput.style.borderColor  = 'var(--red)'; return; }
      // Snap the chosen date to the right boundary (Wed for weekly, 1st for monthly).
      const d = new Date(dateVal + 'T00:00:00Z');
      if (activePeriod === 'monthly') {
        dateVal = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
      } else {
        const dow = d.getUTCDay();
        const forward = (3 - dow + 7) % 7;
        d.setUTCDate(d.getUTCDate() + forward);
        dateVal = d.toISOString().slice(0, 10);
      }
      try {
        // Use bulk-import so it works for BOTH manual and derived (as override).
        await apiFetch('?api=bulk-import', {
          method: 'POST',
          body: JSON.stringify({ rows: [{
            metric_key: metricKey,
            period_type: activePeriod,
            period_start: dateVal,
            value_num: Number(v),
          }] }),
        });
        await loadData(true);
        openDrilldown(metricKey);  // re-render with the new row
      } catch (e) {
        alert('Add failed: ' + (e.message || e));
      }
    });
  }

  // Wire inline edits (works for both manual metrics and derived overrides).
  if (canMutate) {
    wrap.querySelectorAll('tr[data-period]').forEach(tr => {
      const period_start = tr.dataset.period;
      tr.querySelector('.row-save')?.addEventListener('click', async () => {
        const inp = tr.querySelector('.row-edit');
        const v = inp.value.trim();
        try {
          // bulk-import accepts derived keys (as overrides); upsert doesn't.
          await apiFetch('?api=bulk-import', {
            method: 'POST',
            body: JSON.stringify({ rows: [{
              metric_key: metricKey,
              period_type: activePeriod,
              period_start,
              value_num: v === '' ? null : Number(v),
            }] }),
          });
          inp.dataset.orig = v;
          inp.style.borderColor = 'var(--green)';
          setTimeout(() => inp.style.borderColor = '', 700);
          await loadData(true);
          openDrilldown(metricKey);  // refresh modal contents
        } catch (e) {
          alert('Save failed: ' + (e.message || e));
        }
      });
      tr.querySelector('.row-del')?.addEventListener('click', async () => {
        if (!confirm(`Delete value for ${period_start}?`)) return;
        try {
          // delete works for both — removes the manual row / override.
          // For a derived metric this means "fall back to the auto-computed value."
          await apiFetch('?api=delete', {
            method: 'POST',
            body: JSON.stringify({ metric_key: metricKey, period_type: activePeriod, period_start }),
          });
          await loadData(true);
          openDrilldown(metricKey);
        } catch (e) {
          alert('Delete failed: ' + (e.message || e));
        }
      });
    });
  }

  document.getElementById('drillModal').classList.add('open');
}

function closeDrillModal() {
  document.getElementById('drillModal').classList.remove('open');
  if (drillChartInst) { try { drillChartInst.destroy(); } catch (_) {} drillChartInst = null; }
}
document.getElementById('drillClose').addEventListener('click', closeDrillModal);

// ── Drill-down: Edit metric (rename + invert) ──────────────────────
document.getElementById('drillEditBtn')?.addEventListener('click', () => {
  const form = document.getElementById('drillEditForm');
  const open = form.style.display === 'none' || !form.style.display;
  form.style.display = open ? 'block' : 'none';
  if (open) document.getElementById('drillEditLabel').focus();
});
document.getElementById('drillEditCancel')?.addEventListener('click', () => {
  document.getElementById('drillEditForm').style.display = 'none';
});
document.getElementById('drillEditSave')?.addEventListener('click', async () => {
  const btn = document.getElementById('drillEditSave');
  const msg = document.getElementById('drillEditMsg');
  const editBtn = document.getElementById('drillEditBtn');
  const key = editBtn?.dataset?.metricKey;
  if (!key) { msg.textContent = 'No metric loaded.'; return; }
  const m = catalog.find(x => x.key === key);
  if (!m) { msg.textContent = 'Metric not found in catalog.'; return; }
  const newLabel       = document.getElementById('drillEditLabel').value.trim();
  const newInvert      = document.getElementById('drillEditInvert').checked;
  const newPointLabels = document.getElementById('drillEditPointLabels').checked;
  const newStaff       = document.getElementById('drillEditStaff').checked;
  // Collect the checked extra tabs (the home tab is disabled in the UI).
  const newExtraTabs = Array.from(document.querySelectorAll('#drillEditTabs input[data-tab]'))
    .filter(cb => cb.checked && !cb.disabled)
    .map(cb => cb.dataset.tab);
  const curExtraTabs = Array.isArray(m.extra_tabs) ? [...m.extra_tabs].sort().join(',') : '';
  const newExtraJoin = [...newExtraTabs].sort().join(',');
  if (!newLabel) { msg.textContent = 'Label is required.'; return; }
  // Build patch with only fields the user actually changed.
  const patch = { key };
  if (newLabel       !== m.label)                  patch.label             = newLabel;
  if (newInvert      !== !!m.invert_chart)         patch.invert_chart      = newInvert;
  if (newPointLabels !== !!m.show_point_labels)    patch.show_point_labels = newPointLabels;
  if (newStaff       !== !!m.in_staff_meeting)     patch.in_staff_meeting  = newStaff;
  if (newExtraJoin   !== curExtraTabs)             patch.extra_tabs        = newExtraTabs;
  if (Object.keys(patch).length === 1) {
    msg.textContent = 'No changes to save.';
    return;
  }
  btn.disabled = true; btn.textContent = 'Saving…';
  msg.textContent = '';
  try {
    await apiFetch('?api=update-metric', { method:'POST', body: JSON.stringify(patch) });
    // Reflect in the in-memory catalog so the dashboard updates without a refetch.
    if (patch.label != null) m.label = patch.label;
    if (patch.invert_chart != null) m.invert_chart = patch.invert_chart;
    if (patch.show_point_labels != null) m.show_point_labels = patch.show_point_labels;
    if (patch.in_staff_meeting != null) m.in_staff_meeting = patch.in_staff_meeting;
    if (patch.extra_tabs != null) m.extra_tabs = patch.extra_tabs;
    msg.textContent = '✓ Saved';
    // Re-render the drilldown (chart + title) AND the grid card behind it.
    setTimeout(() => {
      document.getElementById('drillEditForm').style.display = 'none';
      msg.textContent = '';
      openDrilldown(key);
      renderAll();
    }, 500);
  } catch (e) {
    msg.textContent = 'Save failed: ' + (e.message || e);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
});

// Click-outside and Escape-to-close for every modal-overlay on the page.
// Clicks land on the backdrop (the overlay itself), not the inner card —
// so e.target === currentTarget means the user clicked outside the card.
['drillModal','addModal','importModal','createMetricModal'].forEach(id => {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.target !== el) return;
    if (id === 'drillModal') closeDrillModal();
    else el.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.modal-overlay.open');
  if (!open) return;
  if (open.id === 'drillModal') closeDrillModal();
  else open.classList.remove('open');
});

// ── Period / division tabs ──────────────────────────────────────────
document.getElementById('periodTabs').addEventListener('click', e => {
  const btn = e.target.closest('.pill-tab'); if (!btn) return;
  document.querySelectorAll('#periodTabs .pill-tab').forEach(b => b.classList.toggle('active', b === btn));
  activePeriod = btn.dataset.period;
  // Swap to the period-appropriate default range so the chart density
  // stays sensible (weekly = last 13 weeks, monthly = last 4 months).
  const defaultPreset = activePeriod === 'monthly' ? 'last-4m' : 'last-13w';
  const r = presetRange(defaultPreset);
  dateFrom = r.from; dateTo = r.to;
  document.getElementById('dateFrom').value = r.from;
  document.getElementById('dateTo').value   = r.to;
  document.querySelectorAll('.dr-preset').forEach(x => x.classList.toggle('active', x.dataset.preset === defaultPreset));
  document.getElementById('drLabel').textContent = labelForPreset(defaultPreset, r.from, r.to);
  localStorage.setItem('weekly-stats:range', JSON.stringify({ preset: defaultPreset }));
  loadData();
});
document.getElementById('divisionTabs').addEventListener('click', e => {
  const btn = e.target.closest('.pill-tab'); if (!btn) return;
  document.querySelectorAll('#divisionTabs .pill-tab').forEach(b => b.classList.toggle('active', b === btn));
  activeDivision = btn.dataset.div;
  // Division switching is purely a client-side filter — we already have
  // every metric's series in memory. Skip the network call and re-render
  // from cache for instant tab switches.
  if (seriesByMetric && seriesByMetric.size) renderAll();
  else loadData();
});

// ── Date range UI ────────────────────────────────────────────────────
document.getElementById('daterangeBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('daterangePopup').classList.toggle('open');
});
document.addEventListener('click', e => {
  const popup = document.getElementById('daterangePopup');
  const wrap  = document.getElementById('daterangeWrap');
  if (popup.classList.contains('open') && !wrap.contains(e.target)) popup.classList.remove('open');
  const navMenu = document.getElementById('navDropdownMenu');
  const nav     = document.getElementById('navDropdown');
  if (navMenu.classList.contains('open') && !nav.contains(e.target)) navMenu.classList.remove('open');
});
document.querySelectorAll('.dr-preset').forEach(b => {
  b.addEventListener('click', () => {
    const r = presetRange(b.dataset.preset);
    dateFrom = r.from; dateTo = r.to;
    document.getElementById('dateFrom').value = r.from;
    document.getElementById('dateTo').value   = r.to;
    document.querySelectorAll('.dr-preset').forEach(x => x.classList.toggle('active', x === b));
    document.getElementById('drLabel').textContent = labelForPreset(b.dataset.preset, r.from, r.to);
    localStorage.setItem('weekly-stats:range', JSON.stringify({ preset: b.dataset.preset }));
    document.getElementById('daterangePopup').classList.remove('open');
    loadData();
  });
});
document.getElementById('drApply').addEventListener('click', () => {
  const f = document.getElementById('dateFrom').value;
  const t = document.getElementById('dateTo').value;
  if (!f || !t || f > t) return;
  dateFrom = f; dateTo = t;
  document.getElementById('drLabel').textContent = `${f} → ${t}`;
  document.querySelectorAll('.dr-preset').forEach(x => x.classList.remove('active'));
  localStorage.setItem('weekly-stats:range', JSON.stringify({ from: f, to: t, preset: 'custom' }));
  document.getElementById('daterangePopup').classList.remove('open');
  loadData();
});

// ── Nav dropdown ────────────────────────────────────────────────────
document.getElementById('navDropdownBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('navDropdownMenu').classList.toggle('open');
});

// ── Theme + refresh + sign-out ──────────────────────────────────────
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
  // Charts need to re-render so axis colors update.
  renderAll();
});
document.getElementById('refreshBtn').addEventListener('click', loadData);
document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supa.auth.signOut();
  location.href = 'home.html';
});
document.getElementById('deniedSignOutBtn').addEventListener('click', async () => {
  await supa.auth.signOut();
  location.href = 'home.html';
});

// ── Login form ──────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('sendBtn');
  const err = document.getElementById('loginError');
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (e) {
    err.textContent = e.message || 'Sign-in failed';
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});

// ── Add-entry modal ─────────────────────────────────────────────────
function populateAddMetricSelect() {
  const sel = document.getElementById('addMetric');
  const manual = catalog.filter(m => m.source === 'manual');
  sel.innerHTML = manual.map(m => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.label)} (${m.division})</option>`).join('');
}
function applyEditCapabilityToButtons() {
  const addBtn = document.getElementById('addEntryBtn');
  const impBtn = document.getElementById('importBtn');
  const reBtn  = document.getElementById('reorderBtn');
  const cmBtn  = document.getElementById('createMetricBtn');
  addBtn.style.display = capabilities.can_edit   ? '' : 'none';
  impBtn.style.display = capabilities.can_import ? '' : 'none';
  if (reBtn) reBtn.style.display = capabilities.can_edit ? '' : 'none';
  if (cmBtn) cmBtn.style.display = capabilities.can_edit ? '' : 'none';
}
document.getElementById('addEntryBtn').addEventListener('click', () => {
  // Default to the Wednesday that closes the current Thu→Wed week for
  // weekly, or the 1st of the month for monthly.
  const now = new Date();
  const dow = now.getUTCDay();
  const forward = (3 - dow + 7) % 7;
  const wedAnchor = new Date(now); wedAnchor.setUTCDate(now.getUTCDate() + forward);
  document.getElementById('addPeriodType').value = 'weekly';
  document.getElementById('addPeriodStart').value = isoDate(wedAnchor);
  document.getElementById('addValue').value = '';
  document.getElementById('addNotes').value = '';
  document.getElementById('addError').textContent = '';
  document.getElementById('addModal').classList.add('open');
});
document.getElementById('addCancel').addEventListener('click', () => {
  document.getElementById('addModal').classList.remove('open');
});
document.getElementById('addPeriodType').addEventListener('change', (e) => {
  // Snap the date to the appropriate boundary when the user toggles.
  const v = document.getElementById('addPeriodStart').value;
  if (!v) return;
  const d = new Date(v + 'T00:00:00Z');
  if (e.target.value === 'monthly') {
    document.getElementById('addPeriodStart').value = isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  } else {
    // Snap to the Wednesday that closes the team's Thu→Wed business week.
    const dow = d.getUTCDay();
    const forward = (3 - dow + 7) % 7;
    d.setUTCDate(d.getUTCDate() + forward);
    document.getElementById('addPeriodStart').value = isoDate(d);
  }
});
document.getElementById('addSave').addEventListener('click', async () => {
  const err = document.getElementById('addError');
  err.textContent = '';
  const metric_key   = document.getElementById('addMetric').value;
  const period_type  = document.getElementById('addPeriodType').value;
  const period_start = document.getElementById('addPeriodStart').value;
  const value        = document.getElementById('addValue').value.trim();
  const notes        = document.getElementById('addNotes').value.trim();
  if (!period_start) { err.textContent = 'Pick a period start date.'; return; }
  if (value === '')  { err.textContent = 'Enter a value.';            return; }
  try {
    await apiFetch('?api=upsert', {
      method: 'POST',
      body: JSON.stringify({ metric_key, period_type, period_start, value_num: Number(value), notes: notes || null }),
    });
    document.getElementById('addModal').classList.remove('open');
    await loadData(true);
  } catch (e) {
    err.textContent = e.message || 'Save failed';
  }
});

// ── Import modal ────────────────────────────────────────────────────
let parsedImportRows = [];

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importText').value = '';
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importConfirm').disabled = true;
  document.getElementById('importConfirm').textContent = 'Import (0 rows)';
  parsedImportRows = [];
  document.getElementById('importModal').classList.add('open');
});

// Reorder Mode: toggle in → Save commits via api=reorder, Cancel restores
// from server. Wired here so it runs on page load.
document.getElementById('reorderBtn')?.addEventListener('click', () => {
  if (!capabilities.can_edit) return;
  _enterReorderMode();
});

// Current-period toggle: show/hide the in-progress week/month everywhere.
// View-only preference (available to everyone), remembered across tabs +
// reloads. Re-renders in place from the cached series — no network call.
document.getElementById('currentWeekBtn')?.addEventListener('click', () => {
  _showCurrentPeriod = !_showCurrentPeriod;
  localStorage.setItem('weekly-stats:showCurrentPeriod', _showCurrentPeriod ? '1' : '0');
  updateCurrentPeriodBtn();
  renderAll();
});

// ── Add manual graph (create-metric modal) ─────────────────────────
document.getElementById('createMetricBtn')?.addEventListener('click', () => {
  if (!capabilities.can_edit) return;
  // Reset the form to sane defaults each open.
  document.getElementById('cmLabel').value = '';
  document.getElementById('cmDivision').value = 'D4';
  document.getElementById('cmUnit').value = 'count';
  document.getElementById('cmStaff').checked = false;
  document.querySelectorAll('#cmTabs input[data-tab]').forEach(cb => cb.checked = false);
  document.getElementById('cmMsg').textContent = '';
  document.getElementById('createMetricModal').classList.add('open');
  document.getElementById('cmLabel').focus();
});
document.getElementById('cmCancel')?.addEventListener('click', () => {
  document.getElementById('createMetricModal').classList.remove('open');
});
document.getElementById('cmSave')?.addEventListener('click', async () => {
  const btn = document.getElementById('cmSave');
  const msg = document.getElementById('cmMsg');
  const label = document.getElementById('cmLabel').value.trim();
  const division = document.getElementById('cmDivision').value;
  const unit = document.getElementById('cmUnit').value;
  const inStaff = document.getElementById('cmStaff').checked;
  const extraTabs = Array.from(document.querySelectorAll('#cmTabs input[data-tab]'))
    .filter(cb => cb.checked && cb.dataset.tab !== division) // skip home tab
    .map(cb => cb.dataset.tab);
  if (!label) { msg.textContent = 'Name is required.'; return; }
  btn.disabled = true; btn.textContent = 'Creating…';
  msg.textContent = '';
  try {
    const res = await apiFetch('?api=create-metric', {
      method: 'POST',
      body: JSON.stringify({ label, division, unit, in_staff_meeting: inStaff, extra_tabs: extraTabs }),
    });
    msg.textContent = '✓ Created — refreshing catalog…';
    // Re-fetch the catalog so the new metric shows up immediately.
    await fetchCatalog();
    await loadData(true);
    setTimeout(() => {
      document.getElementById('createMetricModal').classList.remove('open');
      msg.textContent = '';
    }, 700);
  } catch (e) {
    msg.textContent = 'Create failed: ' + (e.message || e);
  } finally {
    btn.disabled = false; btn.textContent = 'Create';
  }
});
document.getElementById('reorderSaveBtn')?.addEventListener('click', _saveReorder);
document.getElementById('reorderCancelBtn')?.addEventListener('click', () => _exitReorderMode(true));
document.getElementById('importCancel').addEventListener('click', () => {
  document.getElementById('importModal').classList.remove('open');
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('importText').value = reader.result; };
  reader.readAsText(f);
});

// Drag/drop onto the textarea
(function wireDrop() {
  const ta = document.getElementById('importText');
  ['dragover','dragleave','drop'].forEach(ev => ta.addEventListener(ev, e => { e.preventDefault(); }));
  ta.addEventListener('drop', e => {
    const f = e.dataTransfer.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { ta.value = reader.result; };
    reader.readAsText(f);
  });
})();

document.getElementById('importParse').addEventListener('click', () => {
  const raw = document.getElementById('importText').value.trim();
  const preview = document.getElementById('importPreview');
  if (!raw) { preview.innerHTML = `<div class="inline-error">Paste CSV first.</div>`; return; }
  let parsed;
  try { parsed = parseCsv(raw); } catch (e) { preview.innerHTML = `<div class="inline-error">${escapeHtml(String(e))}</div>`; return; }
  if (!parsed.length) { preview.innerHTML = `<div class="inline-error">No rows detected.</div>`; return; }

  // Validate against the metric catalog.
  const known = new Map(catalog.map(m => [m.key, m]));
  const valid = [];
  const invalid = [];
  for (const r of parsed) {
    const meta = known.get(r.metric_key);
    if (!meta)                                       { invalid.push({ ...r, reason: 'unknown metric_key' }); continue; }
    if (meta.source !== 'manual')                    { invalid.push({ ...r, reason: 'metric is derived (auto)' }); continue; }
    if (!['weekly','monthly'].includes(r.period_type)){ invalid.push({ ...r, reason: 'bad period_type' }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.period_start)) { invalid.push({ ...r, reason: 'bad period_start' }); continue; }
    if (!Number.isFinite(Number(r.value_num)))       { invalid.push({ ...r, reason: 'bad value_num' }); continue; }
    valid.push(r);
  }
  parsedImportRows = valid;

  const tbl = (rows, status) => rows.length ? `
    <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin:14px 0 6px;">${status} (${rows.length})</div>
    <table class="raw-table">
      <thead><tr><th>Metric</th><th>Period</th><th style="text-align:right;">Value</th>${status.startsWith('Skipped') ? '<th>Reason</th>' : ''}</tr></thead>
      <tbody>${rows.slice(0, 50).map(r => `
        <tr>
          <td>${escapeHtml(r.metric_key)}</td>
          <td>${escapeHtml(r.period_type || 'weekly')} · ${escapeHtml(r.period_start)}</td>
          <td class="td-num">${escapeHtml(r.value_num)}</td>
          ${status.startsWith('Skipped') ? `<td style="color:var(--red);">${escapeHtml(r.reason)}</td>` : ''}
        </tr>`).join('')}
        ${rows.length > 50 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">… +${rows.length - 50} more</td></tr>` : ''}
      </tbody>
    </table>` : '';
  preview.innerHTML = tbl(valid, 'Ready to import') + tbl(invalid, 'Skipped');

  const btn = document.getElementById('importConfirm');
  btn.disabled = valid.length === 0;
  btn.textContent = `Import (${valid.length} row${valid.length === 1 ? '' : 's'})`;
});

document.getElementById('importConfirm').addEventListener('click', async () => {
  const btn = document.getElementById('importConfirm');
  if (!parsedImportRows.length) return;
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    let upserted = 0, skipped = 0;
    for (let i = 0; i < parsedImportRows.length; i += 200) {
      const chunk = parsedImportRows.slice(i, i + 200).map(r => ({
        metric_key: r.metric_key,
        period_type: r.period_type || 'weekly',
        period_start: r.period_start,
        value_num: Number(r.value_num),
        notes: r.notes || null,
      }));
      const j = await apiFetch('?api=bulk-import', { method: 'POST', body: JSON.stringify({ rows: chunk }) });
      upserted += j.upserted || 0;
      skipped  += j.skipped  || 0;
    }
    document.getElementById('importPreview').innerHTML = `<div class="banner banner-info">✓ Imported ${upserted} row${upserted === 1 ? '' : 's'} (${skipped} skipped)</div>`;
    btn.textContent = 'Done';
    await loadData(true);
    setTimeout(() => document.getElementById('importModal').classList.remove('open'), 1200);
  } catch (e) {
    document.getElementById('importPreview').innerHTML += `<div class="inline-error">Import failed: ${escapeHtml(e.message || e)}</div>`;
    btn.disabled = false; btn.textContent = `Import (${parsedImportRows.length} rows)`;
  }
});

// Tiny CSV/TSV parser. Handles quoted fields with embedded commas / newlines.
// Auto-detects delimiter (tab if any tabs in header line, else comma).
function parseCsv(text) {
  const headerLineEnd = text.indexOf('\n');
  const headerLine = headerLineEnd >= 0 ? text.slice(0, headerLineEnd) : text;
  const delim = headerLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { inQ = false; continue; }
      field += c;
    } else {
      if (c === '"') { inQ = true; continue; }
      if (c === delim) { cur.push(field); field = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; continue; }
      field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }

  if (rows.length < 2) throw new Error('Need at least a header row + 1 data row');
  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const iKey   = idx('metric_key');
  const iType  = idx('period_type');
  const iStart = idx('period_start');
  const iVal   = idx('value_num');
  const iNotes = idx('notes');
  if (iKey < 0 || iStart < 0 || iVal < 0) throw new Error('Headers must include: metric_key, period_start, value_num (period_type / notes optional)');
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => String(v).trim() === '')) continue;
    out.push({
      metric_key:   String(row[iKey]   ?? '').trim(),
      period_type:  iType  >= 0 ? String(row[iType]  ?? 'weekly').trim() : 'weekly',
      period_start: String(row[iStart] ?? '').trim(),
      value_num:    String(row[iVal]   ?? '').trim(),
      notes:        iNotes >= 0 ? String(row[iNotes] ?? '').trim() : '',
    });
  }
  return out;
}

// ── Realtime: a manual upsert from somewhere else should reflect here. ──
function setupRealtime() {
  try {
    supa.channel('weekly-stats-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_stats' }, () => loadData())
      .subscribe();
  } catch (_) { /* non-fatal */ }
}

// ── Go ──────────────────────────────────────────────────────────────
initAuth();
