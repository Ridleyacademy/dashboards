// org-board.js — standalone Org Board dashboard.
// The board renderers/editors/zoom/drawer below (from `renderOrgBoard` onward)
// are ported verbatim from the old Access & Org "Org Board" tab; this prelude
// supplies the globals they expect (api → access-control, session, escapeHtml,
// the data arrays) plus page bootstrap: auth, topbar, and the view/edit gate.
//
// Access: any signed-in user can VIEW (PAGES roles:'*'). Editing is gated by
// org.edit_structure / org.assign_holders / org.edit_policies (server enforces
// too); an "Edit mode" toggle appears only for those who hold an edit key.
'use strict';

const SUPABASE_URL = 'https://pojqljrhhtnigyrtzdzz.supabase.co';
window.SUPABASE_URL = SUPABASE_URL;   // for the shared targets-widget
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const AC_BASE = SUPABASE_URL + '/functions/v1/access-control';
const WS_BASE = SUPABASE_URL + '/functions/v1/weekly-stats';
const TG_BASE = SUPABASE_URL + '/functions/v1/org-targets';

let session = null;

// ── Shared helpers the ported board code expects ──────────────────────────
function escapeHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// All org structure/holder/policy calls go to the access-control edge fn
// (unchanged) — this is the same contract the old tab used.
async function api(path, opts = {}) {
  const r = await fetch(AC_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
// Weekly-stats fetch (stats popups). Read-only; org.view is enough server-side.
async function wsApi(path) {
  const r = await fetch(WS_BASE + path, { headers: { Authorization: 'Bearer ' + session.access_token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
// Policy writes (org-policy-write edge fn): creator-based model — same as the
// dedicated Policies dashboard. Anyone creates; only creator/admin edits.
async function pwApi(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/functions/v1/org-policy-write' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
// True if the signed-in user is an admin (bypasses the creator check).
function orgIsAdmin() { return !!(session && session.user && session.user.app_metadata && session.user.app_metadata.is_admin === true); }
// Targets (org-targets edge fn): staff self-assign / seniors assign per post.
async function tgApi(path, opts = {}) {
  const r = await fetch(TG_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

// ── Board data (loaded by loadOrgTab, which is ported below) ───────────────
let divisionsData = [], departmentsData = [], postsData = [], execPostsData = [];
let activeHoldersByPost = {}, execHoldersByExecPost = {};
let usersData = [], roles = [], permissions = [], rolePerms = [];
let selectedKind = 'user', selectedId = null;

// ── Edit-mode gate ─────────────────────────────────────────────────────────
// __orgCaps is read by the Stage-C drag handlers and the drawer. CSS keyed off
// body[data-org-edit] hides create/seed/save/delete controls when off.
window.__orgCaps = { isAdmin: false, editStructure: false, assign: false, editPolicies: false };
function orgCanEdit() { return document.body.dataset.orgEdit === '1'; }
function _setEditMode(on) {
  document.body.dataset.orgEdit = on ? '1' : '0';
  const btn = document.getElementById('orgEditToggle');
  if (btn) { btn.classList.toggle('on', on); btn.textContent = on ? '✓ Editing' : '✎ Edit mode'; }
  // Re-render so draggable attributes / affordances reflect the new mode.
  if (divisionsData.length || execPostsData.length) { try { renderOrgBoard(); } catch (_) {} }
}

// ── Topbar / chrome ─────────────────────────────────────────────────────────
function setState(s) { document.body.dataset.state = s; }
function _wireChrome() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') document.body.classList.add('light');
  const themeBtn = document.getElementById('themeBtn');
  const paintTheme = () => { if (themeBtn) themeBtn.textContent = document.body.classList.contains('light') ? '🌙' : '☀️'; };
  paintTheme();
  themeBtn?.addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark'); paintTheme(); });
  const navBtn = document.getElementById('navDropdownBtn');
  navBtn?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('navDropMenu')?.classList.toggle('open'); });
  document.addEventListener('click', () => document.getElementById('navDropMenu')?.classList.remove('open'));
  document.getElementById('signOutBtn')?.addEventListener('click', async () => { await supa.auth.signOut(); location.href = 'home.html'; });
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadOrgTab());
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('loginErr'); if (err) err.textContent = '';
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) { if (err) err.textContent = error.message; return; }
    location.reload();
  });
}

async function init() {
  _wireChrome();
  const { data: { session: s } } = await supa.auth.getSession();
  if (!s) { setState('login'); return; }
  session = s;
  const email = (s.user && s.user.email) || '';
  const ua = document.getElementById('userAvatar'); if (ua) ua.textContent = (email[0] || 'U').toUpperCase();
  const ue = document.getElementById('userEmail'); if (ue) ue.textContent = email;

  const eff = (window.RidleyPerms && window.RidleyPerms.effective) ? window.RidleyPerms.effective(s.user) : {};
  const p2 = eff.permissions_v2 || [];
  const isAdmin = !!eff.is_admin;
  window.__orgCaps = {
    isAdmin,
    editStructure: isAdmin || p2.includes('org.edit_structure'),
    assign: isAdmin || p2.includes('org.assign_holders'),
    editPolicies: isAdmin || p2.includes('org.edit_policies'),
  };
  const canEditAny = __orgCaps.editStructure || __orgCaps.assign || __orgCaps.editPolicies;
  const toggle = document.getElementById('orgEditToggle');
  if (toggle) {
    toggle.style.display = canEditAny ? 'inline-flex' : 'none';
    toggle.addEventListener('click', () => _setEditMode(!orgCanEdit()));
  }
  // Editing is on by default for anyone with edit rights — no mode to enter to
  // move things. The toggle just lets them hide the edit controls if they want
  // a clean read-only view. Users without edit rights stay read-only.
  _setEditMode(canEditAny);

  // Catalog gives roles (post role chips); users give holder name resolution.
  // Both best-effort — a pure viewer without users.view still sees the board,
  // just with fewer resolved names.
  try { const cat = await api('?api=catalog'); roles = cat.roles || []; permissions = cat.permissions || []; rolePerms = cat.role_permissions || []; } catch (_) {}
  try { const u = await api('?api=users'); usersData = u.rows || []; } catch (_) { usersData = []; }

  // Shared policy reader/builder (same UX as the Policies & Orders dashboard).
  // allPolicies feeds series-name suggestions; best-effort.
  try { const pj = await api('?api=policies'); window._orgAllPolicies = pj.rows || []; } catch (_) { window._orgAllPolicies = []; }
  if (window.PolicyWidget) window.PolicyWidget.init({
    supabaseUrl: SUPABASE_URL,
    getToken: () => session.access_token,
    isAdmin: () => orgIsAdmin(),
    userId: () => session && session.user && session.user.id,
    divisions: () => divisionsData,
    departments: () => departmentsData,
    posts: () => postsData,
    execPosts: () => execPostsData,
    users: () => usersData,
    allPolicies: () => window._orgAllPolicies || [],
  });

  setState('app');
  await loadOrgTab();
}

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════════════════════════
// PORTED ORG BOARD  (verbatim from access.js — renderers, editors, drawer,
// zoom, policy modals). Globals above satisfy its external references.
// ═══════════════════════════════════════════════════════════════════════════
async function loadOrgTab() {
  const board = document.getElementById('orgBoard');
  board.innerHTML = '<div style="padding:24px;color:var(--text-dim);font-size:0.84rem;">Loading…</div>';
  try {
    const [d, dep, p, h, ep, eph] = await Promise.all([
      api('?api=divisions'),
      api('?api=departments'),
      api('?api=posts'),
      api('?api=post-holders'),
      api('?api=exec-posts').catch(() => ({ rows: [] })),
      api('?api=exec-post-holders').catch(() => ({ rows: [] })),
    ]);
    divisionsData = d.rows || [];
    departmentsData = dep.rows || [];
    postsData = p.rows || [];
    execPostsData = ep.rows || [];
    activeHoldersByPost = {};
    for (const row of (h.rows || [])) {
      if (row.ended_at) continue;
      (activeHoldersByPost[row.post_id] ||= []).push(row);
    }
    execHoldersByExecPost = {};
    for (const row of (eph.rows || [])) {
      if (row.ended_at) continue;
      (execHoldersByExecPost[row.exec_post_id] ||= []).push(row);
    }
    document.getElementById('axCount').textContent = `${divisionsData.length} div · ${departmentsData.length} dept · ${postsData.length} posts · ${execPostsData.length} exec`;
    renderOrgBoard();
  } catch (e) { board.innerHTML = `<div style="padding:24px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`; }
  // Hook up zoom controls AFTER the board is rendered so the natural-size
  // measurement in applyOrgZoom sees the real content. Idempotent — the
  // helper re-binds each load.
  initOrgZoom();
}

// ── Org-board zoom controls ────────────────────────────────────────────
// Apply a CSS transform: scale() on #orgBoardZoom so the whole board can
// shrink down to fit a small viewport, or zoom in for detail. The scaled
// element's layout box doesn't change with transform, so we also set
// --org-zoom-w on the inner element to (naturalWidth × zoom) so the
// wrapper's horizontal scrollbar reflects the visible size.
//
// Zoom level is persisted in localStorage so it survives a reload. The
// "Fit" button auto-computes the scale needed to show the whole board
// without horizontal scrolling.
const ORG_ZOOM_KEY = 'orgBoard:zoom:v1';
let _orgZoomNaturalWidth = 0;
let _orgZoomNaturalHeight = 0;
function _measureOrgZoomNatural() {
  const inner = document.getElementById('orgBoardZoom');
  if (!inner) return { w: 0, h: 0 };
  // Temporarily clear transform so we measure the natural (un-scaled)
  // size of the inner element, then restore.
  const prev = inner.style.transform;
  inner.style.transform = 'none';
  // scrollWidth/Height includes overflowing children (all divisions even
  // if they'd normally be hidden behind the inner board's scrollbar).
  const w = inner.scrollWidth;
  const h = inner.scrollHeight;
  inner.style.transform = prev;
  return { w, h };
}
// Zoom range — wider than v279 so users can really shrink the board down
// or zoom in for detail work.
const ORG_ZOOM_MIN = 0.1;   // 10%
const ORG_ZOOM_MAX = 3.0;   // 300%
const ORG_ZOOM_STEP = 0.05; // 5% per button click

// applyOrgZoom — sets the visual scale. `continuous` skips the CSS
// transition so a drag of the range slider or wheel scroll feels
// instantaneous (no .08s lag per micro-step).
function applyOrgZoom(zoom, continuous = false) {
  const inner = document.getElementById('orgBoardZoom');
  const sizer = document.getElementById('orgBoardZoomSizer');
  const wrap  = document.getElementById('orgBoardZoomWrap');
  if (!inner || !sizer || !wrap) return;
  const z = Math.max(ORG_ZOOM_MIN, Math.min(ORG_ZOOM_MAX, Number(zoom) || 1));
  // Always re-measure on every apply — the org board content can change
  // (add/remove division) between renders.
  const m = _measureOrgZoomNatural();
  _orgZoomNaturalWidth = m.w;
  _orgZoomNaturalHeight = m.h;
  if (continuous) inner.style.transition = 'none';
  else            inner.style.transition = '';
  inner.style.setProperty('--org-zoom', String(z));
  if (_orgZoomNaturalWidth)  sizer.style.width  = Math.ceil(_orgZoomNaturalWidth  * z) + 'px';
  if (_orgZoomNaturalHeight) sizer.style.height = Math.ceil(_orgZoomNaturalHeight * z) + 'px';
  const pct = document.getElementById('orgZoomPct');
  if (pct) pct.textContent = Math.round(z * 100) + '%';
  const slider = document.getElementById('orgZoomRange');
  if (slider && Math.abs(parseFloat(slider.value) - z * 100) > 0.5) slider.value = String(Math.round(z * 100));
  try { localStorage.setItem(ORG_ZOOM_KEY, String(z)); } catch (_) {}
}
// Scale so the whole board fits inside the viewport — width AND height, so it
// fills the page without either scrollbar. Never zooms past 100%.
function _computeFitZoom() {
  const wrap = document.getElementById('orgBoardZoomWrap');
  const m = _measureOrgZoomNatural();
  _orgZoomNaturalWidth = m.w; _orgZoomNaturalHeight = m.h;
  if (!wrap || !m.w) return 1;
  const vw = wrap.clientWidth - 8;
  const vh = wrap.clientHeight - 8;
  const byW = vw > 0 ? vw / m.w : 1;
  const byH = (vh > 0 && m.h) ? vh / m.h : byW;
  return Math.max(ORG_ZOOM_MIN, Math.min(byW, byH, 1));
}
function initOrgZoom() {
  const inBtn  = document.getElementById('orgZoomIn');
  const outBtn = document.getElementById('orgZoomOut');
  const rstBtn = document.getElementById('orgZoomReset');
  const fitBtn = document.getElementById('orgZoomFit');
  const range  = document.getElementById('orgZoomRange');
  const wrap   = document.getElementById('orgBoardZoomWrap');
  if (!inBtn || !outBtn || !rstBtn || !fitBtn || !range || !wrap) return;
  // Re-measure natural size — content may have changed since last render.
  _orgZoomNaturalWidth = 0; _orgZoomNaturalHeight = 0;
  // Default to Fit on first load (no saved preference); otherwise honour it.
  let z;
  try { const saved = localStorage.getItem(ORG_ZOOM_KEY); z = (saved != null && parseFloat(saved) > 0) ? parseFloat(saved) : _computeFitZoom(); } catch (_) { z = _computeFitZoom(); }
  applyOrgZoom(z);
  // Idempotent re-binding: clone-and-replace strips any old listeners.
  const fresh = (el) => { const c = el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; };
  const inN  = fresh(inBtn), outN = fresh(outBtn), rstN = fresh(rstBtn), fitN = fresh(fitBtn), rangeN = fresh(range);
  const cur = () => parseFloat(getComputedStyle(document.getElementById('orgBoardZoom')).getPropertyValue('--org-zoom')) || 1;
  inN .addEventListener('click', () => applyOrgZoom(cur() + ORG_ZOOM_STEP));
  outN.addEventListener('click', () => applyOrgZoom(cur() - ORG_ZOOM_STEP));
  rstN.addEventListener('click', () => applyOrgZoom(1));
  fitN.addEventListener('click', () => applyOrgZoom(_computeFitZoom()));
  // Range slider — fully continuous; transition is suppressed during drag.
  rangeN.addEventListener('input', (e) => {
    applyOrgZoom(parseFloat(e.target.value) / 100, /*continuous*/ true);
  });
  // Cmd/Ctrl + scroll wheel — proportional to deltaY for a smooth, fine
  // zoom that matches native trackpad pinch feel. (Pinch on trackpads
  // fires wheel events with ctrlKey set, so this hooks both.)
  wrap.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    // 0.0015 → ~15% zoom per typical 100-px wheel notch; fine enough to
    // be smooth, coarse enough that one notch still moves the needle.
    const delta = e.deltaY * -0.0015;
    applyOrgZoom(cur() + delta, /*continuous*/ true);
  }, { passive: false });
}

// Find a user record across every cache we have. The Users tab populates
// usersData; the Sessions tab populates sessionsRaw; rep-mapping prefetch
// gives us a thin list too. The Org Board may need to resolve a UUID
// before any of those tabs have been visited — fall through them all so
// the board never falls back to raw UUIDs.
function _findUserRecord(uid) {
  if (!uid) return null;
  return usersData.find(x => x.id === uid)
      || (typeof sessionsRaw !== 'undefined' ? sessionsRaw.find(x => x.id === uid) : null)
      || null;
}
function _emailOf(uid) {
  if (!uid) return null;
  const u = _findUserRecord(uid);
  return (u && u.email) || uid;
}
// Display name — first_name if set, else email. As a last-resort fallback
// for unknown UUIDs we show "(unknown user)" instead of the raw UUID so
// admins know to refresh.
function _displayOf(uid) {
  if (!uid) return null;
  const u = _findUserRecord(uid);
  if (!u) return '(unknown user)';
  return (u.first_name && u.first_name.trim()) ? u.first_name.trim() : (u.email || '(unknown user)');
}
// Picker label: "Carlos (carlos@…)" if there's a name; plain email otherwise.
function _pickerLabelFor(u) {
  const name = (u.first_name || '').trim();
  return name ? `${name} (${u.email})` : (u.email || u.id);
}
function _initialOf(uid) { const d = _displayOf(uid); return d ? d.slice(0,1).toUpperCase() : '?'; }
// All-users option list, with current selection preselected.
function _userOptions(selectedId, includeVacant = true) {
  const sorted = [...usersData].sort((a, b) => (_displayOf(a.id) || '').localeCompare(_displayOf(b.id) || ''));
  return (includeVacant ? '<option value="">— Vacant —</option>' : '') +
    sorted.map(u => `<option value="${u.id}" ${selectedId === u.id ? 'selected' : ''}>${escapeHtml(_pickerLabelFor(u))}</option>`).join('');
}

