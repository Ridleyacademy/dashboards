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
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const AC_BASE = SUPABASE_URL + '/functions/v1/access-control';
const WS_BASE = SUPABASE_URL + '/functions/v1/weekly-stats';

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
  let z = 1;
  try { z = parseFloat(localStorage.getItem(ORG_ZOOM_KEY) || '1') || 1; } catch (_) {}
  applyOrgZoom(z);
  // Idempotent re-binding: clone-and-replace strips any old listeners.
  const fresh = (el) => { const c = el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; };
  const inN  = fresh(inBtn), outN = fresh(outBtn), rstN = fresh(rstBtn), fitN = fresh(fitBtn), rangeN = fresh(range);
  const cur = () => parseFloat(getComputedStyle(document.getElementById('orgBoardZoom')).getPropertyValue('--org-zoom')) || 1;
  inN .addEventListener('click', () => applyOrgZoom(cur() + ORG_ZOOM_STEP));
  outN.addEventListener('click', () => applyOrgZoom(cur() - ORG_ZOOM_STEP));
  rstN.addEventListener('click', () => applyOrgZoom(1));
  fitN.addEventListener('click', () => {
    // Fit-to-width: scale so naturalWidth × z = wrapper visible width.
    const m = _measureOrgZoomNatural();
    _orgZoomNaturalWidth = m.w; _orgZoomNaturalHeight = m.h;
    const visible = wrap.clientWidth - 8; // small margin so it doesn't kiss the edge
    if (!m.w || !visible) return applyOrgZoom(1);
    applyOrgZoom(Math.min(1, visible / m.w));
  });
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
        <div class="org-exec-card-title">⭐ ${escapeHtml(ep.name)}</div>
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
        <div class="org-exec-card-title">⭐ ${escapeHtml(ep.name)}</div>
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
  finally { if (seedBtn) { seedBtn.disabled = false; seedBtn.textContent = '🏛 Seed standard org board'; } }
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
        <button class="org-add-division" id="org-seed-empty" style="background:rgba(167,139,250,.10);color:#a78bfa;border-color:#a78bfa;font-size:0.92rem;padding:14px 22px;min-height:auto;">🏛 Seed standard Scientology org board</button>
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
      ? `<span class="org-head-pill" title="Division Head: ${escapeHtml(_emailOf(d.head_user_id) || '')} — click to change"><span class="havatar" style="background:${d.color || '#6b9eff'};">${escapeHtml(_initialOf(d.head_user_id))}</span><span>👑 ${escapeHtml(headDisplay)}</span></span>`
      : `<span class="org-head-pill vacant" title="No Division Head — click to assign">👑 No Division Head</span>`;
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
  board.innerHTML = divsHtml +
    '<button class="org-add-division" id="org-add-div">+ Division</button>';

  // Wire clicks
  board.querySelectorAll('.org-col-division-head').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('division', Number(el.dataset.id));
  }));
  board.querySelectorAll('.org-col-department-head').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('department', Number(el.dataset.id));
  }));
  board.querySelectorAll('.org-post-card').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openOrgEditor('post', Number(el.dataset.id));
  }));
  board.querySelectorAll('[data-add-dept]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openCreateDepartmentModal(Number(el.dataset.addDept));
  }));
  board.querySelectorAll('[data-add-post]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openCreatePostModal(Number(el.dataset.addPost));
  }));
  document.getElementById('org-add-div')?.addEventListener('click', openCreateDivisionModal);

  // Division / department / post drag-and-drop (reorder + reparent) is wired by
  // org-extras' unified insertion-line system (enhanceBoard), edit mode only.
}

