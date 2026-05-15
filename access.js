// Access & Org dashboard.
// Three tabs: Users, Roles, Org Board. All admin/users.manage gated.
// Backend: edge function /functions/v1/access-control

const SUPABASE_URL = "https://pojqljrhhtnigyrtzdzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
const AC_BASE = SUPABASE_URL + '/functions/v1/access-control';
const ADMIN_API_BASE = SUPABASE_URL + '/functions/v1/admin-api';
// Thin wrapper to call the legacy admin-api function (used by the new
// Activity / Sessions panes — these endpoints don't live in access-control).
async function adminApi(path, opts = {}) {
  const r = await fetch(ADMIN_API_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
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
// inviteBtn removed from the topbar in v239 — the action now lives inside
// the Users tab via the shared axAddBtn (which becomes "+ Invite user" when
// the Users tab is active). See switchTab().
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
  // Catalog is required (roles + permissions drive every tab). Org structure
  // is nice-to-have so the Users tab can render Posts without flipping tabs;
  // but if anything in the org-data fetch hangs/errors we don't want the
  // whole page stuck. Fall back to empty arrays and let loadOrgTab fill them
  // properly later.
  try {
    const catalog = await api('?api=catalog');
    permissions = catalog.permissions || [];
    roles = catalog.roles || [];
    rolePerms = catalog.role_permissions || [];
  } catch (e) {
    document.getElementById('axList').innerHTML = `<div style="padding:14px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`;
    return;
  }
  // Best-effort org + rep-map preload — never throws.
  try {
    const [divRes, depRes, postRes, holderRes, repRes, unassignedRes] = await Promise.all([
      api('?api=divisions').catch(() => ({ rows: [] })),
      api('?api=departments').catch(() => ({ rows: [] })),
      api('?api=posts').catch(() => ({ rows: [] })),
      api('?api=post-holders').catch(() => ({ rows: [] })),
      api('?api=rep-mappings').catch(() => ({ profiles: [], users: [] })),
      adminApi('?api=unassigned-names').catch(() => null),
    ]);
    divisionsData = divRes.rows || [];
    departmentsData = depRes.rows || [];
    postsData = postRes.rows || [];
    activeHoldersByPost = {};
    for (const row of (holderRes.rows || [])) {
      if (row.ended_at) continue;
      (activeHoldersByPost[row.post_id] ||= []).push(row);
    }
    repMapProfiles = repRes.profiles || [];
    repMapUnassigned = unassignedRes || { allCallsReps: [], unassignedCallsReps: [], unassignedAffiliates: [] };
  } catch (_) { /* swallow — Users tab still works without preload */ }
  // Ensure the per-tab chrome (especially the + Invite user button) is in
  // sync on the very first paint — not just after a tab click.
  applyTabChrome(activeTab);
  try { await refreshTab(); }
  catch (e) {
    document.getElementById('axList').innerHTML = `<div style="padding:14px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`;
  }
}

// Sync the per-tab visual chrome (tab pills, list title, add-button label
// + visibility). Pulled out of switchTab so the initial boot can call it
// once before refreshTab — otherwise the "+ Invite user" button stays
// hidden until the user clicks a tab.
function applyTabChrome(tab) {
  document.body.dataset.tab = tab; // toggles CSS for full-width panes
  document.querySelectorAll('.ax-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const titleEl = document.getElementById('axListTitle');
  if (titleEl) titleEl.textContent =
    tab === 'users' ? 'Users' :
    tab === 'roles' ? 'Roles' :
    tab === 'org'   ? 'Org Board' :
    tab === 'activity' ? 'Activity' :
    tab === 'sessions' ? 'Sessions' : '';
  const addBtn = document.getElementById('axAddBtn');
  if (!addBtn) return;
  // Tabs with their own full-width view (no left list / right detail) hide
  // the shared add-button. Users keeps it as + Invite user, Roles as + Role.
  if (['org', 'activity', 'sessions'].includes(tab)) {
    addBtn.style.display = 'none';
  } else if (tab === 'users') {
    addBtn.style.display = '';
    addBtn.textContent = '+ Invite user';
    addBtn.title = 'Invite a new user';
  } else {
    addBtn.style.display = '';
    addBtn.textContent = '+ Role';
    addBtn.title = 'New role';
  }
}

function switchTab(tab) {
  activeTab = tab;
  selectedId = null;
  document.getElementById('axEditor').innerHTML = '<div class="ax-editor-empty">Select an item on the left.</div>';
  applyTabChrome(tab);
  closeDrawer();
  refreshTab();
}

async function refreshTab() {
  if (activeTab === 'users') return loadUsersTab();
  if (activeTab === 'roles') return loadRolesTab();
  if (activeTab === 'org')   return loadOrgTab();
  if (activeTab === 'activity')  return loadActivityTab();
  if (activeTab === 'sessions')  return loadSessionsTab();
}

function onAddInTab() {
  if (activeTab === 'users') return openInviteModal();
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
      const display = (u.first_name && u.first_name.trim()) ? u.first_name.trim() : u.email;
      const secondary = (u.first_name && u.first_name.trim()) ? u.email : '';
      return `<div class="ax-row ${sel}" data-uid="${u.id}">
        <div class="ax-row-name">${escapeHtml(display)}${secondary ? `<span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;margin-left:6px;">${escapeHtml(secondary)}</span>` : ''}</div>
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

  // ── Posts the user currently holds ────────────────────────────────
  // u.post_ids comes from the /users endpoint (active holders only).
  const heldPosts = (u.post_ids || []).map(pid => postsData.find(p => p.id === pid)).filter(Boolean);
  const postsHtml = heldPosts.length
    ? heldPosts.map(p => {
        const dep = departmentsData.find(d => d.id === p.department_id);
        const div = divisionsData.find(d => d.id === dep?.division_id);
        return `<div class="user-post-pill" data-pid="${p.id}">
          <span class="user-post-path">${escapeHtml(div?.name || '?')} › ${escapeHtml(dep?.name || '?')}</span>
          <span class="user-post-name">${escapeHtml(p.name)}</span>
          <button class="user-post-remove" data-pid="${p.id}" title="Remove from this post">×</button>
        </div>`;
      }).join('')
    : '<span style="color:var(--text-dim);font-size:0.82rem;font-style:italic;">Not assigned to any post yet.</span>';

  // Posts available to assign — every post in the system, grouped by Division › Dept
  const postOptions = ['<option value="">— Pick a post to assign —</option>'];
  for (const div of divisionsData) {
    const deps = departmentsData.filter(d => d.division_id === div.id);
    for (const dep of deps) {
      const posts = postsData.filter(p => p.department_id === dep.id);
      if (!posts.length) continue;
      postOptions.push(`<optgroup label="${escapeHtml(div.name + ' › ' + dep.name)}">`);
      for (const p of posts) {
        if ((u.post_ids || []).includes(p.id)) continue; // hide already-held
        postOptions.push(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
      }
      postOptions.push('</optgroup>');
    }
  }

  ed.innerHTML = `<div class="ax-editor">
    <h2>${escapeHtml(_displayOf(uid) || u.email)}${u.is_admin ? ' <span class="pill pill-admin">Admin</span>' : ''}</h2>
    <div style="color:var(--text-dim);font-size:0.82rem;">${escapeHtml(u.email)}</div>
    <div style="color:var(--text-dim);font-size:0.74rem;margin-top:2px;">Created ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} · Last sign-in ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'never'}</div>

    <h3>Admin flag</h3>
    <label class="invite-admin-toggle ${u.is_admin ? '' : ''}" style="padding:10px 12px;background:${u.is_admin ? 'rgba(251,191,36,.10)' : 'var(--surface2)'};border:1px solid ${u.is_admin ? 'rgba(251,191,36,.45)' : 'var(--border)'};border-radius:10px;">
      <input type="checkbox" id="u-isadmin" ${u.is_admin ? 'checked' : ''} style="margin-top:3px;">
      <span class="invite-admin-text">
        <strong>⚙️ Make admin</strong>
        <em>Wildcard access to everything, including Access &amp; Org itself. Use sparingly.</em>
      </span>
    </label>

    <h3>Roles <span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;">(hover any chip to see what it grants)</span></h3>
    <div style="display:flex;flex-wrap:wrap;gap:6px;" id="u-roles">${allRoles}</div>
    <div style="display:flex;gap:8px;margin-top:6px;align-items:center;">
      <button class="small-btn" id="u-copy-from" style="background:var(--surface3);">⧉ Copy from another user…</button>
      <span style="font-size:0.7rem;color:var(--text-dim);">Click any chip to toggle. Click Save when ready.</span>
    </div>

    <h3>🪪 Posts <span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;">(where this person is posted on the Org Board)</span></h3>
    <div id="u-posts" style="display:flex;flex-direction:column;gap:6px;">${postsHtml}</div>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <select id="u-post-pick" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);">${postOptions.join('')}</select>
      <button class="small-btn" id="u-post-assign">Assign</button>
    </div>

    <h3>🧩 Rep Mapping <span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;">(Calls Log names + Sales Affiliate spellings linked to this user)</span></h3>
    <div id="u-repmap"></div>

    <h3>Effective permissions <span style="font-weight:400;color:var(--text-dim);font-size:0.74rem;">(role + post + grant)</span></h3>
    <div class="effective-perms" id="u-effective">${effHtml}</div>

    <div class="ax-actions">
      <button class="btn-primary" id="u-save">Save roles &amp; admin</button>
      <button class="btn-ghost"  id="u-revoke">Recompute perms</button>
      <button class="btn-ghost"  style="color:var(--red);" id="u-delete">Delete user</button>
      <span class="ax-msg" id="u-msg"></span>
    </div>
  </div>`;

  // Role chip toggles (clicking the body toggles)
  ed.querySelectorAll('#u-roles .role-chip').forEach(c => {
    // Add a hover tooltip listing the perms this role grants
    const rid = Number(c.dataset.roleId);
    const perms = rolePerms.filter(rp => rp.role_id === rid).map(rp => rp.permission_key);
    c.title = perms.length ? `Grants: ${perms.slice(0, 16).join(', ')}${perms.length > 16 ? ` (+${perms.length - 16} more)` : ''}` : 'No permissions yet';
    c.addEventListener('click', () => c.classList.toggle('on'));
  });

  // Post pills: remove handler
  ed.querySelectorAll('.user-post-remove').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const pid = Number(btn.dataset.pid);
    if (!confirm('Remove this user from that post?')) return;
    try {
      await api('?api=post-remove-holder', { method: 'POST', body: { post_id: pid, user_id: uid } });
      await loadOrgTab(); await loadUsersTab();
      openUserEditor(uid);
    } catch (e2) { alert(e2.message); }
  }));

  // Assign-to-post button
  document.getElementById('u-post-assign').addEventListener('click', async () => {
    const pid = Number(document.getElementById('u-post-pick').value);
    if (!pid) return;
    try {
      await api('?api=post-add-holder', { method: 'POST', body: { post_id: pid, user_id: uid } });
      await loadOrgTab(); await loadUsersTab();
      openUserEditor(uid);
    } catch (e) { alert(e.message); }
  });

  // Copy roles from another user
  document.getElementById('u-copy-from').addEventListener('click', () => openCopyRolesPicker(uid));

  // Rep mapping section (linked profiles + add-new form + unassigned chips)
  renderUserRepMap(uid);

  document.getElementById('u-save').addEventListener('click', () => saveUser(uid));
  document.getElementById('u-revoke').addEventListener('click', () => revokeUserSession(uid));
  document.getElementById('u-delete').addEventListener('click', () => deleteUser(uid));
}