// Top tier: executive posts that sit ABOVE the divisions. Each can cover
// one or more divisions (many-to-many via org_executive_post_divisions) and
// be held by one or more users. The host page must contain
// <div id="orgTopTier"></div> right above #orgBoard.
function renderTopTier() {
  const tier = document.getElementById('orgTopTier');
  if (!tier) return;
  const cards = execPostsData.map(ep => {
    const holders = execHoldersByExecPost[ep.id] || [];
    const role = ep.default_role_id ? roles.find(r => r.id === ep.default_role_id) : null;
    const divChips = (ep.division_ids || []).map(did => {
      const d = divisionsData.find(x => x.id === did);
      return d ? `<span class="div-chip" style="border-color:${d.color}66;color:${d.color};">${escapeHtml(d.name)}</span>` : '';
    }).join('') || '<span style="color:var(--text-dim);font-style:italic;font-size:0.72rem;">(no divisions linked)</span>';
    const holderHtml = holders.length
      ? holders.map(h => `<span class="org-exec-holder" title="${escapeHtml(_emailOf(h.user_id) || '')}"><span class="havatar small">${escapeHtml(_initialOf(h.user_id))}</span>${escapeHtml(_displayOf(h.user_id))}</span>`).join('')
      : '<span class="org-exec-holder vacant">Vacant — click to assign</span>';
    return `<div class="org-exec-card" data-kind="exec-post" data-id="${ep.id}" draggable="true" style="border-color:${ep.color || '#fbbf24'}66;">
      <div class="org-exec-card-stripe" style="background:${ep.color || '#fbbf24'};"></div>
      <div class="org-exec-card-body">
        <div class="org-exec-card-title">◆ ${escapeHtml(ep.name)}</div>
        <div class="org-exec-card-holders">${holderHtml}</div>
        <div class="org-exec-card-divs">${divChips}</div>
        ${role ? `<div class="org-exec-card-role" style="color:${role.color || '#a78bfa'};">Auto-role: ${escapeHtml(role.name)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  tier.innerHTML = `<div class="org-top-tier-label">Executive layer</div>
    <div class="org-top-tier-cards">${cards}<button class="org-add-exec" id="org-add-exec">+ Add exec post</button></div>`;

  tier.querySelectorAll('.org-exec-card').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openExecPostEditor(Number(el.dataset.id)); });
    // Drag (reorder + person assignment) handled by org-extras' unified DnD.
  });
  document.getElementById('org-add-exec')?.addEventListener('click', () => openExecPostEditor(null));
  return;
  // Legacy body kept below as dead code for context.
  // eslint-disable-next-line no-unreachable
  if (false) {
  const cardsHtml = execPostsData.map(ep => {
    const holderName = _displayOf(ep.head_user_id);
    const role = ep.default_role_id ? roles.find(r => r.id === ep.default_role_id) : null;
    const divChips = ep.division_ids.map(did => {
      const d = divisionsData.find(x => x.id === did);
      return d ? `<span class="div-chip" style="border-color:${d.color}66;color:${d.color};">${escapeHtml(d.name)}</span>` : '';
    }).join('') || '<span style="color:var(--text-dim);font-style:italic;">(no divisions linked yet)</span>';
    const holderHtml = holderName
      ? `<div class="org-exec-card-holder" title="${escapeHtml(_emailOf(ep.head_user_id) || '')}"><span class="havatar">${escapeHtml(_initialOf(ep.head_user_id))}</span>${escapeHtml(holderName)}</div>`
      : `<div class="org-exec-card-holder vacant">Vacant — click to assign</div>`;
    return `
      <div class="org-exec-card" data-exec-id="${ep.id}" style="--exec-color:${ep.color || '#fbbf24'};">
        <div class="org-exec-card-stripe"></div>
        <div class="org-exec-card-title">◆ ${escapeHtml(ep.name)}</div>
        ${holderHtml}
        ${role ? `<span class="org-exec-card-role">${escapeHtml(role.name)}</span>` : ''}
        <div class="org-exec-card-divs">${divChips}</div>
      </div>`;
  }).join('');
  tier.innerHTML =
    '<div class="org-top-tier-label">Executive</div>' +
    cardsHtml +
    '<button class="org-add-exec" id="org-add-exec">+ Executive post</button>';
  tier.querySelectorAll('.org-exec-card').forEach(el => {
    const epId = Number(el.dataset.execId);
    el.addEventListener('click', () => openExecPostEditor(epId));
    // Hover → highlight the divisions this exec post covers.
    el.addEventListener('mouseenter', () => {
      const ep = execPostsData.find(x => x.id === epId);
      if (!ep) return;
      for (const did of ep.division_ids) {
        document.querySelector(`.org-col-division [data-id="${did}"][data-kind="division"]`)?.closest('.org-col-division')?.classList.add('exec-covered');
      }
    });
    el.addEventListener('mouseleave', () => {
      document.querySelectorAll('.org-col-division.exec-covered').forEach(n => n.classList.remove('exec-covered'));
    });
  });
  document.getElementById('org-add-exec')?.addEventListener('click', () => openExecPostEditor(null));
  } // end if(false) — dead code block
}

async function seedStandardOrg() {
  const seedBtn = document.getElementById('orgSeedBtn');
  if (!confirm('Create the canonical Scientology-style org board?\n\n• 6 Divisions: HCO, Dissemination, Treasury, Technical, Qualifications, Public\n• 18 Departments\n• ~30 standard posts (each with Purpose)\n• 3 Executive top-tier posts: Executive Director, LRH Communicator, Cope Officer\n\nWon\'t duplicate anything that already exists. You can rename/delete anything afterwards.')) return;
  if (seedBtn) { seedBtn.disabled = true; seedBtn.textContent = 'Seeding…'; }
  try {
    const res = await api('?api=seed-standard-org', { method: 'POST', body: {} });
    await loadOrgTab();
    const c = res.created || {};
    alert(`✓ Seed complete — ${c.divisions || 0} divisions, ${c.departments || 0} departments, ${c.posts || 0} posts, ${c.exec_posts || 0} exec posts added.`);
  } catch (e) { alert('Seed failed: ' + e.message); }
  finally { if (seedBtn) { seedBtn.disabled = false; seedBtn.textContent = 'Seed standard org board'; } }
}