function renderDepartmentSubColumn(dep) {
  const posts = postsData.filter(x => x.department_id === dep.id);
  const postsHtml = posts.map(po => renderPostCard(po)).join('') ||
    '<div style="color:var(--text-dim);font-size:0.74rem;font-style:italic;padding:6px;">No posts yet</div>';
  const headDisplay = _displayOf(dep.head_user_id);
  const headLine = headDisplay
    ? `<div class="org-dept-head" title="${escapeHtml(_emailOf(dep.head_user_id) || '')}"><span class="havatar small">${escapeHtml(_initialOf(dep.head_user_id))}</span><span>🎩 ${escapeHtml(headDisplay)}</span></div>`
    : `<div class="org-dept-head vacant">🎩 No Dept Head</div>`;
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

function openOrgEditor(kind, id) {
  selectedKind = kind; selectedId = id;
  openDrawer('<div id="axDrawerEditor"><div class="ax-editor-empty">Loading…</div></div>');
  _useDrawerEditor = true;
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
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb">Top tier · Executive post</div>
    <h2>${ep.id ? '⭐ ' + escapeHtml(ep.name) : '⭐ New executive post'}</h2>
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

    <h3>Divisions overseen</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">Pick every division this person is in charge of. Hover the card on the board to see them highlighted.</div>
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
      msg.className = 'ax-msg ok'; msg.textContent = '✓ Saved';
      await loadOrgTab();
      if (res?.row?.id) openExecPostEditor(res.row.id);
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

    <h3>👑 Division Head</h3>
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

    <h3>🎩 Department Head</h3>
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

    <div class="ax-editor-row"><label>Name</label><input id="po-name" value="${escapeHtml(po.name)}"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="po-slug" value="${escapeHtml(po.slug)}"></div>
    <div class="ax-editor-row"><label title="One sentence: why does this post exist?">Purpose</label><input id="po-purpose" value="${escapeHtml(po.purpose || '')}" placeholder="One sentence: why does this post exist?"></div>
    <div class="ax-editor-row"><label title="The single tangible thing this post produces and ships out.">What this produces</label><input id="po-vfp" value="${escapeHtml(po.valuable_final_product || '')}" placeholder="The tangible thing this post produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="po-desc">${escapeHtml(po.description || '')}</textarea></div>
    <div class="ax-editor-row"><label title="Whoever holds this post automatically receives this role's permissions.">Auto-assigned role</label><select id="po-role">${roleOpts}</select></div>
    <div class="ax-editor-row"><label title="Which post does this one report up to? Leave blank to default to the Department Head.">Reports to (senior post)</label><select id="po-senior"></select></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="po-sort" type="number" value="${po.sort_order || 0}" style="max-width:120px;"></div>

    <h3>Assigned to <span style="font-weight:400;color:var(--text-dim);font-size:0.78rem;">(one person per post — duplicate the post to add another)</span></h3>
    <div style="display:flex;gap:6px;align-items:center;">
      <select id="po-holder-pick" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);"></select>
      <button class="small-btn" id="po-set-holder">Assign</button>
      <button class="small-btn" id="po-clear-holder" style="color:var(--red);">Vacate</button>
    </div>
    <div id="po-holders" style="margin-top:6px;"></div>
    <button class="small-btn" id="po-duplicate" style="margin-top:10px;background:var(--surface3);">⧉ Duplicate post (add another)</button>

    <h3>Policies & orders</h3>
    <div id="po-policies"></div>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">Policies set here apply only to this post. Inherited policies from the parent department and division show with an "↑ from" badge.</div>
    <button class="small-btn" id="po-add-policy" style="margin-top:8px;display:none;">+ Add policy / order</button>

    <div class="ax-actions">
      <button class="btn-primary" id="po-save">Save</button>
      <button class="btn-ghost" style="color:var(--red);" id="po-delete">Delete post</button>
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
    if (!rows.length) { wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">No one assigned yet — pick someone above and click Assign.</span>'; return; }
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
    const j = await api('?api=policies-for-scope&scope_type=' + scopeType + '&scope_id=' + scopeId);
    const rows = j.rows || [];
    const canEdit = !!j.can_edit_self;

    // Show / hide the "+ Add policy" button paired with this list.
    const addBtnIdMap = { 'd-policies': 'd-add-policy', 'dep-policies': 'dep-add-policy', 'po-policies': 'po-add-policy' };
    const addBtn = document.getElementById(addBtnIdMap[elId]);
    if (addBtn) addBtn.style.display = canEdit ? '' : 'none';

    if (!rows.length) {
      el.innerHTML = canEdit
        ? '<span style="color:var(--text-dim);font-size:0.82rem;">No policies or orders yet. Click <strong>+ Add policy / order</strong> to create one.</span>'
        : '<span style="color:var(--text-dim);font-size:0.82rem;">No policies or orders apply here. Ask an admin to add you as a policy editor for this division if you need to create one.</span>';
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
        ${p.body ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">${escapeHtml(p.body).slice(0, 280)}${p.body.length > 280 ? '…' : ''}</div>` : ''}
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
        openPolicyEditModal(Number(div.dataset.pid), scopeType, scopeId);
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

function openPolicyModal(scopeType, scopeId, existingId) {
  // For new: existingId is undefined. For edit: existingId is set and we'll prefill via openPolicyEditModal.
  showModal(`<h3>${existingId ? 'Edit' : 'New'} policy / order</h3>
    <div class="ax-editor-row"><label>Kind</label><select id="p-kind">
      <option value="policy">Policy (standing rule)</option>
      <option value="order">Order (directive, often time-bounded)</option>
      <option value="directive">Directive</option>
    </select></div>
    <div class="ax-editor-row"><label>Title</label><input id="p-title" placeholder="e.g. Welcome new students within 24h"></div>
    <div class="ax-editor-row" style="align-items:flex-start;"><label style="padding-top:6px;">Body</label><textarea id="p-body" style="min-height:140px;" placeholder="What this says, who it applies to, expected behavior."></textarea></div>
    <div class="ax-editor-row"><label>Expires</label><input id="p-expires" type="datetime-local" style="max-width:240px;"></div>
    <div class="ax-actions">
      ${existingId ? '<button class="btn-ghost" style="color:var(--red);" id="p-delete">Delete</button>' : ''}
      <button class="btn-primary" id="p-save">${existingId ? 'Save' : 'Create'}</button>
      <button class="btn-ghost" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button>
    </div>`);
  document.getElementById('p-save').addEventListener('click', async () => {
    try {
      const body = {
        scope_type: scopeType, scope_id: scopeId,
        kind: document.getElementById('p-kind').value,
        title: document.getElementById('p-title').value.trim(),
        body: document.getElementById('p-body').value,
        expires_at: document.getElementById('p-expires').value || null,
      };
      if (!body.title) throw new Error('Title required');
      if (existingId) await api('?api=policy-update&id=' + existingId, { method: 'POST', body });
      else            await api('?api=policy-create', { method: 'POST', body });
      closeModal();
      // Reload the policy list within the currently-open scope editor.
      const elId = scopeType === 'division' ? 'd-policies' : scopeType === 'department' ? 'dep-policies' : 'po-policies';
      loadPoliciesInto(elId, scopeType, scopeId);
    } catch (e) { alert(e.message); }
  });
  if (existingId) {
    document.getElementById('p-delete').addEventListener('click', async () => {
      if (!confirm('Delete this policy / order?')) return;
      try {
        await api('?api=policy-delete&id=' + existingId, { method: 'POST', body: {} });
        closeModal();
        const elId = scopeType === 'division' ? 'd-policies' : scopeType === 'department' ? 'dep-policies' : 'po-policies';
        loadPoliciesInto(elId, scopeType, scopeId);
      } catch (e) { alert(e.message); }
    });
  }
  return existingId;
}

async function openPolicyEditModal(policyId, scopeType, scopeId) {
  // Fetch + populate
  try {
    const j = await api('?api=policies&scope_type=' + scopeType + '&scope_id=' + scopeId);
    const p = (j.rows || []).find(x => x.id === policyId);
    if (!p) return;
    openPolicyModal(scopeType, scopeId, policyId);
    document.getElementById('p-kind').value = p.kind;
    document.getElementById('p-title').value = p.title;
    document.getElementById('p-body').value = p.body || '';
    if (p.expires_at) {
      const d = new Date(p.expires_at);
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('p-expires').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  } catch (e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════════════
// INVITE MODAL — guided, with quick presets and live permission preview
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ORG BOARD EXTRAS — TAP-TO-MOVE + stats popups.
// No drag-and-drop (native DnD dies on touch; pointer-drag felt unreliable).
// Instead: tap an item's move handle (⠿) to "pick it up", then tap one of the
// green drop-slots that appear between every valid position to place it. Tap a
// person to pick them up, then tap a post to assign. All plain clicks/taps —
// works identically on touch and mouse.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const _orig = renderOrgBoard;
  renderOrgBoard = function () { const r = _orig.apply(this, arguments); try { enhanceBoard(); } catch (e) { console.warn('[org enhance]', e); } return r; };
})();

function _deptIdOf(col) { const h = col && col.querySelector('.org-col-department-head'); return h ? Number(h.dataset.id) : null; }
function _itemId(kind, el) { return kind === 'division' ? Number(el.dataset.divId) : kind === 'department' ? _deptIdOf(el) : Number(el.dataset.id); }
const _MVCFG = {
  division:   { listSel: '.org-board',                itemSel: '.org-col-division',   horiz: true,  addSel: '.org-add-division' },
  department: { listSel: '.org-col-departments',       itemSel: '.org-col-department', horiz: false, addSel: '.org-add-btn' },
  post:       { listSel: '.org-col-department-posts',  itemSel: '.org-post-card',      horiz: false, addSel: null },
};

let _mv = null; // { kind:'division'|'department'|'post'|'user', id, name }

function _label(kind, id) {
  if (kind === 'post') { const p = postsData.find(x => x.id === id); return p ? p.name : 'post'; }
  if (kind === 'department') { const d = departmentsData.find(x => x.id === id); return d ? d.name : 'department'; }
  if (kind === 'division') { const d = divisionsData.find(x => x.id === id); return d ? d.name : 'division'; }
  if (kind === 'user') return _displayOf(id) || 'person';
  return '';
}

function _cancelMove(rerender) {
  _mv = null;
  document.body.classList.remove('org-placing');
  document.querySelectorAll('.org-slot').forEach(s => s.remove());
  document.querySelectorAll('.org-picking').forEach(e => e.classList.remove('org-picking'));
  document.querySelectorAll('.org-target').forEach(e => e.classList.remove('org-target'));
  const b = document.getElementById('orgMoveBanner'); if (b) b.remove();
  const td = document.getElementById('orgExecTopDrop'); if (td) td.remove();
  if (rerender) { /* board already reflects DOM; loadOrgTab handles real refresh */ }
}

// ── Executive TREE (connected boxes above the divisions, MAKH-style) ─────────
// Overrides the ported flat-strip renderTopTier() with a nested-UL org chart
// built from org_executive_posts.parent_exec_post_id, drawn with CSS connector
// lines. Add a child post (+), reparent by picking a node up and tapping another
// node (or "make top-level"), assign a holder via the ▾ picker.
renderTopTier = function () { try { _renderExecTree(); } catch (e) { console.warn('[exec tree]', e); } };

function _renderExecTree() {
  const tier = document.getElementById('orgTopTier'); if (!tier) return;
  const editing = orgCanEdit();
  const byParent = new Map();
  execPostsData.forEach(p => { const k = p.parent_exec_post_id || 'root'; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(p); });
  for (const arr of byParent.values()) arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const nodeHtml = (p) => {
    const kids = byParent.get(p.id) || [];
    const holder = (execHoldersByExecPost[p.id] || [])[0];
    const color = p.color || '#fbbf24';
    const holderHtml = holder
      ? `<span class="havatar small">${escapeHtml(_initialOf(holder.user_id))}</span>${escapeHtml(_displayOf(holder.user_id))}`
      : '<span class="org-exec-vac">Vacant</span>';
    return `<li><div class="org-exec-node" data-id="${p.id}" style="--nc:${color}">
        <div class="org-exec-node-title">${escapeHtml(p.name)}</div>
        <div class="org-exec-node-holder">${holderHtml}</div>
      </div>${kids.length ? '<ul>' + kids.map(nodeHtml).join('') + '</ul>' : ''}</li>`;
  };
  const roots = byParent.get('root') || [];
  tier.innerHTML = `<div class="org-tree-label">Executive structure</div>
    <div class="org-tree-scroll"><ul class="org-tree">${roots.length ? roots.map(nodeHtml).join('') : '<li><div class="org-exec-empty">No executive posts yet</div></li>'}</ul></div>
    ${editing ? '<button class="org-add-exec" id="org-add-exec-root">+ Add top post</button>' : ''}`;
  document.getElementById('org-add-exec-root')?.addEventListener('click', () => _createExecUnder(null));
  tier.querySelectorAll('.org-exec-node').forEach(node => {
    const id = Number(node.dataset.id);
    node.appendChild(_statBtn('Executive post stats', ev => { ev.stopPropagation(); openExecStats(id); }));
    if (editing) {
      node.appendChild(_editBtn(ev => { ev.stopPropagation(); openExecPostEditor(id); }));
      const addSub = document.createElement('button'); addSub.className = 'org-exec-addsub'; addSub.type = 'button'; addSub.title = 'Add a post reporting to this'; addSub.textContent = '＋';
      addSub.addEventListener('click', e => { e.stopPropagation(); _createExecUnder(id); }); node.appendChild(addSub);
      const pk = document.createElement('button'); pk.className = 'org-pick-btn'; pk.type = 'button'; pk.title = 'Assign / change person'; pk.textContent = '▾';
      pk.addEventListener('click', e => { e.stopPropagation(); _openExecPersonPicker(id, pk); }); node.appendChild(pk);
      _wholeItemPickup(node, 'exec', id);
    }
  });
  if (_mv && _mv.kind === 'exec') _renderExecTargets();
}

async function _createExecUnder(parentId) {
  const name = prompt(parentId ? 'Name of the post reporting to this one:' : 'Name of the top executive post:');
  if (!name || !name.trim()) return;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('exec_' + Date.now());
  try { await api('?api=exec-post-create', { method: 'POST', body: { name: name.trim(), slug, parent_exec_post_id: parentId || null } }); await loadOrgTab(); } catch (e) { alert(e.message); }
}

function _renderExecTargets() {
  const self = _mv.id;
  const descendants = new Set();
  const collect = (pid) => { execPostsData.filter(p => p.parent_exec_post_id === pid).forEach(c => { descendants.add(c.id); collect(c.id); }); };
  collect(self);
  document.querySelectorAll('.org-exec-node').forEach(node => {
    const id = Number(node.dataset.id);
    if (id === self || descendants.has(id)) return;
    node.classList.add('org-target');
    node.addEventListener('click', _onExecTargetClick, { capture: true });
  });
  const tier = document.getElementById('orgTopTier');
  if (tier && !document.getElementById('orgExecTopDrop')) {
    const chip = document.createElement('button'); chip.id = 'orgExecTopDrop'; chip.className = 'org-exec-topdrop'; chip.type = 'button'; chip.textContent = '⊤ Make top-level (no boss)';
    chip.addEventListener('click', async e => { e.stopPropagation(); const mid = _mv.id; _cancelMove(); try { await api('?api=exec-post-update&id=' + mid, { method: 'POST', body: { parent_exec_post_id: null } }); await loadOrgTab(); } catch (err) { alert(err.message); } });
    tier.insertBefore(chip, tier.firstChild);
  }
}
function _onExecTargetClick(e) {
  if (!_mv) return;
  e.stopPropagation(); e.preventDefault();
  const parentId = Number(e.currentTarget.dataset.id); const mid = _mv.id;
  _cancelMove();
  (async () => { try { await api('?api=exec-post-update&id=' + mid, { method: 'POST', body: { parent_exec_post_id: parentId } }); await loadOrgTab(); } catch (err) { alert(err.message); } })();
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

function _pickUp(kind, id) {
  _cancelMove();
  _mv = { kind, id, name: _label(kind, id) };
  document.body.classList.add('org-placing');
  // Highlight the picked item.
  let srcEl = null;
  if (kind === 'user') srcEl = null;
  else if (_MVCFG[kind]) {
    const cfg = _MVCFG[kind];
    srcEl = [...document.querySelectorAll(cfg.itemSel)].find(el => _itemId(kind, el) === id);
  } else if (kind === 'exec') {
    srcEl = [...document.querySelectorAll('.org-exec-node')].find(el => Number(el.dataset.id) === id);
  }
  if (srcEl) srcEl.classList.add('org-picking');
  _renderTargets();
  _showBanner();
}

function _renderTargets() {
  if (!_mv) return;
  if (_mv.kind === 'exec') { _renderExecTargets(); return; }
  if (_mv.kind === 'division') { _renderDivisionTargets(); return; }
  if (_mv.kind === 'user') {
    // Any post or exec post is a valid assignment target.
    document.querySelectorAll('.org-post-card, .org-exec-card').forEach(card => {
      card.classList.add('org-target');
      card.addEventListener('click', _onUserTargetClick, { capture: true });
    });
    return;
  }
  const cfg = _MVCFG[_mv.kind];
  document.querySelectorAll(cfg.listSel).forEach(container => {
    const items = [...container.querySelectorAll(':scope > ' + cfg.itemSel)];
    const mkSlot = (beforeEl) => {
      const s = document.createElement('button');
      s.type = 'button'; s.className = 'org-slot ' + (cfg.horiz ? 'v' : 'h');
      s.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); _place(container, beforeEl); });
      return s;
    };
    items.forEach(it => container.insertBefore(mkSlot(it), it));
    const addBtn = cfg.addSel ? container.querySelector(':scope > ' + cfg.addSel) : null;
    if (addBtn) container.insertBefore(mkSlot(null), addBtn); else container.appendChild(mkSlot(null));
  });
}

function _onUserTargetClick(e) {
  const card = e.currentTarget;
  e.stopPropagation(); e.preventDefault();
  const uid = _mv && _mv.id; if (!uid) return;
  const isExec = card.classList.contains('org-exec-card');
  const targetId = Number(card.dataset.id);
  _cancelMove();
  (async () => {
    try {
      if (isExec) await api('?api=exec-post-add-holder', { method: 'POST', body: { exec_post_id: targetId, user_id: uid } });
      else await api('?api=post-add-holder', { method: 'POST', body: { post_id: targetId, user_id: uid } });
      await loadOrgTab();
    } catch (err) { alert(err.message); }
  })();
}

async function _place(container, beforeEl) {
  if (!_mv) return;
  const kind = _mv.kind, movedId = _mv.id, cfg = _MVCFG[kind];
  const items = [...container.querySelectorAll(':scope > ' + cfg.itemSel)].filter(el => _itemId(kind, el) !== movedId);
  const ids = items.map(el => _itemId(kind, el)).filter(x => x != null);
  const beforeId = beforeEl ? _itemId(kind, beforeEl) : null;
  const insertIdx = (beforeId == null) ? ids.length : (ids.indexOf(beforeId) === -1 ? ids.length : ids.indexOf(beforeId));
  ids.splice(insertIdx, 0, movedId);
  _cancelMove();
  try {
    if (kind === 'division') {
      await api('?api=reorder', { method: 'POST', body: { kind: 'divisions', order: ids } });
    } else if (kind === 'department') {
      const destDiv = Number(container.closest('.org-col-division').dataset.divId);
      const dep = departmentsData.find(x => x.id === movedId);
      if (dep && dep.division_id !== destDiv) await api('?api=department-update&id=' + movedId, { method: 'POST', body: { division_id: destDiv } });
      await api('?api=reorder', { method: 'POST', body: { kind: 'departments', order: ids } });
    } else if (kind === 'post') {
      const destDept = _deptIdOf(container.closest('.org-col-department'));
      const post = postsData.find(x => x.id === movedId);
      if (post && post.department_id !== destDept) await api('?api=post-update&id=' + movedId, { method: 'POST', body: { department_id: destDept } });
      await api('?api=reorder', { method: 'POST', body: { kind: 'posts', order: ids } });
    }
    await loadOrgTab();
  } catch (err) { alert(err.message); await loadOrgTab(); }
}

function _showBanner() {
  const b = document.createElement('div');
  b.id = 'orgMoveBanner'; b.className = 'org-move-banner';
  b.innerHTML = `<span>Moving <strong>${escapeHtml(_mv.name)}</strong> — tap a green ${_mv.kind === 'user' ? 'post' : 'slot'} to place it</span><button type="button" id="orgMoveCancel">Cancel</button>`;
  document.body.appendChild(b);
  document.getElementById('orgMoveCancel').addEventListener('click', () => _cancelMove());
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

// Make the whole item pick itself up on tap (capture phase so it beats the
// core's open-editor click). Editing opens via the dedicated ✎ button instead.
function _wholeItemPickup(el, kind, id) {
  if (el.dataset.mvPick) return; el.dataset.mvPick = '1';
  el.addEventListener('click', ev => {
    if (!orgCanEdit()) return;
    if (ev.target.closest('.org-stat-btn, .org-edit-btn, .org-post-card-holders, .org-slot, button, a, input, select, textarea')) return;
    if (_mv) return; // a move is already in progress — tap a slot or Cancel
    ev.stopPropagation(); ev.preventDefault();
    _pickUp(kind, id);
  }, true);
}

function enhanceBoard() {
  const editing = orgCanEdit();
  if (!editing) _cancelMove();
  _renderPeopleTray(editing);

  document.querySelectorAll('.org-col-division').forEach(col => {
    const divId = Number(col.dataset.divId);
    const d = divisionsData.find(x => x.id === divId);
    const color = (d && d.color) || '#6b9eff';
    col.style.setProperty('--divc', color);
    col.style.setProperty('--divc-soft', _hexToRgba(color, 0.13));
    const head = col.querySelector('.org-col-division-head');
    if (head && !head.querySelector('.org-stat-btn')) head.appendChild(_statBtn('Division stats', ev => { ev.stopPropagation(); openDivisionStats(divId); }));
    if (editing && head) {
      _wholeItemPickup(head, 'division', divId);
      if (!head.querySelector('.org-color-swatch')) head.insertBefore(_colorSwatch(divId, color), head.firstChild);
      if (!head.querySelector('.org-edit-btn')) head.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('division', divId); }));
    }
  });
  document.querySelectorAll('.org-col-department').forEach(col => {
    const head = col.querySelector('.org-col-department-head');
    if (editing && head) { _wholeItemPickup(head, 'department', _deptIdOf(col)); if (!head.querySelector('.org-edit-btn')) head.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('department', _deptIdOf(col)); })); }
  });
  document.querySelectorAll('.org-post-card').forEach(card => {
    const postId = Number(card.dataset.id);
    if (!card.querySelector('.org-stat-btn')) card.appendChild(_statBtn('Post & holder stats', ev => { ev.stopPropagation(); openPostStats(postId); }));
    if (editing) {
      _wholeItemPickup(card, 'post', postId);
      if (!card.querySelector('.org-edit-btn')) card.appendChild(_editBtn(ev => { ev.stopPropagation(); openOrgEditor('post', postId); }));
      if (!card.querySelector('.org-pick-btn')) card.appendChild(_pickerBtn(postId));
      const holderEl = card.querySelector('.org-post-card-holders');
      const hs = activeHoldersByPost[postId] || [];
      if (holderEl && hs[0] && !holderEl.dataset.mvWired) { holderEl.dataset.mvWired = '1'; holderEl.style.cursor = 'pointer'; holderEl.title = 'Move this person to another post'; holderEl.addEventListener('click', e => { e.stopPropagation(); _pickUp('user', hs[0].user_id); }, true); }
    }
  });
  document.querySelectorAll('.org-exec-card').forEach(card => {
    const epId = Number(card.dataset.id);
    if (!card.querySelector('.org-stat-btn')) card.appendChild(_statBtn('Executive post stats', ev => { ev.stopPropagation(); openExecStats(epId); }));
  });
  try { _weaveTree(); } catch (e) { console.warn('[weave]', e); }
  // If a move is in progress across a re-render, restore its targets.
  if (_mv) { document.body.classList.add('org-placing'); _renderTargets(); }
}

