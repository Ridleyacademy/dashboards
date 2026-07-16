/* policy-widget.js — shared Policy/Order reader + builder.
 * The SAME letter-format reader and rich builder used by the Policies & Orders
 * dashboard, packaged as a drop-in widget so the Org Board (and any page) can
 * open/create/edit policies identically. Self-contained: injects its own CSS +
 * modal overlay (pw- prefixed, no collisions), gets data via an injected
 * context, and writes through org-policy-write (creator-based model).
 *
 *   PolicyWidget.init(ctx)                         once per page
 *   PolicyWidget.openReader(policy, { onChanged }) letter view (+ Edit/Delete)
 *   PolicyWidget.openEditor({ policy, scope, seedConcerns, onSaved, onDeleted })
 *
 * ctx = { supabaseUrl, getToken(), isAdmin(), userId(),
 *         divisions(), departments(), posts(), execPosts(), users(),
 *         allPolicies()?  }  // allPolicies is optional (series suggestions)
 */
window.PolicyWidget = (function () {
  let ctx = null, styled = false;
  const KIND = { policy: 'Policy', order: 'Order' };

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const looksHtml = s => /<[a-z][\s\S]*>/i.test(String(s || ''));
  const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = String(h || ''); return d.textContent || ''; };
  const bodyHtml = s => looksHtml(s) ? sanitizeHtml(s) : esc(s || '').replace(/\n/g, '<br>');
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

  const friendly = email => { const l = String(email || '').split('@')[0] || 'Someone'; return l.charAt(0).toUpperCase() + l.slice(1); };
  const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const letterDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const isExpired = p => p.expires_at && new Date(p.expires_at).getTime() < Date.now();
  const revSuffix = n => { n = Number(n) || 0; return n <= 0 ? '' : n === 1 ? ' R' : ' R' + (n - 1); };
  const seriesLabel = p => (p.series_name ? p.series_name + ' Series' + (p.series_number != null ? ' ' + p.series_number : '') : '');

  // ── Lookups (rebuilt on demand from the injected context) ─────────────────
  const idx = arr => { const m = {}; (arr || []).forEach(x => m[x.id] = x); return m; };
  const divById = () => idx(ctx.divisions());
  const depById = () => idx(ctx.departments());
  const postById = () => idx(ctx.posts());
  const execById = () => idx(ctx.execPosts ? ctx.execPosts() : []);
  const userById = () => idx(ctx.users ? ctx.users() : []);
  const allPolicies = () => (ctx.allPolicies ? ctx.allPolicies() : []) || [];
  const seriesNames = () => [...new Set(allPolicies().map(p => p.series_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function nextSeriesNumber(name) { const n = String(name || '').trim().toLowerCase(); let max = 0; allPolicies().forEach(p => { if ((p.series_name || '').trim().toLowerCase() === n && Number(p.series_number) > max) max = Number(p.series_number); }); return max + 1; }

  function concernLabel(it) {
    if (!it) return '';
    if (it.type === 'text') return it.label || '';
    if (it.type === 'division') return divById()[it.id]?.name || ('Division #' + it.id);
    if (it.type === 'department') return depById()[it.id]?.name || ('Department #' + it.id);
    if (it.type === 'post') return postById()[it.id]?.name || ('Post #' + it.id);
    if (it.type === 'executive_post') return execById()[it.id]?.name || ('Executive post #' + it.id);
    return '';
  }
  function scopeParts(p) {
    const d = divById(), dep = depById(), po = postById(), ex = execById();
    const parts = [];
    if (p.scope_type === 'division') { const x = d[p.scope_id]; if (x) parts.push(x.name); }
    else if (p.scope_type === 'department') { const x = dep[p.scope_id]; if (x) { const v = d[x.division_id]; if (v) parts.push(v.name); parts.push(x.name); } }
    else if (p.scope_type === 'post') { const x = po[p.scope_id]; if (x) { const de = dep[x.department_id]; if (de) { const v = d[de.division_id]; if (v) parts.push(v.name); parts.push(de.name); } parts.push(x.name); } }
    else if (p.scope_type === 'executive_post') { const x = ex[p.scope_id]; if (x) parts.push(x.name); }
    if (!parts.length) parts.push((p.scope_type || '?') + ' #' + (p.scope_id ?? '—'));
    return parts;
  }
  function concernedItems(p) {
    if (Array.isArray(p.concerns) && p.concerns.length) return p.concerns.map(concernLabel).filter(Boolean);
    return scopeParts(p);
  }
  function authorInfo(p) {
    const u = userById()[p.created_by];
    const name = (u && u.first_name) || friendly(p.created_by_email);
    let post = '';
    if (u) {
      const pid = (u.post_ids || [])[0];
      if (pid != null && postById()[pid]) post = postById()[pid].name;
      else { const eid = (u.exec_post_ids || [])[0]; if (eid != null && execById()[eid]) post = execById()[eid].name; }
    }
    return { name, post };
  }
  const canEdit = p => ctx.isAdmin() || !!(p && ctx.userId() && p.created_by === ctx.userId());

  async function pw(path, opts = {}) {
    const r = await fetch(ctx.supabaseUrl + '/functions/v1/org-policy-write' + path, {
      method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.getToken() },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  // ── Modal shell (own overlay, own styles) ─────────────────────────────────
  let _preClose = null, _downOnOverlay = false;
  function root() {
    let el = document.getElementById('pwModalRoot');
    if (!el) {
      el = document.createElement('div'); el.id = 'pwModalRoot'; el.className = 'pw-overlay';
      document.body.appendChild(el);
      el.addEventListener('mousedown', e => { _downOnOverlay = (e.target === el); });
      el.addEventListener('click', e => { if (e.target === el && _downOnOverlay) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
    }
    return el;
  }
  function close() { const hook = _preClose; _preClose = null; if (hook) { try { hook(); } catch (_) {} } const m = root(); m.classList.remove('open'); m.innerHTML = ''; }
  function shell(inner) { const m = root(); m.innerHTML = '<div class="pw-modal">' + inner + '</div>'; m.classList.add('open'); m.querySelector('.pw-x')?.addEventListener('click', close); }
  const $ = id => document.getElementById(id);
  const draftKey = (p, scope) => 'ridley-poldraft-' + (p ? p.id : ('new-' + (scope ? scope.type + '-' + scope.id : 'x')));
  const saveDraft = (k, d) => { try { localStorage.setItem(k, JSON.stringify(d)); } catch (_) {} };
  const loadDraft = k => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  const clearDraft = k => { try { localStorage.removeItem(k); } catch (_) {} };

  // ── Reader (letter format) ────────────────────────────────────────────────
  function openReader(p, opts = {}) {
    if (!p) return;
    injectStyles();
    const auth = authorInfo(p);
    const kindWord = p.kind === 'order' ? 'Order' : 'Policy Letter';
    const items = concernedItems(p);
    const concerned = items.length ? items.map(x => `<div>${esc(x)}</div>`).join('') : '<div>—</div>';
    shell(`
      <div class="pw-head"><span class="pw-mh-title">${esc(KIND[p.kind] || p.kind)}</span><button class="pw-x">✕</button></div>
      <div class="pw-body">
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
        <div id="pwAck" class="pw-ackbar"></div>
      </div>
      ${canEdit(p) ? `<div class="pw-foot"><span class="pw-msg"></span><button class="pw-btn-ghost" id="pwDelete" style="color:var(--red)">Delete</button><button class="pw-btn-primary" id="pwEdit">Edit</button></div>` : ''}`);
    loadAckSection(p);
    if (canEdit(p)) {
      $('pwEdit').addEventListener('click', () => openEditor({ policy: p, scope: { type: p.scope_type, id: p.scope_id }, onSaved: () => opts.onChanged && opts.onChanged(), onDeleted: () => opts.onChanged && opts.onChanged() }));
      $('pwDelete').addEventListener('click', async () => {
        if (!confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
        try { await pw('?api=delete&id=' + p.id, { method: 'POST', body: {} }); clearDraft(draftKey(p)); close(); opts.onChanged && opts.onChanged(); }
        catch (e) { const m = root().querySelector('.pw-msg'); if (m) { m.textContent = e.message; m.classList.add('err'); } }
      });
    }
  }

  // Read-and-understood acknowledgement bar (shown to everyone viewing). The
  // creator/admin also gets a "who has acknowledged" roster.
  const ackDate = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  async function loadAckSection(p) {
    const el = document.getElementById('pwAck'); if (!el) return;
    el.innerHTML = '<span class="pw-ack-loading">Loading…</span>';
    let st;
    try { st = await pw('?api=ack-status&id=' + p.id); } catch (e) { el.innerHTML = ''; return; }
    const acked = !!st.acknowledged;
    el.innerHTML = `<div class="pw-ack-row">
      ${acked
        ? `<span class="pw-ack-done">✓ You marked this read &amp; understood${st.acknowledged_at ? ' on ' + esc(ackDate(st.acknowledged_at)) : ''}</span><button class="pw-ack-link" id="pwAckBtn">Undo</button>`
        : `<button class="pw-btn-primary" id="pwAckBtn">✓ I have read and understood</button>`}
      ${st.is_manager ? `<button class="pw-btn-ghost" id="pwAckList" style="margin-left:auto">Who has acknowledged</button>` : ''}
    </div><div id="pwAckPanel"></div>`;
    document.getElementById('pwAckBtn').addEventListener('click', async () => {
      try { await pw('?api=ack&id=' + p.id, { method: 'POST', body: { on: !acked } }); loadAckSection(p); } catch (e) { alert(e.message); }
    });
    const lb = document.getElementById('pwAckList');
    if (lb) lb.addEventListener('click', () => { const panel = document.getElementById('pwAckPanel'); if (panel && panel.dataset.open === '1') { panel.dataset.open = '0'; panel.innerHTML = ''; } else loadAckList(p); });
  }
  async function loadAckList(p) {
    const panel = document.getElementById('pwAckPanel'); if (!panel) return;
    panel.dataset.open = '1';
    panel.innerHTML = '<div class="pw-ack-loading" style="padding:8px 0">Loading…</div>';
    let j; try { j = await pw('?api=acks&id=' + p.id); } catch (e) { panel.innerHTML = `<div style="color:var(--red,#f87171);font-size:.8rem">${esc(e.message)}</div>`; return; }
    const people = j.people || [];
    panel.innerHTML = `<div class="pw-ack-head">${j.acked}/${j.total} acknowledged</div>` + (people.length
      ? '<div class="pw-ack-list">' + people.map(u => `<div class="pw-ack-item"><span class="pw-ack-mark ${u.acknowledged_at ? 'ok' : 'no'}">${u.acknowledged_at ? '✓' : '○'}</span><span class="pw-ack-name">${esc(u.name || u.email || 'User')}</span><span class="pw-ack-when">${u.acknowledged_at ? esc(ackDate(u.acknowledged_at)) : 'Not yet'}</span></div>`).join('') + '</div>'
      : '<div class="pw-ack-loading" style="padding:6px 0">No one is currently concerned by this policy.</div>');
  }

  function orgUnitIndex() {
    const out = [], d = divById(), dep = depById();
    ctx.divisions().forEach(x => out.push({ type: 'division', id: x.id, name: x.name, path: x.name }));
    ctx.departments().forEach(x => { const v = d[x.division_id]; out.push({ type: 'department', id: x.id, name: x.name, path: (v?.name ? v.name + ' › ' : '') + x.name }); });
    ctx.posts().forEach(x => { const de = dep[x.department_id]; const v = de ? d[de.division_id] : null; out.push({ type: 'post', id: x.id, name: x.name, path: (v?.name ? v.name + ' › ' : '') + (de ? de.name + ' › ' : '') + x.name }); });
    return out;
  }

  // ── Editor (builder) ──────────────────────────────────────────────────────
  function openEditor({ policy: p, scope, seedConcerns, onSaved, onDeleted } = {}) {
    injectStyles();
    const editing = !!p;
    const dkey = draftKey(p, scope);
    let touched = false; const markTouched = () => { touched = true; };
    let concernsList = (p && Array.isArray(p.concerns) && p.concerns.length) ? p.concerns.map(x => ({ ...x }))
      : (Array.isArray(seedConcerns) && seedConcerns.length) ? seedConcerns.map(x => ({ ...x }))
      : (p && p.scope_type && p.scope_id && p.scope_type !== 'executive_post') ? [{ type: p.scope_type, id: p.scope_id }]
      : (scope && scope.type !== 'executive_post') ? [{ type: scope.type, id: scope.id }]
      : [];
    shell(`
      <div class="pw-head"><span class="pw-mh-title">${editing ? 'Edit' : 'New policy / order'}</span><button class="pw-x">✕</button></div>
      <div class="pw-body">
        <div class="pw-fld"><label>Type</label><select id="fKind"><option value="policy" ${!p || p.kind === 'policy' ? 'selected' : ''}>Policy — a standing rule</option><option value="order" ${p && p.kind === 'order' ? 'selected' : ''}>Order — a directive</option></select></div>
        <div class="pw-fld">
          <label>Concerns</label>
          <div id="cChips"></div>
          <div class="cpick">
            <input id="cSearch" placeholder="Search a division, department or post — or type anything" autocomplete="off">
            <div id="cResults" class="cpick-menu"></div>
          </div>
          <div class="pw-hint">Who this concerns — shown as the distribution list on the letter. Add divisions, departments, posts, or free text (e.g. “All Staff”).</div>
        </div>
        <div class="pw-fld">
          <label>Series <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label>
          <div class="pw-fld-row" style="gap:8px;">
            <input id="fSeries" list="pwSeriesList" placeholder="Series name (e.g. Coaching) — pick existing or type new" style="flex:2;" value="${esc(p?.series_name || '')}" autocomplete="off">
            <input id="fSeriesNum" type="number" min="1" placeholder="No." title="Number within the series" style="flex:0 0 96px;" value="${p?.series_number != null ? p.series_number : ''}">
          </div>
          <datalist id="pwSeriesList">${seriesNames().map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
          <div class="pw-hint">Group related policies into a series. Shows as “&lt;name&gt; Series &lt;number&gt;”. Leave the number blank to auto-number.</div>
        </div>
        <div class="pw-fld"><label>Title</label><input id="fTitle" value="${esc(p?.title || '')}" placeholder="e.g. Refund approval policy"></div>
        <div class="pw-fld"><label>Text</label>
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
        <div class="pw-fld"><label>Expires <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label><input type="date" id="fExpires" value="${p?.expires_at ? String(p.expires_at).slice(0, 10) : ''}"><div class="pw-hint">Leave blank for no expiry.</div></div>
      </div>
      <div class="pw-foot"><span class="pw-msg"></span><button class="pw-btn-ghost" id="fCancel">Cancel</button><button class="pw-btn-primary" id="fSave">${editing ? 'Save changes' : 'Create'}</button></div>`);

    const renderChips = () => {
      const box = $('cChips');
      if (!concernsList.length) { box.className = 'chips-empty'; box.textContent = 'No one added yet.'; return; }
      box.className = 'chips';
      box.innerHTML = concernsList.map((it, i) => `<span class="chip${it.type === 'text' ? ' txt' : ''}">${esc(concernLabel(it))}<button data-i="${i}" title="Remove">×</button></span>`).join('');
      box.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { concernsList.splice(Number(b.dataset.i), 1); renderChips(); markTouched(); }));
    };
    renderChips();
    const units = orgUnitIndex();
    const search = $('cSearch'), menu = $('cResults');
    let activeIdx = -1, results = [];
    const TAG = { division: 'Div', department: 'Dept', post: 'Post' };
    const addItem = (item) => { concernsList.push(item); renderChips(); markTouched(); search.value = ''; results = []; menu.classList.remove('open'); search.focus(); };
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
    $('fSeries').addEventListener('change', () => { const nm = $('fSeries').value.trim(); if (nm && !$('fSeriesNum').value) $('fSeriesNum').value = nextSeriesNumber(nm); });
    const fBody = $('fBody');
    fBody.innerHTML = p?.body ? bodyHtml(p.body) : '';
    root().querySelectorAll('.rt-btn').forEach(btn => btn.addEventListener('mousedown', e => { e.preventDefault(); fBody.focus(); document.execCommand(btn.dataset.cmd, false, null); }));
    fBody.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    const draft = loadDraft(dkey);
    if (draft) {
      if (draft.kind) $('fKind').value = draft.kind;
      $('fTitle').value = draft.title || '';
      $('fSeries').value = draft.seriesName || '';
      $('fSeriesNum').value = draft.seriesNumber || '';
      $('fExpires').value = draft.expires || '';
      if (Array.isArray(draft.concerns)) { concernsList = draft.concerns.map(x => ({ ...x })); renderChips(); }
      fBody.innerHTML = draft.body || '';
    }
    ['fKind', 'fTitle', 'fSeries', 'fSeriesNum', 'fExpires'].forEach(id => { $(id).addEventListener('input', markTouched); $(id).addEventListener('change', markTouched); });
    fBody.addEventListener('input', markTouched);
    _preClose = () => { if (touched) saveDraft(dkey, { kind: $('fKind').value, title: $('fTitle').value, body: fBody.innerHTML, seriesName: $('fSeries').value, seriesNumber: $('fSeriesNum').value, expires: $('fExpires').value, concerns: concernsList }); };
    $('fCancel').addEventListener('click', close);
    $('fSave').addEventListener('click', async () => {
      const msg = root().querySelector('.pw-msg'); msg.classList.remove('err');
      const title = $('fTitle').value.trim();
      if (!title) { msg.textContent = 'Title is required.'; msg.classList.add('err'); return; }
      // Scope: use the fixed scope when the caller provides one (org board);
      // otherwise derive it from the first org-unit concern (dashboard style).
      let scopeType, scopeId;
      if (scope) { scopeType = scope.type; scopeId = scope.id; }
      else if (editing) { scopeType = p.scope_type; scopeId = p.scope_id; }
      else { const orgUnit = concernsList.find(it => it.type !== 'text' && it.id != null); if (!orgUnit) { msg.textContent = 'Add at least one division, department or post to Concerns.'; msg.classList.add('err'); return; } scopeType = orgUnit.type; scopeId = orgUnit.id; }
      const seriesName = $('fSeries').value.trim() || null;
      const seriesNumber = seriesName ? (Number($('fSeriesNum').value) || nextSeriesNumber(seriesName)) : null;
      const body = {
        scope_type: scopeType, scope_id: Number(scopeId),
        kind: $('fKind').value, title, body: (fBody.textContent.trim() ? sanitizeHtml(fBody.innerHTML) : ''),
        expires_at: $('fExpires').value || null,
        concerns: concernsList, series_name: seriesName, series_number: seriesNumber,
      };
      $('fSave').disabled = true; msg.textContent = 'Saving…';
      try {
        const res = editing ? await pw('?api=update&id=' + p.id, { method: 'POST', body }) : await pw('?api=create', { method: 'POST', body });
        clearDraft(dkey); _preClose = null; close();
        if (onSaved) onSaved(res.row, !editing);
      } catch (e) { msg.textContent = e.message; msg.classList.add('err'); $('fSave').disabled = false; }
    });
  }

  // ── Styles (injected once) ────────────────────────────────────────────────
  function injectStyles() {
    if (styled) return; styled = true;
    const css = `
    .pw-overlay { display:none; position:fixed; inset:0; z-index:3000; background:rgba(0,0,0,0.62); backdrop-filter:blur(4px); align-items:flex-start; justify-content:center; padding:40px 16px; overflow-y:auto; }
    .pw-overlay.open { display:flex; }
    .pw-modal { width:100%; max-width:820px; background:var(--surface,#161821); border:1px solid var(--border-light,#2a2d3a); border-radius:16px; box-shadow:0 26px 80px rgba(0,0,0,0.65); overflow:hidden; display:flex; flex-direction:column; max-height:calc(100vh - 56px); }
    .pw-head { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:15px 18px; border-bottom:1px solid var(--border,#242736); background:var(--surface2,#1b1e2a); }
    .pw-mh-title { font-size:1.05rem; font-weight:700; flex:1; color:var(--text,#e8eaf0); }
    .pw-x { width:30px; height:30px; border-radius:8px; background:var(--surface3,#222634); border:1px solid var(--border,#242736); color:var(--text,#e8eaf0); cursor:pointer; font-size:0.9rem; }
    .pw-x:hover { color:var(--red,#f87171); border-color:var(--red,#f87171); }
    .pw-body { padding:18px; overflow-y:auto; flex:1 1 auto; min-height:0; }
    .pw-foot { flex:0 0 auto; display:flex; gap:8px; align-items:center; padding:14px 18px; border-top:1px solid var(--border,#242736); background:var(--surface,#161821); }
    .pw-msg { flex:1; font-size:0.8rem; color:var(--text-muted,#aab); } .pw-msg.err { color:var(--red,#f87171); }
    .pw-btn-primary { padding:9px 15px; background:linear-gradient(135deg,#6b9eff,#4a7de0); color:#fff; border:0; border-radius:9px; font-weight:700; cursor:pointer; font-size:0.84rem; box-shadow:0 2px 10px rgba(107,158,255,0.3); }
    .pw-btn-primary:hover { transform:translateY(-1px); } .pw-btn-primary:disabled { opacity:.6; cursor:default; transform:none; }
    .pw-btn-ghost { background:var(--surface2,#1b1e2a); border:1px solid var(--border,#242736); color:var(--text,#e8eaf0); border-radius:9px; padding:9px 14px; font-size:0.83rem; font-weight:600; cursor:pointer; font-family:inherit; }
    .pw-fld { margin-bottom:14px; }
    .pw-fld label { display:block; font-size:0.78rem; font-weight:600; color:var(--text,#e8eaf0); margin-bottom:5px; }
    .pw-fld .pw-hint, .pw-hint { font-size:0.72rem; color:var(--text-dim,#8b90a3); margin-top:4px; }
    .pw-fld input, .pw-fld select { width:100%; padding:9px 11px; background:var(--surface2,#1b1e2a); border:1px solid var(--border-light,#2a2d3a); border-radius:8px; color:var(--text,#e8eaf0); font-size:0.88rem; font-family:inherit; }
    .pw-fld input:focus, .pw-fld select:focus { border-color:var(--blue,#6b9eff); outline:none; box-shadow:0 0 0 3px rgba(107,158,255,.12); }
    .pw-fld-row { display:flex; gap:12px; }
    .rt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:3px; margin-bottom:6px; }
    .rt-btn { min-width:30px; height:30px; padding:0 8px; display:inline-flex; align-items:center; justify-content:center; background:var(--surface2,#1b1e2a); border:1px solid var(--border,#242736); border-radius:7px; color:var(--text-muted,#aab); cursor:pointer; font-size:0.86rem; font-family:inherit; }
    .rt-btn:hover { color:var(--text,#e8eaf0); border-color:var(--border-light,#2a2d3a); background:var(--surface3,#222634); }
    .rt-btn b { font-weight:800; } .rt-btn i { font-style:italic; } .rt-btn u { text-decoration:underline; }
    .rt-btn svg { width:15px; height:15px; }
    .rt-sep { width:1px; height:20px; background:var(--border,#242736); margin:0 3px; }
    .rt-editor { min-height:280px; max-height:46vh; overflow-y:auto; padding:11px 13px; background:var(--surface2,#1b1e2a); border:1px solid var(--border-light,#2a2d3a); border-radius:8px; color:var(--text,#e8eaf0); font-size:0.92rem; line-height:1.6; }
    .rt-editor:focus { border-color:var(--blue,#6b9eff); outline:none; box-shadow:0 0 0 3px rgba(107,158,255,.12); }
    .rt-editor:empty:before { content:attr(data-ph); color:var(--text-dim,#8b90a3); }
    .rt-editor ul, .rt-editor ol { padding-left:1.5em; margin:5px 0; }
    .chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .chip { display:inline-flex; align-items:center; gap:5px; background:var(--surface3,#222634); border:1px solid var(--border,#242736); border-radius:999px; padding:4px 6px 4px 11px; font-size:0.78rem; color:var(--text,#e8eaf0); }
    .chip.txt { border-style:dashed; }
    .chip button { background:none; border:0; color:var(--text-dim,#8b90a3); cursor:pointer; font-size:0.9rem; line-height:1; padding:0 2px; }
    .chip button:hover { color:var(--red,#f87171); }
    .chips-empty { font-size:0.76rem; color:var(--text-dim,#8b90a3); margin-bottom:8px; }
    .cpick { position:relative; }
    .cpick-menu { display:none; position:absolute; left:0; right:0; top:calc(100% + 4px); background:var(--surface,#161821); border:1px solid var(--border-light,#2a2d3a); border-radius:10px; padding:5px; max-height:270px; overflow-y:auto; z-index:20; box-shadow:0 14px 34px rgba(0,0,0,.5); }
    .cpick-menu.open { display:block; }
    .cpick-item { display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:7px; cursor:pointer; font-size:0.83rem; color:var(--text,#e8eaf0); }
    .cpick-item.active, .cpick-item:hover { background:var(--surface2,#1b1e2a); }
    .cpick-tag { font-size:0.55rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; padding:2px 6px; border-radius:4px; flex:0 0 auto; }
    .cpick-tag.division { background:var(--green-bg,rgba(52,211,153,.14)); color:var(--green,#34d399); }
    .cpick-tag.department { background:var(--blue-bg,rgba(107,158,255,.14)); color:var(--blue,#6b9eff); }
    .cpick-tag.post { background:var(--gold-bg,rgba(251,191,36,.14)); color:var(--gold,#fbbf24); }
    .cpick-tag.text { background:rgba(167,139,250,.14); color:#a78bfa; }
    .cpick-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cpick-path { color:var(--text-dim,#8b90a3); font-size:0.72rem; flex:0 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%; }
    .cpick-none { padding:8px 9px; font-size:0.8rem; color:var(--text-dim,#8b90a3); }
    .pl-letter { font-family: Georgia, 'Times New Roman', serif; color:var(--text,#e8eaf0); padding:4px 6px; }
    .pl-org { text-align:center; font-weight:700; font-size:1.08rem; letter-spacing:.02em; }
    .pl-sub { text-align:center; font-size:0.82rem; margin-top:3px; }
    .pl-distribution { font-size:0.74rem; line-height:1.55; margin:20px 0 4px; }
    .pl-series { text-align:center; font-size:0.82rem; font-weight:700; letter-spacing:.03em; margin:14px 0 -2px; }
    .pl-title { text-align:center; font-weight:800; font-size:1.4rem; text-transform:uppercase; letter-spacing:.01em; line-height:1.25; margin:8px 0 18px; }
    .pl-body { font-size:0.96rem; line-height:1.72; word-break:break-word; }
    .pl-body ul, .pl-body ol { padding-left:1.5em; margin:6px 0; }
    .pl-body b, .pl-body strong { font-weight:700; }
    .pl-sign { text-align:right; margin-top:28px; }
    .pl-sign-name { font-weight:700; font-size:0.96rem; }
    .pl-sign-post { font-size:0.82rem; margin-top:1px; }
    .pl-expiry { text-align:center; font-size:0.72rem; margin-top:22px; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
    .pl-expiry.over { color:var(--red,#f87171); font-weight:700; }
    .pw-ackbar { margin-top:26px; padding-top:16px; border-top:1px solid var(--border,#242736); font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
    .pw-ack-loading { color:var(--text-dim,#8b90a3); font-size:0.8rem; }
    .pw-ack-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .pw-ack-done { color:var(--green,#34d399); font-weight:700; font-size:0.86rem; }
    .pw-ack-link { background:none; border:0; color:var(--text-dim,#8b90a3); cursor:pointer; font-size:0.78rem; text-decoration:underline; padding:0; }
    .pw-ack-head { font-size:0.72rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted,#aab); margin:14px 0 8px; }
    .pw-ack-list { display:flex; flex-direction:column; gap:2px; max-height:240px; overflow-y:auto; }
    .pw-ack-item { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:8px; background:var(--surface2,#1b1e2a); }
    .pw-ack-mark { width:20px; text-align:center; font-weight:800; }
    .pw-ack-mark.ok { color:var(--green,#34d399); }
    .pw-ack-mark.no { color:var(--text-dim,#8b90a3); }
    .pw-ack-name { flex:1; font-size:0.86rem; color:var(--text,#e8eaf0); }
    .pw-ack-when { font-size:0.74rem; color:var(--text-dim,#8b90a3); }`;
    const s = document.createElement('style'); s.id = 'pw-styles'; s.textContent = css; document.head.appendChild(s);
  }

  function init(c) { ctx = c; injectStyles(); }
  return { init, openReader, openEditor, canEdit, seriesLabel, isExpired, KIND, _stripHtml: stripHtml };
})();