function renderOrgBoard() {
  const board = document.getElementById('orgBoard');
  // Wire the always-visible Seed button (admins only — it's gated server-side anyway).
  const seedBtn = document.getElementById('orgSeedBtn');
  if (seedBtn) {
    const eff = window.RidleyPerms?.effective(session?.user);
    seedBtn.style.display = eff?.is_admin ? '' : 'none';
    seedBtn.onclick = seedStandardOrg;
  }
  renderTopTier(); // no-op now — Executive is a regular Division
  if (!divisionsData.length) {
    board.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 16px;">
        <button class="org-add-division" id="org-seed-empty" style="background:rgba(167,139,250,.10);color:#a78bfa;border-color:#a78bfa;font-size:0.92rem;padding:14px 22px;min-height:auto;">Seed standard Scientology org board</button>
        <span style="color:var(--text-dim);font-size:0.78rem;">— or —</span>
        <button class="org-add-division" id="org-first-div" style="min-height:auto;">+ Add your first division (start blank)</button>
      </div>`;
    document.getElementById('org-first-div').addEventListener('click', openCreateDivisionModal);
    document.getElementById('org-seed-empty').addEventListener('click', seedStandardOrg);
    return;
  }
  const divsHtml = divisionsData.map(d => {
    const depts = departmentsData.filter(x => x.division_id === d.id);
    const totalPosts = postsData.filter(p => depts.some(dep => dep.id === p.department_id)).length;
    const deptsHtml = depts.map(dep => renderDepartmentSubColumn(dep)).join('') +
      `<button class="org-add-btn" style="align-self:flex-start;margin-top:4px;" data-add-dept="${d.id}">+ Department</button>`;
    const headDisplay = _displayOf(d.head_user_id);
    const headBadge = headDisplay
      ? `<span class="org-head-pill" title="Division Head: ${escapeHtml(_emailOf(d.head_user_id) || '')} — click to change"><span class="havatar" style="background:${d.color || '#6b9eff'};">${escapeHtml(_initialOf(d.head_user_id))}</span><span>${escapeHtml(headDisplay)}</span></span>`
      : `<span class="org-head-pill vacant" title="No Division Head — click to assign">No Division Head</span>`;
    return `
      <div class="org-col-division" data-div-id="${d.id}" draggable="true">
        <div class="org-col-division-head" data-kind="division" data-id="${d.id}">
          <span class="org-div-drag-handle" title="Drag to reorder">⋮⋮</span>
          <div class="org-col-division-stripe" style="background:${d.color || '#6b9eff'};"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;">
            <div class="org-col-division-title">${escapeHtml(d.name)}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              ${headBadge}
              <span class="org-col-division-meta">${depts.length} dept · ${totalPosts} posts</span>
            </div>
          </div>
        </div>
        <div class="org-col-departments">${deptsHtml}</div>
      </div>`;
  }).join('');
  board.innerHTML = divsHtml;   // "+ Division" is now a small button in the header toolbar

  // Wire clicks
  board.querySelectorAll('.org-col-division-head').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('division', Number(el.dataset.id), /*view*/ true);
  }));
  board.querySelectorAll('.org-col-department-head').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('department', Number(el.dataset.id), /*view*/ true);
  }));
  board.querySelectorAll('.org-post-card').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('post', Number(el.dataset.id), /*view*/ true);
  }));
  board.querySelectorAll('[data-add-dept]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openCreateDepartmentModal(Number(el.dataset.addDept));
  }));
  board.querySelectorAll('[data-add-post]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openCreatePostModal(Number(el.dataset.addPost));
  }));
  const _addDivBtn = document.getElementById('orgAddDivBtn');
  if (_addDivBtn && !_addDivBtn.dataset.wired) { _addDivBtn.dataset.wired = '1'; _addDivBtn.addEventListener('click', openCreateDivisionModal); }

  // Division / department / post drag-and-drop (reorder + reparent) is wired by
  // org-extras' unified insertion-line system (enhanceBoard), edit mode only.
}

function renderDepartmentSubColumn(dep) {
  const posts = postsData.filter(x => x.department_id === dep.id);
  const postsHtml = posts.map(po => renderPostCard(po)).join('') ||
    '<div style="color:var(--text-dim);font-size:0.74rem;font-style:italic;padding:6px;">No posts yet</div>';
  const headDisplay = _displayOf(dep.head_user_id);
  const headLine = headDisplay
    ? `<div class="org-dept-head" title="${escapeHtml(_emailOf(dep.head_user_id) || '')}"><span class="havatar small">${escapeHtml(_initialOf(dep.head_user_id))}</span><span>${escapeHtml(headDisplay)}</span></div>`
    : `<div class="org-dept-head vacant">No Dept Head</div>`;
  return `
    <div class="org-col-department">
      <div class="org-col-department-head" data-kind="department" data-id="${dep.id}">
        <span class="title">${escapeHtml(dep.name)}</span>
        <span class="count">${posts.length}</span>
      </div>
      ${headLine}
      <div class="org-col-department-posts">${postsHtml}</div>
      <button class="org-add-btn" data-add-post="${dep.id}">+ Post</button>
    </div>`;
}

function renderPostCard(po) {
  // One post = one person. Show the (single) active holder as a name+avatar,
  // or "Vacant". If a legacy post somehow has multiple holders, we display the
  // most recent one and silently treat the rest as inactive.
  const role = po.default_role_id ? roles.find(r => r.id === po.default_role_id) : null;
  const holders = activeHoldersByPost[po.id] || [];
  const primary = holders[0];
  const holderHtml = primary
    ? `<div class="org-post-card-holders" title="${escapeHtml(_emailOf(primary.user_id) || '')}"><span class="havatar">${escapeHtml(_initialOf(primary.user_id))}</span><span class="hname">${escapeHtml(_displayOf(primary.user_id))}</span></div>`
    : '<div class="org-post-card-holders"><span class="vacant">Vacant — click to assign</span></div>';
  const roleChip = role ? `<span class="org-post-card-role">${escapeHtml(role.name)}</span>` : '';
  const purposeHtml = po.purpose ? `<div class="org-post-card-purpose" title="Purpose">${escapeHtml(po.purpose)}</div>` : '';
  const senior = po.senior_post_id ? postsData.find(x => x.id === po.senior_post_id) : null;
  const reportsLine = senior ? `<div class="org-post-card-reports" title="Reports to">↑ reports to ${escapeHtml(senior.name)}</div>` : '';
  return `
    <div class="org-post-card" data-id="${po.id}">
      <div class="org-post-card-title">${escapeHtml(po.name)}</div>
      ${purposeHtml}
      <div class="org-post-card-meta">${roleChip}</div>
      ${holderHtml}
      ${reportsLine}
    </div>`;
}

// ── Drawer (right-side edit panel for org board items) ────────────────
function openDrawer(innerHtml) {
  closeDrawer();
  const root = document.getElementById('modalRoot');
  root.insertAdjacentHTML('beforeend',
    `<div class="org-drawer-overlay" id="orgDrawerOverlay"></div>
     <div class="org-drawer" id="orgDrawer">
       <div class="org-drawer-close">
         <span style="font-size:0.78rem;color:var(--text-dim);font-weight:600;">Editing</span>
         <button id="orgDrawerCloseBtn" title="Close (Esc)">×</button>
       </div>
       <div class="org-drawer-body" id="orgDrawerBody">${innerHtml}</div>
     </div>`);
  document.getElementById('orgDrawerOverlay').addEventListener('click', closeDrawer);
  document.getElementById('orgDrawerCloseBtn').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', _drawerEsc);
}
function _drawerEsc(e) { if (e.key === 'Escape') closeDrawer(); }
function closeDrawer() {
  document.removeEventListener('keydown', _drawerEsc);
  document.getElementById('orgDrawer')?.remove();
  document.getElementById('orgDrawerOverlay')?.remove();
  _useDrawerEditor = false;
}

// Active editor element — defaults to the main detail pane (#axEditor),
// but openOrgEditor swaps it to the drawer's body so the same render* helpers
// can target it without duplicating ids.
function editorEl() {
  if (_useDrawerEditor) return document.getElementById('axDrawerEditor');
  return document.getElementById('axEditor');
}
let _useDrawerEditor = false;

// Clicking a card opens its PROFILE (view=true, read-only). The ✎ pen opens the
// editable form (view=false). Jumps/save-reopens omit `view` → keep last mode.
let _orgDrawerView = false;
function openOrgEditor(kind, id, view) {
  if (view === undefined) view = _orgDrawerView; else _orgDrawerView = !!view;
  selectedKind = kind; selectedId = id;
  openDrawer('<div id="axDrawerEditor"><div class="ax-editor-empty">Loading…</div></div>');
  const drawer = document.getElementById('orgDrawer');
  // Profiles are their own read-only render (no disabled-form fallback), so the
  // drawer never needs the .viewonly form-lock. Clicking a card = profile;
  // the pencil (or the profile's Edit button) = the full editor below.
  if (drawer) drawer.classList.remove('viewonly');
  const lbl = drawer && drawer.querySelector('.org-drawer-close > span');
  if (lbl) lbl.textContent = view ? 'Profile' : 'Editing';
  _useDrawerEditor = true;
  if (view) {
    if (kind === 'division') return renderDivisionProfile(divisionsData.find(x => x.id === id));
    if (kind === 'department') return renderDepartmentProfile(departmentsData.find(x => x.id === id));
    if (kind === 'post') return renderPostProfile(postsData.find(x => x.id === id));
  }
  if (kind === 'division') return renderDivisionEditor(divisionsData.find(x => x.id === id));
  if (kind === 'department') return renderDepartmentEditor(departmentsData.find(x => x.id === id));
  if (kind === 'post') return renderPostEditor(postsData.find(x => x.id === id));
}

function openExecPostEditor(epId) {
  openDrawer('<div id="axDrawerEditor"><div class="ax-editor-empty">Loading…</div></div>');
  _useDrawerEditor = true;
  const ep = epId ? execPostsData.find(x => x.id === epId) : { id: null, name: '', slug: '', description: '', default_role_id: null, head_user_id: null, color: '#fbbf24', sort_order: execPostsData.length, division_ids: [] };
  const ed = editorEl();
  if (!ed) return;
  const divChecks = divisionsData.map(d => {
    const checked = (ep.division_ids || []).includes(d.id);
    return `<label class="div-check" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;font-size:0.78rem;${checked ? 'background:rgba(251,191,36,.18);color:#fbbf24;border-color:rgba(251,191,36,.45);' : ''}">
      <input type="checkbox" data-div-id="${d.id}" ${checked ? 'checked' : ''} style="margin:0;">
      ${escapeHtml(d.name)}
    </label>`;
  }).join('');
  // Exec posts this one can sit above = every other exec except self and this
  // post's own ancestors (picking an ancestor would make a cycle). A candidate
  // is "checked" when it already reports to this post.
  const _ancestors = new Set();
  if (ep.id) { let cur = ep.parent_exec_post_id; const guard = new Set(); while (cur && !guard.has(cur)) { guard.add(cur); _ancestors.add(cur); const par = execPostsData.find(x => x.id === cur); cur = par ? par.parent_exec_post_id : null; } }
  const execChecks = execPostsData.filter(x => x.id !== ep.id && !_ancestors.has(x.id)).map(x => {
    const checked = ep.id && x.parent_exec_post_id === ep.id;
    return `<label class="exec-check" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;font-size:0.78rem;${checked ? 'background:rgba(59,130,246,.18);color:#93c5fd;border-color:rgba(59,130,246,.5);' : ''}">
      <input type="checkbox" data-exec-id="${x.id}" ${checked ? 'checked' : ''} style="margin:0;">
      ◆ ${escapeHtml(x.name)}
    </label>`;
  }).join('');
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb">Top tier · Executive post</div>
    <h2>${ep.id ? '◆ ' + escapeHtml(ep.name) : '◆ New executive post'}</h2>
    <div style="color:var(--text-dim);font-size:0.78rem;margin-bottom:6px;">Sits ABOVE divisions. One person, in charge of one or more divisions. The default role is auto-conferred to whoever holds this post.</div>

    <div class="ax-editor-row"><label>Name</label><input id="ep-name" value="${escapeHtml(ep.name)}" placeholder="e.g. COO"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="ep-slug" value="${escapeHtml(ep.slug)}" placeholder="coo"></div>
    <div class="ax-editor-row"><label title="One sentence: why does this executive post exist?">Purpose</label><input id="ep-purpose" value="${escapeHtml(ep.purpose || '')}" placeholder="One sentence: why does this exec post exist?"></div>
    <div class="ax-editor-row"><label title="The single tangible thing this exec post is accountable for delivering.">What this produces</label><input id="ep-vfp" value="${escapeHtml(ep.valuable_final_product || '')}" placeholder="The tangible thing this exec post is accountable for"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="ep-desc">${escapeHtml(ep.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Color</label><input id="ep-color" type="color" value="${escapeHtml(ep.color || '#fbbf24')}" style="max-width:80px;"></div>

    <h3>Assigned to</h3>
    <div class="ax-editor-row"><label>Auto-assigned role</label><select id="ep-role"></select></div>
    ${ep.id ? `
    <div class="ax-editor-row" style="flex-direction:column;align-items:stretch;">
      <label style="margin-bottom:4px;">Holders</label>
      <div id="ep-holders" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="ep-holder-pick" style="flex:1;"></select>
        <button class="small-btn" id="ep-add-holder">+ Assign</button>
      </div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">One or more users can hold this exec post. Assigning gives them the auto-role above (on next sign-in).</div>
    </div>
    ` : `
    <div class="ax-editor-row"><label>Holders</label><span style="color:var(--text-dim);font-size:0.78rem;">Save this exec post first, then assign holders.</span></div>
    `}

    <h3>Sits above / oversees</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">Pick everything this post sits above — any mix of other executive posts and divisions. Its box centers over whatever you pick. (e.g. this post can be above the LRH Comm AND above Division 1, while the LRH Comm is above Divisions 2–4.)</div>
    <div style="font-weight:600;font-size:0.76rem;margin:4px 0;">Executive posts reporting to this</div>
    <div id="ep-execs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${execChecks || '<span style="color:var(--text-dim);font-size:0.76rem;">No other executive posts yet.</span>'}</div>
    <div style="font-weight:600;font-size:0.76rem;margin:4px 0;">Divisions</div>
    <div id="ep-divs" style="display:flex;flex-wrap:wrap;gap:6px;">${divChecks}</div>

    <div class="ax-actions">
      <button class="btn-primary" id="ep-save">Save</button>
      ${ep.id ? '<button class="small-btn" id="ep-duplicate" style="background:var(--surface3);">⧉ Duplicate</button>' : ''}
      ${ep.id ? '<button class="btn-ghost" style="color:var(--red);" id="ep-delete">Delete</button>' : ''}
      <span class="ax-msg" id="ep-msg"></span>
    </div>
  </div>`;

  document.getElementById('ep-role').innerHTML = '<option value="">— No default role —</option>' + roles.map(r => `<option value="${r.id}" ${ep.default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  if (ep.id) {
    document.getElementById('ep-holder-pick').innerHTML = _userOptions(null, false);
    refreshExecPostHolders(ep.id);
    document.getElementById('ep-add-holder')?.addEventListener('click', async () => {
      const uid = document.getElementById('ep-holder-pick').value;
      if (!uid) return;
      try { await api('?api=exec-post-add-holder', { method: 'POST', body: { exec_post_id: ep.id, user_id: uid } }); await refreshExecPostHolders(ep.id); }
      catch (e) { alert(e.message); }
    });
  }

  // Toggle chip-style highlight on check
  ed.querySelectorAll('#ep-divs input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = cb.closest('label');
      if (cb.checked) label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid rgba(251,191,36,.45);border-radius:999px;cursor:pointer;font-size:0.78rem;background:rgba(251,191,36,.18);color:#fbbf24;';
      else label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;font-size:0.78rem;';
    });
  });
  ed.querySelectorAll('#ep-execs input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = cb.closest('label');
      if (cb.checked) label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid rgba(59,130,246,.5);border-radius:999px;cursor:pointer;font-size:0.78rem;background:rgba(59,130,246,.18);color:#93c5fd;';
      else label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;cursor:pointer;font-size:0.78rem;';
    });
  });

  document.getElementById('ep-save').addEventListener('click', async () => {
    const msg = document.getElementById('ep-msg');
    msg.className = 'ax-msg'; msg.textContent = 'Saving…';
    try {
      const body = {
        name: document.getElementById('ep-name').value.trim(),
        slug: document.getElementById('ep-slug').value.trim() || document.getElementById('ep-name').value.trim().toLowerCase().replace(/\s+/g, '_'),
        description: document.getElementById('ep-desc').value.trim(),
        color: document.getElementById('ep-color').value,
        default_role_id: document.getElementById('ep-role').value ? Number(document.getElementById('ep-role').value) : null,
        division_ids: [...document.querySelectorAll('#ep-divs input:checked')].map(cb => Number(cb.dataset.divId)),
        sort_order: ep.sort_order || 0,
        purpose: document.getElementById('ep-purpose').value.trim(),
        valuable_final_product: document.getElementById('ep-vfp').value.trim(),
      };
      if (!body.name) throw new Error('Name required');
      let res;
      if (ep.id) res = await api('?api=exec-post-update&id=' + ep.id, { method: 'POST', body });
      else       res = await api('?api=exec-post-create', { method: 'POST', body });
      // Reparent the exec posts this one sits above: checked → parent = this;
      // any that were this post's children but got unchecked → parent = null.
      const thisId = ep.id || res?.row?.id;
      if (thisId) {
        const checkedExecs = new Set([...document.querySelectorAll('#ep-execs input:checked')].map(cb => Number(cb.dataset.execId)));
        const shownExecs = [...document.querySelectorAll('#ep-execs input[data-exec-id]')].map(cb => Number(cb.dataset.execId));
        for (const eid of shownExecs) {
          const child = execPostsData.find(x => x.id === eid);
          const want = checkedExecs.has(eid) ? thisId : (child && child.parent_exec_post_id === thisId ? null : undefined);
          if (want === undefined) continue;                        // no change
          if (child && child.parent_exec_post_id === want) continue; // already correct
          await api('?api=exec-post-update&id=' + eid, { method: 'POST', body: { parent_exec_post_id: want } });
        }
      }
      msg.className = 'ax-msg ok'; msg.textContent = '✓ Saved';
      await loadOrgTab();
      if (thisId) openExecPostEditor(thisId);
    } catch (e) { msg.className = 'ax-msg err'; msg.textContent = e.message; }
  });
  document.getElementById('ep-duplicate')?.addEventListener('click', async () => {
    const newName = prompt('Name for the new executive post', ep.name + ' (copy)');
    if (!newName) return;
    try {
      const res = await api('?api=exec-post-duplicate&id=' + ep.id, { method: 'POST', body: { new_name: newName } });
      await loadOrgTab();
      if (res?.row?.id) openExecPostEditor(res.row.id);
    } catch (e) { alert(e.message); }
  });
  document.getElementById('ep-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete this executive post?')) return;
    try { await api('?api=exec-post-delete&id=' + ep.id, { method: 'POST', body: {} }); closeDrawer(); await loadOrgTab(); }
    catch (e) { alert(e.message); }
  });
}

function renderDivisionEditor(d) {
  if (!d) return;
  const ed = editorEl();
  if (!ed) return;
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb">Division</div>
    <h2>${escapeHtml(d.name)}</h2>

    <div class="ax-editor-row"><label>Name</label><input id="d-name" value="${escapeHtml(d.name)}"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="d-slug" value="${escapeHtml(d.slug)}"></div>
    <div class="ax-editor-row"><label title="One sentence: why does this division exist?">Purpose</label><input id="d-purpose" value="${escapeHtml(d.purpose || '')}" placeholder="One sentence: why does this division exist?"></div>
    <div class="ax-editor-row"><label title="The single tangible thing this division produces and ships out.">What this produces</label><input id="d-vfp" value="${escapeHtml(d.valuable_final_product || '')}" placeholder="The tangible thing this division produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="d-desc">${escapeHtml(d.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Color</label><input id="d-color" type="color" value="${escapeHtml(d.color || '#6b9eff')}" style="max-width:80px;"></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="d-sort" type="number" value="${d.sort_order || 0}" style="max-width:120px;"></div>

    <h3>Division Head</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">The single person in charge of this whole division. The default role here is auto-conferred to them.</div>
    <div class="ax-editor-row"><label>Head user</label><select id="d-head-user"></select></div>
    <div class="ax-editor-row"><label>Auto-assigned role</label><select id="d-head-role"></select></div>

    <h3>Departments</h3>
    <div id="d-depts-list" style="display:flex;flex-direction:column;gap:4px;"></div>
    <button class="small-btn" id="d-add-dept" style="margin-top:8px;">+ Add department</button>

    <h3>Policies & orders</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">Policies set here cascade down to every department and post inside this division.</div>
    <div id="d-policies"></div>
    <button class="small-btn" id="d-add-policy" style="margin-top:8px;display:none;">+ Add policy / order</button>

    <h3>Policy editors <span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;">(admin only)</span></h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">These users can create / edit / delete policies and orders on this division <strong>and every department + post under it</strong>. Other users see policies read-only.</div>
    <div id="d-editors" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
    <div style="display:flex;gap:6px;margin-top:8px;" id="d-editor-add-row">
      <select id="d-editor-pick" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);"></select>
      <button class="small-btn" id="d-editor-add">+ Add editor</button>
    </div>

    <div class="ax-actions">
      <button class="btn-primary" id="d-save">Save</button>
      <button class="btn-ghost" style="color:var(--red);" id="d-delete">Delete division</button>
      <span class="ax-msg" id="d-msg"></span>
    </div>
  </div>`;

  // Populate sub-lists
  const depts = departmentsData.filter(x => x.division_id === d.id);
  document.getElementById('d-depts-list').innerHTML = depts.length
    ? depts.map(dep => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-dep-id="${dep.id}"><span>${escapeHtml(dep.name)}</span><span class="org-badge">${postsData.filter(p => p.department_id === dep.id).length} posts</span></div>`).join('')
    : '<span style="color:var(--text-dim);font-size:0.82rem;">No departments yet.</span>';
  document.querySelectorAll('#d-depts-list [data-dep-id]').forEach(el => el.addEventListener('click', () => openOrgEditor('department', Number(el.dataset.depId))));

  document.getElementById('d-add-dept').addEventListener('click', () => openCreateDepartmentModal(d.id));
  document.getElementById('d-add-policy').addEventListener('click', () => openPolicyModal('division', d.id));

  // Populate Head selects
  const headUserSel = document.getElementById('d-head-user');
  headUserSel.innerHTML = _userOptions(d.head_user_id);
  const headRoleSel = document.getElementById('d-head-role');
  headRoleSel.innerHTML = '<option value="">— No role —</option>' + roles.map(r => `<option value="${r.id}" ${d.head_default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

  // Hide editor management UI for non-admins (server enforces this too).
  const eff = window.RidleyPerms?.effective(session.user);
  if (!eff?.is_admin) {
    document.getElementById('d-editor-add-row').style.display = 'none';
  }
  loadDivisionEditors(d.id);
  document.getElementById('d-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('d-name').value,
      slug: document.getElementById('d-slug').value,
      description: document.getElementById('d-desc').value,
      color: document.getElementById('d-color').value,
      sort_order: Number(document.getElementById('d-sort').value) || 0,
      head_user_id: document.getElementById('d-head-user').value || null,
      head_default_role_id: document.getElementById('d-head-role').value ? Number(document.getElementById('d-head-role').value) : null,
      purpose: document.getElementById('d-purpose').value,
      valuable_final_product: document.getElementById('d-vfp').value,
    };
    try { await api('?api=division-update&id=' + d.id, { method: 'POST', body }); await loadOrgTab(); openOrgEditor('division', d.id); }
    catch (e) { document.getElementById('d-msg').textContent = e.message; }
  });
  document.getElementById('d-delete').addEventListener('click', async () => {
    if (!confirm('Delete this division and all its departments + posts? This cannot be undone.')) return;
    try { await api('?api=division-delete&id=' + d.id, { method: 'POST', body: {} }); selectedId = null; closeDrawer(); await loadOrgTab(); }
    catch (e) { alert(e.message); }
  });
  loadPoliciesInto('d-policies', 'division', d.id);
}

function renderDepartmentEditor(dep) {
  if (!dep) return;
  const ed = editorEl();
  if (!ed) return;
  const division = divisionsData.find(x => x.id === dep.division_id);
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb"><a data-jump="division" data-id="${division?.id}">${escapeHtml(division?.name || 'Division')}</a> › Department</div>
    <h2>${escapeHtml(dep.name)}</h2>

    <div class="ax-editor-row"><label>Name</label><input id="dep-name" value="${escapeHtml(dep.name)}"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="dep-slug" value="${escapeHtml(dep.slug)}"></div>
    <div class="ax-editor-row"><label title="One sentence: why does this department exist?">Purpose</label><input id="dep-purpose" value="${escapeHtml(dep.purpose || '')}" placeholder="One sentence: why does this department exist?"></div>
    <div class="ax-editor-row"><label title="The single tangible thing this department produces and ships out.">What this produces</label><input id="dep-vfp" value="${escapeHtml(dep.valuable_final_product || '')}" placeholder="The tangible thing this department produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="dep-desc">${escapeHtml(dep.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="dep-sort" type="number" value="${dep.sort_order || 0}" style="max-width:120px;"></div>

    <h3>Department Head</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">The single person in charge of this department. The default role here is auto-conferred to them.</div>
    <div class="ax-editor-row"><label>Head user</label><select id="dep-head-user"></select></div>
    <div class="ax-editor-row"><label>Auto-assigned role</label><select id="dep-head-role"></select></div>

    <h3>Posts</h3>
    <div id="dep-posts-list" style="display:flex;flex-direction:column;gap:4px;"></div>
    <button class="small-btn" id="dep-add-post" style="margin-top:8px;">+ Add post</button>

    <h3>Policies & orders</h3>
    <div id="dep-policies"></div>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">Policies here apply to this department + every post inside it. Policies inherited from the division above show with an "↑ from" badge.</div>
    <button class="small-btn" id="dep-add-policy" style="margin-top:8px;display:none;">+ Add policy / order</button>

    <div class="ax-actions">
      <button class="btn-primary" id="dep-save">Save</button>
      <button class="btn-ghost" style="color:var(--red);" id="dep-delete">Delete department</button>
      <span class="ax-msg" id="dep-msg"></span>
    </div>
  </div>`;
  document.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openOrgEditor(a.dataset.jump, Number(a.dataset.id)); }));
  const posts = postsData.filter(p => p.department_id === dep.id);
  document.getElementById('dep-posts-list').innerHTML = posts.length
    ? posts.map(po => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-post-id="${po.id}"><span>${escapeHtml(po.name)}</span><span class="org-badge">${po.default_role_id ? (roles.find(r => r.id === po.default_role_id)?.name || 'role') : '—'}</span></div>`).join('')
    : '<span style="color:var(--text-dim);font-size:0.82rem;">No posts yet.</span>';
  document.querySelectorAll('#dep-posts-list [data-post-id]').forEach(el => el.addEventListener('click', () => openOrgEditor('post', Number(el.dataset.postId))));

  document.getElementById('dep-add-post').addEventListener('click', () => openCreatePostModal(dep.id));
  document.getElementById('dep-add-policy').addEventListener('click', () => openPolicyModal('department', dep.id));
  // Populate dept head selects
  const depHeadUserSel = document.getElementById('dep-head-user');
  depHeadUserSel.innerHTML = _userOptions(dep.head_user_id);
  const depHeadRoleSel = document.getElementById('dep-head-role');
  depHeadRoleSel.innerHTML = '<option value="">— No role —</option>' + roles.map(r => `<option value="${r.id}" ${dep.head_default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  document.getElementById('dep-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('dep-name').value,
      slug: document.getElementById('dep-slug').value,
      description: document.getElementById('dep-desc').value,
      sort_order: Number(document.getElementById('dep-sort').value) || 0,
      head_user_id: document.getElementById('dep-head-user').value || null,
      head_default_role_id: document.getElementById('dep-head-role').value ? Number(document.getElementById('dep-head-role').value) : null,
      purpose: document.getElementById('dep-purpose').value,
      valuable_final_product: document.getElementById('dep-vfp').value,
    };
    try { await api('?api=department-update&id=' + dep.id, { method: 'POST', body }); await loadOrgTab(); openOrgEditor('department', dep.id); }
    catch (e) { document.getElementById('dep-msg').textContent = e.message; }
  });
  document.getElementById('dep-delete').addEventListener('click', async () => {
    if (!confirm('Delete this department and its posts?')) return;
    try { await api('?api=department-delete&id=' + dep.id, { method: 'POST', body: {} }); selectedId = null; closeDrawer(); await loadOrgTab(); }
    catch (e) { alert(e.message); }
  });
  loadPoliciesInto('dep-policies', 'department', dep.id);
}

function renderPostEditor(po) {
  if (!po) return;
  const dep = departmentsData.find(x => x.id === po.department_id);
  const div = divisionsData.find(x => x.id === dep?.division_id);
  const ed = editorEl();
  if (!ed) return;
  const roleOpts = ['<option value="">— No default role —</option>'].concat(
    roles.map(r => `<option value="${r.id}" ${po.default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`)
  ).join('');
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb">
      <a data-jump="division" data-id="${div?.id}">${escapeHtml(div?.name || 'Division')}</a> ›
      <a data-jump="department" data-id="${dep?.id}">${escapeHtml(dep?.name || 'Department')}</a> › Post
    </div>
    <h2>${escapeHtml(po.name)}</h2>

    <h3>Identity</h3>
    <div class="ax-editor-row"><label>Post name</label><input id="po-name" value="${escapeHtml(po.name)}" placeholder="e.g. Coach — Jane"><div class="ax-hint">How this post appears on the board.</div></div>
    <div class="ax-editor-row"><label>Purpose</label><input id="po-purpose" value="${escapeHtml(po.purpose || '')}" placeholder="Why does this post exist?"><div class="ax-hint">One sentence — the reason this post exists.</div></div>
    <div class="ax-editor-row"><label>What it produces</label><input id="po-vfp" value="${escapeHtml(po.valuable_final_product || '')}" placeholder="The thing this post ships"><div class="ax-hint">The single tangible product this post is accountable for.</div></div>
    <div class="ax-editor-row"><label>Description <span style="font-weight:400;color:var(--text-dim);">(optional)</span></label><textarea id="po-desc" placeholder="Any extra detail…">${escapeHtml(po.description || '')}</textarea></div>

    <h3>Who holds this post</h3>
    <div class="ax-hint" style="margin:-4px 0 8px;">One person per post — use <b>Duplicate</b> below to add another seat.</div>
    <div id="po-holders" style="margin-bottom:8px;"></div>
    <div style="display:flex;gap:6px;align-items:center;">
      <select id="po-holder-pick" style="flex:1;padding:9px 11px;background:var(--surface2);border:1px solid var(--border-light);border-radius:8px;color:var(--text);font-size:0.88rem;"></select>
      <button class="small-btn" id="po-set-holder" style="padding:8px 14px;">Assign</button>
      <button class="small-btn" id="po-clear-holder" style="padding:8px 12px;color:var(--red);">Vacate</button>
    </div>
    <button class="small-btn" id="po-duplicate" style="margin-top:10px;background:var(--surface3);padding:7px 12px;">⧉ Duplicate this post</button>

    <h3>Reporting &amp; role</h3>
    <div class="ax-editor-row"><label>Reports to</label><select id="po-senior"></select><div class="ax-hint">The senior post this one answers to. Leave as default to report to the Department Head.</div></div>
    <div class="ax-editor-row"><label>Auto-assigned role</label><select id="po-role">${roleOpts}</select><div class="ax-hint">Whoever holds this post automatically gets this role's permissions.</div></div>

    <details class="ax-advanced">
      <summary>Advanced</summary>
      <div class="ax-editor-row" style="margin-top:8px;"><label>Slug</label><input id="po-slug" value="${escapeHtml(po.slug)}"><div class="ax-hint">Internal identifier — auto-generated from the name; change only if you know why.</div></div>
      <div class="ax-editor-row"><label>Sort order</label><input id="po-sort" type="number" value="${po.sort_order || 0}" style="max-width:120px;"><div class="ax-hint">Lower numbers appear first within the department.</div></div>
    </details>

    <h3>Policies &amp; orders</h3>
    <div id="po-policies"></div>
    <div class="ax-hint" style="margin-top:4px;">Policies set here apply only to this post. Inherited ones from the parent department and division show an "↑ from" badge.</div>
    <button class="small-btn" id="po-add-policy" style="margin-top:8px;display:none;padding:7px 12px;">+ Add policy / order</button>

    <div class="ax-actions">
      <button class="btn-primary" id="po-save">Save changes</button>
      <button class="btn-ghost" style="color:var(--red);" id="po-delete">Delete</button>
      <span class="ax-msg" id="po-msg"></span>
    </div>
  </div>`;
  document.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openOrgEditor(a.dataset.jump, Number(a.dataset.id)); }));

  // Single-holder picker: preselect current holder if any.
  const currentHolder = (activeHoldersByPost[po.id] || [])[0];
  const pick = document.getElementById('po-holder-pick');
  pick.innerHTML = _userOptions(currentHolder?.user_id);
  refreshPostHolders(po.id);
  document.getElementById('po-set-holder').addEventListener('click', async () => {
    const uid = pick.value;
    if (!uid) return;
    try {
      await api('?api=post-add-holder', { method: 'POST', body: { post_id: po.id, user_id: uid } });
      await loadOrgTab();
      openOrgEditor('post', po.id);
    } catch (e) { alert(e.message); }
  });
  document.getElementById('po-clear-holder').addEventListener('click', async () => {
    if (!currentHolder) return;
    try {
      await api('?api=post-remove-holder', { method: 'POST', body: { post_id: po.id, user_id: currentHolder.user_id } });
      await loadOrgTab();
      openOrgEditor('post', po.id);
    } catch (e) { alert(e.message); }
  });
  document.getElementById('po-duplicate').addEventListener('click', async () => {
    const newName = prompt('Name for the new post (e.g. "Coach — Jane")', po.name);
    if (!newName) return;
    try {
      const res = await api('?api=post-duplicate&id=' + po.id, { method: 'POST', body: { new_name: newName } });
      await loadOrgTab();
      if (res?.row?.id) openOrgEditor('post', res.row.id);
    } catch (e) { alert(e.message); }
  });

  document.getElementById('po-add-policy').addEventListener('click', () => openPolicyModal('post', po.id));

  // Senior-post picker: any other post in the org, grouped by department.
  // The default-head fallback ("Reports to Dept Head") is the blank option.
  const seniorSel = document.getElementById('po-senior');
  const byDept = {};
  for (const p of postsData) {
    if (p.id === po.id) continue; // can't report to itself
    (byDept[p.department_id] ||= []).push(p);
  }
  let seniorHtml = '<option value="">— Reports to Dept Head (default) —</option>';
  for (const depRow of departmentsData) {
    if (!byDept[depRow.id]?.length) continue;
    const divRow = divisionsData.find(d => d.id === depRow.division_id);
    seniorHtml += `<optgroup label="${escapeHtml((divRow?.name || '') + ' › ' + depRow.name)}">`;
    for (const p of byDept[depRow.id]) {
      seniorHtml += `<option value="${p.id}" ${po.senior_post_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`;
    }
    seniorHtml += '</optgroup>';
  }
  seniorSel.innerHTML = seniorHtml;

  document.getElementById('po-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('po-name').value,
      slug: document.getElementById('po-slug').value,
      description: document.getElementById('po-desc').value,
      default_role_id: document.getElementById('po-role').value ? Number(document.getElementById('po-role').value) : null,
      sort_order: Number(document.getElementById('po-sort').value) || 0,
      purpose: document.getElementById('po-purpose').value,
      valuable_final_product: document.getElementById('po-vfp').value,
      senior_post_id: document.getElementById('po-senior').value ? Number(document.getElementById('po-senior').value) : null,
    };
    try { await api('?api=post-update&id=' + po.id, { method: 'POST', body }); await loadOrgTab(); openOrgEditor('post', po.id); }
    catch (e) { document.getElementById('po-msg').textContent = e.message; }
  });
  document.getElementById('po-delete').addEventListener('click', async () => {
    if (!confirm('Delete this post and its holder history?')) return;
    try { await api('?api=post-delete&id=' + po.id, { method: 'POST', body: {} }); selectedId = null; closeDrawer(); await loadOrgTab(); }
    catch (e) { alert(e.message); }
  });
  loadPoliciesInto('po-policies', 'post', po.id);
}

