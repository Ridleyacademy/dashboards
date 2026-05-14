// Access & Org dashboard.
// Three tabs: Users, Roles, Org Board. All admin/users.manage gated.
// Backend: edge function /functions/v1/access-control

const SUPABASE_URL = "https://pojqljrhhtnigyrtzdzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
const AC_BASE = SUPABASE_URL + '/functions/v1/access-control';
const INVITE_BASE = SUPABASE_URL + '/functions/v1/invite';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
window.__ridleySession = null;

// ── State ───────────────────────────────────────────────────────────────
let session = null;
let activeTab = 'users';
// Catalog (loaded once)
let permissions = []; // [{key, dashboard, action, label, ...}]
let roles = [];       // [{id, slug, name, ...}]
let rolePerms = [];   // [{role_id, permission_key}]
// Data per tab
let usersData = [];
let divisionsData = [], departmentsData = [], postsData = [];
let selectedId = null;          // current selected row id (users tab uses user uuid string)
let selectedKind = 'user';      // 'user' | 'role' | 'division' | 'department' | 'post'

function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function setState(s) { document.body.dataset.state = s; const lg = document.getElementById('login'); if (lg) lg.style.display = s === 'login' ? '' : 'none'; }
function syncThemeBtn() { const b = document.getElementById('themeBtn'); if (b) b.textContent = document.body.classList.contains('light') ? '🌙' : '☀️'; }

const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') document.body.classList.add('light');
syncThemeBtn();
document.getElementById('themeBtn')?.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  syncThemeBtn();
});
document.getElementById('navDropdownBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('navDropMenu').classList.toggle('open');
});
document.addEventListener('click', () => document.getElementById('navDropMenu')?.classList.remove('open'));
document.getElementById('signOutBtn')?.addEventListener('click', async () => { await supa.auth.signOut(); window.location.reload(); });
document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) errEl.textContent = error.message;
  else boot();
});
document.getElementById('refreshBtn')?.addEventListener('click', refreshAll);
document.getElementById('inviteBtn')?.addEventListener('click', openInviteModal);
document.querySelectorAll('.ax-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
document.getElementById('axAddBtn')?.addEventListener('click', () => onAddInTab());

async function boot() {
  setState('loading');
  const { data: { session: s } } = await supa.auth.getSession();
  if (!s) { setState('login'); return; }
  session = s; window.__ridleySession = s;
  const eff = window.RidleyPerms.effective(s.user);
  const hasManage = eff.is_admin || (eff.permissions_v2 || []).includes('users.manage');
  if (!hasManage) {
    document.getElementById('app').innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-dim);font-size:0.95rem;">Access & Org is admin-only.<br>Ask an admin to grant your account this access.</div>';
    setState('dashboard');
    return;
  }
  document.getElementById('userEmail').textContent = s.user.email || '';
  document.getElementById('userAvatar').textContent = (s.user.email || 'A').slice(0, 1).toUpperCase();
  setState('dashboard');
  await refreshAll();
}
boot();

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

async function refreshAll() {
  try {
    const catalog = await api('?api=catalog');
    permissions = catalog.permissions || [];
    roles = catalog.roles || [];
    rolePerms = catalog.role_permissions || [];
    await refreshTab();
  } catch (e) {
    document.getElementById('axList').innerHTML = `<div style="padding:14px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`;
  }
}

