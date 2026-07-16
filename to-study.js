/* To Study — a personal page: the policies & orders that concern you, with a
 * read-and-understood acknowledgement on each. Reuses policy-widget.js for the
 * letter reader + ack bar. Reads via org-policy-write ?api=my-policies. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  let session = null, isAdmin = false;
  let divisions = [], departments = [], posts = [], execPosts = [], users = [];
  let divById = {}, depById = {}, postById = {}, execById = {}, userById = {}, holderByPost = {};
  let myPolicies = [];

  async function ac(path) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/access-control' + path, { headers: { Authorization: 'Bearer ' + session.access_token } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
  }
  async function pw(path, opts = {}) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/org-policy-write' + path, {
      method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
  }
  const seriesLabel = p => (p.series_name ? p.series_name + ' Series' + (p.series_number != null ? ' ' + p.series_number : '') : '');
  const friendly = email => { const l = String(email || '').split('@')[0] || 'Someone'; return l.charAt(0).toUpperCase() + l.slice(1); };

  function render() {
    const todo = myPolicies.filter(p => !p.my_acknowledged_at);
    const done = myPolicies.filter(p => p.my_acknowledged_at);
    $('tsSummary').innerHTML =
      `<div class="ts-chip todo"><div class="n">${todo.length}</div><div class="l">To read</div></div>` +
      `<div class="ts-chip done"><div class="n">${done.length}</div><div class="l">Acknowledged</div></div>`;

    const card = (p, isDone) => {
      const author = (userById[p.created_by] && userById[p.created_by].first_name) || friendly(p.created_by_email);
      return `<div class="ts-card${isDone ? ' done' : ''}" data-id="${p.id}">
        <div class="ts-mark ${isDone ? 'done' : 'todo'}">${isDone ? '✓' : '!'}</div>
        <div class="ts-body">
          <div class="ts-top">
            <span class="ts-badge ${p.kind === 'order' ? 'order' : 'policy'}">${p.kind === 'order' ? 'Order' : 'Policy'}</span>
            <span class="ts-title">${esc(p.title)}</span>
            ${p.series_name ? `<span class="ts-series">${esc(seriesLabel(p))}</span>` : ''}
          </div>
          <div class="ts-meta">By ${esc(author)} · ${esc(fmtDate(p.created_at))}${isDone ? ' · read ' + esc(fmtDate(p.my_acknowledged_at)) : ''}</div>
        </div>
        ${isDone ? '' : '<span class="ts-cta">Read →</span>'}
      </div>`;
    };

    let html = '';
    if (!myPolicies.length) {
      html = '<div class="ts-empty">Nothing to study right now. Policies and orders that concern your post will appear here.</div>';
    } else {
      html += `<div class="ts-sec-h">To study${todo.length ? ' — ' + todo.length : ''}</div>`;
      html += todo.length ? todo.map(p => card(p, false)).join('') : '<div class="ts-empty" style="padding:20px">All caught up — nothing left to read. 🎉</div>';
      if (done.length) { html += `<div class="ts-sec-h">Acknowledged</div>` + done.map(p => card(p, true)).join(''); }
    }
    $('tsContent').innerHTML = html;
    document.querySelectorAll('.ts-card').forEach(el => el.addEventListener('click', () => {
      const p = myPolicies.find(x => x.id == el.dataset.id);
      if (p && window.PolicyWidget) window.PolicyWidget.openReader(p, { onChanged: reload });
    }));
  }

  async function reload() {
    try { const j = await pw('?api=my-policies'); myPolicies = j.rows || []; render(); }
    catch (e) { $('tsContent').innerHTML = `<div class="ts-empty" style="color:var(--red)">${esc(e.message)}</div>`; }
  }

  async function boot() {
    const { data: { session: s } } = await _supa.auth.getSession();
    if (!s) { location.href = 'login.html?next=to-study.html'; return; }
    session = s; window.session = s;
    const email = (s.user && s.user.email) || '';
    $('userAvatar').textContent = (email[0] || 'U').toUpperCase();
    $('userEmail').textContent = email;
    isAdmin = !!(window.RidleyPerms ? window.RidleyPerms.effective(s.user).is_admin : (s.user.app_metadata && s.user.app_metadata.is_admin === true));

    // Org data for the shared policy reader (concern names, author, scope).
    try {
      const [dv, dp, po, ex, us, ph] = await Promise.all([
        ac('?api=divisions').catch(() => ({ rows: [] })),
        ac('?api=departments').catch(() => ({ rows: [] })),
        ac('?api=posts').catch(() => ({ rows: [] })),
        ac('?api=exec-posts').catch(() => ({ rows: [] })),
        ac('?api=users').catch(() => ({ rows: [] })),
        ac('?api=post-holders').catch(() => ({ rows: [] })),
      ]);
      divisions = dv.rows || []; departments = dp.rows || []; posts = po.rows || []; execPosts = ex.rows || []; users = us.rows || [];
      divById = {}; divisions.forEach(d => divById[d.id] = d);
      depById = {}; departments.forEach(d => depById[d.id] = d);
      postById = {}; posts.forEach(p => postById[p.id] = p);
      execById = {}; execPosts.forEach(e => execById[e.id] = e);
      userById = {}; users.forEach(u => userById[u.id] = u);
      holderByPost = {};
      (ph.rows || []).forEach(r => { if (r.ended_at || holderByPost[r.post_id]) return; const u = userById[r.user_id]; holderByPost[r.post_id] = (u && (u.first_name || u.name)) ? (u.first_name || u.name) : (u && u.email ? u.email.split('@')[0] : null); });
    } catch (_) {}

    if (window.PolicyWidget) window.PolicyWidget.init({
      supabaseUrl: SUPABASE_URL,
      getToken: () => session.access_token,
      isAdmin: () => isAdmin,
      userId: () => session && session.user && session.user.id,
      divisions: () => divisions,
      departments: () => departments,
      posts: () => posts,
      execPosts: () => execPosts,
      users: () => users,
      allPolicies: () => myPolicies,
      postHolderName: (postId) => holderByPost[postId] || null,
    });

    document.body.dataset.state = 'app';
    await reload();
  }

  // Chrome wiring
  $('signOutBtn').addEventListener('click', async () => { await _supa.auth.signOut(); location.href = 'login.html'; });
  $('navDropdownBtn').addEventListener('click', e => { e.stopPropagation(); $('navDropdownMenu').classList.toggle('open'); });
  document.addEventListener('click', e => { const d = $('navDropdown'); if (d && !d.contains(e.target)) $('navDropdownMenu').classList.remove('open'); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