// ── Read-only PROFILE views ────────────────────────────────────────────────
// Clicking a card on the board opens one of these — a clean, formatted profile
// (no form inputs). The pencil / the profile's own "Edit" button opens the full
// editor above. Policies render read-only here; the +Add button is omitted (the
// editor is where policies are managed). Anyone can view a profile.
function _profBlock(label, val) {
  if (val === null || val === undefined || String(val).trim() === '') return '';
  return `<div class="ax-editor-row" style="margin-bottom:10px;">
    <label style="display:block;margin-bottom:2px;">${escapeHtml(label)}</label>
    <div style="font-size:0.9rem;color:var(--text);white-space:pre-wrap;line-height:1.45;">${escapeHtml(val)}</div>
  </div>`;
}
function _profHeadPill(uid) {
  if (!uid) return '<span style="color:var(--text-dim);font-size:0.86rem;">Vacant</span>';
  return `<span class="holder-pill" title="${escapeHtml(_emailOf(uid) || '')}">
    <span class="holder-pill-av">${escapeHtml(_initialOf(uid))}</span>
    ${escapeHtml(_displayOf(uid))}
  </span>`;
}
function _profActions(kind, id, statsFn) {
  const canEdit = orgCanEdit();
  return `<div class="ax-actions" style="border-top:1px solid var(--border);padding-top:14px;margin-top:16px;">
    ${statsFn ? `<button class="small-btn" id="prof-stats" style="padding:8px 14px;">▤ Stats</button>` : ''}
    ${canEdit ? `<button class="btn-primary" id="prof-edit">✎ Edit</button>` : ''}
  </div>`;
}
function _wireProfileNav(kind, id, statsFn) {
  document.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); openOrgEditor(a.dataset.jump, Number(a.dataset.id), /*view*/ true);
  }));
  document.querySelectorAll('[data-jump-view]').forEach(el => el.addEventListener('click', () => {
    openOrgEditor(el.dataset.jumpView, Number(el.dataset.jumpId), /*view*/ true);
  }));
  const editBtn = document.getElementById('prof-edit');
  if (editBtn) editBtn.addEventListener('click', () => openOrgEditor(kind, id, /*view*/ false));
  const statsBtn = document.getElementById('prof-stats');
  if (statsBtn && statsFn) statsBtn.addEventListener('click', () => statsFn(id));
}