function switchTab(tab) {
  activeTab = tab;
  selectedId = null;
  document.body.dataset.tab = tab; // toggles CSS for full-width org board
  document.querySelectorAll('.ax-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('axEditor').innerHTML = '<div class="ax-editor-empty">Select an item on the left.</div>';
  document.getElementById('axListTitle').textContent = tab === 'users' ? 'Users' : tab === 'roles' ? 'Roles' : 'Org Board';
  const addBtn = document.getElementById('axAddBtn');
  // Org tab uses the full-width board (no list/detail split), so the add button
  // in the left-list header isn't needed.
  if (tab === 'users' || tab === 'org') addBtn.style.display = 'none';
  else { addBtn.style.display = ''; addBtn.textContent = '+ Role'; }
  closeDrawer();
  refreshTab();
}

async function refreshTab() {
  if (activeTab === 'users') return loadUsersTab();
  if (activeTab === 'roles') return loadRolesTab();
  if (activeTab === 'org')   return loadOrgTab();
}

function onAddInTab() {
  if (activeTab === 'roles') return openRoleEditor(null);
  if (activeTab === 'org')   return openCreateDivisionModal();
}

// ═══════════════════════════════════════════════════════════════════════
// USERS TAB
// ═══════════════════════════════════════════════════════════════════════
async function loadUsersTab() {
  const list = document.getElementById('axList');
  list.innerHTML = '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem;">Loading users…</div>';
  try {
    const j = await api('?api=users');
    usersData = (j.rows || []).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    document.getElementById('axCount').textContent = `${usersData.length} total`;
    list.innerHTML = usersData.map(u => {
      const roleNames = u.role_ids.map(id => roles.find(r => r.id === id)?.name).filter(Boolean);
      const sel = u.id === selectedId ? 'selected' : '';
      return `<div class="ax-row ${sel}" data-uid="${u.id}">
        <div class="ax-row-name">${escapeHtml(u.email)}</div>
        <div class="ax-row-meta">
          ${u.is_admin ? '<span class="pill pill-admin">Admin</span>' : ''}
          ${roleNames.slice(0,3).map(n => `<span class="pill pill-blue">${escapeHtml(n)}</span>`).join('')}
          ${roleNames.length > 3 ? `<span class="pill">+${roleNames.length - 3}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.ax-row').forEach(r => r.addEventListener('click', () => openUserEditor(r.dataset.uid)));
  } catch (e) { list.innerHTML = `<div style="padding:14px;color:var(--red);">${escapeHtml(e.message)}</div>`; }
}

function openUserEditor(uid) {
  selectedId = uid; selectedKind = 'user';
  document.querySelectorAll('.ax-row').forEach(r => r.classList.toggle('selected', r.dataset.uid === uid));
  const u = usersData.find(x => x.id === uid);
  if (!u) return;
  const ed = document.getElementById('axEditor');
  const allRoles = roles.map(r => {
    const on = u.role_ids.includes(r.id);
    return `<span class="role-chip ${on ? 'on' : ''}" data-role-id="${r.id}" style="${on ? '' : ''}">
      <span class="role-chip-dot" style="background:${r.color}"></span>${escapeHtml(r.name)}
    </span>`;
  }).join('');
  // Effective perms grouped by dashboard
  const grouped = {};
  for (const k of u.permissions_v2 || []) {
    const d = k.split('.')[0]; (grouped[d] ||= []).push(k);
  }
  const effHtml = Object.keys(grouped).sort().map(d =>
    `<div style="width:100%;font-size:0.74rem;color:var(--text-muted);margin-top:6px;">${escapeHtml(d)}</div>` +
    grouped[d].sort().map(k => `<span class="pill pill-on">${escapeHtml(k.split('.').slice(1).join('.'))}</span>`).join('')
  ).join('') || '<span style="color:var(--text-dim);">No permissions yet.</span>';

  ed.innerHTML = `<div class="ax-editor">
    <h2>${escapeHtml(u.email)}</h2>
    <div style="color:var(--text-dim);font-size:0.82rem;">Created ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} · Last sign-in ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'never'}</div>

    <h3>Admin flag</h3>
    <label style="display:flex;align-items:center;gap:8px;font-size:0.86rem;">
      <input type="checkbox" id="u-isadmin" ${u.is_admin ? 'checked' : ''}>
      Make this user an admin (wildcard access to everything, including Access & Org)
    </label>

    <h3>Roles</h3>
    <div style="display:flex;flex-wrap:wrap;gap:6px;" id="u-roles">${allRoles}</div>
    <div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Click a role chip to toggle. Saved with the button below.</div>

    <h3>Effective permissions</h3>
    <div class="effective-perms" id="u-effective">${effHtml}</div>

    <div class="ax-actions">
      <button class="btn-primary" id="u-save">Save</button>
      <button class="btn-ghost"  id="u-revoke">Revoke session</button>
      <button class="btn-ghost"  style="color:var(--red);" id="u-delete">Delete user</button>
      <span class="ax-msg" id="u-msg"></span>
    </div>
  </div>`;

  ed.querySelectorAll('#u-roles .role-chip').forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));
  document.getElementById('u-save').addEventListener('click', () => saveUser(uid));
  document.getElementById('u-revoke').addEventListener('click', () => revokeUserSession(uid));
  document.getElementById('u-delete').addEventListener('click', () => deleteUser(uid));
}

async function saveUser(uid) {
  const msg = document.getElementById('u-msg');
  msg.textContent = 'Saving…'; msg.className = 'ax-msg';
  try {
    const isAdmin = document.getElementById('u-isadmin').checked;
    const roleIds = [...document.querySelectorAll('#u-roles .role-chip.on')].map(c => Number(c.dataset.roleId));
    await api('?api=user-set-admin', { method: 'POST', body: { user_id: uid, is_admin: isAdmin } });
    await api('?api=user-set-roles', { method: 'POST', body: { user_id: uid, role_ids: roleIds } });
    msg.textContent = '✓ Saved'; msg.className = 'ax-msg ok';
    await loadUsersTab();
    openUserEditor(uid);
  } catch (e) { msg.textContent = e.message; msg.className = 'ax-msg err'; }
}

async function revokeUserSession(uid) {
  if (!confirm('Force this user to sign in again on their next request?')) return;
  // Recompute is enough to invalidate cached JWTs is not exposed by Supabase
  // directly via edge fn here. For MVP we just trigger recompute so next refresh
  // pulls latest perms. Full sign-out requires admin.signOut(uid).
  try { await api('?api=user-recompute', { method: 'POST', body: { user_id: uid } }); alert('Permissions recomputed. The user will pick up the new set on their next sign-in or token refresh.'); }
  catch (e) { alert(e.message); }
}

async function deleteUser(uid) {
  const u = usersData.find(x => x.id === uid);
  if (!confirm(`Delete ${u?.email}? This permanently removes the account.`)) return;
  alert('Delete user is not wired up in this MVP — use the Supabase dashboard for now.');
}

// ═══════════════════════════════════════════════════════════════════════
// ROLES TAB
// ═══════════════════════════════════════════════════════════════════════
function loadRolesTab() {
  const list = document.getElementById('axList');
  document.getElementById('axCount').textContent = `${roles.length} roles`;
  list.innerHTML = roles.map(r => {
    const sel = r.id === selectedId ? 'selected' : '';
    const permCount = rolePerms.filter(rp => rp.role_id === r.id).length;
    return `<div class="ax-row ${sel}" data-rid="${r.id}">
      <div class="ax-row-name"><span class="role-chip-dot" style="background:${r.color};display:inline-block;margin-right:6px;"></span>${escapeHtml(r.name)}</div>
      <div class="ax-row-meta">
        ${r.is_system ? '<span class="pill">System</span>' : ''}
        <span>${permCount} perms</span>
        <span>${escapeHtml(r.slug)}</span>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.ax-row').forEach(r => r.addEventListener('click', () => openRoleEditor(parseInt(r.dataset.rid, 10))));
}

function openRoleEditor(rid) {
  selectedId = rid; selectedKind = 'role';
  document.querySelectorAll('.ax-row').forEach(r => r.classList.toggle('selected', parseInt(r.dataset.rid, 10) === rid));
  const r = rid ? roles.find(x => x.id === rid) : { id: null, name: '', slug: '', description: '', color: '#6b9eff', sort_order: 999, is_system: false };
  if (!r) return;
  const currentPermKeys = new Set(rolePerms.filter(rp => rp.role_id === rid).map(rp => rp.permission_key));
  const byDashboard = {};
  for (const p of permissions) (byDashboard[p.dashboard] ||= []).push(p);
  const gridHtml = Object.keys(byDashboard).sort().map(d => `
    <div class="perm-grid-dashboard">${escapeHtml(d)}</div>
    <div class="perm-grid-actions">
      ${byDashboard[d].map(p => `<span class="perm-chip ${currentPermKeys.has(p.key) ? 'on' : ''}" data-perm-key="${p.key}" title="${escapeHtml(p.description || '')}">${escapeHtml(p.action)}</span>`).join('')}
    </div>
  `).join('');

  const ed = document.getElementById('axEditor');
  ed.innerHTML = `<div class="ax-editor">
    <h2>${r.id ? escapeHtml(r.name) : 'New role'} ${r.is_system ? '<span class="pill">System</span>' : ''}</h2>
    <div class="ax-editor-row"><label>Name</label><input id="r-name" value="${escapeHtml(r.name)}"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="r-slug" value="${escapeHtml(r.slug)}" ${r.is_system ? 'readonly' : ''} placeholder="lowercase_with_underscores"></div>
    <div class="ax-editor-row"><label>Description</label><input id="r-desc" value="${escapeHtml(r.description || '')}"></div>
    <div class="ax-editor-row"><label>Color</label><input id="r-color" type="color" value="${escapeHtml(r.color || '#6b9eff')}" style="max-width:80px;"></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="r-sort" type="number" value="${r.sort_order || 0}" style="max-width:120px;"></div>

    <h3>Permissions in this bundle</h3>
    <div class="perm-grid" id="r-perm-grid">${gridHtml}</div>
    <div style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;">Click an action chip to include/exclude it. Users with this role get the union of all checked permissions.</div>

    <div class="ax-actions">
      <button class="btn-primary" id="r-save">Save</button>
      ${!r.is_system && r.id ? '<button class="btn-ghost" style="color:var(--red);" id="r-delete">Delete</button>' : ''}
      <span class="ax-msg" id="r-msg"></span>
    </div>
  </div>`;

  ed.querySelectorAll('#r-perm-grid .perm-chip').forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));
  document.getElementById('r-save').addEventListener('click', () => saveRole(rid));
  document.getElementById('r-delete')?.addEventListener('click', () => deleteRole(rid));
}

async function saveRole(rid) {
  const msg = document.getElementById('r-msg');
  msg.textContent = 'Saving…'; msg.className = 'ax-msg';
  try {
    const body = {
      name: document.getElementById('r-name').value.trim(),
      slug: document.getElementById('r-slug').value.trim(),
      description: document.getElementById('r-desc').value.trim(),
      color: document.getElementById('r-color').value,
      sort_order: Number(document.getElementById('r-sort').value) || 0,
      permission_keys: [...document.querySelectorAll('#r-perm-grid .perm-chip.on')].map(c => c.dataset.permKey),
    };
    if (!body.name) throw new Error('Name is required');
    let res;
    if (rid) res = await api('?api=role-update&id=' + rid, { method: 'POST', body });
    else     res = await api('?api=role-create', { method: 'POST', body });
    msg.textContent = '✓ Saved'; msg.className = 'ax-msg ok';
    await refreshAll();
    if (res?.row?.id) openRoleEditor(res.row.id);
  } catch (e) { msg.textContent = e.message; msg.className = 'ax-msg err'; }
}

async function deleteRole(rid) {
  if (!confirm('Delete this role? Users currently assigned will lose its permissions on their next refresh.')) return;
  try { await api('?api=role-delete&id=' + rid, { method: 'POST', body: {} }); selectedId = null; await refreshAll(); }
  catch (e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════════════════
// ORG BOARD TAB
// ═══════════════════════════════════════════════════════════════════════
// ── Org board: holders index ────────────────────────────────────────────
// We fetch every active holder once per org-tab load so we can render the
// avatar stack on each post card without an extra request per card.
let activeHoldersByPost = {}; // { [postId]: [{user_id, started_at}, …] }

async function loadOrgTab() {
  const board = document.getElementById('orgBoard');
  board.innerHTML = '<div style="padding:24px;color:var(--text-dim);font-size:0.84rem;">Loading…</div>';
  try {
    const [d, dep, p, h] = await Promise.all([
      api('?api=divisions'),
      api('?api=departments'),
      api('?api=posts'),
      api('?api=post-holders'),
    ]);
    divisionsData = d.rows || [];
    departmentsData = dep.rows || [];
    postsData = p.rows || [];
    activeHoldersByPost = {};
    for (const row of (h.rows || [])) {
      if (row.ended_at) continue;
      (activeHoldersByPost[row.post_id] ||= []).push(row);
    }
    document.getElementById('axCount').textContent = `${divisionsData.length} div · ${departmentsData.length} dept · ${postsData.length} posts`;
    renderOrgBoard();
  } catch (e) { board.innerHTML = `<div style="padding:24px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`; }
}

function renderOrgBoard() {
  const board = document.getElementById('orgBoard');
  if (!divisionsData.length) {
    board.innerHTML = `
      <button class="org-add-division" id="org-first-div">
        + Add your first division
      </button>`;
    document.getElementById('org-first-div').addEventListener('click', openCreateDivisionModal);
    return;
  }
  const divsHtml = divisionsData.map(d => {
    const depts = departmentsData.filter(x => x.division_id === d.id);
    const totalPosts = postsData.filter(p => depts.some(dep => dep.id === p.department_id)).length;
    const deptsHtml = depts.map(dep => renderDepartmentSubColumn(dep)).join('') +
      `<button class="org-add-btn" style="align-self:flex-start;margin-top:4px;" data-add-dept="${d.id}">+ Department</button>`;
    return `
      <div class="org-col-division">
        <div class="org-col-division-head" data-kind="division" data-id="${d.id}">
          <div class="org-col-division-stripe" style="background:${d.color || '#6b9eff'};"></div>
          <div class="org-col-division-title">${escapeHtml(d.name)}</div>
          <div class="org-col-division-meta">${depts.length} dept · ${totalPosts} posts</div>
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
}

function renderDepartmentSubColumn(dep) {
  const posts = postsData.filter(x => x.department_id === dep.id);
  const postsHtml = posts.map(po => renderPostCard(po)).join('') ||
    '<div style="color:var(--text-dim);font-size:0.74rem;font-style:italic;padding:6px;">No posts yet</div>';
  return `
    <div class="org-col-department">
      <div class="org-col-department-head" data-kind="department" data-id="${dep.id}">
        <span class="title">${escapeHtml(dep.name)}</span>
        <span class="count">${posts.length}</span>
      </div>
      <div class="org-col-department-posts">${postsHtml}</div>
      <button class="org-add-btn" data-add-post="${dep.id}">+ Post</button>
    </div>`;
}

function renderPostCard(po) {
  const role = po.default_role_id ? roles.find(r => r.id === po.default_role_id) : null;
  const holders = activeHoldersByPost[po.id] || [];
  const avatars = holders.slice(0, 4).map(h => {
    const u = usersData.find(x => x.id === h.user_id);
    const initial = (u?.email || '?').slice(0, 1).toUpperCase();
    return `<span class="havatar" title="${escapeHtml(u?.email || h.user_id)}">${escapeHtml(initial)}</span>`;
  }).join('');
  const extra = holders.length > 4 ? `<span class="havatar" style="background:var(--surface3);color:var(--text-muted);">+${holders.length - 4}</span>` : '';
  const holdersHtml = holders.length
    ? `<div class="org-post-card-holders">${avatars}${extra}</div>`
    : '<div class="org-post-card-holders"><span class="vacant">Vacant</span></div>';
  const roleChip = role ? `<span class="org-post-card-role">${escapeHtml(role.name)}</span>` : '';
  return `
    <div class="org-post-card" data-id="${po.id}">
      <div class="org-post-card-title">${escapeHtml(po.name)}</div>
      <div class="org-post-card-meta">${roleChip}<span>${holders.length} ${holders.length === 1 ? 'holder' : 'holders'}</span></div>
      ${holdersHtml}
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

function renderDivisionEditor(d) {
  if (!d) return;
  const ed = editorEl();
  if (!ed) return;
  ed.innerHTML = `<div class="ax-editor">
    <div class="breadcrumb">Division</div>
    <h2>${escapeHtml(d.name)}</h2>

    <div class="ax-editor-row"><label>Name</label><input id="d-name" value="${escapeHtml(d.name)}"></div>
    <div class="ax-editor-row"><label>Slug</label><input id="d-slug" value="${escapeHtml(d.slug)}"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="d-desc">${escapeHtml(d.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Color</label><input id="d-color" type="color" value="${escapeHtml(d.color || '#6b9eff')}" style="max-width:80px;"></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="d-sort" type="number" value="${d.sort_order || 0}" style="max-width:120px;"></div>

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
    <div class="ax-editor-row"><label>Description</label><textarea id="dep-desc">${escapeHtml(dep.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="dep-sort" type="number" value="${dep.sort_order || 0}" style="max-width:120px;"></div>

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
  document.getElementById('dep-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('dep-name').value,
      slug: document.getElementById('dep-slug').value,
      description: document.getElementById('dep-desc').value,
      sort_order: Number(document.getElementById('dep-sort').value) || 0,
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
    <div class="ax-editor-row"><label>Description</label><textarea id="po-desc">${escapeHtml(po.description || '')}</textarea></div>
    <div class="ax-editor-row"><label title="Whoever holds this post automatically receives this role's permissions.">Default role</label><select id="po-role">${roleOpts}</select></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="po-sort" type="number" value="${po.sort_order || 0}" style="max-width:120px;"></div>

    <h3>Holders <span style="font-weight:400;color:var(--text-dim);font-size:0.78rem;">(many people can hold the same post)</span></h3>
    <div id="po-holders"></div>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <select id="po-holder-pick" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);"></select>
      <button class="small-btn" id="po-add-holder">+ Add holder</button>
    </div>

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

  // Load + render holders
  refreshPostHolders(po.id);
  // Populate holder picker with users not currently holding this post
  const pick = document.getElementById('po-holder-pick');
  pick.innerHTML = usersData.map(u => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join('');
  document.getElementById('po-add-holder').addEventListener('click', async () => {
    const uid = pick.value;
    if (!uid) return;
    try { await api('?api=post-add-holder', { method: 'POST', body: { post_id: po.id, user_id: uid } }); await refreshPostHolders(po.id); await loadUsersTab(); }
    catch (e) { alert(e.message); }
  });

  document.getElementById('po-add-policy').addEventListener('click', () => openPolicyModal('post', po.id));
  document.getElementById('po-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('po-name').value,
      slug: document.getElementById('po-slug').value,
      description: document.getElementById('po-desc').value,
      default_role_id: document.getElementById('po-role').value ? Number(document.getElementById('po-role').value) : null,
      sort_order: Number(document.getElementById('po-sort').value) || 0,
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

async function refreshPostHolders(postId) {
  try {
    const j = await api('?api=post-holders&post_id=' + postId);
    const rows = (j.rows || []).filter(r => !r.ended_at);
    const wrap = document.getElementById('po-holders');
    if (!wrap) return;
    if (!rows.length) { wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">No current holders.</span>'; return; }
    wrap.innerHTML = rows.map(r => {
      const u = usersData.find(x => x.id === r.user_id);
      const initial = (u?.email || '?').slice(0, 1).toUpperCase();
      return `<span class="holder-pill">
        <span class="holder-pill-av">${initial}</span>
        ${escapeHtml(u?.email || r.user_id)}
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
          const initial = (e.email || '?').slice(0, 1).toUpperCase();
          return `<span class="holder-pill">
            <span class="holder-pill-av">${escapeHtml(initial)}</span>
            ${escapeHtml(e.email)}
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
      pick.innerHTML = usersData
        .filter(u => !editorIds.has(u.id))
        .map(u => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join('');
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
function showModal(html) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-card" onclick="event.stopPropagation()">${html}</div></div>`;
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
    <div class="ax-editor-row"><label>Default role</label><select id="m-role">${roleOpts}</select></div>
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

function openInviteModal() {
  const roleOpts = roles.map(r => `<label class="role-chip" data-rid="${r.id}"><input type="checkbox" style="margin-right:4px;">${escapeHtml(r.name)}</label>`).join('');
  showModal(`<h3>Invite user</h3>
    <div class="ax-editor-row"><label>Email</label><input id="i-email" placeholder="name@ridleyacademy.team"></div>
    <div class="ax-editor-row"><label>First name</label><input id="i-fname" placeholder="Optional"></div>
    <div class="ax-editor-row" style="align-items:flex-start;"><label style="padding-top:6px;">Roles</label><div style="display:flex;flex-wrap:wrap;gap:6px;flex:1;" id="i-roles">${roleOpts}</div></div>
    <div style="font-size:0.72rem;color:var(--text-dim);margin:6px 0 0 110px;">Roles are applied after they activate their account. They'll receive an email with an activation link.</div>
    <div class="ax-actions"><button class="btn-primary" id="i-send">Send invite</button><button class="btn-ghost" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button><span class="ax-msg" id="i-msg"></span></div>`);
  document.getElementById('i-send').addEventListener('click', async () => {
    const msg = document.getElementById('i-msg');
    msg.className = 'ax-msg'; msg.textContent = 'Sending…';
    try {
      const email = document.getElementById('i-email').value.trim().toLowerCase();
      const first_name = document.getElementById('i-fname').value.trim();
      const selectedRoles = [...document.querySelectorAll('#i-roles input:checked')].map(cb => Number(cb.closest('[data-rid]').dataset.rid));
      // Derive legacy `permissions` array from selected roles' slugs so the
      // existing invite flow / activation continues to work.
      const legacyPerms = [...new Set(selectedRoles.map(rid => roles.find(r => r.id === rid)?.slug).filter(Boolean))];
      const r = await fetch(INVITE_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ email, first_name, permissions: legacyPerms, is_admin: false }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'invite failed');
      msg.className = 'ax-msg ok'; msg.textContent = '✓ Invite sent';
      setTimeout(() => { closeModal(); loadUsersTab(); }, 800);
    } catch (e) { msg.className = 'ax-msg err'; msg.textContent = e.message; }
  });
}