// ── Rep Mapping subsection inside the user editor ──────────────────────
function renderUserRepMap(uid) {
  const wrap = document.getElementById('u-repmap');
  if (!wrap) return;
  const u = usersData.find(x => x.id === uid);
  const firstName = (u?.first_name || '').trim();
  const mine = repMapProfiles.filter(p => p.user_id === uid);
  const unlinked = repMapProfiles.filter(p => !p.user_id);
  const unassignedNames = repMapUnassigned?.unassignedCallsReps || [];
  const datalistOptions = (repMapUnassigned?.allCallsReps || []).map(n => `<option value="${escapeHtml(n)}">`).join('');

  // ── Smart-match suggestions when this user has no profile yet ─────────
  // 1) Does an UNLINKED profile have calls_name == this user's first_name?
  //    → "Looks like Jordin's profile already exists — Link it"
  // 2) Does an UNASSIGNED Calls Log name == first_name?
  //    → "This name is in the calls log but has no profile — Create & link"
  // 3) Otherwise the create-new form below will pre-fill calls_name=firstName.
  let smartSuggestion = '';
  if (!mine.length && firstName) {
    const fLower = firstName.toLowerCase();
    const matchUnlinked = unlinked.find(p => (p.calls_name || '').toLowerCase() === fLower);
    const matchUnassigned = unassignedNames.find(n => (n || '').toLowerCase() === fLower);
    if (matchUnlinked) {
      smartSuggestion = `
        <div class="rep-suggest">
          <span class="rep-suggest-emoji">💡</span>
          <div style="flex:1;">
            <div><strong>${escapeHtml(matchUnlinked.calls_name)}</strong> is an existing unlinked rep profile.</div>
            <div style="font-size:0.72rem;color:var(--text-dim);">Probably this user. Link it?</div>
          </div>
          <button class="btn-primary" id="u-rm-suggest-link" data-id="${matchUnlinked.id}">Link to this user</button>
        </div>`;
    } else if (matchUnassigned) {
      smartSuggestion = `
        <div class="rep-suggest">
          <span class="rep-suggest-emoji">💡</span>
          <div style="flex:1;">
            <div><strong>${escapeHtml(matchUnassigned)}</strong> appears in the Calls Log but has no rep profile yet.</div>
            <div style="font-size:0.72rem;color:var(--text-dim);">Create a profile for this user with that exact name?</div>
          </div>
          <button class="btn-primary" id="u-rm-suggest-create" data-name="${escapeHtml(matchUnassigned)}">Create &amp; link</button>
        </div>`;
    }
  }

  // Pre-fill calls_name in the create-new form with the user's first name
  // (the common case is they match — admins only need to change it when the
  // Calls Log spelling differs from the user's stored first_name).
  const newNameDefault = !mine.length ? firstName : '';
  // Auto-expand the create form when user has no profile yet so admins
  // don't need to hunt for it.
  const createOpenAttr = !mine.length ? ' open' : '';

  const minePillsHtml = mine.length ? mine.map(p => {
    const aff = (p.sales_affiliates || []).join(', ');
    return `<div class="rep-map-row" data-profile-id="${p.id}">
      <div class="rep-map-top">
        <div class="rep-map-avatar">${escapeHtml((p.calls_name || '?').slice(0,2).toUpperCase())}</div>
        <div style="flex:1;">
          <div class="rep-map-name">${escapeHtml(p.calls_name)}</div>
          <div class="rep-map-sub">🔗 linked to this user</div>
        </div>
        <button class="small-btn u-rm-unlink" data-id="${p.id}" data-name="${escapeHtml(p.calls_name)}" title="Unlink from this user (keep the profile)">Unlink</button>
        <button class="small-btn u-rm-delete" data-id="${p.id}" style="color:var(--red);border-color:rgba(248,113,113,.3);">✕ Delete</button>
      </div>
      <div class="rep-map-fields">
        <div class="rep-map-field" style="flex:1;min-width:240px;">
          <label>Sales Log Affiliates (comma-separated)</label>
          <input class="u-rm-aff" type="text" value="${escapeHtml(aff)}" placeholder="e.g. Jordin Pedlar, jordin pedlar">
        </div>
      </div>
      <div class="rep-map-actions">
        <button class="btn-primary u-rm-save" data-id="${p.id}" data-name="${escapeHtml(p.calls_name)}">Save</button>
        <span class="ax-msg" id="u-rm-msg-${p.id}"></span>
      </div>
    </div>`;
  }).join('') : '<div style="color:var(--text-dim);font-size:0.78rem;font-style:italic;padding:6px;">No rep profiles linked to this user yet.</div>';

  const unlinkedOpts = unlinked.length
    ? '<option value="">— Pick an unlinked profile —</option>' + unlinked
        .sort((a, b) => (a.calls_name || '').localeCompare(b.calls_name || ''))
        .map(p => `<option value="${p.id}" data-name="${escapeHtml(p.calls_name)}">${escapeHtml(p.calls_name)} ${(p.sales_affiliates || []).length ? '(' + p.sales_affiliates.length + ' aff)' : ''}</option>`)
        .join('')
    : '';

  wrap.innerHTML = `
    ${smartSuggestion}
    ${minePillsHtml}
    ${unlinked.length ? `
      <div style="margin-top:10px;display:flex;gap:6px;align-items:center;">
        <select id="u-rm-attach-pick" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text);">${unlinkedOpts}</select>
        <button class="small-btn" id="u-rm-attach">Attach to this user</button>
      </div>
    ` : ''}
    <details style="margin-top:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;overflow:hidden;"${createOpenAttr}>
      <summary style="cursor:pointer;padding:8px 10px;font-size:0.78rem;font-weight:600;color:var(--text-muted);list-style:none;">${mine.length ? '+ Create another rep profile for this user' : '+ Set this user’s Calls Log name'}</summary>
      <div style="padding:10px;display:flex;flex-direction:column;gap:8px;">
        ${firstName && !mine.length ? `<div style="font-size:0.72rem;color:var(--text-dim);">Default is the user’s first name (<strong>${escapeHtml(firstName)}</strong>). Change it if the Calls Log uses a different spelling for this person.</div>` : ''}
        <div class="rep-map-fields">
          <div class="rep-map-field" style="flex:1;min-width:160px;">
            <label>Calls Log Name (exact match)</label>
            <input id="u-rm-new-name" list="u-rm-name-list" placeholder="e.g. Jordin" autocomplete="off" value="${escapeHtml(newNameDefault)}">
            <datalist id="u-rm-name-list">${datalistOptions}</datalist>
          </div>
          <div class="rep-map-field" style="flex:2;min-width:240px;">
            <label>Sales Affiliates (comma-separated)</label>
            <input id="u-rm-new-aff" placeholder="e.g. Jordin Pedlar, jordin pedlar">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-primary" id="u-rm-create">${mine.length ? 'Create &amp; link' : 'Save Calls Log name'}</button>
          <span class="ax-msg" id="u-rm-new-msg"></span>
        </div>
      </div>
    </details>
    ${unassignedNames.length ? `
      <div style="margin-top:10px;padding:8px 10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:8px;">
        <div style="font-size:0.7rem;color:#fbbf24;font-weight:700;margin-bottom:6px;">Calls Log reps without a profile — click to claim for this user</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${unassignedNames.map(n => `<span class="unassigned-chip u-rm-claim" data-name="${escapeHtml(n)}">${escapeHtml(n)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // Wire row save / unlink / delete
  wrap.querySelectorAll('.u-rm-save').forEach(btn => btn.addEventListener('click', async () => {
    const row = btn.closest('.rep-map-row');
    const id = btn.dataset.id;
    const name = btn.dataset.name;
    const aff = row.querySelector('.u-rm-aff').value.split(',').map(s => s.trim()).filter(Boolean);
    const msg = document.getElementById('u-rm-msg-' + id);
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await setRepMapping(name, aff, uid);
      msg.className = 'ax-msg ok'; msg.textContent = '✓ Saved';
      setTimeout(() => renderUserRepMap(uid), 700);
    } catch (e) { msg.className = 'ax-msg err'; msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Save'; }
  }));
  wrap.querySelectorAll('.u-rm-unlink').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm(`Unlink "${btn.dataset.name}" from this user? (The rep profile stays — only the user link is cleared.)`)) return;
    btn.disabled = true; btn.textContent = 'Unlinking…';
    try {
      const profile = repMapProfiles.find(p => p.id === Number(btn.dataset.id));
      await setRepMapping(btn.dataset.name, profile?.sales_affiliates || [], null);
      renderUserRepMap(uid);
    } catch (e) { btn.disabled = false; btn.textContent = 'Unlink'; alert(e.message); }
  }));
  wrap.querySelectorAll('.u-rm-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this rep profile entirely? This cannot be undone.')) return;
    btn.disabled = true; btn.textContent = 'Deleting…';
    try { await deleteRepMappingById(btn.dataset.id); renderUserRepMap(uid); }
    catch (e) { btn.disabled = false; btn.textContent = '✕ Delete'; alert(e.message); }
  }));

  // Attach an existing unlinked profile to this user
  document.getElementById('u-rm-attach')?.addEventListener('click', async () => {
    const sel = document.getElementById('u-rm-attach-pick');
    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) return;
    const profile = repMapProfiles.find(p => p.id === Number(opt.value));
    if (!profile) return;
    try {
      await setRepMapping(profile.calls_name, profile.sales_affiliates || [], uid);
      renderUserRepMap(uid);
    } catch (e) { alert(e.message); }
  });

  // Create new + link
  document.getElementById('u-rm-create')?.addEventListener('click', async () => {
    const name = document.getElementById('u-rm-new-name').value.trim();
    const aff = document.getElementById('u-rm-new-aff').value.split(',').map(s => s.trim()).filter(Boolean);
    const msg = document.getElementById('u-rm-new-msg');
    if (!name) { msg.className = 'ax-msg err'; msg.textContent = 'Calls Log name is required.'; return; }
    msg.className = 'ax-msg'; msg.textContent = 'Saving…';
    try {
      await setRepMapping(name, aff, uid);
      msg.className = 'ax-msg ok'; msg.textContent = '✓ Linked';
      setTimeout(() => renderUserRepMap(uid), 600);
    } catch (e) { msg.className = 'ax-msg err'; msg.textContent = e.message; }
  });

  // One-click claim: take an unassigned Calls Log name and link it to this user
  wrap.querySelectorAll('.u-rm-claim').forEach(chip => chip.addEventListener('click', async () => {
    const name = chip.dataset.name;
    if (!confirm(`Create a rep profile for "${name}" and link it to this user?`)) return;
    try { await setRepMapping(name, [], uid); renderUserRepMap(uid); }
    catch (e) { alert(e.message); }
  }));

  // Smart-match: existing unlinked profile that matches first_name → one-click link
  document.getElementById('u-rm-suggest-link')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const profile = repMapProfiles.find(p => p.id === Number(btn.dataset.id));
    if (!profile) return;
    btn.disabled = true; btn.textContent = 'Linking…';
    try {
      await setRepMapping(profile.calls_name, profile.sales_affiliates || [], uid);
      renderUserRepMap(uid);
    } catch (err) { btn.disabled = false; btn.textContent = 'Link to this user'; alert(err.message); }
  });
  // Smart-match: unassigned calls-log name that matches first_name → one-click create+link
  document.getElementById('u-rm-suggest-create')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Creating…';
    try { await setRepMapping(btn.dataset.name, [], uid); renderUserRepMap(uid); }
    catch (err) { btn.disabled = false; btn.textContent = 'Create & link'; alert(err.message); }
  });
}

function openCopyRolesPicker(targetUid) {
  const choices = usersData.filter(u => u.id !== targetUid && (u.is_admin || u.role_ids.length))
    .sort((a, b) => (_displayOf(a.id) || '').localeCompare(_displayOf(b.id) || ''));
  if (!choices.length) { alert('No users with roles to copy from yet.'); return; }
  const opts = choices.map(u => `<option value="${u.id}">${escapeHtml(_displayOf(u.id))} ${u.is_admin ? '(admin)' : `(${u.role_ids.length} roles)`}</option>`).join('');
  showModal(`<h3>⧉ Copy roles from another user</h3>
    <div class="ax-editor-row"><label>Copy from</label><select id="cf-source">${opts}</select></div>
    <div style="font-size:0.74rem;color:var(--text-dim);margin:6px 0;">This will replace the current user's roles + admin flag with the chosen user's. Posts and grants are not copied.</div>
    <div class="ax-actions"><button class="btn-primary" id="cf-apply">Copy &amp; Save</button><button class="btn-ghost" id="cf-cancel">Cancel</button></div>`);
  document.getElementById('cf-cancel').addEventListener('click', closeModal);
  document.getElementById('cf-apply').addEventListener('click', async () => {
    const srcId = document.getElementById('cf-source').value;
    const src = usersData.find(u => u.id === srcId);
    if (!src) return;
    try {
      await api('?api=user-set-admin', { method: 'POST', body: { user_id: targetUid, is_admin: !!src.is_admin } });
      await api('?api=user-set-roles', { method: 'POST', body: { user_id: targetUid, role_ids: src.role_ids } });
      closeModal();
      await loadUsersTab();
      openUserEditor(targetUid);
    } catch (e) { alert(e.message); }
  });
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
      ${byDashboard[d].map(p => `<span class="perm-chip ${currentPermKeys.has(p.key) ? 'on' : ''}" data-perm-key="${p.key}" title="${escapeHtml(p.description || p.key || '')}">${escapeHtml(p.label || p.action)}</span>`).join('')}
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
let repMapProfiles = [];       // [{ id, calls_name, sales_affiliates[], user_id, user_email }]
let repMapUnassigned = { allCallsReps: [], unassignedCallsReps: [], unassignedAffiliates: [] };

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

function _emailOf(uid) { return uid ? (usersData.find(u => u.id === uid)?.email || uid) : null; }
// Display name — first_name if set, else email, else id. Use this for
// anything user-facing on the board / pickers / chips.
function _displayOf(uid) {
  if (!uid) return null;
  const u = usersData.find(x => x.id === uid);
  if (!u) return uid;
  return (u.first_name && u.first_name.trim()) ? u.first_name.trim() : (u.email || uid);
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

// DEPRECATED — Executive is now a regular Division (Div 0). This is a no-op
// kept only so older render paths don't error.
function renderTopTier() {
  const tier = document.getElementById('orgTopTier');
  if (tier) tier.innerHTML = '';
  return;
  // legacy body retained as dead code below for context:
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
      <div class="org-col-division">
        <div class="org-col-division-head" data-kind="division" data-id="${d.id}">
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
    <div class="ax-editor-row"><label title="The single tangible thing this exec post is accountable for delivering.">Valuable Final Product</label><input id="ep-vfp" value="${escapeHtml(ep.valuable_final_product || '')}" placeholder="The tangible thing this exec post is accountable for"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="ep-desc">${escapeHtml(ep.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Color</label><input id="ep-color" type="color" value="${escapeHtml(ep.color || '#fbbf24')}" style="max-width:80px;"></div>

    <h3>Assigned to</h3>
    <div class="ax-editor-row"><label>Holder</label><select id="ep-head"></select></div>
    <div class="ax-editor-row"><label>Default role</label><select id="ep-role"></select></div>

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

  document.getElementById('ep-head').innerHTML = _userOptions(ep.head_user_id);
  document.getElementById('ep-role').innerHTML = '<option value="">— No default role —</option>' + roles.map(r => `<option value="${r.id}" ${ep.default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

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
        head_user_id: document.getElementById('ep-head').value || null,
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
    <div class="ax-editor-row"><label title="The single tangible thing this division produces and ships out.">Valuable Final Product</label><input id="d-vfp" value="${escapeHtml(d.valuable_final_product || '')}" placeholder="The tangible thing this division produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="d-desc">${escapeHtml(d.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Color</label><input id="d-color" type="color" value="${escapeHtml(d.color || '#6b9eff')}" style="max-width:80px;"></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="d-sort" type="number" value="${d.sort_order || 0}" style="max-width:120px;"></div>

    <h3>👑 Division Head</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">The single person in charge of this whole division. The default role here is auto-conferred to them.</div>
    <div class="ax-editor-row"><label>Head user</label><select id="d-head-user"></select></div>
    <div class="ax-editor-row"><label>Default role</label><select id="d-head-role"></select></div>

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
    <div class="ax-editor-row"><label title="The single tangible thing this department produces and ships out.">Valuable Final Product</label><input id="dep-vfp" value="${escapeHtml(dep.valuable_final_product || '')}" placeholder="The tangible thing this department produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="dep-desc">${escapeHtml(dep.description || '')}</textarea></div>
    <div class="ax-editor-row"><label>Sort order</label><input id="dep-sort" type="number" value="${dep.sort_order || 0}" style="max-width:120px;"></div>

    <h3>🎩 Department Head</h3>
    <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;">The single person in charge of this department. The default role here is auto-conferred to them.</div>
    <div class="ax-editor-row"><label>Head user</label><select id="dep-head-user"></select></div>
    <div class="ax-editor-row"><label>Default role</label><select id="dep-head-role"></select></div>

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
    <div class="ax-editor-row"><label title="The single tangible thing this post produces and ships out.">Valuable Final Product</label><input id="po-vfp" value="${escapeHtml(po.valuable_final_product || '')}" placeholder="The tangible thing this post produces and ships"></div>
    <div class="ax-editor-row"><label>Description</label><textarea id="po-desc">${escapeHtml(po.description || '')}</textarea></div>
    <div class="ax-editor-row"><label title="Whoever holds this post automatically receives this role's permissions.">Default role</label><select id="po-role">${roleOpts}</select></div>
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

// ═══════════════════════════════════════════════════════════════════════
// INVITE MODAL — guided, with quick presets and live permission preview
// ═══════════════════════════════════════════════════════════════════════
function openInviteModal(prefillFromUid) {
  // Hardcoded quick-pick presets: each is { label, emoji, role_slugs[], is_admin }
  // These map to roles that may or may not exist in the system; missing roles
  // are silently skipped at apply time.
  const PRESETS = [
    { key: 'coach',      emoji: '🎓', label: 'Coach',          desc: 'Music Education delivery',   role_slugs: ['coach'] },
    { key: 'sales',      emoji: '💼', label: 'Sales Rep',      desc: 'Calls + closes',             role_slugs: ['sales'] },
    { key: 'mentorship', emoji: '🧑‍🏫', label: 'Mentorship I/C', desc: 'Mentorship oversight',    role_slugs: ['ms_ic'] },
    { key: 'delivery',   emoji: '📦', label: 'Delivery I/C',   desc: 'Delivery + production',      role_slugs: ['delivery_ic'] },
    { key: 'marketing',  emoji: '📢', label: 'Marketing',      desc: 'Ads / funnels / creative',   role_slugs: ['marketing'] },
    { key: 'finance',    emoji: '💰', label: 'Finance',        desc: 'Income + disbursements',     role_slugs: ['finance'] },
    { key: 'admin',      emoji: '⚙️', label: 'Admin',          desc: 'Wildcard — full access',     role_slugs: [], is_admin: true },
  ];

  // If we were asked to prefill from another user, grab their roles/admin.
  const sourceUser = prefillFromUid ? usersData.find(u => u.id === prefillFromUid) : null;
  const prefillRoleIds = new Set(sourceUser?.role_ids || []);
  const prefillIsAdmin = !!sourceUser?.is_admin;

  // Build role grid grouped — role name + tiny dot + perm count hover.
  const roleByPermCount = {};
  for (const rp of rolePerms) (roleByPermCount[rp.role_id] = (roleByPermCount[rp.role_id] || 0) + 1);
  const roleGrid = roles.map(r => {
    const isOn = prefillRoleIds.has(r.id);
    const permCount = roleByPermCount[r.id] || 0;
    const permList = rolePerms.filter(rp => rp.role_id === r.id).map(rp => rp.permission_key).slice(0, 12).join(', ');
    const moreCount = Math.max(0, permCount - 12);
    const tooltip = permList ? permList + (moreCount ? ` … (+${moreCount} more)` : '') : 'No permissions yet';
    return `<label class="invite-role-chip ${isOn ? 'on' : ''}" data-rid="${r.id}" data-slug="${escapeHtml(r.slug)}" title="${escapeHtml(tooltip)}">
      <input type="checkbox" ${isOn ? 'checked' : ''}>
      <span class="role-chip-dot" style="background:${r.color}"></span>
      <span class="invite-role-name">${escapeHtml(r.name)}</span>
      <span class="invite-role-count">${permCount}</span>
    </label>`;
  }).join('');

  // Build "copy from user" dropdown — only show users with at least one role / admin
  const copyableUsers = usersData.filter(u => u.is_admin || u.role_ids.length).sort((a, b) => (_displayOf(a.id) || '').localeCompare(_displayOf(b.id) || ''));
  const copyFromHtml = copyableUsers.map(u => `<option value="${u.id}" ${u.id === prefillFromUid ? 'selected' : ''}>${escapeHtml(_displayOf(u.id))} ${u.is_admin ? '(admin)' : `(${u.role_ids.length} role${u.role_ids.length === 1 ? '' : 's'})`}</option>`).join('');

  const presetHtml = PRESETS.map(p => `<button type="button" class="invite-preset" data-key="${p.key}" title="${escapeHtml(p.desc)}"><span class="invite-preset-emoji">${p.emoji}</span><span>${escapeHtml(p.label)}</span></button>`).join('');

  showModal(`
    <div class="invite-modal">
      <div class="invite-header">
        <h3>✉️ Invite a new user</h3>
        <span class="invite-subtitle">They'll get an email with an activation link. Roles you pick now apply automatically when they sign in for the first time.</span>
      </div>

      <div class="invite-section">
        <label class="invite-label">Recipients <span class="invite-required">*</span> <span class="invite-hint">(one row per person · press Enter to add the next)</span></label>
        <div id="i-recipients" class="invite-recipients"></div>
        <button class="invite-add-row" id="i-add-row" type="button">+ Add another recipient</button>
        <span class="invite-hint" id="i-email-count" style="color:var(--text-dim);margin-top:6px;">0 valid recipients</span>
      </div>

      <div class="invite-section">
        <label class="invite-label">Copy roles from existing user <span class="invite-hint">(optional)</span></label>
        <select id="i-copy-from"><option value="">— None —</option>${copyFromHtml}</select>
      </div>

      <div class="invite-section">
        <label class="invite-label">Quick presets <span class="invite-hint">(adds the matching role · click again to toggle)</span></label>
        <div class="invite-presets">${presetHtml}</div>
      </div>

      <div class="invite-section">
        <label class="invite-label">Roles <span class="invite-hint">(hover any chip for what it grants)</span></label>
        <div class="invite-roles" id="i-roles">${roleGrid}</div>
      </div>

      <div class="invite-section invite-admin-row ${prefillIsAdmin ? 'warn' : ''}">
        <label class="invite-admin-toggle">
          <input type="checkbox" id="i-is-admin" ${prefillIsAdmin ? 'checked' : ''}>
          <span class="invite-admin-text">
            <strong>⚙️ Make admin</strong>
            <em>Wildcard access to everything — including Access &amp; Org itself. Use sparingly.</em>
          </span>
        </label>
      </div>

      <div class="invite-section invite-preview">
        <div class="invite-preview-label">📋 When they activate, they'll get:</div>
        <div class="invite-preview-body" id="i-preview">—</div>
      </div>

      <div class="invite-actions">
        <button class="btn-primary invite-send-btn" id="i-send">Send invite</button>
        <button class="btn-ghost" id="i-cancel">Cancel</button>
        <span class="ax-msg" id="i-msg"></span>
      </div>
    </div>
  `, { wide: true });

  // ── Wire everything ──────────────────────────────────────────────────
  const roleEl = document.getElementById('i-roles');
  const adminEl = document.getElementById('i-is-admin');
  const previewEl = document.getElementById('i-preview');

  function selectedRoleIds() {
    return [...roleEl.querySelectorAll('input:checked')].map(cb => Number(cb.closest('[data-rid]').dataset.rid));
  }
  function refreshPreview() {
    const rids = selectedRoleIds();
    const isAdmin = adminEl.checked;
    if (isAdmin) {
      previewEl.innerHTML = '<span style="color:#fbbf24;font-weight:700;">⚙️ Full admin access</span> — every dashboard, every action.';
      document.querySelector('.invite-admin-row').classList.add('warn');
      return;
    }
    document.querySelector('.invite-admin-row').classList.remove('warn');
    if (!rids.length) {
      previewEl.innerHTML = '<span style="color:var(--text-dim);font-style:italic;">No roles selected — they\'ll have no access yet. Add at least one role above.</span>';
      return;
    }
    // Aggregate distinct permissions across selected roles
    const perms = new Set();
    for (const rid of rids) for (const rp of rolePerms) if (rp.role_id === rid) perms.add(rp.permission_key);
    // Group by dashboard
    const grouped = {};
    for (const k of perms) { const d = k.split('.')[0]; (grouped[d] ||= []).push(k.split('.').slice(1).join('.')); }
    const rolesPicked = rids.map(rid => roles.find(r => r.id === rid)).filter(Boolean);
    const roleChips = rolesPicked.map(r => `<span class="pill" style="background:${r.color}22;color:${r.color};border:1px solid ${r.color}55;">${escapeHtml(r.name)}</span>`).join(' ');
    const dashChips = Object.keys(grouped).sort().map(d => `<div class="invite-preview-dash"><strong>${escapeHtml(d)}:</strong> ${grouped[d].slice(0,8).map(a => `<span class="pill pill-on">${escapeHtml(a)}</span>`).join('')} ${grouped[d].length > 8 ? `<span style="color:var(--text-dim);font-size:0.7rem;">+${grouped[d].length - 8} more</span>` : ''}</div>`).join('');
    previewEl.innerHTML = `<div style="margin-bottom:6px;">${roleChips}</div>${dashChips}<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">${perms.size} total permission${perms.size === 1 ? '' : 's'} across ${Object.keys(grouped).length} dashboard${Object.keys(grouped).length === 1 ? '' : 's'}.</div>`;
  }

  // Role chip toggle (click anywhere on the label)
  roleEl.querySelectorAll('.invite-role-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      // Let the actual checkbox click bubble naturally; only handle clicks on the label background
      if (e.target.tagName === 'INPUT') { setTimeout(() => { chip.classList.toggle('on', chip.querySelector('input').checked); refreshPreview(); }, 0); return; }
      const cb = chip.querySelector('input');
      cb.checked = !cb.checked;
      chip.classList.toggle('on', cb.checked);
      refreshPreview();
    });
  });

  // Preset buttons
  document.querySelectorAll('.invite-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PRESETS.find(p => p.key === btn.dataset.key);
      if (!preset) return;
      if (preset.is_admin) {
        adminEl.checked = !adminEl.checked;
        refreshPreview();
        return;
      }
      // Toggle each role in the preset
      for (const slug of preset.role_slugs) {
        const chip = roleEl.querySelector(`.invite-role-chip[data-slug="${slug}"]`);
        if (!chip) continue;
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('on', cb.checked);
      }
      refreshPreview();
    });
  });

  // Copy-from-user dropdown
  document.getElementById('i-copy-from').addEventListener('change', e => {
    const uid = e.target.value;
    const src = uid ? usersData.find(u => u.id === uid) : null;
    const wantIds = new Set(src?.role_ids || []);
    roleEl.querySelectorAll('.invite-role-chip').forEach(chip => {
      const on = wantIds.has(Number(chip.dataset.rid));
      chip.querySelector('input').checked = on;
      chip.classList.toggle('on', on);
    });
    adminEl.checked = !!src?.is_admin;
    refreshPreview();
  });

  // Admin toggle
  adminEl.addEventListener('change', refreshPreview);

  document.getElementById('i-cancel').addEventListener('click', closeModal);

  // ── Row-based recipient editor ────────────────────────────────────
  // Each row = one invitee with its own first name + email. Pressing Enter
  // in the email field of the last row auto-adds another row. Pasting a
  // blob of emails into any email field auto-splits into rows.
  const recipientsEl = document.getElementById('i-recipients');
  const countEl = document.getElementById('i-email-count');
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  function makeRow(initial = { name: '', email: '' }) {
    const row = document.createElement('div');
    row.className = 'invite-recipient-row';
    row.innerHTML = `
      <input class="invite-r-name"  placeholder="First name (optional)" autocomplete="off" value="${escapeHtml(initial.name || '')}">
      <input class="invite-r-email" type="email" placeholder="email@ridleyacademy.team" autocomplete="off" value="${escapeHtml(initial.email || '')}">
      <button class="invite-r-remove" type="button" title="Remove this recipient">×</button>`;
    const emailIn = row.querySelector('.invite-r-email');
    const nameIn  = row.querySelector('.invite-r-name');
    const remove  = row.querySelector('.invite-r-remove');
    emailIn.addEventListener('input', refreshRowsState);
    nameIn.addEventListener('input', refreshRowsState);
    // Enter on email field → add another row (or focus existing next one).
    emailIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const allRows = [...recipientsEl.querySelectorAll('.invite-recipient-row')];
        const idx = allRows.indexOf(row);
        const next = allRows[idx + 1];
        if (next) next.querySelector('.invite-r-name').focus();
        else addRow().querySelector('.invite-r-name').focus();
      }
    });
    // Tab on email field of the LAST row → add a new row and tab into it.
    emailIn.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const allRows = [...recipientsEl.querySelectorAll('.invite-recipient-row')];
      if (allRows[allRows.length - 1] !== row) return;
      if (!emailIn.value.trim()) return; // only if user typed something
      e.preventDefault();
      addRow().querySelector('.invite-r-name').focus();
    });
    // Paste a blob → split into rows.
    emailIn.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (!/[\n,;]/.test(text)) return; // single email — let it paste normally
      e.preventDefault();
      const parsed = parseBlob(text);
      if (!parsed.length) return;
      // First parsed pair fills this row, the rest get new rows.
      emailIn.value = parsed[0].email;
      if (parsed[0].name && !nameIn.value) nameIn.value = parsed[0].name;
      for (let i = 1; i < parsed.length; i++) addRow(parsed[i]);
      refreshRowsState();
    });
    remove.addEventListener('click', () => {
      const allRows = [...recipientsEl.querySelectorAll('.invite-recipient-row')];
      if (allRows.length <= 1) { nameIn.value = ''; emailIn.value = ''; refreshRowsState(); return; }
      row.remove();
      refreshRowsState();
    });
    recipientsEl.appendChild(row);
    refreshRowsState();
    return row;
  }
  function addRow(initial) { return makeRow(initial); }

  // Parse a pasted blob into recipient pairs. Supports the same syntaxes the
  // textarea used to, so users can still paste in bulk.
  function parseBlob(blob) {
    const lines = (blob || '').split(/[\n\r]+/g).map(s => s.trim()).filter(Boolean);
    const out = []; const seen = new Set();
    for (const line of lines) {
      const hasAngle = /<[^>]+>/.test(line);
      const tokens = hasAngle ? [line] : line.split(/[,;]/g).map(t => t.trim()).filter(Boolean);
      for (const tok of tokens) {
        let name = '', email = '';
        const angle = tok.match(/^(.*?)<\s*([^>\s]+)\s*>\s*$/);
        if (angle) { name = angle[1].trim().replace(/^["']|["']$/g, ''); email = angle[2].trim().toLowerCase(); }
        else {
          const m = tok.match(/^(.*?)[\s,]+([^\s,]+)$/);
          if (m && isEmail(m[2])) { name = m[1].trim().replace(/^["']|["']$/g, ''); email = m[2].toLowerCase(); }
          else if (isEmail(tok)) { email = tok.toLowerCase(); }
        }
        if (!isEmail(email) || seen.has(email)) continue;
        seen.add(email); out.push({ name, email });
      }
    }
    return out;
  }

  function gatherRecipients() {
    const rows = [...recipientsEl.querySelectorAll('.invite-recipient-row')];
    const out = []; const seen = new Set();
    for (const row of rows) {
      const name = row.querySelector('.invite-r-name').value.trim();
      const email = row.querySelector('.invite-r-email').value.trim().toLowerCase();
      if (!isEmail(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email); out.push({ name, email });
    }
    return out;
  }

  function refreshRowsState() {
    const list = gatherRecipients();
    countEl.textContent = list.length + ' valid recipient' + (list.length === 1 ? '' : 's');
    countEl.style.color = list.length ? 'var(--accent)' : 'var(--text-dim)';
    // Show / hide remove buttons: hide × on the only row when both fields are empty.
    const rows = [...recipientsEl.querySelectorAll('.invite-recipient-row')];
    if (rows.length === 1) rows[0].querySelector('.invite-r-remove').style.visibility = 'hidden';
    else rows.forEach(r => r.querySelector('.invite-r-remove').style.visibility = 'visible');
  }

  // Start with one empty row.
  addRow();
  document.getElementById('i-add-row').addEventListener('click', () => {
    addRow().querySelector('.invite-r-name').focus();
  });

  document.getElementById('i-send').addEventListener('click', async () => {
    const msg = document.getElementById('i-msg');
    const sendBtn = document.getElementById('i-send');
    const recipients = gatherRecipients();
    if (!recipients.length) {
      msg.className = 'ax-msg err'; msg.textContent = 'Please add at least one recipient with a valid email.';
      return;
    }
    const selectedRoles = selectedRoleIds();
    const is_admin = adminEl.checked;
    if (!is_admin && !selectedRoles.length && !confirm('No roles selected — these invitees will have no access at first. Send anyway?')) {
      msg.className = 'ax-msg'; msg.textContent = '';
      return;
    }
    const legacyPerms = [...new Set(selectedRoles.map(rid => roles.find(r => r.id === rid)?.slug).filter(Boolean))];

    sendBtn.disabled = true;
    let ok = 0, failed = 0; const failures = [];
    for (let i = 0; i < recipients.length; i++) {
      const { name, email } = recipients[i];
      const first_name = (name || '').trim().split(/\s+/)[0] || '';
      msg.className = 'ax-msg'; msg.textContent = `Sending ${i + 1} / ${recipients.length}: ${name ? name + ' · ' : ''}${email}…`;
      try {
        const r = await fetch(INVITE_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ email, first_name, permissions: legacyPerms, is_admin }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { failed++; failures.push({ email, error: j.error || ('HTTP ' + r.status) }); }
        else { ok++; }
      } catch (e) { failed++; failures.push({ email, error: e.message || String(e) }); }
    }
    sendBtn.disabled = false;
    if (failed === 0) {
      msg.className = 'ax-msg ok'; msg.textContent = `✓ Sent ${ok} invite${ok === 1 ? '' : 's'}`;
      setTimeout(() => { closeModal(); loadUsersTab(); }, 900);
    } else {
      msg.className = 'ax-msg err';
      msg.innerHTML = `Sent ${ok}, failed ${failed}.<br><small style="color:var(--text-dim);">${failures.map(f => `<strong>${escapeHtml(f.email)}</strong>: ${escapeHtml(f.error)}`).join('<br>')}</small>`;
    }
  });

  refreshPreview();
}

// ═══════════════════════════════════════════════════════════════════════
// REP MAPPING — merged into the User editor (v246)
// repMapProfiles and repMapUnassigned are loaded by refreshAll.
// ═══════════════════════════════════════════════════════════════════════

async function refreshRepMapData() {
  const [repRes, unassignedRes] = await Promise.all([
    api('?api=rep-mappings').catch(() => ({ profiles: [], users: [] })),
    adminApi('?api=unassigned-names').catch(() => null),
  ]);
  repMapProfiles = repRes.profiles || [];
  repMapUnassigned = unassignedRes || { allCallsReps: [], unassignedCallsReps: [], unassignedAffiliates: [] };
}

// Set / upsert a rep-mapping row. Called from the inline user-editor form.
async function setRepMapping(callsName, salesAffiliates, userId) {
  await api('?api=set-rep-mapping', { method: 'POST', body: { callsName, salesAffiliates, userId: userId || null } });
  await refreshRepMapData();
}

async function deleteRepMappingById(id) {
  await api('?api=delete-rep-mapping', { method: 'POST', body: { id: Number(id) } });
  await refreshRepMapData();
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY TAB
// ═══════════════════════════════════════════════════════════════════════
const ACT_LABELS = {
  'declaration.create':      { icon: '📝', label: 'created declaration' },
  'declaration.update':      { icon: '✏️', label: 'edited declaration' },
  'declaration.delete':      { icon: '🗑️', label: 'deleted declaration' },
  'declaration.auto_assign': { icon: '🤖', label: 'auto-assigned declarations' },
  'declaration.auto_import': { icon: '🤖', label: 'auto-imported declarations' },
  'user.invite':             { icon: '✉️', label: 'invited' },
  'user.delete':             { icon: '🗑️', label: 'deleted user' },
  'user.permissions_change': { icon: '🔐', label: 'changed permissions for' },
  'user.force_logout':       { icon: '🚪', label: 'force-logged-out' },
  'rep_mapping.set':         { icon: '🧩', label: 'updated rep mapping' },
  'rep_mapping.delete':      { icon: '🧩', label: 'deleted rep mapping' },
  'dashboard.archive':       { icon: '📦', label: 'archived dashboard' },
  'dashboard.unarchive':     { icon: '📦', label: 'unarchived dashboard' },
};

async function loadActivityTab() {
  const list = document.getElementById('activityList');
  list.innerHTML = '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem;">Loading…</div>';
  const action = document.getElementById('actActionFilter').value;
  const search = document.getElementById('actSearch').value.trim();
  const params = new URLSearchParams({ api: 'activity', limit: '200' });
  if (action) params.set('action', action);
  if (search) params.set('q', search);
  try {
    const j = await adminApi('?' + params.toString());
    const rows = j.rows || [];
    if (!rows.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.84rem;">No activity found.</div>'; return; }
    list.innerHTML = rows.map(r => {
      const meta = ACT_LABELS[r.action] || { icon: '•', label: r.action };
      const when = new Date(r.created_at);
      const whenStr = isNaN(when.getTime()) ? '' : when.toLocaleString();
      const target = r.target_id ? `<span class="act-target">${escapeHtml(String(r.target_id))}</span>` : '';
      const details = r.details ? `<div class="act-details">${escapeHtml(JSON.stringify(r.details).slice(0, 200))}</div>` : '';
      return `<div class="act-row">
        <span class="act-icon">${meta.icon}</span>
        <div class="act-body">
          <span class="act-actor">${escapeHtml(r.actor_email || r.actor_id || 'system')}</span>
          <span class="act-verb">${escapeHtml(meta.label)}</span>
          ${target}
          ${details}
        </div>
        <span class="act-when">${escapeHtml(whenStr)}</span>
      </div>`;
    }).join('');
  } catch (e) { list.innerHTML = `<div style="padding:14px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`; }
}

document.getElementById('activityRefreshBtn')?.addEventListener('click', loadActivityTab);
document.getElementById('actActionFilter')?.addEventListener('change', loadActivityTab);
let _actSearchTimer;
document.getElementById('actSearch')?.addEventListener('input', () => {
  clearTimeout(_actSearchTimer); _actSearchTimer = setTimeout(loadActivityTab, 350);
});

// ═══════════════════════════════════════════════════════════════════════
// SESSIONS TAB
// ═══════════════════════════════════════════════════════════════════════
async function loadSessionsTab() {
  const list = document.getElementById('sessionsList');
  list.innerHTML = '<div style="padding:14px;color:var(--text-dim);font-size:0.84rem;">Loading…</div>';
  try {
    const j = await adminApi('?api=sessions');
    const rows = j.rows || [];
    if (!rows.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.84rem;">No recent sessions.</div>'; return; }
    list.innerHTML = rows.map(s => {
      const initial = (s.first_name || s.email || '?').slice(0, 1).toUpperCase();
      const display = (s.first_name && s.first_name.trim()) ? s.first_name.trim() : s.email;
      const last = s.last_sign_in_at ? new Date(s.last_sign_in_at) : null;
      const lastStr = last && !isNaN(last.getTime()) ? last.toLocaleString() : '—';
      return `<div class="sess-row" data-uid="${s.id}">
        <span class="sess-av">${escapeHtml(initial)}</span>
        <div>
          <div class="sess-name">${escapeHtml(display)}${s.is_admin ? ' <span class="pill pill-admin">Admin</span>' : ''}</div>
          <div class="sess-email">${escapeHtml(s.email || '')}</div>
        </div>
        <span class="sess-when">Last sign-in: ${escapeHtml(lastStr)}</span>
        <button class="small-btn sess-logout" data-uid="${s.id}" data-email="${escapeHtml(s.email || '')}" style="color:var(--red);border-color:rgba(248,113,113,.3);">Force logout</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.sess-logout').forEach(btn => btn.addEventListener('click', () => forceLogoutUser(btn)));
  } catch (e) { list.innerHTML = `<div style="padding:14px;color:var(--red);font-size:0.84rem;">${escapeHtml(e.message)}</div>`; }
}

async function forceLogoutUser(btn) {
  if (!confirm(`Force ${btn.dataset.email} to sign out? Their refresh tokens will be revoked.`)) return;
  btn.disabled = true; btn.textContent = 'Revoking…';
  try {
    await adminApi('?api=force-logout', { method: 'POST', body: { userId: btn.dataset.uid } });
    btn.textContent = '✓ Revoked';
    setTimeout(loadSessionsTab, 700);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Force logout';
    alert(e.message);
  }
}

document.getElementById('sessionsRefreshBtn')?.addEventListener('click', loadSessionsTab);