function renderDivisionProfile(d) {
  if (!d) return;
  const ed = editorEl(); if (!ed) return;
  const depts = departmentsData.filter(x => x.division_id === d.id);
  const totalPosts = postsData.filter(p => depts.some(dep => dep.id === p.department_id)).length;
  const roleName = d.head_default_role_id ? (roles.find(r => r.id === d.head_default_role_id)?.name || '') : '';
  ed.innerHTML = `<div class="ax-profile">
    <div class="breadcrumb">Division</div>
    <h2 style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${escapeHtml(d.color || '#6b9eff')};"></span>${escapeHtml(d.name)}</h2>
    <div style="color:var(--text-dim);font-size:0.82rem;margin:-4px 0 14px;">${depts.length} department${depts.length === 1 ? '' : 's'} · ${totalPosts} post${totalPosts === 1 ? '' : 's'}</div>

    ${_profBlock('Purpose', d.purpose)}
    ${_profBlock('What this produces', d.valuable_final_product)}
    ${_profBlock('Description', d.description)}

    <h3>Division Head</h3>
    <div style="margin-bottom:12px;">${_profHeadPill(d.head_user_id)}${roleName ? ` <span class="org-badge">${escapeHtml(roleName)}</span>` : ''}</div>

    <h3>Departments</h3>
    <div id="prof-depts" style="display:flex;flex-direction:column;gap:4px;">${
      depts.length
        ? depts.map(dep => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-jump-view="department" data-jump-id="${dep.id}"><span>${escapeHtml(dep.name)}</span><span class="org-badge">${postsData.filter(p => p.department_id === dep.id).length} posts</span></div>`).join('')
        : '<span style="color:var(--text-dim);font-size:0.82rem;">No departments yet.</span>'
    }</div>

    <h3>Policies &amp; orders</h3>
    <div id="d-policies"></div>

    ${_profActions('division', d.id, typeof openDivisionStats === 'function' ? openDivisionStats : null)}
  </div>`;
  _wireProfileNav('division', d.id, typeof openDivisionStats === 'function' ? openDivisionStats : null);
  loadPoliciesInto('d-policies', 'division', d.id);
}

function renderDepartmentProfile(dep) {
  if (!dep) return;
  const ed = editorEl(); if (!ed) return;
  const division = divisionsData.find(x => x.id === dep.division_id);
  const posts = postsData.filter(p => p.department_id === dep.id);
  const roleName = dep.head_default_role_id ? (roles.find(r => r.id === dep.head_default_role_id)?.name || '') : '';
  ed.innerHTML = `<div class="ax-profile">
    <div class="breadcrumb"><a data-jump="division" data-id="${division?.id}">${escapeHtml(division?.name || 'Division')}</a> › Department</div>
    <h2>${escapeHtml(dep.name)}</h2>
    <div style="color:var(--text-dim);font-size:0.82rem;margin:-4px 0 14px;">${posts.length} post${posts.length === 1 ? '' : 's'}</div>

    ${_profBlock('Purpose', dep.purpose)}
    ${_profBlock('What this produces', dep.valuable_final_product)}
    ${_profBlock('Description', dep.description)}

    <h3>Department Head</h3>
    <div style="margin-bottom:12px;">${_profHeadPill(dep.head_user_id)}${roleName ? ` <span class="org-badge">${escapeHtml(roleName)}</span>` : ''}</div>

    <h3>Posts</h3>
    <div id="prof-posts" style="display:flex;flex-direction:column;gap:4px;">${
      posts.length
        ? posts.map(po => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-jump-view="post" data-jump-id="${po.id}"><span>${escapeHtml(po.name)}</span><span class="org-badge">${po.default_role_id ? escapeHtml(roles.find(r => r.id === po.default_role_id)?.name || 'role') : '—'}</span></div>`).join('')
        : '<span style="color:var(--text-dim);font-size:0.82rem;">No posts yet.</span>'
    }</div>

    <h3>Policies &amp; orders</h3>
    <div id="dep-policies"></div>

    ${_profActions('department', dep.id, null)}
  </div>`;
  _wireProfileNav('department', dep.id, null);
  loadPoliciesInto('dep-policies', 'department', dep.id);
}

function renderPostProfile(po) {
  if (!po) return;
  const ed = editorEl(); if (!ed) return;
  const dep = departmentsData.find(x => x.id === po.department_id);
  const div = divisionsData.find(x => x.id === dep?.division_id);
  const holders = (activeHoldersByPost[po.id] || []);
  const roleName = po.default_role_id ? (roles.find(r => r.id === po.default_role_id)?.name || '') : '';
  const senior = po.senior_post_id ? postsData.find(p => p.id === po.senior_post_id) : null;
  const seniorText = senior ? senior.name : 'Department Head (default)';
  const holdersHtml = holders.length
    ? holders.map(h => _profHeadPill(h.user_id)).join(' ')
    : '<span style="color:var(--text-dim);font-size:0.86rem;">Vacant</span>';
  ed.innerHTML = `<div class="ax-profile">
    <div class="breadcrumb">
      <a data-jump="division" data-id="${div?.id}">${escapeHtml(div?.name || 'Division')}</a> ›
      <a data-jump="department" data-id="${dep?.id}">${escapeHtml(dep?.name || 'Department')}</a> › Post
    </div>
    <h2>${escapeHtml(po.name)}</h2>

    <h3>Who holds this post</h3>
    <div style="margin-bottom:12px;">${holdersHtml}</div>

    ${_profBlock('Purpose', po.purpose)}
    ${_profBlock('What it produces', po.valuable_final_product)}
    ${_profBlock('Description', po.description)}

    <h3>Reporting &amp; role</h3>
    <div class="ax-editor-row" style="margin-bottom:8px;"><label style="display:block;margin-bottom:2px;">Reports to</label><div style="font-size:0.9rem;color:var(--text);">${escapeHtml(seniorText)}</div></div>
    <div class="ax-editor-row" style="margin-bottom:8px;"><label style="display:block;margin-bottom:2px;">Auto-assigned role</label><div style="font-size:0.9rem;color:var(--text);">${roleName ? escapeHtml(roleName) : '—'}</div></div>

    <h3>Policies &amp; orders</h3>
    <div id="po-policies"></div>

    ${_profActions('post', po.id, typeof openPostStats === 'function' ? openPostStats : null)}
  </div>`;
  _wireProfileNav('post', po.id, typeof openPostStats === 'function' ? openPostStats : null);
  loadPoliciesInto('po-policies', 'post', po.id);
}

// Executive posts live above the divisions; clicking one opens this read-only
// profile (holder, purpose, who it oversees, who it reports to). The pencil / the
// profile's Edit button opens the exec editor (openExecPostEditor).
function openExecProfile(epId) {
  const ep = execPostsData.find(x => x.id === epId);
  openDrawer('<div id="axDrawerEditor"><div class="ax-editor-empty">Loading…</div></div>');
  const drawer = document.getElementById('orgDrawer');
  if (drawer) drawer.classList.remove('viewonly');
  const lbl = drawer && drawer.querySelector('.org-drawer-close > span');
  if (lbl) lbl.textContent = 'Profile';
  _useDrawerEditor = true;
  renderExecProfile(ep);
}
function renderExecProfile(ep) {
  if (!ep) return;
  const ed = editorEl(); if (!ed) return;
  const holders = (execHoldersByExecPost[ep.id] || []);
  const holdersHtml = holders.length ? holders.map(h => _profHeadPill(h.user_id)).join(' ')
    : '<span style="color:var(--text-dim);font-size:0.86rem;">Vacant</span>';
  const parent = ep.parent_exec_post_id ? execPostsData.find(x => x.id === ep.parent_exec_post_id) : null;
  const childExecs = execPostsData.filter(x => x.parent_exec_post_id === ep.id && x.id !== ep.id);
  const overseenDivs = (ep.division_ids || []).map(did => divisionsData.find(d => d.id === did)).filter(Boolean);
  const oversees = [
    ...overseenDivs.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-jump-view="division" data-jump-id="${d.id}"><span>${escapeHtml(d.name)}</span><span class="org-badge">division</span></div>`),
    ...childExecs.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-jump-exec-id="${c.id}"><span>${escapeHtml(c.name)}</span><span class="org-badge">exec</span></div>`),
  ].join('');
  ed.innerHTML = `<div class="ax-profile">
    <div class="breadcrumb">Executive post</div>
    <h2 style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${escapeHtml(ep.color || '#fbbf24')};"></span>${escapeHtml(ep.name)}</h2>

    <h3>Who holds this post</h3>
    <div style="margin-bottom:12px;">${holdersHtml}</div>

    ${_profBlock('Purpose', ep.purpose)}
    ${_profBlock('What this produces', ep.valuable_final_product)}
    ${_profBlock('Description', ep.description)}

    <h3>Reports to</h3>
    <div style="margin-bottom:4px;">${parent
      ? `<div style="display:inline-flex;align-items:center;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;cursor:pointer;" data-jump-exec-id="${parent.id}">${escapeHtml(parent.name)}</div>`
      : '<span style="color:var(--text-dim);font-size:0.86rem;">Top-level (reports to no one)</span>'}</div>

    <h3>Oversees</h3>
    <div style="display:flex;flex-direction:column;gap:4px;">${oversees || '<span style="color:var(--text-dim);font-size:0.82rem;">Nothing assigned yet.</span>'}</div>

    <h3>Policies &amp; orders</h3>
    <div id="exec-policies"></div>
    <button class="small-btn" id="exec-add-policy" style="margin-top:8px;display:none;padding:7px 12px;">+ Add policy / order</button>

    <h3>Targets</h3>
    <div id="exec-targets"></div>

    <div class="ax-actions" style="border-top:1px solid var(--border);padding-top:14px;margin-top:16px;">
      ${typeof openExecStats === 'function' ? '<button class="small-btn" id="prof-stats" style="padding:8px 14px;">▤ Stats</button>' : ''}
      ${orgCanEdit() ? '<button class="btn-primary" id="prof-edit">✎ Edit</button>' : ''}
    </div>
  </div>`;
  document.querySelectorAll('[data-jump-view]').forEach(el => el.addEventListener('click', () => openOrgEditor(el.dataset.jumpView, Number(el.dataset.jumpId), /*view*/ true)));
  document.querySelectorAll('[data-jump-exec-id]').forEach(el => el.addEventListener('click', () => openExecProfile(Number(el.dataset.jumpExecId))));
  const eb = document.getElementById('prof-edit'); if (eb) eb.addEventListener('click', () => openExecPostEditor(ep.id));
  const sb = document.getElementById('prof-stats'); if (sb && typeof openExecStats === 'function') sb.addEventListener('click', () => openExecStats(ep.id));
  // Policies & orders (creator-based, exec-scoped) + the exec's own task board.
  loadPoliciesInto('exec-policies', 'executive_post', ep.id);
  document.getElementById('exec-add-policy')?.addEventListener('click', () => openPolicyModal('executive_post', ep.id));
  const tEl = document.getElementById('exec-targets');
  if (tEl && window.Targets) {
    tEl.innerHTML = '<div id="execTgBoard"></div><div style="margin-top:8px;"><button class="small-btn" id="execTgNew" style="background:var(--surface3);">+ New task</button></div>';
    Targets.renderBoard(document.getElementById('execTgBoard'), { filterExecPost: ep.id, execPostId: ep.id });
    document.getElementById('execTgNew').addEventListener('click', () => Targets.openNew({ exec_post_id: ep.id, opts: { onClose: () => renderExecProfile(ep), onChange: () => renderExecProfile(ep) } }));
  } else if (tEl) { tEl.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">Targets unavailable.</span>'; }
}

async function refreshExecPostHolders(execPostId) {
  try {
    const j = await api('?api=exec-post-holders&exec_post_id=' + execPostId);
    const rows = (j.rows || []).filter(r => !r.ended_at);
    const wrap = document.getElementById('ep-holders');
    if (!wrap) return;
    if (!rows.length) { wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">No holders yet — pick someone below and click Assign.</span>'; return; }
    wrap.innerHTML = rows.map(r => `<span class="holder-pill" title="${escapeHtml(_emailOf(r.user_id) || '')}">
        <span class="holder-pill-av">${escapeHtml(_initialOf(r.user_id))}</span>
        ${escapeHtml(_displayOf(r.user_id))}
        <button title="Remove from post" data-uid="${r.user_id}">×</button>
      </span>`).join('');
    wrap.querySelectorAll('button[data-uid]').forEach(b => b.addEventListener('click', async () => {
      try { await api('?api=exec-post-remove-holder', { method: 'POST', body: { exec_post_id: execPostId, user_id: b.dataset.uid } }); await refreshExecPostHolders(execPostId); await loadOrgTab(); }
      catch (e) { alert(e.message); }
    }));
  } catch (_) {}
}

async function refreshPostHolders(postId) {
  try {
    const j = await api('?api=post-holders&post_id=' + postId);
    const rows = (j.rows || []).filter(r => !r.ended_at);
    const wrap = document.getElementById('po-holders');
    if (!wrap) return;
    if (!rows.length) { wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">Vacant — pick someone below and click Assign.</span>'; return; }
    wrap.innerHTML = rows.map(r => {
      return `<span class="holder-pill" title="${escapeHtml(_emailOf(r.user_id) || '')}">
        <span class="holder-pill-av">${escapeHtml(_initialOf(r.user_id))}</span>
        ${escapeHtml(_displayOf(r.user_id))}
        <button title="Remove from post" data-uid="${r.user_id}">×</button>
      </span>`;
    }).join('');
    wrap.querySelectorAll('button[data-uid]').forEach(b => b.addEventListener('click', async () => {
      try { await api('?api=post-remove-holder', { method: 'POST', body: { post_id: postId, user_id: b.dataset.uid } }); await refreshPostHolders(postId); await loadUsersTab(); }
      catch (e) { alert(e.message); }
    }));
  } catch (_) {}
}

async function loadPoliciesInto(elId, scopeType, scopeId) {
  // Uses /policies-for-scope which returns own + inherited policies.
  // Inherited policies (from a parent department or division) are displayed
  // read-only with a badge — clicking them jumps to the source scope.
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">Loading…</span>';
  try {
    // Executive posts aren't in access-control's scope model and have no
    // inheritance — read their own policies directly via org-policy-write.
    const j = scopeType === 'executive_post'
      ? await pwApi('?api=list&scope_type=executive_post&scope_id=' + scopeId)
      : await api('?api=policies-for-scope&scope_type=' + scopeType + '&scope_id=' + scopeId);
    const rows = j.rows || [];

    // Anyone can create their own policy here (same as the Policies dashboard);
    // editing/deleting is gated per-policy to the creator or an admin.
    const addBtnIdMap = { 'd-policies': 'd-add-policy', 'dep-policies': 'dep-add-policy', 'po-policies': 'po-add-policy', 'exec-policies': 'exec-add-policy' };
    const addBtn = document.getElementById(addBtnIdMap[elId]);
    if (addBtn) addBtn.style.display = '';

    if (!rows.length) {
      el.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">No policies or orders yet. Click <strong>+ Add policy / order</strong> to create one.</span>';
      return;
    }
    el.innerHTML = rows.map(p => {
      const kindLabel = p.kind === 'order' ? 'ORDER' : p.kind === 'directive' ? 'DIRECTIVE' : 'POLICY';
      const kindColor = p.kind === 'order' ? '#fbbf24' : p.kind === 'directive' ? '#f472b6' : '#6b9eff';
      const expiry = p.expires_at ? new Date(p.expires_at) : null;
      const expired = expiry && expiry < new Date();
      const expiryText = expiry ? (expired ? `expired ${expiry.toLocaleDateString()}` : `expires ${expiry.toLocaleDateString()}`) : '';
      const inh = p.inherited_from;
      // Inherited policies look slightly dimmer and carry an "inherited from X" badge.
      const baseStyle = inh
        ? 'padding:10px;background:var(--surface);border:1px dashed var(--border);border-radius:8px;margin-top:6px;cursor:pointer;opacity:0.92;'
        : 'padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-top:6px;cursor:pointer;';
      const inhBadge = inh
        ? `<span style="font-size:0.64rem;padding:2px 6px;border-radius:4px;background:rgba(167,139,250,.18);color:#a78bfa;font-weight:700;">↑ from ${escapeHtml(inh.type)} ${escapeHtml(inh.name)}</span>`
        : '';
      return `<div style="${baseStyle}" data-pid="${p.id}" data-inherited="${inh ? '1' : '0'}" data-source-type="${inh ? inh.type : scopeType}" data-source-id="${inh ? inh.id : scopeId}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-weight:600;font-size:0.88rem;">${escapeHtml(p.title)}</span>
          <span style="display:flex;gap:6px;align-items:center;">
            ${inhBadge}
            <span style="font-size:0.66rem;font-weight:700;color:${kindColor};">${kindLabel}</span>
          </span>
        </div>
        ${(() => { const t = (window.PolicyWidget && window.PolicyWidget._stripHtml) ? window.PolicyWidget._stripHtml(p.body) : String(p.body || ''); return t.trim() ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">${escapeHtml(t).slice(0, 280)}${t.length > 280 ? '…' : ''}</div>` : ''; })()}
        ${expiryText ? `<div style="font-size:0.7rem;color:${expired ? 'var(--red)' : 'var(--text-dim)'};margin-top:4px;">${expiryText}</div>` : ''}
      </div>`;
    }).join('');
    el.querySelectorAll('[data-pid]').forEach(div => div.addEventListener('click', () => {
      const inherited = div.dataset.inherited === '1';
      if (inherited) {
        // Inherited: jump to the source scope so the user can edit (if allowed) there.
        const sType = div.dataset.sourceType;
        const sId = Number(div.dataset.sourceId);
        openOrgEditor(sType, sId);
      } else {
        // Same read view as the Policies & Orders dashboard (letter format).
        const p = rows.find(x => x.id == div.dataset.pid);
        openPolicyReader(p, scopeType, scopeId);
      }
    }));
  } catch (e) { el.innerHTML = `<span style="color:var(--red);font-size:0.82rem;">${escapeHtml(e.message)}</span>`; }
}

async function loadDivisionEditors(divisionId) {
  const wrap = document.getElementById('d-editors');
  const pick = document.getElementById('d-editor-pick');
  if (!wrap) return;
  wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.78rem;">Loading…</span>';
  try {
    const j = await api('?api=division-editors&division_id=' + divisionId);
    const editors = j.rows || [];
    const editorIds = new Set(editors.map(e => e.user_id));
    wrap.innerHTML = editors.length
      ? editors.map(e => {
          return `<span class="holder-pill" title="${escapeHtml(e.email)}">
            <span class="holder-pill-av">${escapeHtml(_initialOf(e.user_id))}</span>
            ${escapeHtml(_displayOf(e.user_id))}
            <button title="Remove" data-uid="${e.user_id}">×</button>
          </span>`;
        }).join('')
      : '<span style="color:var(--text-dim);font-size:0.78rem;">No policy editors yet — only admins can edit policies on this division.</span>';
    wrap.querySelectorAll('button[data-uid]').forEach(b => b.addEventListener('click', async () => {
      try { await api('?api=division-editor-remove', { method: 'POST', body: { division_id: divisionId, user_id: b.dataset.uid } }); await loadDivisionEditors(divisionId); }
      catch (e) { alert(e.message); }
    }));
    // Populate dropdown with non-editor users
    if (pick) {
      pick.innerHTML = [...usersData]
        .filter(u => !editorIds.has(u.id))
        .sort((a, b) => (_displayOf(a.id) || '').localeCompare(_displayOf(b.id) || ''))
        .map(u => `<option value="${u.id}">${escapeHtml(_pickerLabelFor(u))}</option>`).join('');
      const addBtn = document.getElementById('d-editor-add');
      if (addBtn) addBtn.onclick = async () => {
        const uid = pick.value;
        if (!uid) return;
        try { await api('?api=division-editor-add', { method: 'POST', body: { division_id: divisionId, user_id: uid } }); await loadDivisionEditors(divisionId); }
        catch (e) { alert(e.message); }
      };
    }
  } catch (e) { wrap.innerHTML = `<span style="color:var(--red);font-size:0.78rem;">${escapeHtml(e.message)}</span>`; }
}

// ═══════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════
function showModal(html, opts = {}) {
  const root = document.getElementById('modalRoot');
  const wide = opts.wide ? ' invite-wide' : '';
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-card${wide}" onclick="event.stopPropagation()">${html}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', closeModal);
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

function openCreateDivisionModal() {
  showModal(`<h3>New division</h3>
    <div class="ax-editor-row"><label>Name</label><input id="m-name" placeholder="e.g. Mentorship Operations"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="m-slug" placeholder="mentorship_ops"></div>
    <div class="ax-editor-row"><label>Color</label><input id="m-color" type="color" value="#6b9eff" style="max-width:80px;"></div>
    <div class="ax-actions"><button class="btn-primary" id="m-create">Create</button><button class="btn-ghost" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button></div>`);
  document.getElementById('m-create').addEventListener('click', async () => {
    try {
      const body = { name: document.getElementById('m-name').value.trim(), slug: document.getElementById('m-slug').value.trim() || document.getElementById('m-name').value.trim().toLowerCase().replace(/\s+/g, '_'), color: document.getElementById('m-color').value, sort_order: divisionsData.length };
      const res = await api('?api=division-create', { method: 'POST', body });
      closeModal(); await loadOrgTab(); if (res?.row?.id) openOrgEditor('division', res.row.id);
    } catch (e) { alert(e.message); }
  });
}

function openCreateDepartmentModal(divisionId) {
  showModal(`<h3>New department</h3>
    <div class="ax-editor-row"><label>Name</label><input id="m-name" placeholder="e.g. Coaching"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="m-slug" placeholder="coaching"></div>
    <div class="ax-actions"><button class="btn-primary" id="m-create">Create</button><button class="btn-ghost" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button></div>`);
  document.getElementById('m-create').addEventListener('click', async () => {
    try {
      const body = { division_id: divisionId, name: document.getElementById('m-name').value.trim(), slug: document.getElementById('m-slug').value.trim() || document.getElementById('m-name').value.trim().toLowerCase().replace(/\s+/g, '_'), sort_order: departmentsData.filter(d => d.division_id === divisionId).length };
      const res = await api('?api=department-create', { method: 'POST', body });
      closeModal(); await loadOrgTab(); if (res?.row?.id) openOrgEditor('department', res.row.id);
    } catch (e) { alert(e.message); }
  });
}

function openCreatePostModal(departmentId) {
  const roleOpts = ['<option value="">— No default role —</option>'].concat(roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)).join('');
  showModal(`<h3>New post</h3>
    <div class="ax-editor-row"><label>Name</label><input id="m-name" placeholder="e.g. Coach"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="m-slug" placeholder="coach"></div>
    <div class="ax-editor-row"><label>Auto-assigned role</label><select id="m-role">${roleOpts}</select></div>
    <div class="ax-actions"><button class="btn-primary" id="m-create">Create</button><button class="btn-ghost" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button></div>`);
  document.getElementById('m-create').addEventListener('click', async () => {
    try {
      const body = { department_id: departmentId, name: document.getElementById('m-name').value.trim(), slug: document.getElementById('m-slug').value.trim() || document.getElementById('m-name').value.trim().toLowerCase().replace(/\s+/g, '_'), default_role_id: document.getElementById('m-role').value ? Number(document.getElementById('m-role').value) : null, sort_order: postsData.filter(p => p.department_id === departmentId).length };
      const res = await api('?api=post-create', { method: 'POST', body });
      closeModal(); await loadOrgTab(); if (res?.row?.id) openOrgEditor('post', res.row.id);
    } catch (e) { alert(e.message); }
  });
}

// Element that holds each scope's policy list (same id in the editor + profile).
function _policyElId(scopeType) { return scopeType === 'division' ? 'd-policies' : scopeType === 'department' ? 'dep-policies' : scopeType === 'executive_post' ? 'exec-policies' : 'po-policies'; }
function _reloadPolicies(scopeType, scopeId) { loadPoliciesInto(_policyElId(scopeType), scopeType, scopeId); }

// New policy / order — opens the SAME rich builder as the Policies & Orders
// dashboard (series, concerns typeahead, rich text, letter format) via the
// shared PolicyWidget. The scope is fixed to where you're adding it.
function openPolicyModal(scopeType, scopeId) {
  if (!window.PolicyWidget) return;
  const seed = scopeType === 'executive_post' ? [] : [{ type: scopeType, id: Number(scopeId) }];
  window.PolicyWidget.openEditor({
    scope: { type: scopeType, id: Number(scopeId) }, seedConcerns: seed,
    onSaved: (row) => { if (row) { const c = (window._orgAllPolicies = window._orgAllPolicies || []); c.push(row); } _reloadPolicies(scopeType, scopeId); },
  });
}

// Clicking an existing policy opens the read view (letter format); Edit/Delete
// live inside that reader (creator/admin only), all via the shared PolicyWidget.
function openPolicyReader(p, scopeType, scopeId) {
  if (!window.PolicyWidget || !p) return;
  window.PolicyWidget.openReader(p, { onChanged: () => {
    // Keep the series-suggestion cache roughly in sync after edits/deletes.
    try { const c = window._orgAllPolicies; if (Array.isArray(c)) { const i = c.findIndex(x => x.id === p.id); if (i >= 0) c.splice(i, 1); } } catch (_) {}
    _reloadPolicies(scopeType, scopeId);
  } });
}

// ═══════════════════════════════════════════════════════════════════════
// INVITE MODAL — guided, with quick presets and live permission preview
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ORG BOARD EXTRAS — DRAG-AND-DROP moves + stats popups.
// Divisions, departments and posts are moved/reordered by dragging (pointer-
// based, with a live-reflow ghost — see _wireDivisionDrag / _wireDepartmentDrag
// / _wirePostDrag). People are assigned with the ▾ picker on each post (and in
// the editor drawer). Exec hierarchy + which divisions an exec oversees are set
// in the exec editor. (The old tap-to-pick-then-tap-a-green-slot system and the
// "Unposted people" tray were removed once drag-and-drop covered every move.)
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const _orig = renderOrgBoard;
  renderOrgBoard = function () { const r = _orig.apply(this, arguments); try { enhanceBoard(); } catch (e) { console.warn('[org enhance]', e); } return r; };
})();

function _deptIdOf(col) { const h = col && col.querySelector('.org-col-department-head'); return h ? Number(h.dataset.id) : null; }

// ── Executive TREE (connected boxes above the divisions, MAKH-style) ─────────
// Overrides the ported flat-strip renderTopTier() with a nested-UL org chart
// built from org_executive_posts.parent_exec_post_id, drawn with CSS connector
// lines. Add a child post (+), reparent by picking a node up and tapping another
// node (or "make top-level"), assign a holder via the ▾ picker.
renderTopTier = function () { try { _renderExecTree(); } catch (e) { console.warn('[exec tree]', e); } };

function _renderExecTree() {
  const tier = document.getElementById('orgTopTier'); if (!tier) return;
  const editing = orgCanEdit();
  // Flat render: every exec node is an absolutely-positioned box inside the
  // layer. Positions + connector lines are computed later in _weaveTree() so
  // each exec sits centred over everything it connects to (child execs and/or
  // divisions), MAKH-style. parent_exec_post_id still defines the hierarchy.
  const nodeHtml = (p) => {
    const holder = (execHoldersByExecPost[p.id] || [])[0];
    const color = p.color || '#fbbf24';
    const holderHtml = holder
      ? `<span class="havatar small">${escapeHtml(_initialOf(holder.user_id))}</span>${escapeHtml(_displayOf(holder.user_id))}`
      : '<span class="org-exec-vac">Vacant</span>';
    return `<div class="org-exec-node" data-id="${p.id}" style="--nc:${color}">
        <div class="org-exec-node-title">${escapeHtml(p.name)}</div>
        <div class="org-exec-node-holder">${holderHtml}</div>
      </div>`;
  };
  tier.innerHTML = `<div class="org-tree-label">Executive structure${editing ? ' <button class="org-add-exec" id="org-add-exec-root">+ Add top post</button>' : ''}</div>
    <div class="org-exec-layer" id="orgExecLayer">${execPostsData.length ? execPostsData.map(nodeHtml).join('') : '<div class="org-exec-empty">No executive posts yet</div>'}</div>`;
  document.getElementById('org-add-exec-root')?.addEventListener('click', () => _createExecUnder(null));
  tier.querySelectorAll('.org-exec-node').forEach(node => {
    const id = Number(node.dataset.id);
    // Clicking the node body opens its read-only profile (like clicking a post
    // or division). The small buttons below stopPropagation, so they win.
    node.style.cursor = 'pointer';
    node.addEventListener('click', ev => {
      if (ev.target.closest('button, a, input, select, textarea, .org-pick-btn, .org-stat-btn, .org-edit-btn, .org-exec-addsub')) return;
      ev.stopPropagation();
      openExecProfile(id);
    });
    node.appendChild(_statBtn('Executive post stats', ev => { ev.stopPropagation(); openExecStats(id); }));
    if (editing) {
      node.appendChild(_editBtn(ev => { ev.stopPropagation(); openExecPostEditor(id); }));
      const addSub = document.createElement('button'); addSub.className = 'org-exec-addsub'; addSub.type = 'button'; addSub.title = 'Add a post reporting to this'; addSub.textContent = '＋';
      addSub.addEventListener('click', e => { e.stopPropagation(); _createExecUnder(id); }); node.appendChild(addSub);
      const pk = document.createElement('button'); pk.className = 'org-pick-btn'; pk.type = 'button'; pk.title = 'Assign / change person'; pk.textContent = '▾';
      pk.addEventListener('click', e => { e.stopPropagation(); _openExecPersonPicker(id, pk); }); node.appendChild(pk);
      // Executive hierarchy is set in the editor ("Sits above / oversees"), so
      // executives are no longer tap-to-move — no "tap a green slot" mode.
    }
  });
}

async function _createExecUnder(parentId) {
  const name = prompt(parentId ? 'Name of the post reporting to this one:' : 'Name of the top executive post:');
  if (!name || !name.trim()) return;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('exec_' + Date.now());
  try { await api('?api=exec-post-create', { method: 'POST', body: { name: name.trim(), slug, parent_exec_post_id: parentId || null } }); await loadOrgTab(); } catch (e) { alert(e.message); }
}

function _openExecPersonPicker(execId, anchor) {
  _closePicker();
  const pop = document.createElement('div'); pop.id = 'orgPersonPop'; pop.className = 'org-person-pop';
  pop.innerHTML = '<input type="text" class="org-pop-search" placeholder="Search people…"><div class="org-pop-list"></div>';
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 246)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 320) + 'px';
  const list = pop.querySelector('.org-pop-list'), search = pop.querySelector('.org-pop-search');
  const cur = (execHoldersByExecPost[execId] || [])[0];
  const render = (q) => {
    const ql = (q || '').toLowerCase();
    const rows = usersData.filter(u => !ql || (_displayOf(u.id) || '').toLowerCase().includes(ql) || (u.email || '').toLowerCase().includes(ql)).slice(0, 60)
      .map(u => `<button type="button" class="org-pop-item" data-uid="${u.id}">${escapeHtml(_pickerLabelFor(u))}</button>`);
    list.innerHTML = (cur ? '<button type="button" class="org-pop-item org-pop-clear" data-uid="">✕ Make vacant</button>' : '') + (rows.join('') || '<div style="padding:8px;color:var(--text-dim);font-size:0.78rem;">No matches</div>');
    list.querySelectorAll('.org-pop-item').forEach(it => it.addEventListener('click', async e => {
      e.stopPropagation(); const uid = it.dataset.uid; _closePicker();
      try { if (uid) await api('?api=exec-post-add-holder', { method: 'POST', body: { exec_post_id: execId, user_id: uid } }); else if (cur) await api('?api=exec-post-remove-holder', { method: 'POST', body: { exec_post_id: execId, user_id: cur.user_id } }); await loadOrgTab(); } catch (err) { alert(err.message); }
    }));
  };
  render(''); search.focus();
  search.addEventListener('input', () => render(search.value));
  search.addEventListener('click', e => e.stopPropagation());
  setTimeout(() => document.addEventListener('click', _closePickerOutside, true), 0);
}

function _editBtn(onClick) {
  const b = document.createElement('button');
  b.className = 'org-edit-btn'; b.type = 'button'; b.title = 'Edit';
  b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  b.addEventListener('click', onClick);
  return b;
}
function _hexToRgba(hex, a) { hex = String(hex || '').replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const n = parseInt(hex || '6b9eff', 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// Color picker (swatch) on a division header — opens the native color input.
function _colorSwatch(divId, color) {
  const w = document.createElement('label');
  w.className = 'org-color-swatch'; w.title = 'Division color'; w.style.background = color;
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = color;
  inp.style.cssText = 'position:absolute;opacity:0;width:100%;height:100%;left:0;top:0;cursor:pointer;';
  w.appendChild(inp);
  w.addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('input', e => { e.stopPropagation(); w.style.background = inp.value; });
  inp.addEventListener('change', async e => { e.stopPropagation(); try { await api('?api=division-update&id=' + divId, { method: 'POST', body: { color: inp.value } }); await loadOrgTab(); } catch (err) { alert(err.message); } });
  return w;
}

// Inline person picker (data picker) — a ▾ on a post that opens a searchable
// people popover; picking one sets the holder without opening the drawer.
function _pickerBtn(postId) {
  const b = document.createElement('button');
  b.className = 'org-pick-btn'; b.type = 'button'; b.title = 'Assign / change person'; b.textContent = '▾';
  b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); _openPersonPicker(postId, b); });
  return b;
}
function _closePicker() { const p = document.getElementById('orgPersonPop'); if (p) p.remove(); document.removeEventListener('click', _closePickerOutside, true); }
function _closePickerOutside(e) { if (!e.target.closest('#orgPersonPop, .org-pick-btn')) _closePicker(); }
function _openPersonPicker(postId, anchor) {
  _closePicker();
  const pop = document.createElement('div'); pop.id = 'orgPersonPop'; pop.className = 'org-person-pop';
  pop.innerHTML = '<input type="text" class="org-pop-search" placeholder="Search people…"><div class="org-pop-list"></div>';
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 246)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 320) + 'px';
  const list = pop.querySelector('.org-pop-list'), search = pop.querySelector('.org-pop-search');
  const cur = (activeHoldersByPost[postId] || [])[0];
  const render = (q) => {
    const ql = (q || '').toLowerCase();
    const rows = usersData
      .filter(u => !ql || (_displayOf(u.id) || '').toLowerCase().includes(ql) || (u.email || '').toLowerCase().includes(ql))
      .slice(0, 60)
      .map(u => `<button type="button" class="org-pop-item" data-uid="${u.id}">${escapeHtml(_pickerLabelFor(u))}</button>`);
    list.innerHTML = (cur ? '<button type="button" class="org-pop-item org-pop-clear" data-uid="">✕ Make vacant</button>' : '') + (rows.join('') || '<div style="padding:8px;color:var(--text-dim);font-size:0.78rem;">No matches</div>');
    list.querySelectorAll('.org-pop-item').forEach(it => it.addEventListener('click', async e => {
      e.stopPropagation(); const uid = it.dataset.uid; _closePicker();
      try {
        if (uid) await api('?api=post-add-holder', { method: 'POST', body: { post_id: postId, user_id: uid } });
        else if (cur) await api('?api=post-remove-holder', { method: 'POST', body: { post_id: postId, user_id: cur.user_id } });
        await loadOrgTab();
      } catch (err) { alert(err.message); }
    }));
  };
  render(''); search.focus();
  search.addEventListener('input', () => render(search.value));
  search.addEventListener('click', e => e.stopPropagation());
  setTimeout(() => document.addEventListener('click', _closePickerOutside, true), 0);
}

// After a drag, sync the in-memory model from the (already-correct) DOM and
// re-render locally — NO network round-trip, NO "Loading…" blank. The server is
// updated in the background. This is what stops the whole board flashing black
// on every drop.
function _syncMemoryFromDom() {
  const board = document.getElementById('orgBoard');
  if (!board) return;
  const divEls = [...board.querySelectorAll(':scope > .org-col-division')];
  const divOrder = divEls.map(e => Number(e.dataset.divId));
  divisionsData.sort((a, b) => divOrder.indexOf(a.id) - divOrder.indexOf(b.id));
  divisionsData.forEach((d, i) => { d.sort_order = i; });
  divEls.forEach(divEl => {
    const divId = Number(divEl.dataset.divId);
    [...divEl.querySelectorAll('.org-col-departments > .org-col-department')].forEach((deptEl, di) => {
      const deptId = _deptIdOf(deptEl);
      const dep = departmentsData.find(x => x.id === deptId);
      if (dep) { dep.division_id = divId; dep.sort_order = di; }
      [...deptEl.querySelectorAll('.org-col-department-posts > .org-post-card')].forEach((pEl, pi) => {
        const p = postsData.find(x => x.id === Number(pEl.dataset.id));
        if (p) { p.department_id = deptId; p.sort_order = pi; }
      });
    });
  });
  departmentsData.sort((a, b) => (a.division_id - b.division_id) || (a.sort_order - b.sort_order));
  postsData.sort((a, b) => (a.department_id - b.department_id) || (a.sort_order - b.sort_order));
}
function _reRenderInPlace() {
  _syncMemoryFromDom();
  try { renderOrgBoard(); } catch (e) { console.warn('[org rerender]', e); }
  try { applyOrgZoom(_currentZoom()); } catch (e) {}
}

// ── Division drag-to-reorder (live reflow, MAKH-style) ───────────────────────
// Pick up a division by its header, a ghost follows the pointer, the other
// divisions shift to open a gap where it will land, drop to commit the order.
let _dd = null;
function _currentZoom() { const inner = document.getElementById('orgBoardZoom'); const v = inner && inner.style.getPropertyValue('--org-zoom'); const z = parseFloat(v); return z > 0 ? z : 1; }
function _wireDivisionDrag(head, col, divId) {
  if (head.dataset.ddWired) return; head.dataset.ddWired = '1';
  head.style.touchAction = 'none';
  // Kill native HTML5 drag (the browser's own translucent snapshot) so only our
  // ghost shows — otherwise you see a fragment of the element first.
  head.addEventListener('dragstart', e => e.preventDefault());
  head.addEventListener('pointerdown', e => {
    if (!orgCanEdit() || _dd) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.org-stat-btn, .org-edit-btn, .org-color-swatch, button, a, input, select, textarea')) return;
    e.preventDefault();               // suppress native drag / text selection
    _dd = { col, divId, startX: e.clientX, startY: e.clientY, active: false };
    window.addEventListener('pointermove', _ddMove);
    window.addEventListener('pointerup', _ddUp);
    window.addEventListener('pointercancel', _ddUp);
    window.addEventListener('keydown', _ddKey);
  });
}
function _ddMove(e) {
  if (!_dd) return;
  if (!_dd.active) {
    if (Math.abs(e.clientX - _dd.startX) < 5 && Math.abs(e.clientY - _dd.startY) < 5) return;
    _ddBegin(e);
  }
  _dd.ghost.style.left = (e.clientX - _dd.grabDX) + 'px';
  _dd.ghost.style.top = (e.clientY - _dd.grabDY) + 'px';
  _ddReflow(e.clientX);
}
function _ddBegin(e) {
  _dd.active = true;
  const col = _dd.col;
  _dd.origParent = col.parentElement; _dd.origNext = col.nextElementSibling;   // for no-op detection
  const rect = col.getBoundingClientRect(), z = _currentZoom();
  const ghost = col.cloneNode(true);
  ghost.classList.add('org-div-ghost');
  ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;margin:0;width:' + col.offsetWidth + 'px;transform:scale(' + z + ');transform-origin:top left;left:' + rect.left + 'px;top:' + rect.top + 'px;';
  // cloneNode does NOT reliably carry inline CSS custom properties, so re-apply
  // the division's colour vars or the ghost renders as a plain dark box.
  ghost.style.setProperty('--divc', col.style.getPropertyValue('--divc'));
  ghost.style.setProperty('--divc-soft', col.style.getPropertyValue('--divc-soft'));
  document.body.appendChild(ghost);
  _dd.ghost = ghost;
  _dd.grabDX = e.clientX - rect.left;
  _dd.grabDY = e.clientY - rect.top;
  col.classList.add('org-div-dragging');
  document.body.classList.add('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '0.15';
}
function _ddReflow(clientX) {
  const board = document.getElementById('orgBoard');
  const others = [...board.querySelectorAll(':scope > .org-col-division')].filter(c => c !== _dd.col);
  let ref = null;
  for (const c of others) { const r = c.getBoundingClientRect(); if (clientX < r.left + r.width / 2) { ref = c; break; } }
  const addBtn = board.querySelector(':scope > #org-add-div');
  board.insertBefore(_dd.col, ref || addBtn || null);
}
function _ddKey(e) { if (e.key === 'Escape' && _dd) { _ddAbortOrder = true; _ddUp(); } }
let _ddAbortOrder = false;
function _ddUp() {
  window.removeEventListener('pointermove', _ddMove);
  window.removeEventListener('pointerup', _ddUp);
  window.removeEventListener('pointercancel', _ddUp);
  window.removeEventListener('keydown', _ddKey);
  const dd = _dd; _dd = null;
  if (!dd) return;
  if (dd.ghost) dd.ghost.remove();
  dd.col.classList.remove('org-div-dragging');
  document.body.classList.remove('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '';
  if (!dd.active) return;               // was a click, not a drag
  if (_ddAbortOrder) { _ddAbortOrder = false; loadOrgTab(); return; }  // Esc → reload original order
  if (dd.col.parentElement === dd.origParent && dd.col.nextElementSibling === dd.origNext) return;  // no-op: dropped back
  const board = document.getElementById('orgBoard');
  const order = [...board.querySelectorAll(':scope > .org-col-division')].map(c => Number(c.dataset.divId));
  _reRenderInPlace();                   // instant local re-render, no network blank
  (async () => { try { await api('?api=reorder', { method: 'POST', body: { kind: 'divisions', order } }); } catch (err) { alert(err.message); loadOrgTab(); } })();
}

// ── Department drag-to-move (reorder within a division OR into another) ───────
// Same feel as division drag but vertical, and the drop target is whichever
// division's department list the pointer is over — so a department can be moved
// inside its division or into a different one, others reflowing to make room.
let _dpd = null, _dpdAbort = false;
function _wireDepartmentDrag(head, col, deptId) {
  if (head.dataset.dpdWired) return; head.dataset.dpdWired = '1';
  head.style.touchAction = 'none';
  head.addEventListener('dragstart', e => e.preventDefault());
  head.addEventListener('pointerdown', e => {
    if (!orgCanEdit() || _dpd || _dd) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.org-stat-btn, .org-edit-btn, .org-add-btn, button, a, input, select, textarea')) return;
    e.preventDefault();
    _dpd = { col, deptId, startX: e.clientX, startY: e.clientY, active: false };
    window.addEventListener('pointermove', _dpdMove);
    window.addEventListener('pointerup', _dpdUp);
    window.addEventListener('pointercancel', _dpdUp);
    window.addEventListener('keydown', _dpdKey);
  });
}
function _dpdMove(e) {
  if (!_dpd) return;
  if (!_dpd.active) {
    if (Math.abs(e.clientX - _dpd.startX) < 5 && Math.abs(e.clientY - _dpd.startY) < 5) return;
    _dpdBegin(e);
  }
  _dpd.ghost.style.left = (e.clientX - _dpd.grabDX) + 'px';
  _dpd.ghost.style.top = (e.clientY - _dpd.grabDY) + 'px';
  _dpdReflow(e.clientX, e.clientY);
}
function _dpdBegin(e) {
  _dpd.active = true;
  const col = _dpd.col;
  _dpd.origParent = col.parentElement; _dpd.origNext = col.nextElementSibling;
  const rect = col.getBoundingClientRect(), z = _currentZoom();
  const srcDiv = col.closest('.org-col-division');
  const ghost = col.cloneNode(true);
  ghost.classList.add('org-dept-ghost');
  ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;margin:0;width:' + col.offsetWidth + 'px;transform:scale(' + z + ');transform-origin:top left;left:' + rect.left + 'px;top:' + rect.top + 'px;';
  if (srcDiv) { ghost.style.setProperty('--divc', srcDiv.style.getPropertyValue('--divc')); ghost.style.setProperty('--divc-soft', srcDiv.style.getPropertyValue('--divc-soft')); }
  document.body.appendChild(ghost);
  _dpd.ghost = ghost;
  _dpd.grabDX = e.clientX - rect.left;
  _dpd.grabDY = e.clientY - rect.top;
  col.classList.add('org-dept-dragging');
  document.body.classList.add('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '0.15';
}
function _dpdReflow(cx, cy) {
  // Find the department list the pointer is over (any division); fall back to
  // the one the department currently lives in.
  let target = null;
  for (const c of document.querySelectorAll('.org-col-departments')) {
    const r = c.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top - 50 && cy <= r.bottom + 50) { target = c; break; }
  }
  if (!target) target = _dpd.col.parentElement;
  const others = [...target.querySelectorAll(':scope > .org-col-department')].filter(c => c !== _dpd.col);
  let ref = null;
  for (const c of others) { const r = c.getBoundingClientRect(); if (cy < r.top + r.height / 2) { ref = c; break; } }
  const addBtn = target.querySelector(':scope > .org-add-btn');
  target.insertBefore(_dpd.col, ref || addBtn || null);
}
function _dpdKey(e) { if (e.key === 'Escape' && _dpd) { _dpdAbort = true; _dpdUp(); } }
function _dpdUp() {
  window.removeEventListener('pointermove', _dpdMove);
  window.removeEventListener('pointerup', _dpdUp);
  window.removeEventListener('pointercancel', _dpdUp);
  window.removeEventListener('keydown', _dpdKey);
  const dpd = _dpd; _dpd = null;
  if (!dpd) return;
  if (dpd.ghost) dpd.ghost.remove();
  dpd.col.classList.remove('org-dept-dragging');
  document.body.classList.remove('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '';
  if (!dpd.active) return;
  if (_dpdAbort) { _dpdAbort = false; loadOrgTab(); return; }
  if (dpd.col.parentElement === dpd.origParent && dpd.col.nextElementSibling === dpd.origNext) return;  // no-op
  const container = dpd.col.parentElement;
  const destDivEl = container.closest('.org-col-division');
  const destDiv = destDivEl ? Number(destDivEl.dataset.divId) : null;
  const order = [...container.querySelectorAll(':scope > .org-col-department')].map(c => _deptIdOf(c)).filter(x => x != null);
  const dep = departmentsData.find(x => x.id === dpd.deptId);
  const changedDiv = dep && destDiv != null && dep.division_id !== destDiv;
  _reRenderInPlace();
  (async () => {
    try {
      if (changedDiv) await api('?api=department-update&id=' + dpd.deptId, { method: 'POST', body: { division_id: destDiv } });
      await api('?api=reorder', { method: 'POST', body: { kind: 'departments', order } });
    } catch (err) { alert(err.message); loadOrgTab(); }
  })();
}

// ── Post drag-to-move (reorder in a department OR into another department) ────
// The whole card is the handle; drop target is whichever department's post list
// the pointer is over — across departments and even across divisions.
let _ppd = null, _ppdAbort = false;
function _wirePostDrag(card, postId) {
  if (card.dataset.ppdWired) return; card.dataset.ppdWired = '1';
  card.style.touchAction = 'none';
  card.addEventListener('dragstart', e => e.preventDefault());
  card.addEventListener('pointerdown', e => {
    if (!orgCanEdit() || _ppd || _dd || _dpd) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.org-stat-btn, .org-edit-btn, .org-pick-btn, button, a, input, select, textarea')) return;
    e.preventDefault();
    _ppd = { card, postId, startX: e.clientX, startY: e.clientY, active: false };
    window.addEventListener('pointermove', _ppdMove);
    window.addEventListener('pointerup', _ppdUp);
    window.addEventListener('pointercancel', _ppdUp);
    window.addEventListener('keydown', _ppdKey);
  });
}
function _ppdMove(e) {
  if (!_ppd) return;
  if (!_ppd.active) {
    if (Math.abs(e.clientX - _ppd.startX) < 5 && Math.abs(e.clientY - _ppd.startY) < 5) return;
    _ppdBegin(e);
  }
  _ppd.ghost.style.left = (e.clientX - _ppd.grabDX) + 'px';
  _ppd.ghost.style.top = (e.clientY - _ppd.grabDY) + 'px';
  _ppdReflow(e.clientX, e.clientY);
}
function _ppdBegin(e) {
  _ppd.active = true;
  const card = _ppd.card;
  _ppd.origParent = card.parentElement; _ppd.origNext = card.nextElementSibling;
  const rect = card.getBoundingClientRect(), z = _currentZoom();
  const srcDiv = card.closest('.org-col-division');
  const ghost = card.cloneNode(true);
  ghost.classList.add('org-post-ghost');
  ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;margin:0;width:' + card.offsetWidth + 'px;transform:scale(' + z + ');transform-origin:top left;left:' + rect.left + 'px;top:' + rect.top + 'px;';
  if (srcDiv) { ghost.style.setProperty('--divc', srcDiv.style.getPropertyValue('--divc')); ghost.style.setProperty('--divc-soft', srcDiv.style.getPropertyValue('--divc-soft')); }
  document.body.appendChild(ghost);
  _ppd.ghost = ghost;
  _ppd.grabDX = e.clientX - rect.left;
  _ppd.grabDY = e.clientY - rect.top;
  card.classList.add('org-post-dragging');
  document.body.classList.add('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '0.15';
}
function _ppdReflow(cx, cy) {
  let target = null;
  for (const c of document.querySelectorAll('.org-col-department-posts')) {
    const r = c.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top - 40 && cy <= r.bottom + 40) { target = c; break; }
  }
  if (!target) target = _ppd.card.parentElement;
  const others = [...target.querySelectorAll(':scope > .org-post-card')].filter(c => c !== _ppd.card);
  let ref = null;
  for (const c of others) { const r = c.getBoundingClientRect(); if (cy < r.top + r.height / 2) { ref = c; break; } }
  const addBtn = target.querySelector(':scope > .org-add-post, :scope > .org-add-btn');
  target.insertBefore(_ppd.card, ref || addBtn || null);
}
function _ppdKey(e) { if (e.key === 'Escape' && _ppd) { _ppdAbort = true; _ppdUp(); } }
function _ppdUp() {
  window.removeEventListener('pointermove', _ppdMove);
  window.removeEventListener('pointerup', _ppdUp);
  window.removeEventListener('pointercancel', _ppdUp);
  window.removeEventListener('keydown', _ppdKey);
  const ppd = _ppd; _ppd = null;
  if (!ppd) return;
  if (ppd.ghost) ppd.ghost.remove();
  ppd.card.classList.remove('org-post-dragging');
  document.body.classList.remove('org-dragging');
  const svg = document.getElementById('orgLinkSvg'); if (svg) svg.style.opacity = '';
  if (!ppd.active) return;
  if (_ppdAbort) { _ppdAbort = false; loadOrgTab(); return; }
  if (ppd.card.parentElement === ppd.origParent && ppd.card.nextElementSibling === ppd.origNext) return;  // no-op
  const container = ppd.card.parentElement;
  const destDeptEl = container.closest('.org-col-department');
  const destDept = destDeptEl ? _deptIdOf(destDeptEl) : null;
  const order = [...container.querySelectorAll(':scope > .org-post-card')].map(c => Number(c.dataset.id)).filter(x => !isNaN(x));
  const post = postsData.find(x => x.id === ppd.postId);
  const changedDept = post && destDept != null && post.department_id !== destDept;
  _reRenderInPlace();
  (async () => {
    try {
      if (changedDept) await api('?api=post-update&id=' + ppd.postId, { method: 'POST', body: { department_id: destDept } });
      await api('?api=reorder', { method: 'POST', body: { kind: 'posts', order } });
    } catch (err) { alert(err.message); loadOrgTab(); }
  })();
}

function enhanceBoard() {
  const editing = orgCanEdit();
  // Feed the shared targets-widget the session, people directory + post names.
  window.session = session;
  window.TG_DIRECTORY = usersData;
  window.TG_POSTS = postsData.map(p => ({ id: p.id, name: p.name }));
  // One global, capture-phase suppressor kills the browser's native drag for any
  // org element (incl. holder avatar <img>s) — so a drag NEVER shows the native
  // image fragment regardless of where the card is grabbed or how it was re-rendered.
  if (!window.__orgDragSuppressor) {
    window.__orgDragSuppressor = true;
    document.addEventListener('dragstart', e => {
      const t = e.target; if (t && t.closest && t.closest('.org-col-division, .org-col-department, .org-post-card, .org-exec-node')) e.preventDefault();
    }, true);
  }
  document.querySelectorAll('.org-col-division').forEach(col => {
    const divId = Number(col.dataset.divId);
    const d = divisionsData.find(x => x.id === divId);
    const color = (d && d.color) || '#6b9eff';
    col.style.setProperty('--divc', color);
    col.style.setProperty('--divc-soft', _hexToRgba(color, 0.13));
    const head = col.querySelector('.org-col-division-head');
    if (head && !head.querySelector('.org-stat-btn')) head.appendChild(_statBtn('Division stats', ev => { ev.stopPropagation(); openDivisionStats(divId); }));
    if (editing && head) {
      _wireDivisionDrag(head, col, divId);
      // Color is edited inside the division editor drawer (see the Color field there),
      // so no header swatch — it just took up space on the board.
      if (!head.querySelector('.org-edit-btn')) head.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('division', divId, /*view*/ false); }));
    }
  });
  document.querySelectorAll('.org-col-department').forEach(col => {
    const head = col.querySelector('.org-col-department-head');
    if (editing && head) { _wireDepartmentDrag(head, col, _deptIdOf(col)); if (!head.querySelector('.org-edit-btn')) head.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('department', _deptIdOf(col), /*view*/ false); })); }
  });
  document.querySelectorAll('.org-post-card').forEach(card => {
    const postId = Number(card.dataset.id);
    if (!card.querySelector('.org-stat-btn')) card.appendChild(_statBtn('Post & holder stats', ev => { ev.stopPropagation(); openPostStats(postId); }));
    if (editing) {
      _wirePostDrag(card, postId);
      if (!card.querySelector('.org-edit-btn')) card.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('post', postId, /*view*/ false); }));
      if (!card.querySelector('.org-pick-btn')) card.appendChild(_pickerBtn(postId));
    }
  });
  document.querySelectorAll('.org-exec-card').forEach(card => {
    const epId = Number(card.dataset.id);
    if (!card.querySelector('.org-stat-btn')) card.appendChild(_statBtn('Executive post stats', ev => { ev.stopPropagation(); openExecStats(epId); }));
  });
  // Highlight the post(s) the signed-in user holds, and wire the "My Post" button.
  const myIds = new Set(_myPostIds());
  document.querySelectorAll('.org-post-card').forEach(card => {
    const mine = myIds.has(Number(card.dataset.id));
    card.classList.toggle('org-post-mine', mine);
    if (mine && !card.querySelector('.org-mine-badge')) { const b = document.createElement('span'); b.className = 'org-mine-badge'; b.textContent = 'You'; card.insertBefore(b, card.firstChild); }
    else if (!mine) { const b = card.querySelector('.org-mine-badge'); if (b) b.remove(); }
  });
  const myBtn = document.getElementById('orgMyPostBtn');
  if (myBtn) { if (!myBtn.dataset.wired) { myBtn.dataset.wired = '1'; myBtn.addEventListener('click', _onMyPostClick); } myBtn.style.display = myIds.size ? '' : ''; }

  try { _weaveTree(); } catch (e) { console.warn('[weave]', e); }
}

// Layered org-chart layout. ALL divisions stay in the flat #orgBoard row (always
// visible — nothing hides). Above them, each executive box is absolutely
// positioned so it sits CENTRED over everything it connects to: its child exec
// posts and/or the divisions it oversees. Executives that manage divisions
// directly share the row just above the divisions (so there can be several side
// by side, MAKH-style); their parents stack in rows above, centred over their
// children. Connector lines (exec→exec and exec→division) are drawn as SVG
// org-chart elbows. Runs at the end of enhanceBoard, after divisions render.
const _EXECW = 184, _EXECH = 46, _EXECROW = 78;  // node width/height, row pitch
function _weaveTree() {
  const zoom = document.getElementById('orgBoardZoom'), board = document.getElementById('orgBoard'), layer = document.getElementById('orgExecLayer');
  if (!zoom || !board) return;
  zoom.style.position = 'relative';
  // Divisions keep the order the user arranged them in (sort_order, set by
  // drag-reorder) — no auto-clustering, so a dragged division stays where dropped.

  // 2. Exec hierarchy + height (longest downward chain of exec posts).
  const byId = new Map(execPostsData.map(p => [p.id, p]));
  // Guard against bad data: a post that is its own parent (self-cycle) or any
  // parent cycle must NOT recurse forever — treat self-parent as top-level.
  const childrenOf = (id) => execPostsData.filter(p => p.parent_exec_post_id === id && p.id !== id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const heightMemo = new Map();
  const height = (p, seen) => {
    if (heightMemo.has(p.id)) return heightMemo.get(p.id);
    seen = seen || new Set();
    if (seen.has(p.id)) return 1;          // cycle → stop
    seen.add(p.id);
    const kids = childrenOf(p.id);
    const h = kids.length ? 1 + Math.max(...kids.map(k => height(k, seen))) : 1;
    seen.delete(p.id);
    heightMemo.set(p.id, h);
    return h;
  };
  const H = execPostsData.length ? Math.max(...execPostsData.map(p => height(p))) : 0;

  // Size the exec layer so the divisions row sits below it, then measure divisions.
  const off = (el) => { let x = 0, y = 0, n = el; while (n && n !== zoom) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  if (layer) layer.style.height = H > 0 ? (H * _EXECROW) + 'px' : '';
  const divCenter = new Map(), divTopByPos = {};
  board.querySelectorAll(':scope > .org-col-division').forEach(c => { const b = off(c); divCenter.set(+c.dataset.divId, Math.round(b.x + b.w / 2)); divTopByPos[+c.dataset.divId] = b.y; });

  // 3. Compute each exec's centre-x bottom-up (leaves over their divisions,
  //    parents over their children), and its row-y from its height.
  const cx = new Map(), cy = new Map();
  const execY = (p) => (H - height(p)) * _EXECROW + 8;   // leaves near the divisions, root at top
  let orphanCursor = 40;
  [...execPostsData].sort((a, b) => height(a) - height(b)).forEach(p => {
    cy.set(p.id, execY(p));
    const targets = [];
    childrenOf(p.id).forEach(k => { if (cx.has(k.id)) targets.push(cx.get(k.id)); });
    (p.division_ids || []).forEach(did => { if (divCenter.has(did)) targets.push(divCenter.get(did)); });
    if (targets.length) cx.set(p.id, Math.round((Math.min(...targets) + Math.max(...targets)) / 2));
    else { cx.set(p.id, orphanCursor + _EXECW / 2); orphanCursor += _EXECW + 24; }
  });
  // 4. De-overlap execs that share a row (keep a minimum gap, preserve order).
  const rows = new Map();
  execPostsData.forEach(p => { const y = cy.get(p.id); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(p); });
  rows.forEach(arr => {
    arr.sort((a, b) => cx.get(a.id) - cx.get(b.id));
    const gap = _EXECW + 18;
    for (let i = 1; i < arr.length; i++) if (cx.get(arr[i].id) - cx.get(arr[i - 1].id) < gap) cx.set(arr[i].id, cx.get(arr[i - 1].id) + gap);
  });
  // 5. Position the nodes. cx/cy are in ZOOM space; node.style.left/top are
  //    relative to the layer (its offsetParent), so subtract the layer origin.
  const layerOrigin = layer ? off(layer) : { x: 0, y: 0 };
  execPostsData.forEach(p => {
    const node = document.querySelector('.org-exec-node[data-id="' + p.id + '"]'); if (!node) return;
    node.style.position = 'absolute';
    node.style.left = Math.round(cx.get(p.id) - _EXECW / 2 - layerOrigin.x) + 'px';
    node.style.top = Math.round(cy.get(p.id) - layerOrigin.y) + 'px';
  });

  // 6. Draw all connector lines (exec → child exec, exec → division) from the
  //    ACTUAL rendered positions (measured in zoom space) so lines always meet
  //    the boxes exactly, regardless of any layer offset.
  let svg = document.getElementById('orgLinkSvg');
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'orgLinkSvg'; svg.setAttribute('class', 'org-link-svg'); zoom.insertBefore(svg, zoom.firstChild); }
  const W = zoom.scrollWidth, Ht = zoom.scrollHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', Ht); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Ht);
  const centerTop = (el) => { const b = off(el); return { x: Math.round(b.x + b.w / 2), top: b.y, bottom: b.y + b.h }; };
  let paths = '';
  execPostsData.forEach(p => {
    const selfNode = document.querySelector('.org-exec-node[data-id="' + p.id + '"]'); if (!selfNode) return;
    const me = centerTop(selfNode); const fx = me.x, fy = me.bottom;   // this exec's bottom centre
    const targets = [];
    childrenOf(p.id).forEach(k => { const kn = document.querySelector('.org-exec-node[data-id="' + k.id + '"]'); if (kn) { const c = centerTop(kn); targets.push({ x: c.x, y: c.top }); } });
    (p.division_ids || []).forEach(did => { const col = board.querySelector(':scope > .org-col-division[data-div-id="' + did + '"]'); if (col) { const c = centerTop(col); targets.push({ x: c.x, y: c.top }); } });
    if (!targets.length) return;
    const col = p.color || '#fbbf24';
    const minTY = Math.min(...targets.map(t => t.y));
    const busY = fy + Math.round((minTY - fy) * 0.5);
    paths += `<path d="M ${fx} ${fy} L ${fx} ${busY}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
    const minX = Math.min(fx, ...targets.map(t => t.x)), maxX = Math.max(fx, ...targets.map(t => t.x));
    paths += `<path d="M ${minX} ${busY} L ${maxX} ${busY}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
    targets.forEach(t => {
      paths += `<path d="M ${t.x} ${busY} L ${t.x} ${t.y}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
      paths += `<circle cx="${t.x}" cy="${t.y}" r="3.5" fill="${col}"/>`;
    });
  });
  svg.innerHTML = paths;
}