// Weave the divisions into the executive tree: each division column is moved to
// hang UNDER the exec post that oversees it (org_executive_post_divisions), so
// the connector lines run exec → division, MAKH-style. Divisions with no exec
// link become top-level nodes in the tree. Reuses the already-rendered + wired
// division columns (moving DOM nodes preserves their listeners).
function _weaveTree() {
  const tier = document.getElementById('orgTopTier'), board = document.getElementById('orgBoard');
  if (!tier || !board) return;
  const treeUl = tier.querySelector('ul.org-tree');
  if (!treeUl) return; // exec tree renders even when empty, so this is defensive
  const assigned = new Set();
  execPostsData.forEach(ep => {
    (ep.division_ids || []).forEach(did => {
      if (assigned.has(did)) return;
      const nodeEl = treeUl.querySelector('.org-exec-node[data-id="' + ep.id + '"]');
      const col = board.querySelector('.org-col-division[data-div-id="' + did + '"]');
      if (!nodeEl || !col) return;
      const li = nodeEl.closest('li');
      let childUl = li.querySelector(':scope > ul');
      if (!childUl) { childUl = document.createElement('ul'); li.appendChild(childUl); }
      const wrap = document.createElement('li'); wrap.className = 'org-div-leaf'; wrap.appendChild(col); childUl.appendChild(wrap);
      assigned.add(did);
    });
  });
  // Divisions NOT under any executive stay in #orgBoard as a labeled flat row
  // BELOW the tree (they don't get forced into the tree, which mis-positioned
  // them). The "+ Division" button stays there too.
  const zoom = document.getElementById('orgBoardZoom');
  const remaining = board.querySelectorAll(':scope > .org-col-division').length;
  let label = document.getElementById('orgUnassignedLabel');
  if (remaining > 0 && zoom) {
    if (!label) { label = document.createElement('div'); label.id = 'orgUnassignedLabel'; label.className = 'org-tree-label'; label.style.marginTop = '12px'; zoom.insertBefore(label, board); }
    label.textContent = 'Divisions not under an executive yet — tap one, then tap an executive to connect it';
  } else if (label) { label.remove(); }
}

