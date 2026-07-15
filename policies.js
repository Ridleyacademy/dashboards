/* Policies & Orders dashboard.
 * Central repository over the existing org_policies table (scope_type +
 * scope_id, kind policy|order). Reuses the access-control endpoints:
 *   ?api=policies                → list every policy/order (any authed user)
 *   ?api=divisions|departments|posts (org.view) → resolve scope names + pickers
 *   org-policy-write ?api=create|update|delete — creator-based model:
 *     anyone creates their own; only the creator (or an admin) edits/deletes.
 * Scope names + creator are joined client-side; no backend changes.
 */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Rich-text body: stored as HTML. Helpers to detect/plainify/sanitize it.
  const looksHtml = s => /<[a-z][\s\S]*>/i.test(String(s || ''));
  const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = String(h || ''); return d.textContent || ''; };
  // Body HTML for rendering: sanitized HTML, or plain text with line breaks.
  const bodyHtml = s => looksHtml(s) ? sanitizeHtml(s) : esc(s || '').replace(/\n/g, '<br>');
  // Whitelist sanitizer (defence in depth — content comes from our own toolbar +
  // plain-text paste, but old rows / pastes are still cleaned on render).
  function sanitizeHtml(html) {
    const ALLOW = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, DIV: 1, P: 1, UL: 1, OL: 1, LI: 1, SPAN: 1, H3: 1, H4: 1, A: 1 };
    const doc = new DOMParser().parseFromString('<div id="_r">' + String(html || '') + '</div>', 'text/html');
    const root = doc.getElementById('_r');
    const clean = (node) => {
      for (const ch of [...node.childNodes]) {
        if (ch.nodeType === 3) continue;
        if (ch.nodeType !== 1) { ch.remove(); continue; }
        clean(ch);
        if (!ALLOW[ch.tagName]) { while (ch.firstChild) node.insertBefore(ch.firstChild, ch); ch.remove(); continue; }
        for (const a of [...ch.attributes]) {
          if (a.name === 'style') { const ta = (ch.style.textAlign || '').toLowerCase(); ch.removeAttribute('style'); if (['center', 'right', 'left', 'justify'].includes(ta)) ch.style.textAlign = ta; }
          else if (ch.tagName === 'A' && a.name === 'href') { const h = ch.getAttribute('href') || ''; if (/^https?:|^mailto:/i.test(h)) { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener'); } else ch.removeAttribute('href'); }
          else ch.removeAttribute(a.name);
        }
      }
    };
    clean(root);
    return root.innerHTML;
  }
  const KIND = { policy: 'Policy', order: 'Order' };

  let session = null, isAdmin = false;
  // Anyone can create; only the creator (or an admin) can edit/delete a policy.
  const canEditPolicy = p => isAdmin || !!(session && p && p.created_by === session.user.id);
  let divisions = [], departments = [], posts = [];
  let divById = {}, depById = {}, postById = {}, execById = {}, userById = {};
  let policies = [];
  const view = { search: '', kind: '', division: '', series: '', level: '', sort: 'new' };

  async function ac(path, opts = {}) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/access-control' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  // Policy writes (create/update/delete) go through org-policy-write, which
  // enforces the creator-based model (any user creates; creator/admin edits).
  async function pw(path, opts = {}) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/org-policy-write' + path, {
      method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  // Series display + helpers. e.g. "Coaching Series 1".
  const seriesLabel = p => (p.series_name ? p.series_name + ' Series' + (p.series_number != null ? ' ' + p.series_number : '') : '');
  const seriesNames = () => [...new Set(policies.map(p => p.series_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function nextSeriesNumber(name) { const n = String(name || '').trim().toLowerCase(); let max = 0; policies.forEach(p => { if ((p.series_name || '').trim().toLowerCase() === n && Number(p.series_number) > max) max = Number(p.series_number); }); return max + 1; }
  // Resolve a concerns item ({type:division|department|post,id} | {type:text,label}) to a display name.
  function concernLabel(it) {
    if (!it) return '';
    if (it.type === 'text') return it.label || '';
    if (it.type === 'division') return divById[it.id]?.name || ('Division #' + it.id);
    if (it.type === 'department') return depById[it.id]?.name || ('Department #' + it.id);
    if (it.type === 'post') return postById[it.id]?.name || ('Post #' + it.id);
    return '';
  }
  // The concerned list for a policy: its explicit concerns, else the scope path.
  function concernedItems(p) {
    if (Array.isArray(p.concerns) && p.concerns.length) return p.concerns.map(concernLabel).filter(Boolean);
    return p._parts;
  }

  const friendly = email => { const l = String(email || '').split('@')[0] || 'Someone'; return l.charAt(0).toUpperCase() + l.slice(1); };
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const letterDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const isExpired = p => p.expires_at && new Date(p.expires_at).getTime() < Date.now();
  // Revision suffix: 0 → none, 1 → "R", n → "R{n-1}" (R itself means one revision).
  const revSuffix = n => { n = Number(n) || 0; return n <= 0 ? '' : n === 1 ? ' R' : ' R' + (n - 1); };
  // Author's name + the post they hold (regular post first, else exec post).
  function authorInfo(p) {
    const u = userById[p.created_by];
    const name = (u && u.first_name) || friendly(p.created_by_email);
    let post = '';
    if (u) {
      const pid = (u.post_ids || [])[0];
      if (pid != null && postById[pid]) post = postById[pid].name;
      else { const eid = (u.exec_post_ids || [])[0]; if (eid != null && execById[eid]) post = execById[eid].name; }
    }
    return { name, post };
  }

  // Division › Department › Post path for a policy's scope.
  function scopeInfo(p) {
    const parts = []; let divisionId = null;
    if (p.scope_type === 'division') { const d = divById[p.scope_id]; if (d) { parts.push(d.name); divisionId = d.id; } }
    else if (p.scope_type === 'department') { const dep = depById[p.scope_id]; if (dep) { const d = divById[dep.division_id]; if (d) { parts.push(d.name); divisionId = d.id; } parts.push(dep.name); } }
    else if (p.scope_type === 'post') { const po = postById[p.scope_id]; if (po) { const dep = depById[po.department_id]; if (dep) { const d = divById[dep.division_id]; if (d) { parts.push(d.name); divisionId = d.id; } parts.push(dep.name); } parts.push(po.name); } }
    if (!parts.length) parts.push((p.scope_type || '?') + ' #' + (p.scope_id ?? '—'));
    return { parts, divisionId, text: parts.join(' › ') };
  }

  function enrich() {
    policies.forEach(p => { const s = scopeInfo(p); p._parts = s.parts; p._divId = s.divisionId; p._scopeText = s.text; p._author = friendly(p.created_by_email); p._concernsText = (Array.isArray(p.concerns) ? p.concerns.map(concernLabel) : []).join(' '); p._seriesText = seriesLabel(p); p._bodyText = stripHtml(p.body); });
  }

  function _apply() {
    const q = view.search.trim().toLowerCase();
    let rows = policies.filter(p => {
      if (view.kind && p.kind !== view.kind) return false;
      if (view.division && String(p._divId) !== view.division) return false;
      if (view.series && p.series_name !== view.series) return false;
      if (view.level && p.scope_type !== view.level) return false;
      if (q) {
        const hay = (p.title + ' ' + (p._bodyText || '') + ' ' + p._scopeText + ' ' + (p.created_by_email || '') + ' ' + p._author + ' ' + (p._concernsText || '') + ' ' + (p._seriesText || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const ts = d => d ? new Date(d).getTime() : 0;
    if (view.sort === 'new') rows.sort((a, b) => ts(b.created_at) - ts(a.created_at));
    else if (view.sort === 'old') rows.sort((a, b) => ts(a.created_at) - ts(b.created_at));
    else if (view.sort === 'title') rows.sort((a, b) => a.title.localeCompare(b.title));
    else if (view.sort === 'expiring') rows.sort((a, b) => (ts(a.expires_at) || Infinity) - (ts(b.expires_at) || Infinity));
    return rows;
  }

  function render() {
    const rows = _apply();
    $('polCount').textContent = rows.length + (rows.length === 1 ? ' document' : ' documents') + (policies.length !== rows.length ? ' (of ' + policies.length + ')' : '');
    const list = $('polList');
    if (!rows.length) {
      list.innerHTML = '<div class="empty">' + (policies.length ? 'No documents match your filters.' : 'No policies or orders yet. Click <b>+ New</b> to add the first one.') + '</div>';
      return;
    }
    list.innerHTML = rows.map(p => {
      const scope = p._parts.map((x, i) => (i ? '<span class="sc-sep">›</span>' : '') + esc(x)).join('');
      const preview = p._bodyText ? '<div class="pol-body-preview">' + esc(p._bodyText) + '</div>' : '';
      return `<div class="pol-card" data-id="${p.id}">
        <div class="pol-card-top">
          <span class="pol-badge ${p.kind === 'order' ? 'order' : 'policy'}">${esc(KIND[p.kind] || p.kind)}</span>
          <span class="pol-title">${esc(p.title)}</span>
          ${p.series_name ? `<span class="pol-series-badge">${esc(seriesLabel(p))}</span>` : ''}
          ${isExpired(p) ? '<span class="pol-expired">Expired</span>' : ''}
        </div>
        <div class="pol-scope">${scope}</div>
        ${preview}
        <div class="pol-meta"><span>By ${esc(p._author)}</span><span>${esc(fmtDate(p.created_at))}</span>${p.expires_at ? '<span>Expires ' + esc(fmtDate(p.expires_at)) + '</span>' : ''}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.pol-card').forEach(c => c.addEventListener('click', () => openDetail(policies.find(p => p.id == c.dataset.id))));
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  function closeModal() { const m = $('modalRoot'); m.classList.remove('open'); m.innerHTML = ''; }
  function shell(inner) { const m = $('modalRoot'); m.innerHTML = '<div class="modal">' + inner + '</div>'; m.classList.add('open'); m.querySelector('.modal-x')?.addEventListener('click', closeModal); }
  document.addEventListener('click', e => { if (e.target.id === 'modalRoot') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function openDetail(p) {
    if (!p) return;
    const auth = authorInfo(p);
    const kindWord = p.kind === 'order' ? 'Order' : 'Policy Letter';
    const items = concernedItems(p);
    const concerned = items.length ? items.map(x => `<div>${esc(x)}</div>`).join('') : '<div>—</div>';
    shell(`
      <div class="modal-head"><span class="mh-title">${esc(KIND[p.kind] || p.kind)}</span><button class="modal-x">✕</button></div>
      <div class="modal-body">
        <div class="pl-letter">
          <div class="pl-org">Ridley Academy Establishment Office</div>
          <div class="pl-sub">RAEO ${esc(kindWord)} of ${esc(letterDate(p.created_at))}${esc(revSuffix(p.revision))}</div>
          <div class="pl-distribution">${concerned}</div>
          ${p.series_name ? `<div class="pl-series">${esc(seriesLabel(p))}</div>` : ''}
          <div class="pl-title">${esc(p.title)}</div>
          <div class="pl-body">${p.body && stripHtml(p.body).trim() ? bodyHtml(p.body) : '<span style="color:var(--text-dim)">No text.</span>'}</div>
          <div class="pl-sign">
            <div class="pl-sign-name">${esc(auth.name)}</div>
            ${auth.post ? `<div class="pl-sign-post">${esc(auth.post)}</div>` : ''}
          </div>
          ${p.expires_at ? `<div class="pl-expiry${isExpired(p) ? ' over' : ''}">${isExpired(p) ? 'Expired' : 'Expires'} ${esc(fmtDate(p.expires_at))}</div>` : ''}
        </div>
      </div>
      ${canEditPolicy(p) ? `<div class="modal-foot"><span class="modal-msg"></span><button class="btn-ghost" id="dvDelete" style="color:var(--red)">Delete</button><button class="btn-primary" id="dvEdit">Edit</button></div>` : ''}`);
    if (canEditPolicy(p)) {
      $('dvEdit').addEventListener('click', () => openEdit(p));
      $('dvDelete').addEventListener('click', async () => {
        if (!confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
        try { await pw('?api=delete&id=' + p.id, { method: 'POST', body: {} }); policies = policies.filter(x => x.id !== p.id); closeModal(); render(); }
        catch (e) { $('modalRoot').querySelector('.modal-msg').textContent = e.message; $('modalRoot').querySelector('.modal-msg').classList.add('err'); }
      });
    }
  }

  // Flat, searchable index of every org unit (division/department/post) with its
  // path — feeds the concerns typeahead.
  function orgUnitIndex() {
    const out = [];
    divisions.forEach(d => out.push({ type: 'division', id: d.id, name: d.name, path: d.name }));
    departments.forEach(dep => { const d = divById[dep.division_id]; out.push({ type: 'department', id: dep.id, name: dep.name, path: (d?.name ? d.name + ' › ' : '') + dep.name }); });
    posts.forEach(po => { const dep = depById[po.department_id]; const d = dep ? divById[dep.division_id] : null; out.push({ type: 'post', id: po.id, name: po.name, path: (d?.name ? d.name + ' › ' : '') + (dep ? dep.name + ' › ' : '') + po.name }); });
    return out;
  }

  function openEdit(p) {
    const editing = !!p;
    // Concerns is the policy's connection to the org. Old policies with only a
    // scope (no concerns) are seeded from that scope so nothing is lost.
    let concernsList = (p && Array.isArray(p.concerns) && p.concerns.length) ? p.concerns.map(x => ({ ...x }))
      : (p && p.scope_type && p.scope_id ? [{ type: p.scope_type, id: p.scope_id }] : []);
    shell(`
      <div class="modal-head"><span class="mh-title">${editing ? 'Edit' : 'New policy / order'}</span><button class="modal-x">✕</button></div>
      <div class="modal-body">
        <div class="fld"><label>Type</label><select id="fKind"><option value="policy" ${!p || p.kind === 'policy' ? 'selected' : ''}>Policy — a standing rule</option><option value="order" ${p && p.kind === 'order' ? 'selected' : ''}>Order — a directive</option></select></div>
        <div class="fld">
          <label>Concerns</label>
          <div id="cChips"></div>
          <div class="cpick">
            <input id="cSearch" placeholder="Search a division, department or post — or type anything" autocomplete="off">
            <div id="cResults" class="cpick-menu"></div>
          </div>
          <div class="hint">Pick the divisions, departments or posts this concerns — that's how the policy is linked to the org (add at least one). You can also add free text (e.g. “All Staff”).</div>
        </div>
        <div class="fld">
          <label>Series <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label>
          <div class="fld-row" style="gap:8px;">
            <input id="fSeries" list="seriesList" placeholder="Series name (e.g. Coaching) — pick existing or type new" style="flex:2;" value="${esc(p?.series_name || '')}" autocomplete="off">
            <input id="fSeriesNum" type="number" min="1" placeholder="No." title="Number within the series" style="flex:0 0 96px;" value="${p?.series_number != null ? p.series_number : ''}">
          </div>
          <datalist id="seriesList">${seriesNames().map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          <div class="hint">Group related policies into a series. Shows on the letter as “&lt;name&gt; Series &lt;number&gt;”. Leave the number blank to auto-number it next in the series.</div>
        </div>
        <div class="fld"><label>Title</label><input id="fTitle" value="${esc(p?.title || '')}" placeholder="e.g. Refund approval policy"></div>
        <div class="fld"><label>Text</label>
          <div class="rt-toolbar">
            <button type="button" class="rt-btn" data-cmd="bold" title="Bold"><b>B</b></button>
            <button type="button" class="rt-btn" data-cmd="italic" title="Italic"><i>I</i></button>
            <button type="button" class="rt-btn" data-cmd="underline" title="Underline"><u>U</u></button>
            <span class="rt-sep"></span>
            <button type="button" class="rt-btn" data-cmd="justifyLeft" title="Align left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></button>
            <button type="button" class="rt-btn" data-cmd="justifyCenter" title="Center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg></button>
            <button type="button" class="rt-btn" data-cmd="justifyRight" title="Align right"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg></button>
            <span class="rt-sep"></span>
            <button type="button" class="rt-btn" data-cmd="insertUnorderedList" title="Bulleted list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg></button>
            <button type="button" class="rt-btn" data-cmd="insertOrderedList" title="Numbered list" style="font-size:0.72rem;font-weight:800;">1.</button>
            <span class="rt-sep"></span>
            <button type="button" class="rt-btn" data-cmd="removeFormat" title="Clear formatting"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 5h12"/><path d="M10 5l-1 14"/><path d="M14 5l1 8"/><line x1="15" y1="17" x2="21" y2="21"/><line x1="21" y1="17" x2="15" y2="21"/></svg></button>
          </div>
          <div id="fBody" class="rt-editor" contenteditable="true" data-ph="The full policy or order…"></div>
        </div>
        <div class="fld"><label>Expires <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label><input type="date" id="fExpires" value="${p?.expires_at ? String(p.expires_at).slice(0, 10) : ''}"><div class="hint">Leave blank for no expiry.</div></div>
      </div>
      <div class="modal-foot"><span class="modal-msg"></span><button class="btn-ghost" id="fCancel">Cancel</button><button class="btn-primary" id="fSave">${editing ? 'Save changes' : 'Create'}</button></div>`);
    // Concerns chips editor
    const renderChips = () => {
      const box = $('cChips');
      if (!concernsList.length) { box.className = 'chips-empty'; box.textContent = 'No one added yet.'; return; }
      box.className = 'chips';
      box.innerHTML = concernsList.map((it, i) => `<span class="chip${it.type === 'text' ? ' txt' : ''}">${esc(concernLabel(it))}<button data-i="${i}" title="Remove">×</button></span>`).join('');
      box.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { concernsList.splice(Number(b.dataset.i), 1); renderChips(); }));
    };
    renderChips();
    // Searchable concerns typeahead: type to filter org units, or add free text.
    const units = orgUnitIndex();
    const search = $('cSearch'), menu = $('cResults');
    let activeIdx = -1, results = [];
    const TAG = { division: 'Div', department: 'Dept', post: 'Post' };
    const addItem = (item) => { concernsList.push(item); renderChips(); search.value = ''; results = []; menu.classList.remove('open'); search.focus(); };
    const chosen = () => new Set(concernsList.filter(c => c.type !== 'text').map(c => c.type + ':' + c.id));
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const taken = chosen();
      results = (q ? units.filter(u => u.path.toLowerCase().includes(q)) : units).filter(u => !taken.has(u.type + ':' + u.id)).slice(0, 30);
      const rows = results.map((u, i) => `<div class="cpick-item${i === activeIdx ? ' active' : ''}" data-i="${i}"><span class="cpick-tag ${u.type}">${TAG[u.type]}</span><span class="cpick-name">${esc(u.name)}</span><span class="cpick-path">${esc(u.path)}</span></div>`).join('');
      const textRow = q ? `<div class="cpick-item" data-txt="1"><span class="cpick-tag text">Text</span><span class="cpick-name">Add “${esc(search.value.trim())}”</span></div>` : '';
      menu.innerHTML = (rows || (q ? '' : '<div class="cpick-none">Type to search…</div>')) + textRow;
      menu.querySelectorAll('.cpick-item[data-i]').forEach(el => el.addEventListener('mousedown', e => { e.preventDefault(); const u = results[Number(el.dataset.i)]; addItem({ type: u.type, id: u.id }); }));
      const tr = menu.querySelector('[data-txt]'); if (tr) tr.addEventListener('mousedown', e => { e.preventDefault(); addItem({ type: 'text', label: search.value.trim() }); });
      menu.classList.add('open');
    };
    search.addEventListener('focus', () => { activeIdx = -1; draw(); });
    search.addEventListener('input', () => { activeIdx = -1; draw(); });
    search.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, results.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, -1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0 && results[activeIdx]) { const u = results[activeIdx]; addItem({ type: u.type, id: u.id }); } else if (search.value.trim()) { const q = search.value.trim().toLowerCase(); const exact = results[0]; if (exact && exact.path.toLowerCase().includes(q) && results.length === 1) addItem({ type: exact.type, id: exact.id }); else addItem({ type: 'text', label: search.value.trim() }); } }
      else if (e.key === 'Escape') { menu.classList.remove('open'); }
    });
    search.addEventListener('blur', () => setTimeout(() => menu.classList.remove('open'), 150));
    // Series: auto-fill the next number when a series name is set and no number given.
    $('fSeries').addEventListener('change', () => { const nm = $('fSeries').value.trim(); if (nm && !$('fSeriesNum').value) $('fSeriesNum').value = nextSeriesNumber(nm); });
    // Rich-text body: load existing content, wire the toolbar, paste as plain text.
    const fBody = $('fBody');
    fBody.innerHTML = p?.body ? bodyHtml(p.body) : '';
    $('modalRoot').querySelectorAll('.rt-btn').forEach(btn => btn.addEventListener('mousedown', e => { e.preventDefault(); fBody.focus(); document.execCommand(btn.dataset.cmd, false, null); }));
    fBody.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    $('fCancel').addEventListener('click', closeModal);
    $('fSave').addEventListener('click', async () => {
      const msg = $('modalRoot').querySelector('.modal-msg'); msg.classList.remove('err');
      const title = $('fTitle').value.trim();
      if (!title) { msg.textContent = 'Title is required.'; msg.classList.add('err'); return; }
      // The policy links to the org via Concerns: use the first org-unit concern
      // as its scope (drives edit permissions + where it shows on the org board).
      const orgUnit = concernsList.find(it => it.type !== 'text' && it.id != null);
      if (!orgUnit) { msg.textContent = 'Add at least one division, department or post to Concerns.'; msg.classList.add('err'); return; }
      const seriesName = $('fSeries').value.trim() || null;
      const seriesNumber = seriesName ? (Number($('fSeriesNum').value) || nextSeriesNumber(seriesName)) : null;
      const body = {
        scope_type: orgUnit.type, scope_id: Number(orgUnit.id),
        kind: $('fKind').value, title, body: ($('fBody').textContent.trim() ? sanitizeHtml($('fBody').innerHTML) : ''),
        expires_at: $('fExpires').value || null,
        concerns: concernsList, series_name: seriesName, series_number: seriesNumber,
      };
      $('fSave').disabled = true; msg.textContent = 'Saving…';
      try {
        const res = editing ? await pw('?api=update&id=' + p.id, { method: 'POST', body }) : await pw('?api=create', { method: 'POST', body });
        const row = res.row;
        if (editing) { Object.assign(p, row); } else { policies.push(row); }
        enrich(); closeModal(); render();
      } catch (e) { msg.textContent = e.message; msg.classList.add('err'); $('fSave').disabled = false; }
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    const { data: { session: s } } = await _supa.auth.getSession();
    if (!s) { location.href = 'login.html?next=policies.html'; return; }
    session = s; window.session = s;
    const email = (s.user && s.user.email) || '';
    $('userAvatar').textContent = (email[0] || 'U').toUpperCase();
    $('userEmail').textContent = email;
    isAdmin = !!(window.RidleyPerms ? window.RidleyPerms.effective(s.user).is_admin : (s.user.app_metadata && s.user.app_metadata.is_admin === true));
    $('polNew').style.display = '';   // anyone signed in can create their own

    try {
      const [dv, dp, po, ex, us, pol] = await Promise.all([
        ac('?api=divisions').catch(() => ({ rows: [] })),
        ac('?api=departments').catch(() => ({ rows: [] })),
        ac('?api=posts').catch(() => ({ rows: [] })),
        ac('?api=exec-posts').catch(() => ({ rows: [] })),
        ac('?api=users').catch(() => ({ rows: [] })),
        ac('?api=policies'),
      ]);
      divisions = (dv.rows || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      departments = dp.rows || []; posts = po.rows || []; policies = pol.rows || [];
      divById = {}; divisions.forEach(d => divById[d.id] = d);
      depById = {}; departments.forEach(d => depById[d.id] = d);
      postById = {}; posts.forEach(p => postById[p.id] = p);
      execById = {}; (ex.rows || []).forEach(e => execById[e.id] = e);
      userById = {}; (us.rows || []).forEach(u => userById[u.id] = u);
      enrich();
      $('polDiv').innerHTML = '<option value="">All divisions</option>' + divisions.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
      $('polSeries').innerHTML = '<option value="">All series</option>' + seriesNames().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    } catch (e) {
      $('polList').innerHTML = '<div class="empty" style="color:var(--red)">' + esc(e.message) + '</div>';
    }
    document.body.dataset.state = 'app';
    render();
    const tid = new URLSearchParams(location.search).get('id');
    if (tid) { const p = policies.find(x => x.id == tid); if (p) openDetail(p); }
  }

  // Wiring
  $('polSearch').addEventListener('input', e => { view.search = e.target.value; render(); });
  $('polKindSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { $('polKindSeg').querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); view.kind = b.dataset.k; render(); }));
  $('polDiv').addEventListener('change', e => { view.division = e.target.value; render(); });
  $('polSeries').addEventListener('change', e => { view.series = e.target.value; render(); });
  $('polLevel').addEventListener('change', e => { view.level = e.target.value; render(); });
  $('polSort').addEventListener('change', e => { view.sort = e.target.value; render(); });
  $('polNew').addEventListener('click', () => openEdit(null));
  $('signOutBtn').addEventListener('click', async () => { await _supa.auth.signOut(); location.href = 'login.html'; });
  $('navDropdownBtn').addEventListener('click', e => { e.stopPropagation(); $('navDropdownMenu').classList.toggle('open'); });
  document.addEventListener('click', e => { const d = $('navDropdown'); if (d && !d.contains(e.target)) $('navDropdownMenu').classList.remove('open'); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