// Division → exec overseer and exec hierarchy are both set in the exec editor
// ("Sits above / oversees" + the division checkboxes), so there is no on-board
// tap-to-connect flow any more.

// ─────────────────────── "My Post" panel (staff self-service) ───────────────
// Any signed-in staffer clicks "My Post" (or their highlighted card) to see, for
// the post they hold: identity + direct senior + orders/policies + stats + their
// targets (ClickUp-style tasks they and their senior can add / check off).
function _myPostIds() {
  const uid = session?.user?.id; if (!uid) return [];
  return postsData.filter(p => (activeHoldersByPost[p.id] || []).some(h => h.user_id === uid)).map(p => p.id);
}
function _onMyPostClick() {
  const ids = _myPostIds();
  if (!ids.length) { alert("You don't hold a post yet — ask your senior to assign you one."); return; }
  if (ids.length === 1) return openMyPostPanel(ids[0]);
  _closeMyPost();
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="org-mp-overlay" id="orgMpOverlay"><div class="org-mp-card" style="max-width:420px;">
    <div class="org-mp-head"><h2>Your posts</h2><button class="org-mp-close" id="orgMpClose">✕</button></div>
    <div class="org-mp-body">${ids.map(id => { const p = postsData.find(x => x.id === id); return `<button class="org-mp-pick" data-id="${id}">${escapeHtml(p ? p.name : 'Post')}</button>`; }).join('')}</div></div></div>`;
  root.querySelector('#orgMpClose').addEventListener('click', _closeMyPost);
  root.querySelector('#orgMpOverlay').addEventListener('click', e => { if (e.target.id === 'orgMpOverlay') _closeMyPost(); });
  root.querySelectorAll('.org-mp-pick').forEach(b => b.addEventListener('click', () => openMyPostPanel(Number(b.dataset.id))));
}
function _closeMyPost() { const o = document.getElementById('orgMpOverlay'); if (o) o.remove(); }

function openMyPostPanel(postId) {
  const po = postsData.find(x => x.id === postId); if (!po) return;
  const dep = departmentsData.find(d => d.id === po.department_id);
  const div = dep ? divisionsData.find(v => v.id === dep.division_id) : null;
  const holder = (activeHoldersByPost[postId] || [])[0];
  const senior = po.senior_post_id ? postsData.find(x => x.id === po.senior_post_id) : null;
  const seniorHolder = senior ? (activeHoldersByPost[senior.id] || [])[0] : null;
  const crumb = [div && div.name, dep && dep.name].filter(Boolean).map(escapeHtml).join(' <span class="org-mp-sep">▸</span> ');
  _closeMyPost();
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="org-mp-overlay" id="orgMpOverlay"><div class="org-mp-card">
    <div class="org-mp-head">
      <div style="min-width:0;">
        <div class="org-mp-crumb">${crumb || 'Org'}</div>
        <h2>${escapeHtml(po.name)}</h2>
        <div class="org-mp-holder">${holder ? '<span class="havatar small" style="background:' + (div?.color || '#6b9eff') + '">' + escapeHtml(_initialOf(holder.user_id)) + '</span> ' + escapeHtml(_displayOf(holder.user_id)) : '<span style="color:var(--text-dim);font-style:italic;">Vacant</span>'}</div>
      </div>
      <button class="org-mp-close" id="orgMpClose">✕</button>
    </div>
    <div class="org-mp-body">
      ${(po.purpose || po.valuable_final_product || po.description) ? `<section class="org-mp-sec">
        ${po.purpose ? `<div class="org-mp-kv"><span class="org-mp-k">Purpose</span><span>${escapeHtml(po.purpose)}</span></div>` : ''}
        ${po.valuable_final_product ? `<div class="org-mp-kv"><span class="org-mp-k">Produces</span><span>${escapeHtml(po.valuable_final_product)}</span></div>` : ''}
        ${po.description ? `<div class="org-mp-kv"><span class="org-mp-k">Notes</span><span>${escapeHtml(po.description)}</span></div>` : ''}
      </section>` : ''}
      <section class="org-mp-sec"><h3>Your direct senior</h3>
        ${senior ? `<div class="org-mp-senior">${seniorHolder ? '<span class="havatar small">' + escapeHtml(_initialOf(seniorHolder.user_id)) + '</span> <strong>' + escapeHtml(_displayOf(seniorHolder.user_id)) + '</strong> · ' : ''}${escapeHtml(senior.name)}</div>` : '<div class="org-mp-empty">No senior post set for this post.</div>'}
      </section>
      <section class="org-mp-sec"><h3>Orders &amp; policies</h3><div id="orgMpPolicies"><div class="org-mp-loading">Loading…</div></div></section>
      <section class="org-mp-sec"><div style="display:flex;align-items:center;gap:8px;"><h3 style="margin:0;flex:1;">Your stats</h3><button class="small-btn" id="orgMpFullStats" style="background:var(--surface3);">Open full charts</button></div><div id="orgMpStats"><div class="org-mp-loading">Loading…</div></div></section>
      <section class="org-mp-sec"><h3>Your targets</h3><div id="orgMpTargets"><div class="org-mp-loading">Loading…</div></div></section>
    </div>
  </div></div>`;
  root.querySelector('#orgMpClose').addEventListener('click', _closeMyPost);
  root.querySelector('#orgMpOverlay').addEventListener('click', e => { if (e.target.id === 'orgMpOverlay') _closeMyPost(); });
  root.querySelector('#orgMpFullStats').addEventListener('click', () => openPostStats(postId));
  _mpLoadPolicies(postId);
  _mpLoadStats(holder ? holder.user_id : null);
  _mpLoadTargets(postId);
}