// Division movement is reparent-under-an-exec (target-based), since divisions
// now live in the tree, not a flat row.
function _renderDivisionTargets() {
  document.querySelectorAll('.org-exec-node').forEach(node => { node.classList.add('org-target'); node.addEventListener('click', _onDivTargetClick, { capture: true }); });
  const tier = document.getElementById('orgTopTier');
  if (tier && !document.getElementById('orgExecTopDrop')) {
    const chip = document.createElement('button'); chip.id = 'orgExecTopDrop'; chip.className = 'org-exec-topdrop'; chip.type = 'button'; chip.textContent = '⊤ Top-level (under no exec)';
    chip.addEventListener('click', async e => { e.stopPropagation(); const did = _mv.id; _cancelMove(); try { await _setDivisionExec(did, null); await loadOrgTab(); } catch (err) { alert(err.message); } });
    tier.insertBefore(chip, tier.firstChild);
  }
}
function _onDivTargetClick(e) {
  if (!_mv || _mv.kind !== 'division') return;
  e.stopPropagation(); e.preventDefault();
  const execId = Number(e.currentTarget.dataset.id), did = _mv.id;
  _cancelMove();
  (async () => { try { await _setDivisionExec(did, execId); await loadOrgTab(); } catch (err) { alert(err.message); } })();
}
async function _setDivisionExec(did, execId) {
  for (const ep of execPostsData) {
    const has = (ep.division_ids || []).includes(did);
    if (execId && ep.id === execId) { if (!has) await api('?api=exec-post-update&id=' + ep.id, { method: 'POST', body: { division_ids: [...(ep.division_ids || []), did] } }); }
    else if (has) await api('?api=exec-post-update&id=' + ep.id, { method: 'POST', body: { division_ids: (ep.division_ids || []).filter(x => x !== did) } });
  }
}

