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
  all:    ['phone_sales_total_gi','mentorship_gi_overall','refunds_salvaged_amount','disputes_won'],
  D2:     ['phone_sales_total_gi','phone_sales_recurrent_gi','mentorship_gi_overall','masterclass_gi_phone'],
  D3:     ['refunds_salvaged_amount','refunds_approved_amount','disputes_won','recovered_failed_rebills'],
  D4:     ['mentorship_wins','mentorship_resigns_weekly','students_onboarded','students_completed_mentorship'],
  D5:     ['masterclass_starters','masterclass_purchasers','masterclass_gi_phone','active_masterclass_students'],
};

// ── Formatters ──────────────────────────────────────────────────────
const fmtMoney = (v) => v == null ? '—' : '$' + Math.round(Number(v)).toLocaleString();
const fmtCount = (v) => v == null ? '—' : Number(v).toLocaleString();
const fmtVal   = (v, unit) => unit === 'usd' ? fmtMoney(v) : fmtCount(v);
const fmtPct   = (cur, prev) => {
  if (prev == null || prev === 0) return cur > 0 ? '+∞' : '0%';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
};

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
    case 'last-4w':  from.setUTCDate(now.getUTCDate() - 28); break;
    case 'last-13w': from.setUTCDate(now.getUTCDate() - 91); break;
    case 'last-26w': from.setUTCDate(now.getUTCDate() - 182); break;
    case 'ytd':      from.setUTCMonth(0); from.setUTCDate(1); break;
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
  const map = { 'last-4w':'Last 4 Weeks','last-13w':'Last 13 Weeks','last-26w':'Last 26 Weeks','ytd':'Year to Date','last-6m':'Last 6 Months','last-12m':'Last 12 Months' };
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

async function loadData() {
  setBanner('');
  spin(true);
  try {
    const url = `?api=series&period=${activePeriod}&from=${dateFrom}&to=${dateTo}`
      + (activeDivision !== 'all' ? `&division=${activeDivision}` : '');
    const j = await apiFetch(url);
    seriesByMetric = new Map((j.series || []).map(s => [s.metric_key, s.points]));
    renderAll();
  } catch (e) {
    setBanner('Failed to load: ' + (e.message || e), 'error');
  } finally {
    spin(false);
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
    if (activePeriod === 'weekly'  && m.division === 'monthly') return false;
    if (activePeriod === 'monthly' && m.division !== 'monthly') return false;
    if (activeDivision === 'all') return true;
    return m.division === activeDivision;
  });
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
    const pts = seriesByMetric.get(m.key) || [];
    const { current, previous } = lastTwoValues(pts);
    const delta = current - previous;
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
    return `
      <div class="kpi-card" style="--c-color:${colors[i]};--c-glow:${glows[i]};">
        <div class="kpi-label">${escapeHtml(m.label)}</div>
        <div class="kpi-value">${fmtVal(current, m.unit)}</div>
        <div class="kpi-delta ${cls}">${arrow} ${fmtPct(current, previous)} <span style="color:var(--text-dim);font-weight:600;margin-left:4px;">vs prior ${activePeriod === 'weekly' ? 'week' : 'month'}</span></div>
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
    const pts = seriesByMetric.get(m.key) || [];
    const { current, previous } = lastTwoValues(pts);
    const delta = current - previous;
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
    return `
      <div class="chart-card" data-key="${escapeHtml(m.key)}">
        <div class="chart-card-head">
          <div class="chart-card-title">${escapeHtml(m.label)}</div>
          <div class="chart-card-source ${m.source === 'derived' ? 'src-derived' : 'src-manual'}">${m.source}</div>
        </div>
        <div class="chart-card-now">
          <span class="chart-card-value">${fmtVal(current, m.unit)}</span>
          <span class="chart-card-delta ${cls}">${arrow} ${fmtPct(current, previous)}</span>
        </div>
        <div class="chart-card-wrap"><canvas id="c-${cssId(m.key)}"></canvas></div>
        <div class="chart-card-foot">${pts.length} ${activePeriod === 'weekly' ? 'weeks' : 'months'} · ${m.division} · click to expand</div>
      </div>`;
  }).join('');

  // Mount Chart.js instances after the DOM has the canvases.
  for (const m of visible) {
    const ctx = document.getElementById(`c-${cssId(m.key)}`);
    if (!ctx) continue;
    chartInstances.set(m.key, makeMiniChart(ctx, seriesByMetric.get(m.key) || [], m));
  }

  // Click-to-drilldown.
  grid.querySelectorAll('.chart-card').forEach(card => {
    card.addEventListener('click', () => openDrilldown(card.dataset.key));
  });
}

function cssId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

function makeMiniChart(canvas, points, metric) {
  const ctx = canvas.getContext('2d');
  // Money metrics → green-tinted bars; counts → blue-tinted. Manual entries
  // get a softer dashed line variant so we can spot them at a glance.
  const isUsd = metric.unit === 'usd';
  const color = metric.source === 'manual' ? '#a78bfa' : (isUsd ? '#34d399' : '#6b9eff');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 160);
  grad.addColorStop(0, color + 'CC');
  grad.addColorStop(1, color + '11');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: points.map(p => p.period_start),
      datasets: [{
        data: points.map(p => p.value),
        backgroundColor: grad,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmtVal(ctx.raw, metric.unit),
          },
        },
      },
      scales: {
        x: { ticks: { color: '#7880a8', font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: '#7880a8', font: { size: 9 }, callback: (v) => isUsd ? '$' + (v/1000).toFixed(0) + 'k' : v }, grid: { color: 'rgba(255,255,255,0.04)' } },
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
  document.getElementById('drillSub').textContent = `${m.division} · ${m.source === 'derived' ? 'auto-computed from existing data' : 'manually entered / imported'} · ${pts.length} data points`;

  // Big chart
  if (drillChartInst) { try { drillChartInst.destroy(); } catch (_) {} drillChartInst = null; }
  const canvas = document.getElementById('drillChart');
  drillChartInst = makeMiniChart(canvas, pts, m);

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
        await loadData();
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
          await loadData();
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
          await loadData();
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

// Click-outside and Escape-to-close for every modal-overlay on the page.
// Clicks land on the backdrop (the overlay itself), not the inner card —
// so e.target === currentTarget means the user clicked outside the card.
['drillModal','addModal','importModal'].forEach(id => {
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
  loadData();
});
document.getElementById('divisionTabs').addEventListener('click', e => {
  const btn = e.target.closest('.pill-tab'); if (!btn) return;
  document.querySelectorAll('#divisionTabs .pill-tab').forEach(b => b.classList.toggle('active', b === btn));
  activeDivision = btn.dataset.div;
  loadData();
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
  addBtn.style.display = capabilities.can_edit   ? '' : 'none';
  impBtn.style.display = capabilities.can_import ? '' : 'none';
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
    await loadData();
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
    await loadData();
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