async function _mpLoadPolicies(postId) {
  const el = document.getElementById('orgMpPolicies'); if (!el) return;
  try {
    const j = await api('?api=policies-for-scope&scope_type=post&scope_id=' + postId);
    const rows = j.rows || j.policies || [];
    if (!rows.length) { el.innerHTML = '<div class="org-mp-empty">No orders or policies apply to this post.</div>'; return; }
    el.innerHTML = rows.map(p => {
      const kind = p.kind === 'order' ? 'ORDER' : p.kind === 'directive' ? 'DIRECTIVE' : 'POLICY';
      const from = (p.scope_type && p.scope_type !== 'post') ? `<span class="org-mp-from">↑ from ${escapeHtml(p.scope_type)}</span>` : '';
      const exp = p.expires_at ? `<span class="org-mp-exp">expires ${escapeHtml(String(p.expires_at).slice(0, 10))}</span>` : '';
      return `<div class="org-mp-policy"><div class="org-mp-policy-top"><span class="org-mp-kind org-mp-kind-${(p.kind || 'policy')}">${kind}</span><strong>${escapeHtml(p.title || '')}</strong>${from}${exp}</div>${p.body ? `<div class="org-mp-policy-body">${escapeHtml(p.body)}</div>` : ''}</div>`;
    }).join('');
  } catch (e) { el.innerHTML = `<div class="org-mp-empty" style="color:var(--red);">${escapeHtml(e.message)}</div>`; }
}