function _statBtn(title, onClick) {
  const b = document.createElement('button');
  b.className = 'org-stat-btn'; b.title = title; b.type = 'button';
  b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="5"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="22" y2="14"/></svg>';
  b.addEventListener('click', onClick);
  return b;
}

// ── Unposted-people tray (edit mode) — tap a chip to pick the person up ──────
function _renderPeopleTray(editing) {
  let tray = document.getElementById('orgPeopleTray');
  if (!editing) { if (tray) tray.remove(); return; }
  const view = document.getElementById('orgBoardView'); if (!view) return;
  const posted = new Set();
  Object.values(activeHoldersByPost).forEach(a => a.forEach(h => posted.add(h.user_id)));
  Object.values(execHoldersByExecPost).forEach(a => a.forEach(h => posted.add(h.user_id)));
  const unposted = usersData.filter(u => !posted.has(u.id));
  if (!tray) { tray = document.createElement('div'); tray.id = 'orgPeopleTray'; tray.className = 'org-people-tray'; view.insertBefore(tray, document.getElementById('orgBoardZoomWrap')); }
  tray.innerHTML = '<span class="org-tray-label">Unposted people — tap one, then tap a post to assign</span>' +
    (unposted.length
      ? unposted.map(u => `<button type="button" class="org-person-chip" data-uid="${u.id}" title="${escapeHtml(u.email || '')}"><span class="havatar small">${escapeHtml(_initialOf(u.id))}</span>${escapeHtml(_displayOf(u.id))}</button>`).join('')
      : '<span style="color:var(--text-dim);font-size:0.78rem;">Everyone is posted 🎉</span>');
  tray.querySelectorAll('.org-person-chip').forEach(ch => ch.addEventListener('click', e => { e.stopPropagation(); _pickUp('user', ch.dataset.uid); }));
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.getElementById('orgStatsModal')) _closeStats(); else if (_mv) _cancelMove(); } });

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