async function _mpLoadStats(uid) {
  const el = document.getElementById('orgMpStats'); if (!el) return;
  if (!uid) { el.innerHTML = '<div class="org-mp-empty">This post is vacant — no stats.</div>'; return; }
  try {
    const j = await wsApi('?api=stats-for-user&user_id=' + encodeURIComponent(uid));
    const metrics = j.metrics || [], series = j.series || [];
    if (!metrics.length) { el.innerHTML = '<div class="org-mp-empty">No stats are linked to you yet.</div>'; return; }
    const sMap = new Map(series.map(s => [s.metric_key, s.points || []]));
    el.innerHTML = '<div class="org-mp-stats">' + metrics.map(m => {
      const pts = sMap.get(m.key) || [];
      const last = pts.length ? Number(pts[pts.length - 1].value) || 0 : 0;
      const prev = pts.length > 1 ? Number(pts[pts.length - 2].value) || 0 : null;
      const arrow = prev == null ? '' : (last > prev ? '<span class="org-mp-up">▲</span>' : last < prev ? '<span class="org-mp-down">▼</span>' : '<span class="org-mp-flat">—</span>');
      return `<div class="org-mp-stat"><span class="org-mp-stat-label">${escapeHtml(m.label)}</span><span class="org-mp-stat-val">${_fmtStat(last, m.unit)} ${arrow}</span></div>`;
    }).join('') + '</div>';
  } catch (e) { el.innerHTML = `<div class="org-mp-empty" style="color:var(--red);">${escapeHtml(e.message)}</div>`; }
}

// The targets section reuses the shared ClickUp-style widget: grouped list +
// click-to-open the full task detail popup + "New task".
function _mpLoadTargets(postId) {
  const el = document.getElementById('orgMpTargets'); if (!el) return;
  if (!window.Targets) { el.innerHTML = '<div class="org-mp-empty">Targets unavailable.</div>'; return; }
  el.innerHTML = '<div id="orgMpTgBoard"></div><div style="margin-top:8px;"><button class="small-btn" id="orgMpTgNew" style="background:var(--surface3);">+ New task</button></div>';
  // "Your targets" = tasks assigned to you; new ones default to attaching to this post.
  Targets.renderBoard(document.getElementById('orgMpTgBoard'), { assignee: 'me', postId });
  document.getElementById('orgMpTgNew').addEventListener('click', () => Targets.openNew({ post_id: postId, assignee_ids: [session.user.id], opts: { onClose: () => _mpLoadTargets(postId), onChange: () => _mpLoadTargets(postId) } }));
}

function _statBtn(title, onClick) {
  const b = document.createElement('button');
  b.className = 'org-stat-btn'; b.title = title; b.type = 'button';
  b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="5"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="22" y2="14"/></svg>';
  b.addEventListener('click', onClick);
  return b;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.getElementById('orgStatsModal')) _closeStats(); } });

// ── Stats popups (weekly-stats data via org-scoped endpoints) ────────────────
function _fmtStat(v, unit) { v = Number(v) || 0; if (unit === 'usd') return '$' + Math.round(v).toLocaleString(); if (unit === 'pct') return (Math.round(v * 10) / 10) + '%'; return (Math.round(v * 10) / 10).toLocaleString(); }
let _statCharts = [];
function _closeStats() { _statCharts.forEach(c => { try { c.destroy(); } catch (_) {} }); _statCharts = []; const m = document.getElementById('orgStatsModal'); if (m) m.remove(); }
function _openStatsShell(title, sub) {
  _closeStats();
  const el = document.createElement('div');
  el.id = 'orgStatsModal'; el.className = 'org-stats-overlay';
  el.innerHTML = `<div class="org-stats-card"><div class="org-stats-head"><div><h3>${escapeHtml(title)}</h3>${sub ? `<div class="org-stats-sub">${escapeHtml(sub)}</div>` : ''}</div><button id="orgStatsClose" title="Close (Esc)">×</button></div><div class="org-stats-body" id="orgStatsBody"><div style="padding:28px;color:var(--text-dim);font-size:0.85rem;">Loading stats…</div></div></div>`;
  document.getElementById('modalRoot').appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) _closeStats(); });
  document.getElementById('orgStatsClose').onclick = _closeStats;
}
function _renderStats(metrics, series) {
  const body = document.getElementById('orgStatsBody'); if (!body) return;
  const sMap = new Map((series || []).map(s => [s.metric_key, s.points || []]));
  if (!metrics || !metrics.length) { body.innerHTML = '<div style="padding:28px;color:var(--text-dim);font-size:0.85rem;">No stats are assigned here yet. (Stats are linked to people in Weekly Stats.)</div>'; return; }
  body.innerHTML = metrics.map((m, i) => { const pts = sMap.get(m.key) || []; const last = pts.length ? pts[pts.length - 1].value : 0; return `<div class="org-stat-card"><div class="org-stat-top"><span class="org-stat-label">${escapeHtml(m.label)}</span><span class="org-stat-val">${_fmtStat(last, m.unit)}</span></div><div class="org-stat-chartwrap"><canvas id="orgsc_${i}"></canvas></div></div>`; }).join('');
  metrics.forEach((m, i) => {
    const pts = sMap.get(m.key) || []; const ctx = document.getElementById('orgsc_' + i); if (!ctx || !window.Chart) return;
    _statCharts.push(new Chart(ctx, { type: 'line', data: { labels: pts.map(p => p.period_start), datasets: [{ data: pts.map(p => Number(p.value) || 0), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => it[0]?.label || '', label: it => _fmtStat(it.parsed.y, m.unit) } } }, scales: { x: { display: false }, y: { display: false } } } }));
  });
}
function _statsErr(e) { const b = document.getElementById('orgStatsBody'); if (b) b.innerHTML = `<div style="padding:28px;color:var(--red);font-size:0.85rem;">${escapeHtml(e.message)}</div>`; }
async function _loadUserStats(uid) { return wsApi('?api=stats-for-user&user_id=' + encodeURIComponent(uid)); }
async function _unionStatsForUsers(uids) {
  const results = await Promise.all(uids.map(uid => _loadUserStats(uid).catch(() => ({ metrics: [], series: [] }))));
  const mMap = new Map(), sMap = new Map();
  results.forEach(r => { (r.metrics || []).forEach(m => { if (!mMap.has(m.key)) mMap.set(m.key, m); }); (r.series || []).forEach(s => { if (!sMap.has(s.metric_key)) sMap.set(s.metric_key, s); }); });
  return { metrics: [...mMap.values()], series: [...sMap.values()] };
}
async function openPostStats(postId) {
  const po = postsData.find(x => x.id === postId); const holder = (activeHoldersByPost[postId] || [])[0];
  _openStatsShell((po ? po.name : 'Post') + ' — stats', holder ? _displayOf(holder.user_id) : 'Vacant post');
  if (!holder) { _renderStats([], []); return; }
  try { const j = await _loadUserStats(holder.user_id); _renderStats(j.metrics || [], j.series || []); } catch (e) { _statsErr(e); }
}
async function openUserStats(uid) { _openStatsShell(_displayOf(uid) + ' — stats', _emailOf(uid) || ''); try { const j = await _loadUserStats(uid); _renderStats(j.metrics || [], j.series || []); } catch (e) { _statsErr(e); } }
async function openDivisionStats(divId) {
  const d = divisionsData.find(x => x.id === divId);
  _openStatsShell((d ? d.name : 'Division') + ' — division stats', 'Combined stats of everyone posted in this division');
  const depIds = departmentsData.filter(x => x.division_id === divId).map(x => x.id);
  const postIds = postsData.filter(p => depIds.includes(p.department_id)).map(p => p.id);
  const uids = [...new Set(postIds.flatMap(pid => (activeHoldersByPost[pid] || []).map(h => h.user_id)))];
  if (!uids.length) { _renderStats([], []); return; }
  try { const { metrics, series } = await _unionStatsForUsers(uids); _renderStats(metrics, series); } catch (e) { _statsErr(e); }
}
async function openExecStats(epId) {
  const ep = execPostsData.find(x => x.id === epId);
  const uids = [...new Set((execHoldersByExecPost[epId] || []).map(h => h.user_id))];
  _openStatsShell((ep ? ep.name : 'Executive post') + ' — stats', uids.map(u => _displayOf(u)).join(', ') || 'Vacant');
  if (!uids.length) { _renderStats([], []); return; }
  try { const { metrics, series } = await _unionStatsForUsers(uids); _renderStats(metrics, series); } catch (e) { _statsErr(e); }
}
