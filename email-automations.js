const SUPABASE_URL = "https://pojqljrhhtnigyrtzdzz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanFsanJoaHRuaWd5cnR6ZHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTA3ODMsImV4cCI6MjA5MTM4Njc4M30.PcSBDqOzbiZxZ7IAs5efqx0gsAlAG0cj3GqUOkAmxos";
const EA_BASE = SUPABASE_URL + '/functions/v1/email-automations';
const STUDENTS_BASE = SUPABASE_URL + '/functions/v1/students';
const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }});
window.__ridleySession = null; // exposed for nav-menu / access-guard

let currentSession = null;
let automations = [];
let currentAutomation = null;
let quill = null;
let allStudents = [];
let availableEvents = []; // {key,label,recipient,vars,in_use}
let listView = 'automations'; // or 'templates'
let recipientKinds = []; // [{value,label}]
let availableTemplates = []; // [{id,name,description}]

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

document.getElementById('navDropdownBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('navDropMenu').classList.toggle('open');
});
document.addEventListener('click', () => document.getElementById('navDropMenu').classList.remove('open'));

document.getElementById('signOutBtn').addEventListener('click', async () => { await supa.auth.signOut(); window.location.reload(); });

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) errEl.textContent = error.message;
  else boot();
});

document.getElementById('refreshBtn').addEventListener('click', loadAutomations);

function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function boot() {
  setState('loading');
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { setState('login'); return; }
  currentSession = session;
  window.__ridleySession = session;
  const eff = window.RidleyPerms.effective(session.user);
  // Admin gate — non-admins shouldn't even reach this URL (access-guard.js
  // also redirects), but defend in case.
  if (!eff?.is_admin) {
    document.getElementById('app').innerHTML = '<div style="padding:60px 20px;text-align:center;color:var(--text-dim);font-size:0.95rem;">Email Automations is admin-only. Ask an admin to grant your account this access.</div>';
    setState('dashboard');
    return;
  }
  document.getElementById('userEmail').textContent = session.user.email || '';
  document.getElementById('userAvatar').textContent = (session.user.email || 'A').slice(0, 1).toUpperCase();
  setState('dashboard');
  await Promise.all([loadAutomations(), loadAvailableEvents(), loadRecipientKinds(), loadAvailableTemplates()]);
  // Wire tabs
  document.getElementById('tabAutomations')?.addEventListener('click', () => switchListView('automations'));
  document.getElementById('tabTemplates')?.addEventListener('click', () => switchListView('templates'));
  syncTabStyles();
}
async function loadRecipientKinds() {
  try { const j = await api('?api=recipient-kinds'); recipientKinds = j.kinds || []; }
  catch (e) { console.warn('recipient-kinds failed', e); recipientKinds = []; }
}
async function loadAvailableTemplates() {
  try { const j = await api('?api=templates-list'); availableTemplates = j.templates || []; }
  catch (e) { console.warn('templates-list failed', e); availableTemplates = []; }
}
function switchListView(view) {
  listView = view;
  currentAutomation = null;
  syncTabStyles();
  renderEditor();
  loadAutomations();
}
function syncTabStyles() {
  const a = document.getElementById('tabAutomations');
  const t = document.getElementById('tabTemplates');
  if (!a || !t) return;
  const active = 'padding:6px 12px;background:var(--accent);color:#06231a;border-color:var(--accent);';
  const inactive = 'padding:6px 12px;';
  a.style.cssText = listView === 'automations' ? active : inactive;
  t.style.cssText = listView === 'templates' ? active : inactive;
  const newBtn = document.getElementById('newBtn');
  if (newBtn) newBtn.textContent = listView === 'templates' ? '+ New template' : '+ New automation';
}

// ── Email building blocks ───────────────────────────────────────────────────
// Quill strips inline `style` attributes from pasted HTML by default, which
// would turn our buttons / callouts / images back into plain links + plain
// text on save. Solution: register a custom BlockEmbed that stores the raw
// HTML inside a wrapper div and reproduces it verbatim on save. A clipboard
// matcher reads previously-saved wrapper divs back as embeds on load.
let _emailBlockBlotRegistered = false;
function ensureEmailBlockBlotRegistered() {
  if (_emailBlockBlotRegistered) return;
  const BlockEmbed = Quill.import('blots/block/embed');
  class EmailBlockBlot extends BlockEmbed {
    static create(value) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      node.setAttribute('data-email-block', '1');
      node.innerHTML = value || '';
      return node;
    }
    static value(domNode) { return domNode.innerHTML; }
  }
  EmailBlockBlot.blotName = 'emailBlock';
  EmailBlockBlot.tagName  = 'div';
  EmailBlockBlot.className = 'email-block';
  Quill.register(EmailBlockBlot, true);
  _emailBlockBlotRegistered = true;
}
function registerEmailBlockClipboardMatcher() {
  // Reads a saved <div class="email-block">…</div> back as an emailBlock embed
  // when the html_body is pasted into Quill on load.
  if (!quill || !quill.clipboard) return;
  const Delta = Quill.import('delta');
  quill.clipboard.addMatcher('div.email-block', (node) => {
    return new Delta().insert({ emailBlock: node.innerHTML });
  });
}

function insertHtmlAtCursor(html) {
  if (!quill) return;
  const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
  // insertEmbed routes through the BlockEmbed, so inline styles survive both
  // editor-render and the save round-trip.
  quill.insertEmbed(range.index, 'emailBlock', html, 'user');
  quill.setSelection(range.index + 1, 0, 'user');
  debouncedRefreshPreview();
}

function _variableChipsHtml(targetInputId) {
  const vars = (currentAutomation?.variables_available || []);
  if (!vars.length) return '<em style="color:var(--text-dim);font-size:0.78rem;">No variables for this trigger.</em>';
  return vars.map(v => `<button class="ea-var-chip" type="button" data-insert-into="${targetInputId}" data-var="${v}">{{${v}}}</button>`).join(' ');
}
function _wireVariableChips(modalEl) {
  modalEl.querySelectorAll('[data-insert-into]').forEach(chip => chip.addEventListener('click', () => {
    const input = document.getElementById(chip.dataset.insertInto);
    if (!input) return;
    const v = '{{' + chip.dataset.var + '}}';
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    input.value = input.value.slice(0, start) + v + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start + v.length;
    input.focus();
  }));
}

const BUTTON_COLORS = [
  { name: 'Brand red',  bg: '#DC2626', fg: '#ffffff' },
  { name: 'Black',      bg: '#1a1a2e', fg: '#ffffff' },
  { name: 'Emerald',    bg: '#10b981', fg: '#ffffff' },
  { name: 'Blue',       bg: '#2563eb', fg: '#ffffff' },
  { name: 'Purple',     bg: '#7c3aed', fg: '#ffffff' },
  { name: 'Gold',       bg: '#f59e0b', fg: '#1a1a2e' },
  { name: 'Outline',    bg: '#ffffff', fg: '#DC2626', border: '#DC2626' },
];
function _buttonHtml(opts) {
  const bg = opts.bg || '#DC2626';
  const fg = opts.fg || '#ffffff';
  const border = opts.border ? `border:2px solid ${opts.border};` : '';
  const pad = opts.size === 'large' ? '14px 28px' : opts.size === 'small' ? '8px 16px' : '11px 22px';
  const fontSize = opts.size === 'large' ? '1rem' : opts.size === 'small' ? '0.82rem' : '0.92rem';
  const align = opts.align || 'center';
  const label = (opts.label || 'Click here').replace(/[<>]/g, '');
  const href = opts.href || '#';
  return `<div style="text-align:${align};margin:18px 0;"><a href="${href}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:700;padding:${pad};border-radius:8px;font-size:${fontSize};${border}">${label}</a></div>`;
}
function openButtonBuilder() {
  document.getElementById('blockBuilderModal')?.remove();
  const m = document.createElement('div');
  m.id = 'blockBuilderModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>Insert button</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div class="builder-field">
          <label>Button label</label>
          <input id="bb-label" type="text" placeholder="Click here, Get started, Open dashboard…" value="Click here">
        </div>
        <div class="builder-field">
          <label>Link (URL or variable)</label>
          <input id="bb-href" type="text" placeholder="https://… or click a variable below">
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${_variableChipsHtml('bb-href')}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">Pick a variable so each recipient gets their own link (e.g. <code>{{joinUrl}}</code>, <code>{{activateUrl}}</code>, <code>{{dashboardLink}}</code>).</div>
        </div>
        <div class="builder-field">
          <label>Color</label>
          <div class="swatch-row" id="bb-swatches">
            ${BUTTON_COLORS.map((c,i) => `<button type="button" class="swatch ${i===0?'active':''}" data-i="${i}" style="background:${c.bg};${c.border?'border-color:'+c.border:''}" title="${c.name}"></button>`).join('')}
          </div>
        </div>
        <div class="builder-field" style="flex-direction:row;gap:12px;align-items:center;">
          <div style="flex:1;"><label>Size</label>
            <select id="bb-size"><option value="medium" selected>Medium</option><option value="large">Large</option><option value="small">Small</option></select>
          </div>
          <div style="flex:1;"><label>Alignment</label>
            <select id="bb-align"><option value="center" selected>Center</option><option value="left">Left</option><option value="right">Right</option></select>
          </div>
        </div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Preview</div>
        <div class="builder-preview" id="bb-preview"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="bb-insert">Insert button</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  _wireVariableChips(m);

  let colorIdx = 0;
  m.querySelectorAll('#bb-swatches .swatch').forEach(s => s.addEventListener('click', () => {
    colorIdx = Number(s.dataset.i);
    m.querySelectorAll('#bb-swatches .swatch').forEach(x => x.classList.toggle('active', Number(x.dataset.i) === colorIdx));
    renderPreview();
  }));
  function currentOpts() {
    const c = BUTTON_COLORS[colorIdx];
    return {
      label: document.getElementById('bb-label').value,
      href:  document.getElementById('bb-href').value || '#',
      bg: c.bg, fg: c.fg, border: c.border,
      size:  document.getElementById('bb-size').value,
      align: document.getElementById('bb-align').value,
    };
  }
  function renderPreview() { document.getElementById('bb-preview').innerHTML = _buttonHtml(currentOpts()); }
  m.querySelectorAll('input, select').forEach(el => el.addEventListener('input', renderPreview));
  renderPreview();
  document.getElementById('bb-insert').addEventListener('click', () => {
    const opts = currentOpts();
    if (!opts.href || opts.href === '#') { alert('Pick a link or variable for this button.'); return; }
    insertHtmlAtCursor(_buttonHtml(opts));
    close();
  });
}

const CALLOUT_THEMES = [
  { name: 'Brand red',  bg: '#fef2f2', border: '#fecaca', color: '#DC2626' },
  { name: 'Emerald',    bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
  { name: 'Blue',       bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb' },
  { name: 'Amber',      bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  { name: 'Gray',       bg: '#f5f6fc', border: '#dde1f2', color: '#525b82' },
];
function _calloutHtml(opts) {
  const t = CALLOUT_THEMES[opts.themeIdx || 0];
  const title = (opts.title || '').replace(/[<>]/g, '');
  return `<div style="background:${t.bg};border:1px solid ${t.border};border-radius:10px;padding:14px 18px;margin:18px 0;">
${title ? `<div style="font-size:0.78rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${t.color};margin-bottom:6px;">${title}</div>` : ''}
<div style="font-size:0.92rem;line-height:1.55;color:#1a1a2e;">${opts.body || ''}</div>
</div>`;
}
function openCalloutBuilder() {
  document.getElementById('blockBuilderModal')?.remove();
  const m = document.createElement('div');
  m.id = 'blockBuilderModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>Insert callout box</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div class="builder-field">
          <label>Title (optional)</label>
          <input id="cb-title" type="text" placeholder="DATE & TIME, WHAT'S NEXT, IMPORTANT…">
        </div>
        <div class="builder-field">
          <label>Body</label>
          <textarea id="cb-body" placeholder="The text that goes inside the box. You can use {{variables}} here.">Your message goes here.</textarea>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${_variableChipsHtml('cb-body')}</div>
        </div>
        <div class="builder-field">
          <label>Color theme</label>
          <div class="swatch-row" id="cb-swatches">
            ${CALLOUT_THEMES.map((c,i) => `<button type="button" class="swatch ${i===0?'active':''}" data-i="${i}" style="background:${c.bg};border-color:${c.border};" title="${c.name}"></button>`).join('')}
          </div>
        </div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Preview</div>
        <div class="builder-preview" id="cb-preview"></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="cb-insert">Insert callout</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  _wireVariableChips(m);

  let themeIdx = 0;
  m.querySelectorAll('#cb-swatches .swatch').forEach(s => s.addEventListener('click', () => {
    themeIdx = Number(s.dataset.i);
    m.querySelectorAll('#cb-swatches .swatch').forEach(x => x.classList.toggle('active', Number(x.dataset.i) === themeIdx));
    renderPreview();
  }));
  function currentOpts() {
    return { title: document.getElementById('cb-title').value, body: document.getElementById('cb-body').value, themeIdx };
  }
  function renderPreview() { document.getElementById('cb-preview').innerHTML = _calloutHtml(currentOpts()); }
  m.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', renderPreview));
  renderPreview();
  document.getElementById('cb-insert').addEventListener('click', () => { insertHtmlAtCursor(_calloutHtml(currentOpts())); close(); });
}

function _imageHtml(opts) {
  const w = opts.maxWidth ? `max-width:${opts.maxWidth}px;` : 'max-width:100%;';
  return `<div style="text-align:${opts.align || 'center'};margin:18px 0;"><img src="${opts.src}" alt="${(opts.alt||'').replace(/[<>]/g,'')}" style="${w}height:auto;border-radius:8px;border:0;"></div>`;
}
function openImageBuilder() {
  document.getElementById('blockBuilderModal')?.remove();
  const m = document.createElement('div');
  m.id = 'blockBuilderModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>Insert image</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div class="builder-field"><label>Image URL</label>
          <input id="ib-src" type="url" placeholder="https://…">
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px;">Paste a public URL. Upload images to your CDN (Dropbox / S3 / cdn.accelonline.io) and paste the direct link here.</div>
        </div>
        <div class="builder-field"><label>Alt text (for screen-readers / when images blocked)</label>
          <input id="ib-alt" type="text" placeholder="Practice graph">
        </div>
        <div class="builder-field" style="flex-direction:row;gap:12px;">
          <div style="flex:1;"><label>Max width (px)</label><input id="ib-width" type="number" value="480" min="80" max="560"></div>
          <div style="flex:1;"><label>Alignment</label><select id="ib-align"><option value="center" selected>Center</option><option value="left">Left</option><option value="right">Right</option></select></div>
        </div>
        <div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Preview</div>
        <div class="builder-preview" id="ib-preview"><em style="color:#999;">Paste a URL above</em></div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="ib-insert">Insert image</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  function currentOpts() { return { src: document.getElementById('ib-src').value.trim(), alt: document.getElementById('ib-alt').value, maxWidth: document.getElementById('ib-width').value, align: document.getElementById('ib-align').value }; }
  function renderPreview() { const o = currentOpts(); document.getElementById('ib-preview').innerHTML = o.src ? _imageHtml(o) : '<em style="color:#999;">Paste a URL above</em>'; }
  m.querySelectorAll('input, select').forEach(el => el.addEventListener('input', renderPreview));
  document.getElementById('ib-insert').addEventListener('click', () => { const o = currentOpts(); if (!o.src) { alert('Image URL is required.'); return; } insertHtmlAtCursor(_imageHtml(o)); close(); });
}

// ── Snippets ────────────────────────────────────────────────────────────────
async function openSnippetPicker() {
  let snippets = [];
  try { const j = await api('?api=snippets-list'); snippets = j.rows || []; } catch (e) { alert('Failed to load snippets: ' + e.message); return; }
  document.getElementById('blockBuilderModal')?.remove();
  const m = document.createElement('div');
  m.id = 'blockBuilderModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>Snippets</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
          <button class="btn-primary" id="sn-save-selection">+ Save current body as snippet</button>
        </div>
        ${snippets.length ? '' : '<div style="color:var(--text-dim);font-size:0.86rem;padding:14px;text-align:center;">No snippets yet. Save the current body as a snippet to get started, or use a snippet from another automation.</div>'}
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${snippets.map(s => `
            <div class="picker-list" style="padding:0;border-radius:9px;">
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;">
                <div style="flex:1;">
                  <div style="font-weight:700;">${escapeHtml(s.name)}</div>
                  <div style="font-size:0.72rem;color:var(--text-dim);">${escapeHtml(s.description || '')}</div>
                </div>
                <button class="btn-ghost" data-insert-snippet-id="${s.id}">Insert</button>
                <button class="btn-danger" data-delete-snippet-id="${s.id}" title="Delete snippet">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" data-x>Close</button></div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  m.querySelectorAll('[data-insert-snippet-id]').forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.insertSnippetId);
    const s = snippets.find(x => x.id === id);
    if (s) { insertHtmlAtCursor(s.html); close(); }
  }));
  m.querySelectorAll('[data-delete-snippet-id]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this snippet?')) return;
    try { await api('?api=snippets-delete&id=' + b.dataset.deleteSnippetId, { method: 'POST' }); close(); openSnippetPicker(); }
    catch (e) { alert('Delete failed: ' + e.message); }
  }));
  document.getElementById('sn-save-selection').addEventListener('click', async () => {
    const name = prompt('Name this snippet (e.g. "Carlos signature", "CTA: Book session"):');
    if (!name) return;
    const html = quill.root.innerHTML;
    try {
      await api('?api=snippets-create', { method: 'POST', body: { name, html } });
      close();
      openSnippetPicker();
    } catch (e) { alert('Save failed: ' + e.message); }
  });
}

function openRawHtmlEditor() {
  document.getElementById('blockBuilderModal')?.remove();
  const m = document.createElement('div');
  m.id = 'blockBuilderModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:760px;">
      <div class="modal-head"><h2>Raw HTML edit</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:10px;">Direct access to the HTML body. Useful for fine-grained edits the visual editor can't do (custom layouts, advanced CSS, etc.). Pasted HTML is preserved verbatim when you save.</div>
        <textarea id="rh-html" style="width:100%;min-height:380px;background:#0d0e15;color:#cad0e8;border:1px solid var(--border);border-radius:9px;padding:14px;font-family:ui-monospace,monospace;font-size:0.84rem;line-height:1.5;"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="rh-apply">Apply HTML</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  document.getElementById('rh-html').value = quill.root.innerHTML;
  document.getElementById('rh-apply').addEventListener('click', () => {
    const html = document.getElementById('rh-html').value;
    // Replace the whole body with a single email-block embed so inline styles
    // and custom tags are preserved verbatim through the save round-trip.
    quill.setText('', 'silent');
    quill.insertEmbed(0, 'emailBlock', html, 'user');
    debouncedRefreshPreview();
    close();
  });
}

// ── Live preview helpers ────────────────────────────────────────────────────
// Sample values used to render the {{vars}} so the preview reads as a real
// email. Keep in sync with the test-send sample on the server.
const PREVIEW_SAMPLES = {
  firstName: 'Sarah', recipientFirstName: 'Carlos',
  topic: 'Mentorship session — Module 5',
  date: 'Wednesday, May 14, 2026', time: '6:00 PM UTC', durationMin: '60',
  joinUrl: 'https://us06web.zoom.us/j/0000000000',
  recurrenceLabel: '', recurrenceLine: '',
  icalUrl: '#', googleUrl: '#', yahooUrl: '#', outlookUrl: '#',
  coachName: 'Carlos', coachFirstName: 'Carlos', coachEmail: 'carlos@ridleyacademy.team',
  activateUrl: 'https://ridleyacademy.team/activate?token=preview',
  email: 'sarah@example.com', inviterName: 'Admin',
  firstNameOrBlank: ' Sarah',
  studentName: 'Sarah Cohen', studentEmail: 'sarah@example.com', studentEmailLine: ' &lt;sarah@example.com&gt;',
  alertTitle: 'Practice setup help',
  alertDescription: 'Student is having trouble setting up their MIDI keyboard.',
  filedBy: 'admin@ridleyacademy.team',
  resolutionNote: 'Sent video walkthrough.',
  resolvedBy: 'carlos@ridleyacademy.team',
  closedBy: 'carlos@ridleyacademy.team',
  repName: 'Carlos', note: 'See you next week.',
  noteBlock: '<div style="background:#f5f6fc;border-left:3px solid #DC2626;padding:10px 14px;margin:14px 0;">See you next week.</div>',
  result: 'Closed — great call.',
  fileName: 'Module4_Practice.mov',
  dashboardLink: 'https://ridleyacademy.team/students.html?student=1',
  studentDashboardLink: 'https://ridleyacademy.team/students.html?student=1',
  // Student profile fields
  phone: '+1 555 1234', status: 'Active', lifecycleStatus: 'Active',
  mentor: 'Carlos', rep: 'Carlos', product: 'Private Mentorship',
  level: 'Intermediate', currentModule: 'Module 5', masterclassLevel: 'Level 3',
  coachStatus: 'All good', preferredTimeSlot: 'Tue/Thu 6pm CET',
  concern: 'Wrist tension during arpeggios', goal: 'Play Chopin Nocturne Op.9 No.2 by June',
  // Computed lifecycle
  termMonths: '12', monthsLeft: '8',
  firstPurchaseDate: 'May 1, 2025', originalEndDate: 'May 1, 2026', effectiveEndDate: 'May 14, 2026',
  daysUntilEnd: '30', daysOverdue: '0',
  lastZoomDate: '2026-05-01', lastAssignmentSent: '2026-04-28', lastAssignmentReceived: '2026-04-30',
  daysSinceLastZoom: '7', daysSinceLastAssignment: '8',
  openAlertsCount: '0', winsCount: '4', pausedDaysTotal: '14',
  // Links
  communityUrl: 'https://community.ridleyacademy.com/c/sarah',
  gdriveUrl: 'https://drive.google.com/d/sarah',
  videoUrl: 'https://www.dropbox.com/scl/fi/sarah-module4',
  surveyUrl: 'https://typeform.com/sarah-onboarding',
  // Globals (live-rendered for accuracy)
  companyName: 'Ridley Academy',
  websiteUrl: 'https://ridleyacademy.com',
  dashboardBaseUrl: 'https://ridleyacademy.team',
  supportEmail: 'support@ridleyacademy.com',
  signOff: 'The Ridley Academy team',
  logoUrl: 'https://cdn.accelonline.io/qyO8Dzdk80CWcn0r5CiEPA/images/eR97N7wyk0aQHAjZbTCuBw.webp',
  currentYear: String(new Date().getFullYear()),
  currentMonth: new Date().toLocaleDateString('en-US', { month: 'long' }),
  currentDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
  currentDate: new Date().toLocaleDateString(),
  currentDateLong: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  currentTimeUtc: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC',
  // Lifecycle event-specific (already covered by manual broadcast extras)
  onboardedDate: 'May 1, 2026', pauseEndDate: 'June 1, 2026',
  endDate: 'May 14, 2027', daysLeft: '30',
  monthsAdded: '3', newEndDate: 'August 14, 2027',
  refundedDate: '2026-05-01', refundedAmount: '4990',
  daysSinceZoom: '21', daysSinceAssignment: '14',
  winText: 'Nailed the Module 5 final piece',
  resetUrl: 'https://ridleyacademy.team/forgot-password?token=preview',
};
function renderTplClient(tpl, vars) {
  // Supports {{name}} and {{name|fallback}} syntax to match the server.
  // An EXPLICITLY-EMPTY var (set to '') renders as empty string. A MISSING
  // var (undefined / not in vars) still renders the literal {{name}} so
  // typos remain visible in previews.
  return String(tpl || '').replace(/\{\{\s*([\w]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (m, name, fallback) => {
    const v = vars[name];
    const isMissing = v == null;
    const isEmptyString = v === '';
    if (fallback != null && (isMissing || isEmptyString)) return fallback;
    if (isMissing) return name === 'firstNameOrBlank' ? '' : m;
    if (isEmptyString) return '';
    if (name === 'firstNameOrBlank') return ' ' + String(v);
    return String(v);
  });
}
// Defang structural tags (doctype, html, body) in the preview shell —
// AXL's HTML preprocessor crashes on a second document declaration
// inside a script. We build them via concatenation so the upstream
// parser never sees the literal sequence; the browser still receives
// the same final string at runtime.
const _LT = '<', _GT = '>';
const PREVIEW_SHELL = (innerHtml) =>
  _LT + '!doctype html' + _GT +
  _LT + 'html' + _GT +
  _LT + 'body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#1a1a2e;"' + _GT + `
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
<div style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
<div style="background:#000000;padding:28px 16px;text-align:center;"><img src="https://cdn.accelonline.io/qyO8Dzdk80CWcn0r5CiEPA/images/eR97N7wyk0aQHAjZbTCuBw.webp" alt="Ridley Academy" width="200" style="max-width:200px;width:100%;height:auto;display:block;margin:0 auto;border:0;"></div>
<div style="height:4px;background:#DC2626;"></div>
<div style="padding:32px;font-size:0.95rem;line-height:1.6;">${innerHtml}</div>
</div>
<div style="text-align:center;padding:18px 0 0;font-size:0.72rem;color:#999;">Ridley Academy · ridleyacademy.com</div>
</div>` + _LT + '/body' + _GT + _LT + '/html' + _GT;
function refreshPreview() {
  const subjectEl = document.getElementById('ea-subject');
  const preheaderEl = document.getElementById('ea-preheader');
  const subjectText = document.getElementById('prev-subject-text');
  const frame = document.getElementById('prev-frame');
  if (!subjectEl || !frame) return;
  const vars = { ...PREVIEW_SAMPLES };
  const subj = renderTplClient(subjectEl.value || '(no subject)', vars);
  const preh = renderTplClient(preheaderEl?.value || '', vars);
  // Inbox shows: "Subject — preheader" (gray, lighter). Mimic that.
  subjectText.innerHTML = `${escapeHtml(subj)}${preh ? ` <span style="color:var(--text-dim);">— ${escapeHtml(preh)}</span>` : ''}`;
  const innerHtml = renderTplClient(quill?.root?.innerHTML || '', vars);
  frame.srcdoc = PREVIEW_SHELL(innerHtml);
}
let _previewDebounce = null;
function debouncedRefreshPreview() {
  clearTimeout(_previewDebounce);
  _previewDebounce = setTimeout(refreshPreview, 200);
}

// ── Variable catalog ────────────────────────────────────────────────────────
// Per-variable metadata. Used to render chips with descriptions + samples, to
// drive the {{ autocomplete popover, and to pick sensible fallback strings.
const VAR_CATALOG = {
  // Student
  firstName:           { group: 'Student',         desc: "Student's first name (from their profile).",            sample: 'Sarah' },
  email:               { group: 'Student',         desc: "Student's email address.",                              sample: 'sarah@example.com' },
  coachName:           { group: 'Student',         desc: "Assigned coach's name, or empty if no coach yet.",      sample: 'Carlos' },
  studentName:         { group: 'Student',         desc: "Full student name (used in staff-facing emails).",      sample: 'Sarah Cohen' },
  studentEmail:        { group: 'Student',         desc: "Student email (staff-facing emails).",                  sample: 'sarah@example.com' },
  studentEmailLine:    { group: 'Student',         desc: 'Pre-formatted " <email>" snippet for inline use.',      sample: ' <sarah@example.com>' },
  recipientFirstName:  { group: 'Recipient',       desc: "First name of the email recipient (coach/IC/admin).",   sample: 'Carlos' },
  firstNameOrBlank:    { group: 'Personalization', desc: 'Space + first name if known; nothing if blank. Use after "Hi" — e.g. "Hi{{firstNameOrBlank}}," renders as "Hi Sarah," or "Hi,".', sample: ' Sarah' },
  // Session / Zoom
  topic:               { group: 'Session',         desc: "The Zoom meeting topic.",                                sample: 'Mentorship session — Module 5' },
  date:                { group: 'Session',         desc: "Long-form date (e.g. Wednesday, May 14, 2026).",         sample: 'Wednesday, May 14, 2026' },
  time:                { group: 'Session',         desc: "Time of the session in UTC.",                            sample: '6:00 PM UTC' },
  durationMin:         { group: 'Session',         desc: "Duration in minutes.",                                   sample: '60' },
  joinUrl:             { group: 'Session',         desc: "Student's personal Zoom join link.",                     sample: 'https://us06web.zoom.us/j/0000000000' },
  recurrenceLabel:     { group: 'Session',         desc: 'Recurrence label text (e.g. "every week for 4 sessions"), empty if one-off.', sample: '' },
  recurrenceLine:      { group: 'Session',         desc: 'Pre-formatted "Recurring: …" HTML line, empty if one-off.', sample: '' },
  icalUrl:             { group: 'Session',         desc: "Apple Calendar / .ics download URL.",                    sample: '#' },
  googleUrl:           { group: 'Session',         desc: "Google Calendar event-create URL.",                      sample: '#' },
  outlookUrl:          { group: 'Session',         desc: "Outlook calendar event-create URL.",                     sample: '#' },
  yahooUrl:            { group: 'Session',         desc: "Yahoo Calendar event-create URL.",                       sample: '#' },
  // Account
  activateUrl:         { group: 'Account',         desc: "Account-activation link (invite emails).",               sample: 'https://ridleyacademy.team/activate?token=…' },
  inviterName:         { group: 'Account',         desc: "Admin who sent the invite.",                             sample: 'Admin' },
  resetUrl:            { group: 'Account',         desc: "Password-reset link.",                                   sample: 'https://ridleyacademy.team/forgot-password?token=…' },
  // Lifecycle
  onboardedDate:       { group: 'Lifecycle',       desc: "Date the student was onboarded.",                        sample: 'May 1, 2026' },
  pauseEndDate:        { group: 'Lifecycle',       desc: "Date the pause is scheduled to end.",                    sample: 'June 1, 2026' },
  endDate:             { group: 'Lifecycle',       desc: "Effective mentorship end date.",                         sample: 'May 14, 2027' },
  daysLeft:            { group: 'Lifecycle',       desc: "Days remaining until expiry.",                           sample: '30' },
  monthsAdded:         { group: 'Lifecycle',       desc: "Months added by a resign / extension.",                  sample: '3' },
  newEndDate:          { group: 'Lifecycle',       desc: "Updated effective end date after a resign.",             sample: 'August 14, 2027' },
  refundedDate:        { group: 'Lifecycle',       desc: "Date the refund was logged.",                            sample: '2026-05-01' },
  refundedAmount:      { group: 'Lifecycle',       desc: "Refund amount (numeric, no currency symbol).",           sample: '4990' },
  daysSinceZoom:       { group: 'Engagement',      desc: "Days since the student's last Zoom session.",            sample: '21' },
  daysSinceAssignment: { group: 'Engagement',      desc: "Days since the student's last assignment received.",     sample: '14' },
  winText:             { group: 'Engagement',      desc: "Text of the win the coach logged.",                      sample: 'Nailed the Module 5 final piece' },
  // Staff alerts
  alertTitle:          { group: 'Staff alerts',    desc: "Title of the service alert.",                            sample: 'Practice setup help' },
  alertDescription:    { group: 'Staff alerts',    desc: "Description / details of the alert.",                    sample: 'Student is having trouble setting up their MIDI keyboard.' },
  filedBy:             { group: 'Staff alerts',    desc: "Who filed the alert / turnover.",                        sample: 'admin@ridleyacademy.team' },
  resolutionNote:      { group: 'Staff alerts',    desc: "Resolution note when the alert is resolved.",            sample: 'Sent video walkthrough.' },
  resolvedBy:          { group: 'Staff alerts',    desc: "Who resolved the alert.",                                sample: 'carlos@ridleyacademy.team' },
  closedBy:            { group: 'Staff alerts',    desc: "Who closed the turnover.",                               sample: 'carlos@ridleyacademy.team' },
  repName:             { group: 'Staff alerts',    desc: "Rep the turnover was handed to.",                        sample: 'Carlos' },
  note:                { group: 'Staff alerts',    desc: "Note attached to the turnover.",                         sample: 'See you next week.' },
  noteBlock:           { group: 'Staff alerts',    desc: "Pre-formatted note callout (HTML block).",               sample: '<div>…</div>' },
  result:              { group: 'Staff alerts',    desc: "Outcome / result when the turnover is closed.",          sample: 'Closed — great call.' },
  // Files
  fileName:            { group: 'Files',           desc: "Uploaded file name.",                                    sample: 'Module4_Practice.mov' },
  // Cross-page
  dashboardLink:       { group: 'Links',           desc: "Direct dashboard link (student profile, alert, etc.).",  sample: 'https://ridleyacademy.team/students.html?student=1' },
  studentDashboardLink:{ group: 'Links',           desc: "Direct link to this student's CRM profile.",             sample: 'https://ridleyacademy.team/students.html?student=1' },
  communityUrl:        { group: 'Links',           desc: "Student's Community / Circle URL (if set).",             sample: 'https://community.ridleyacademy.com/c/sarah' },
  gdriveUrl:           { group: 'Links',           desc: "Student's Google Drive doc URL (if set).",               sample: 'https://drive.google.com/d/sarah' },
  videoUrl:            { group: 'Links',           desc: "Student's video URL (Dropbox or manual).",               sample: 'https://www.dropbox.com/scl/fi/sarah-module4' },
  surveyUrl:           { group: 'Links',           desc: "Student's survey URL (legacy field).",                   sample: 'https://typeform.com/sarah-onboarding' },

  // Extra student profile fields
  phone:               { group: 'Student',         desc: "Student's phone number.",                                sample: '+1 555 1234' },
  status:              { group: 'Student',         desc: "Free-text status from the profile (Active / Lead / Paused / Cancelled / Graduated).", sample: 'Active' },
  lifecycleStatus:     { group: 'Student',         desc: "Computed lifecycle status (Active / Expiring soon / Expired / Paused / Delayed start).", sample: 'Active' },
  mentor:              { group: 'Student',         desc: "Mentor name on the profile.",                            sample: 'Carlos' },
  rep:                 { group: 'Student',         desc: "Assigned sales rep / mentor name.",                      sample: 'Carlos' },
  product:             { group: 'Student',         desc: "Product on the student record.",                         sample: 'Private Mentorship' },
  level:               { group: 'Student',         desc: "Coach-assessed level (Beginner / Intermediate / Advanced).", sample: 'Intermediate' },
  currentModule:       { group: 'Student',         desc: "Current module the student is working on.",              sample: 'Module 5' },
  masterclassLevel:    { group: 'Student',         desc: "Masterclass level (Introduction / Level 1–10).",         sample: 'Level 3' },
  coachStatus:         { group: 'Student',         desc: "Coach's free-text status flag (All good / Needs attention).", sample: 'All good' },
  coachFirstName:      { group: 'Student',         desc: "Coach's first name (computed from coach field).",        sample: 'Carlos' },
  coachEmail:          { group: 'Student',         desc: "Coach's email address (when matched to a user account).", sample: 'carlos@ridleyacademy.team' },
  preferredTimeSlot:   { group: 'Student',         desc: 'Student\'s preferred schedule (e.g. "Tue/Thu 6pm CET").',sample: 'Tue/Thu 6pm CET' },
  concern:             { group: 'Student',         desc: "Concern recorded by the coach.",                         sample: 'Wrist tension during arpeggios' },
  goal:                { group: 'Student',         desc: "Goal recorded by the coach.",                            sample: 'Play Chopin Nocturne Op.9 No.2 by June' },

  // Computed lifecycle
  termMonths:          { group: 'Lifecycle',       desc: "Term length in months from the profile.",                sample: '12' },
  monthsLeft:          { group: 'Lifecycle',       desc: "Months remaining (computed).",                           sample: '8' },
  firstPurchaseDate:   { group: 'Lifecycle',       desc: "First purchase date.",                                   sample: 'May 1, 2025' },
  originalEndDate:     { group: 'Lifecycle',       desc: "Manually-set end date (override).",                      sample: 'May 1, 2026' },
  effectiveEndDate:    { group: 'Lifecycle',       desc: "Computed end date after pauses & resigns.",              sample: 'May 14, 2026' },
  daysUntilEnd:        { group: 'Lifecycle',       desc: "Days remaining until effective end date.",               sample: '30' },
  daysOverdue:         { group: 'Lifecycle',       desc: "Days past the effective end date (0 if active).",        sample: '0' },
  lastZoomDate:        { group: 'Engagement',      desc: "Date of the student's most recent Zoom session.",        sample: '2026-05-01' },
  lastAssignmentSent:  { group: 'Engagement',      desc: "Date of the last assignment the coach sent.",            sample: '2026-04-28' },
  lastAssignmentReceived:{ group: 'Engagement',    desc: "Date of the last assignment the student turned in.",     sample: '2026-04-30' },
  daysSinceLastZoom:   { group: 'Engagement',      desc: "Days since the student's last Zoom session.",            sample: '7' },
  daysSinceLastAssignment:{ group: 'Engagement',   desc: "Days since the student's last assignment received.",     sample: '8' },
  openAlertsCount:     { group: 'Engagement',      desc: "Count of unresolved service alerts.",                    sample: '0' },
  winsCount:           { group: 'Engagement',      desc: "Number of wins logged for this student.",                sample: '4' },
  pausedDaysTotal:     { group: 'Engagement',      desc: "Total days the student has spent on pause.",             sample: '14' },

  // Globals — always available
  companyName:         { group: 'Global',          desc: "Your company name.",                                     sample: 'Ridley Academy' },
  websiteUrl:          { group: 'Global',          desc: "Public website URL.",                                    sample: 'https://ridleyacademy.com' },
  dashboardBaseUrl:    { group: 'Global',          desc: "Dashboard base URL (use in links).",                     sample: 'https://ridleyacademy.team' },
  supportEmail:        { group: 'Global',          desc: "Support email address.",                                 sample: 'support@ridleyacademy.com' },
  signOff:             { group: 'Global',          desc: "Standard email sign-off.",                               sample: 'The Ridley Academy team' },
  logoUrl:             { group: 'Global',          desc: "Logo image URL (use in custom HTML).",                   sample: 'https://cdn.accelonline.io/.../logo.webp' },
  currentDate:         { group: 'Global',          desc: "Today's date (UTC, short).",                             sample: '5/8/2026' },
  currentDateLong:     { group: 'Global',          desc: "Today's date (UTC, long form).",                         sample: 'Friday, May 8, 2026' },
  currentDay:          { group: 'Global',          desc: "Today's weekday (UTC).",                                 sample: 'Friday' },
  currentMonth:        { group: 'Global',          desc: "Current month name (UTC).",                              sample: 'May' },
  currentYear:         { group: 'Global',          desc: "Current 4-digit year (UTC).",                            sample: '2026' },
  currentTimeUtc:      { group: 'Global',          desc: "Current time in UTC.",                                   sample: '6:00 PM UTC' },
};
function _varMeta(name) { return VAR_CATALOG[name] || { group: 'Other', desc: '', sample: '' }; }

// Tracks which input/editor was most recently focused so chips know where to insert.
let _lastFocusedField = 'quill';

function insertVariableAtFocus(varName, withFallback = false) {
  const meta = _varMeta(varName);
  const fallback = withFallback ? '|' + (meta.sample ? String(meta.sample).replace(/[<>]/g,'') : 'there') : '';
  const text = '{{' + varName + fallback + '}}';
  if (_lastFocusedField === 'quill' && quill) {
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertText(range.index, text, 'user');
    quill.setSelection(range.index + text.length, 0, 'user');
  } else {
    const input = document.getElementById(_lastFocusedField);
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
    // Trigger input event so the live preview refreshes
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  debouncedRefreshPreview();
}

function renderVariablePanelHtml(varNames) {
  if (!varNames || !varNames.length) return '<em style="color:var(--text-dim);font-size:0.78rem;">No variables defined.</em>';
  const groups = {};
  for (const v of varNames) {
    const m = _varMeta(v);
    (groups[m.group] = groups[m.group] || []).push({ name: v, meta: m });
  }
  const groupOrder = ['Recipient','Student','Personalization','Session','Account','Lifecycle','Engagement','Staff alerts','Files','Links','Global','Other'];
  return `
    <div class="ea-var-panel">
      <div class="ea-var-search-row">
        <input id="ea-var-search" type="search" placeholder="Search variables…">
        <span class="ea-var-tip">Click chip → insert. Click <strong>ƒ</strong> → insert with fallback. Works in subject, preheader &amp; body.</span>
      </div>
      <div class="ea-var-groups" id="ea-var-groups">
        ${groupOrder.filter(g => groups[g]).map(g => `
          <div class="ea-var-group" data-group="${g}">
            <div class="ea-var-group-label">${g}</div>
            <div class="ea-var-chips">
              ${groups[g].map(v => `
                <span class="ea-var-chip" data-var="${escapeHtml(v.name)}" title="${escapeHtml(v.meta.desc)}${v.meta.sample ? '\n\nSample: ' + String(v.meta.sample) : ''}">
                  <button type="button" class="chip-main" data-insert-var="${escapeHtml(v.name)}">{{${escapeHtml(v.name)}}}</button>
                  <button type="button" class="chip-fallback" data-insert-var-fallback="${escapeHtml(v.name)}" title="Insert with fallback: {{${escapeHtml(v.name)}|${escapeHtml(String(v.meta.sample || 'there').slice(0,16))}}}">ƒ</button>
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function wireVariablePanel(scope) {
  scope.querySelectorAll('[data-insert-var]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); insertVariableAtFocus(b.dataset.insertVar, false); }));
  scope.querySelectorAll('[data-insert-var-fallback]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); insertVariableAtFocus(b.dataset.insertVarFallback, true); }));
  const search = scope.querySelector('#ea-var-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const groups = scope.querySelectorAll('.ea-var-group');
      let anyVisible = false;
      groups.forEach(g => {
        let groupHasMatch = false;
        g.querySelectorAll('.ea-var-chip').forEach(chip => {
          const v = chip.dataset.var.toLowerCase();
          const m = _varMeta(chip.dataset.var);
          const matches = !q || v.includes(q) || (m.desc || '').toLowerCase().includes(q);
          chip.style.display = matches ? '' : 'none';
          if (matches) groupHasMatch = true;
        });
        g.style.display = groupHasMatch ? '' : 'none';
        if (groupHasMatch) anyVisible = true;
      });
    });
  }
}

// ── {{ Autocomplete for subject + preheader ────────────────────────────────
// When the user types {{ in either input, pop a list of variables filtered by
// what comes after. Arrow keys + Enter to insert, Esc to cancel.
function attachAutocomplete(inputEl, getVarNames) {
  let pop = null;
  let activeIdx = 0;
  let visible = [];
  function close() { if (pop) { pop.remove(); pop = null; } }
  function trigPosition() {
    // Returns { start, query } if cursor is inside a {{… token; null otherwise.
    const v = inputEl.value;
    const c = inputEl.selectionStart ?? 0;
    const open = v.lastIndexOf('{{', c - 1);
    if (open < 0) return null;
    const close = v.indexOf('}}', open);
    if (close >= 0 && close < c) return null; // already closed
    return { start: open, query: v.slice(open + 2, c).trim() };
  }
  function render() {
    const trig = trigPosition();
    if (!trig) { close(); return; }
    const q = trig.query.toLowerCase();
    const names = getVarNames() || [];
    visible = names
      .map(n => ({ name: n, ...(_varMeta(n)) }))
      .filter(v => !q || v.name.toLowerCase().includes(q))
      .slice(0, 8);
    if (!visible.length) { close(); return; }
    activeIdx = Math.min(activeIdx, visible.length - 1);
    if (!pop) {
      pop = document.createElement('div'); pop.className = 'ea-autocomplete';
      document.body.appendChild(pop);
    }
    const rect = inputEl.getBoundingClientRect();
    pop.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    pop.style.left = (rect.left + window.scrollX) + 'px';
    pop.innerHTML = visible.map((v, i) =>
      `<div class="ea-autocomplete-item ${i === activeIdx ? 'active' : ''}" data-i="${i}">
        <span class="ac-name">{{${v.name}}}</span>
        <span class="ac-desc">${escapeHtml(v.desc || '')}${v.sample ? ' · sample: ' + escapeHtml(String(v.sample)) : ''}</span>
      </div>`
    ).join('');
    pop.querySelectorAll('.ea-autocomplete-item').forEach(el => el.addEventListener('mousedown', (e) => { e.preventDefault(); pick(Number(el.dataset.i)); }));
  }
  function pick(i) {
    const trig = trigPosition();
    const v = visible[i];
    if (!trig || !v) return;
    const before = inputEl.value.slice(0, trig.start);
    const after  = inputEl.value.slice(inputEl.selectionStart);
    const token  = '{{' + v.name + '}}';
    inputEl.value = before + token + after;
    const newPos = before.length + token.length;
    inputEl.selectionStart = inputEl.selectionEnd = newPos;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    close();
  }
  inputEl.addEventListener('input', render);
  inputEl.addEventListener('keydown', (e) => {
    if (!pop) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % visible.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + visible.length) % visible.length; render(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (visible[activeIdx]) { e.preventDefault(); pick(activeIdx); } }
    else if (e.key === 'Escape') { close(); }
  });
  inputEl.addEventListener('blur', () => setTimeout(close, 200));
}

// ── Recipient-kind filtering ────────────────────────────────────────────────
// Different triggers have different relevant "Send to" options. Student-side
// events shouldn't show "All active students" (that's broadcast-only). Staff
// events shouldn't show "The student" (those emails never go to students).
function _naturalRecipientFor(a) {
  if (a.trigger_type === 'event') {
    const evt = availableEvents.find(e => e.key === a.trigger_event);
    return evt?.recipient || 'student';
  }
  return 'student'; // manual broadcasts target students by default
}
function _defaultLabelFor(a) {
  if (a.trigger_type === 'manual') return 'Default (the students you pick when broadcasting)';
  const evt = availableEvents.find(e => e.key === a.trigger_event);
  if (!evt) return 'Default (event\'s natural recipient)';
  if (evt.recipient === 'student') return 'Default (the student)';
  if (evt.recipient === 'custom') {
    // Staff fan-out — describe per event
    if (/turnover/.test(evt.key))  return 'Default (handed-to rep + assigned coach + I-Cs)';
    if (/alert/.test(evt.key))     return 'Default (assigned coach + Mentorship I-Cs)';
    if (/survey|video/.test(evt.key)) return 'Default (assigned coach + I-Cs)';
    if (evt.key === 'user_invited') return 'Default (the invited person)';
    return 'Default (event\'s natural recipient list)';
  }
  return 'Default';
}
function filteredRecipientKindsFor(a) {
  const all = recipientKinds || [];
  const triggerType = a.trigger_type;
  const natural = _naturalRecipientFor(a);
  let allowed;
  if (triggerType === 'manual') {
    // Broadcasts can target most things, including "all active students"
    allowed = ['default', 'student', 'coach', 'ms_ic', 'delivery_ic', 'all_admins', 'all_active_students', 'specific_email'];
  } else if (natural === 'student') {
    // Student-recipient events: can redirect to coach / I-Cs / admin / specific
    allowed = ['default', 'student', 'coach', 'ms_ic', 'delivery_ic', 'all_admins', 'specific_email'];
  } else if (natural === 'custom') {
    // Staff events: never go to the student; no broadcasting either
    allowed = ['default', 'coach', 'ms_ic', 'delivery_ic', 'all_admins', 'specific_email'];
  } else {
    allowed = all.map(k => k.value);
  }
  // Re-label the "default" option in context.
  const defaultLabel = _defaultLabelFor(a);
  return all.filter(k => allowed.includes(k.value)).map(k => k.value === 'default' ? { ...k, label: defaultLabel } : k);
}

function triggerOptionsHtml(a) {
  // Build a grouped <select> for non-system rows. Disables events that are
  // already in use by another enabled automation, and tags 'planned' events
  // (catalog-only, no upstream emitter yet) so admins know what's wired.
  const isManual = a.trigger_type === 'manual';
  let opts = `<option value="manual" ${isManual ? 'selected' : ''}>Manual broadcast (you pick recipients)</option>`;
  // Bucket events by group, preserving order from availableEvents.
  const groups = {};
  for (const ev of availableEvents) {
    const g = ev.group || 'Other';
    (groups[g] = groups[g] || []).push(ev);
  }
  for (const [groupName, evs] of Object.entries(groups)) {
    opts += `<optgroup label="${escapeHtml(groupName)}">`;
    for (const ev of evs) {
      const blocked = ev.in_use && ev.key !== a.trigger_event;
      const planned = ev.status === 'planned';
      let label = ev.label;
      if (blocked) label += ' — already in use';
      else if (planned) label += ' (planned — needs wiring)';
      const sel = a.trigger_event === ev.key ? 'selected' : '';
      opts += `<option value="${escapeHtml(ev.key)}" ${sel} ${blocked ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
    }
    opts += '</optgroup>';
  }
  return opts;
}

async function loadAvailableEvents() {
  try {
    const j = await api('?api=available-events');
    availableEvents = j.events || [];
  } catch (e) { console.warn('available-events failed', e); availableEvents = []; }
}

async function api(path, opts = {}) {
  const r = await fetch(EA_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + currentSession.access_token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

async function loadAutomations() {
  const list = document.getElementById('eaList');
  list.innerHTML = '<div style="color:var(--text-dim);padding:16px;font-size:0.84rem;">Loading…</div>';
  try {
    const j = await api('?api=list&kind=' + (listView === 'templates' ? 'templates' : 'automations'));
    automations = j.rows || [];
    if (!automations.length) {
      list.innerHTML = `<div style="color:var(--text-dim);padding:16px;font-size:0.84rem;">No ${listView === 'templates' ? 'templates' : 'automations'} yet. Click <strong>+ New ${listView === 'templates' ? 'template' : 'automation'}</strong> to make one.</div>`;
      return;
    }
    renderList();
  } catch (e) {
    console.error('[email-automations] load failed:', e);
    list.innerHTML = `<div style="color:var(--red);padding:16px;font-size:0.84rem;"><strong>Failed to load:</strong><br>${escapeHtml(e.message || e)}</div>`;
  }
}

function renderList() {
  const list = document.getElementById('eaList');
  document.getElementById('eaCount').textContent = `${automations.length} total`;
  list.innerHTML = automations.map(a => {
    const sel = currentAutomation?.id === a.id ? 'selected' : '';
    const trigger = a.trigger_type === 'manual' ? 'Manual broadcast' : (a.trigger_event || a.trigger_type);
    return `<div class="ea-row ${sel}" data-id="${a.id}">
      <div class="ea-row-name">${escapeHtml(a.name)}</div>
      <div class="ea-row-meta">
        <span class="pill ${a.is_system ? 'pill-system' : 'pill-manual'}">${a.is_system ? 'System' : 'Manual'}</span>
        <span class="pill ${a.enabled ? 'pill-on' : 'pill-off'}">${a.enabled ? 'On' : 'Off'}</span>
        <span>${escapeHtml(trigger)}</span>
        ${a.send_count ? `<span>· sent ${a.send_count}×</span>` : ''}
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.ea-row').forEach(r => r.addEventListener('click', () => openAutomation(parseInt(r.dataset.id, 10))));
}

// Re-entrancy guard — rapid clicks across rows would otherwise pile up Quill
// instances and race on currentAutomation. Track the latest requested id; if a
// newer click lands while we're still fetching, drop the older response.
let _openLatestId = 0;
async function openAutomation(id) {
  _openLatestId = id;
  // 1. INSTANT visual feedback — paint the selected row + "Loading…" editor
  //    pane BEFORE awaiting the network. Without this the UI looks frozen for
  //    the duration of the round-trip (network + edge-function cold-start +
  //    SELECT). Most of the perceived "very long to load" is this gap.
  const list = document.getElementById('eaList');
  if (list) list.querySelectorAll('.ea-row').forEach(r => {
    r.classList.toggle('selected', parseInt(r.dataset.id, 10) === id);
  });
  // Tear down any existing Quill so its toolbar / DOM doesn't sit there stale
  // while the new one is being fetched.
  if (quill) { try { quill = null; } catch (_) {} }
  const ed = document.getElementById('eaEditor');
  if (ed) ed.innerHTML = '<div class="ea-editor-empty" style="display:flex;align-items:center;justify-content:center;gap:10px;"><span class="spinner" style="width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;display:inline-block;animation:eaSpin 0.7s linear infinite;"></span>Loading…</div>';
  if (!document.getElementById('eaSpinKf')) {
    const st = document.createElement('style'); st.id = 'eaSpinKf';
    st.textContent = '@keyframes eaSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  try {
    const j = await api('?api=get&id=' + id);
    // A newer click landed — drop this response.
    if (_openLatestId !== id) return;
    currentAutomation = j.row;
    renderEditor();
  } catch (e) {
    if (_openLatestId !== id) return;
    if (ed) ed.innerHTML = `<div class="ea-editor-empty" style="color:var(--red);">Load failed: ${escapeHtml(e.message)}</div>`;
  }
}

function renderEditor() {
  const ed = document.getElementById('eaEditor');
  if (!currentAutomation) { ed.innerHTML = '<div class="ea-editor-empty">Select an automation on the left to edit it, or click <strong>+ New automation</strong>.</div>'; return; }
  const a = currentAutomation;
  const varPanelHtml = renderVariablePanelHtml(a.variables_available || []);
  ed.innerHTML = `
    <div class="ea-tabs">
      <button class="ea-tab active" data-tab="edit">Edit</button>
      <button class="ea-tab" data-tab="history">Send history</button>
    </div>
    <div data-tabpane="edit">
      <div class="ea-split">
        <div class="ea-edit-pane">
          <div class="ea-editor-head">
            <input class="ea-name" id="ea-name" value="${escapeHtml(a.name)}" ${a.is_system ? 'readonly' : ''} placeholder="Automation name">
            <label style="display:flex;align-items:center;gap:6px;font-size:0.84rem;color:var(--text-muted);cursor:pointer;">
              <input type="checkbox" id="ea-enabled" ${a.enabled ? 'checked' : ''}> Enabled
            </label>
          </div>
          <div class="ea-editor-row">
            <label>Trigger</label>
            ${a.is_system
              ? `<input value="${escapeHtml(a.trigger_event || 'Manual broadcast')}" readonly title="System automation triggers can\\'t be re-targeted (you can still toggle Enabled).">`
              : `<select id="ea-trigger">${triggerOptionsHtml(a)}</select>`}
          </div>
          <div class="ea-editor-row">
            <label title="Who receives the email when the trigger fires.">Send to</label>
            <select id="ea-recipient-kind" style="flex:1;">
              ${filteredRecipientKindsFor(a).map(k => `<option value="${escapeHtml(k.value)}" ${(a.recipient_kind||'default')===k.value?'selected':''}>${escapeHtml(k.label)}</option>`).join('')}
            </select>
          </div>
          <div class="ea-editor-row" id="ea-recipient-email-row" style="display:${(a.recipient_kind==='specific_email')?'flex':'none'};">
            <label>To email(s)</label>
            <input id="ea-recipient-email" type="text" value="${escapeHtml(a.recipient_email||'')}" placeholder="address@example.com (comma-separated for multiple)">
          </div>
          <div class="ea-editor-row">
            <label title='Custom "From" name in the recipient\\'s inbox. Variables work — type {{ for autocomplete, or click a chip below. Leave blank for the default ("Ridley Academy Mentorship").'>From name</label>
            <input id="ea-from-name" type="text" value="${escapeHtml(a.from_name||'')}" placeholder='e.g. {{coachFirstName|Ridley Academy Mentorship}}'>
          </div>
          <div class="ea-editor-row">
            <label title="If a recipient hits Reply, where should the email go? Variables work — e.g. {{coachEmail}} routes replies to that student's coach.">Reply-to</label>
            <input id="ea-reply-to" type="text" value="${escapeHtml(a.reply_to_email||'')}" placeholder="e.g. {{coachEmail|mentorship@ridleyacademy.team}}">
          </div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin:-6px 0 6px;padding-left:100px;">
            💡 Both fields accept <code>{{variables}}</code> rendered per recipient. Try <code>{{coachEmail}}</code> in Reply-to so replies go to each student's coach.
          </div>
          ${a.is_system ? '' : `
          <div class="ea-editor-row">
            <label title="Make this a reusable template instead of an active automation. Templates don't fire; users start new automations from them.">As template</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.84rem;color:var(--text-muted);cursor:pointer;flex:1;">
              <input type="checkbox" id="ea-is-template" ${a.is_template ? 'checked' : ''}> Save as reusable template (no trigger, used as starter for new automations)
            </label>
          </div>`}
          <div class="ea-editor-row"><label>Subject</label><input id="ea-subject" value="${escapeHtml(a.subject)}"></div>
          <div class="ea-editor-row">
            <label title="The hidden preview text shown in inbox under the subject. Email apps show ~60–90 chars.">Preheader</label>
            <input id="ea-preheader" value="${escapeHtml(a.preheader || '')}" placeholder="Inbox preview text (60–90 chars)" maxlength="200">
          </div>
          <div class="ea-editor-row">
            <label title="How long to wait after the trigger fires before sending.">Send delay</label>
            <select id="ea-delay" style="flex:1;">
              <option value="0" ${(a.delay_minutes||0)===0?'selected':''}>Send immediately</option>
              <option value="15" ${a.delay_minutes===15?'selected':''}>15 minutes after</option>
              <option value="60" ${a.delay_minutes===60?'selected':''}>1 hour after</option>
              <option value="240" ${a.delay_minutes===240?'selected':''}>4 hours after</option>
              <option value="1440" ${a.delay_minutes===1440?'selected':''}>1 day after</option>
              <option value="2880" ${a.delay_minutes===2880?'selected':''}>2 days after</option>
              <option value="4320" ${a.delay_minutes===4320?'selected':''}>3 days after</option>
              <option value="10080" ${a.delay_minutes===10080?'selected':''}>1 week after</option>
              <option value="20160" ${a.delay_minutes===20160?'selected':''}>2 weeks after</option>
              <option value="43200" ${a.delay_minutes===43200?'selected':''}>30 days after</option>
              <option value="custom" ${(a.delay_minutes>0 && ![15,60,240,1440,2880,4320,10080,20160,43200].includes(a.delay_minutes))?'selected':''}>Custom…</option>
            </select>
            <input id="ea-delay-custom" type="number" min="1" max="43200" placeholder="minutes" style="flex:0 0 110px;display:${(a.delay_minutes>0 && ![15,60,240,1440,2880,4320,10080,20160,43200].includes(a.delay_minutes))?'block':'none'};" value="${(a.delay_minutes>0 && ![15,60,240,1440,2880,4320,10080,20160,43200].includes(a.delay_minutes))?a.delay_minutes:''}">
          </div>
          <div style="margin-top:14px;">
            <label style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">Email body</label>
            <div class="ea-block-bar">
              <button type="button" class="ea-block-btn" data-insert="button"><span class="em">🔘</span> Button</button>
              <button type="button" class="ea-block-btn" data-insert="callout"><span class="em">💡</span> Callout box</button>
              <button type="button" class="ea-block-btn" data-insert="divider"><span class="em">⎯</span> Divider</button>
              <button type="button" class="ea-block-btn" data-insert="image"><span class="em">🖼</span> Image</button>
              <button type="button" class="ea-block-btn" data-insert="snippet" title="Insert a saved snippet (signature, CTA, etc.)"><span class="em">📋</span> Snippet</button>
              <button type="button" class="ea-block-btn" data-insert="rawhtml" title="Switch to raw HTML edit for fine control"><span class="em">⟨/⟩</span> Raw HTML</button>
            </div>
            <div id="ea-quill"></div>
          </div>
          <div style="margin-top:14px;"><label style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">Plain-text fallback</label><textarea id="ea-text">${escapeHtml(a.text_body || '')}</textarea></div>
          <div style="margin-top:10px;">
            <label style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">Variables — click to insert into the last-focused field</label>
            ${varPanelHtml}
            <div style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;line-height:1.5;">
              <strong>Pro tip:</strong> hover any chip to see what it stands for and a sample value. Or type <code style="background:var(--surface2);padding:1px 5px;border-radius:4px;">{{</code> directly in the subject / preheader for autocomplete.
            </div>
          </div>
          <div class="ea-actions">
            <button class="btn-primary" id="ea-save">Save</button>
            <button class="btn-ghost" id="ea-test">Send test to me</button>
            ${a.trigger_type === 'event' ? '<button class="btn-ghost" id="ea-test-fire" title="Fire this event through dispatch-event using a real student row. Sends to a single override address only.">🧪 Test fire event…</button>' : ''}
            ${a.trigger_type === 'manual' ? '<button class="btn-ghost" id="ea-broadcast">📨 Broadcast to students…</button>' : ''}
            <button class="btn-ghost" id="ea-duplicate">Duplicate</button>
            ${a.is_system ? '' : '<button class="btn-danger" id="ea-delete">Delete</button>'}
          </div>
          <div id="ea-msg"></div>
          <div class="ea-meta-line">Last updated ${new Date(a.updated_at).toLocaleString()}${a.last_edited_by_email ? ' by ' + escapeHtml(a.last_edited_by_email) : ''}</div>
        </div>
        <div class="ea-preview-pane">
          <div class="ea-preview-head">
            <h3>👁 Live preview</h3>
            <div class="ea-preview-toolbar">
              <button type="button" id="prev-desktop" class="active" title="Desktop width">🖥</button>
              <button type="button" id="prev-mobile" title="Phone width">📱</button>
            </div>
          </div>
          <div class="ea-preview-subject" id="prev-subject"><strong>Subject:</strong> <span id="prev-subject-text">—</span></div>
          <iframe id="prev-frame" class="ea-preview-frame" sandbox="allow-same-origin"></iframe>
        </div>
      </div>
    </div>
    <div data-tabpane="history" style="display:none;"><div id="ea-sends">Loading…</div></div>
  `;
  ensureEmailBlockBlotRegistered();
  quill = new Quill('#ea-quill', {
    theme: 'snow',
    placeholder: 'Compose the email body…',
    modules: {
      toolbar: [
        [{ header: [false, 1, 2, 3] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['link'],
        ['clean']
      ]
    }
  });
  // Re-hydrate any previously-saved email-block divs as embeds so Quill
  // treats them atomically (and so their inner HTML survives the round-trip).
  registerEmailBlockClipboardMatcher();
  quill.clipboard.dangerouslyPasteHTML(a.html_body || '');

  // Variable panel — searchable chips with fallback affordance
  wireVariablePanel(ed);

  // Focus tracker — chips insert into whichever field was last focused
  const subjectEl   = document.getElementById('ea-subject');
  const preheaderEl = document.getElementById('ea-preheader');
  const fromNameEl  = document.getElementById('ea-from-name');
  const replyToEl   = document.getElementById('ea-reply-to');
  subjectEl?.addEventListener('focus',   () => _lastFocusedField = 'ea-subject');
  preheaderEl?.addEventListener('focus', () => _lastFocusedField = 'ea-preheader');
  fromNameEl?.addEventListener('focus',  () => _lastFocusedField = 'ea-from-name');
  replyToEl?.addEventListener('focus',   () => _lastFocusedField = 'ea-reply-to');
  quill.on('selection-change', (range) => { if (range) _lastFocusedField = 'quill'; });

  // Autocomplete on {{ in subject + preheader + from-name + reply-to
  if (subjectEl)   attachAutocomplete(subjectEl,   () => currentAutomation?.variables_available || []);
  if (preheaderEl) attachAutocomplete(preheaderEl, () => currentAutomation?.variables_available || []);
  if (fromNameEl)  attachAutocomplete(fromNameEl,  () => currentAutomation?.variables_available || []);
  if (replyToEl)   attachAutocomplete(replyToEl,   () => currentAutomation?.variables_available || []);
  document.getElementById('ea-save').addEventListener('click', saveAutomation);
  document.getElementById('ea-test').addEventListener('click', sendTest);
  document.getElementById('ea-test-fire')?.addEventListener('click', testFireEvent);
  document.getElementById('ea-duplicate').addEventListener('click', duplicateAutomation);
  document.getElementById('ea-delete')?.addEventListener('click', deleteAutomation);
  document.getElementById('ea-broadcast')?.addEventListener('click', openBroadcastModal);
  ed.querySelectorAll('.ea-tab').forEach(t => t.addEventListener('click', () => {
    ed.querySelectorAll('.ea-tab').forEach(x => x.classList.toggle('active', x === t));
    ed.querySelectorAll('[data-tabpane]').forEach(p => p.style.display = p.dataset.tabpane === t.dataset.tab ? '' : 'none');
    if (t.dataset.tab === 'history') loadSends();
  }));

  // ── Insert-block buttons ───────────────────────────────────────────────
  ed.querySelectorAll('.ea-block-btn[data-insert]').forEach(b => {
    b.addEventListener('click', () => {
      const kind = b.dataset.insert;
      if (kind === 'button')   openButtonBuilder();
      if (kind === 'callout')  openCalloutBuilder();
      if (kind === 'divider')  insertHtmlAtCursor('<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">');
      if (kind === 'image')    openImageBuilder();
      if (kind === 'snippet')  openSnippetPicker();
      if (kind === 'rawhtml')  openRawHtmlEditor();
    });
  });

  // ── Custom-delay toggle ────────────────────────────────────────────────
  document.getElementById('ea-delay')?.addEventListener('change', () => {
    const sel = document.getElementById('ea-delay');
    document.getElementById('ea-delay-custom').style.display = sel.value === 'custom' ? 'block' : 'none';
  });
  // Recipient-kind toggle — show specific-email input only when "specific_email" is picked
  document.getElementById('ea-recipient-kind')?.addEventListener('change', () => {
    const v = document.getElementById('ea-recipient-kind').value;
    document.getElementById('ea-recipient-email-row').style.display = v === 'specific_email' ? 'flex' : 'none';
  });
  // When the trigger changes on a non-system row, the relevant "Send to"
  // options change too — rebuild the dropdown in place.
  document.getElementById('ea-trigger')?.addEventListener('change', () => {
    const trigSel = document.getElementById('ea-trigger');
    const rkSel = document.getElementById('ea-recipient-kind');
    if (!rkSel) return;
    const pretend = { ...currentAutomation, trigger_type: trigSel.value === 'manual' ? 'manual' : 'event', trigger_event: trigSel.value === 'manual' ? null : trigSel.value };
    const opts = filteredRecipientKindsFor(pretend);
    const prevValue = rkSel.value;
    // Preserve current selection if still valid; otherwise fall back to default.
    const newSelection = opts.some(o => o.value === prevValue) ? prevValue : 'default';
    rkSel.innerHTML = opts.map(k => `<option value="${escapeHtml(k.value)}" ${newSelection===k.value?'selected':''}>${escapeHtml(k.label)}</option>`).join('');
    document.getElementById('ea-recipient-email-row').style.display = newSelection === 'specific_email' ? 'flex' : 'none';
  });

  // ── Live preview wiring ────────────────────────────────────────────────
  quill.on('text-change', debouncedRefreshPreview);
  document.getElementById('ea-subject')?.addEventListener('input', debouncedRefreshPreview);
  document.getElementById('ea-preheader')?.addEventListener('input', debouncedRefreshPreview);
  document.getElementById('prev-desktop')?.addEventListener('click', () => {
    document.getElementById('prev-frame').classList.remove('mobile-w');
    document.getElementById('prev-desktop').classList.add('active');
    document.getElementById('prev-mobile').classList.remove('active');
  });
  document.getElementById('prev-mobile')?.addEventListener('click', () => {
    document.getElementById('prev-frame').classList.add('mobile-w');
    document.getElementById('prev-mobile').classList.add('active');
    document.getElementById('prev-desktop').classList.remove('active');
  });
  // Initial render after Quill has hydrated.
  setTimeout(refreshPreview, 50);
}

function _readDelayMinutes() {
  const sel = document.getElementById('ea-delay');
  if (!sel) return 0;
  if (sel.value === 'custom') {
    return Math.max(0, Number(document.getElementById('ea-delay-custom').value) || 0);
  }
  return Math.max(0, Number(sel.value) || 0);
}

async function saveAutomation() {
  const msg = document.getElementById('ea-msg');
  msg.className = 'ea-msg'; msg.textContent = 'Saving…';
  try {
    const html_body = quill.root.innerHTML;
    const body = {
      name: document.getElementById('ea-name').value.trim(),
      subject: document.getElementById('ea-subject').value.trim(),
      preheader: document.getElementById('ea-preheader').value.trim(),
      delay_minutes: _readDelayMinutes(),
      recipient_kind: document.getElementById('ea-recipient-kind')?.value || 'default',
      recipient_email: document.getElementById('ea-recipient-email')?.value?.trim() || null,
      from_name: document.getElementById('ea-from-name')?.value?.trim() || null,
      reply_to_email: document.getElementById('ea-reply-to')?.value?.trim() || null,
      html_body,
      text_body: document.getElementById('ea-text').value,
      enabled: document.getElementById('ea-enabled').checked,
    };
    // Optional template toggle (non-system rows only)
    const tpl = document.getElementById('ea-is-template');
    if (tpl) body.is_template = tpl.checked;
    // Trigger select only exists on non-system rows.
    const trigSel = document.getElementById('ea-trigger');
    if (trigSel) {
      if (trigSel.value === 'manual') {
        body.trigger_type = 'manual';
        body.trigger_event = null;
      } else {
        body.trigger_type = 'event';
        body.trigger_event = trigSel.value;
      }
    }
    const j = await api('?api=update&id=' + currentAutomation.id, { method: 'POST', body });
    currentAutomation = j.row;
    msg.className = 'ea-msg ok'; msg.textContent = 'Saved.';
    await Promise.all([loadAutomations(), loadAvailableEvents()]);
    // Re-render so the variable list / chips update if the trigger changed.
    renderEditor();
  } catch (e) { msg.className = 'ea-msg err'; msg.textContent = 'Failed: ' + e.message; }
}

async function sendTest() {
  const msg = document.getElementById('ea-msg');
  const to = prompt('Send a test of "' + currentAutomation.name + '" to which email?', currentSession.user.email);
  if (!to) return;
  await saveAutomation();
  msg.className = 'ea-msg'; msg.textContent = 'Sending test…';
  try {
    await api('?api=send-test', { method: 'POST', body: { id: currentAutomation.id, to } });
    msg.className = 'ea-msg ok'; msg.textContent = `Test sent to ${to}.`;
  } catch (e) { msg.className = 'ea-msg err'; msg.textContent = 'Failed: ' + e.message; }
}

// ── Test-fire an event automation through the real dispatch pipeline ─────
// Routes through email-automations?api=test-fire, which proxies to
// dispatch-event server-side (so the dispatch secret stays out of the
// browser). Useful for validating an event automation end-to-end against a
// real student row — vars render exactly as they will in production.
async function testFireEvent() {
  const msg = document.getElementById('ea-msg');
  if (!currentAutomation?.enabled) {
    msg.className = 'ea-msg err';
    msg.textContent = 'Enable the automation first — dispatch-event skips disabled automations.';
    return;
  }
  await saveAutomation();
  const override = prompt(
    'Test-fire "' + currentAutomation.name + '" — send the actual rendered email to which address?\n\n' +
    '(Recipient resolution is bypassed; only this address receives it.)',
    currentSession.user.email
  );
  if (!override) return;
  const studentIdStr = prompt(
    'Use which student\'s data for variable rendering?\n\n' +
    'Enter a student ID (number) from the CRM, or leave blank to auto-pick an active student.',
    ''
  );
  const body = { id: currentAutomation.id, override_to: override };
  if (studentIdStr && /^\d+$/.test(studentIdStr.trim())) body.student_id = Number(studentIdStr.trim());
  msg.className = 'ea-msg'; msg.textContent = 'Firing event through dispatch-event…';
  try {
    const j = await api('?api=test-fire', { method: 'POST', body });
    const d = j.dispatch || {};
    if (d.skipped) {
      msg.className = 'ea-msg err';
      msg.textContent = `dispatch-event skipped: ${d.skipped}`;
      return;
    }
    msg.className = 'ea-msg ok';
    msg.textContent = `Fired ${currentAutomation.trigger_event} → ${override} (sent: ${d.sent || 0}, failed: ${d.failed || 0}${d.scheduled ? `, scheduled +${d.delay_minutes}min` : ''})`;
  } catch (e) {
    msg.className = 'ea-msg err';
    msg.textContent = 'Failed: ' + e.message;
  }
}

async function duplicateAutomation() {
  try {
    const j = await api('?api=duplicate&id=' + currentAutomation.id, { method: 'POST' });
    await loadAutomations();
    openAutomation(j.row.id);
  } catch (e) { alert('Duplicate failed: ' + e.message); }
}

async function deleteAutomation() {
  if (!confirm(`Delete "${currentAutomation.name}"? This cannot be undone.`)) return;
  try {
    await api('?api=delete&id=' + currentAutomation.id, { method: 'POST' });
    currentAutomation = null;
    await loadAutomations();
    renderEditor();
  } catch (e) { alert('Delete failed: ' + e.message); }
}

document.getElementById('newBtn')?.addEventListener('click', openNewAutomationModal);
document.getElementById('suppressionsBtn')?.addEventListener('click', openSuppressionsModal);

async function openSuppressionsModal() {
  let rows = [];
  try { const j = await api('?api=suppressions-list'); rows = j.rows || []; }
  catch (e) { alert('Failed to load suppressions: ' + e.message); return; }
  document.getElementById('suppressionsModal')?.remove();
  const m = document.createElement('div');
  m.id = 'suppressionsModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card" style="max-width:680px;">
      <div class="modal-head"><h2>Suppressed addresses</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Addresses on this list never receive automated emails. Resend adds them automatically on hard-bounce or spam complaint; you can add manual entries too.</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <input id="sup-email" type="email" placeholder="address@example.com" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 12px;color:var(--text);font:inherit;">
          <input id="sup-reason" type="text" placeholder="reason (optional)" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 12px;color:var(--text);font:inherit;">
          <button class="btn-primary" id="sup-add">Suppress</button>
        </div>
        ${rows.length ? `<div style="border:1px solid var(--border);border-radius:10px;background:var(--bg);max-height:400px;overflow-y:auto;">
          ${rows.map(r => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.86rem;">${escapeHtml(r.email)}</div>
                <div style="font-size:0.72rem;color:var(--text-dim);">${escapeHtml(r.source || '')}${r.reason ? ' · ' + escapeHtml(r.reason) : ''} · ${new Date(r.added_at).toLocaleDateString()}</div>
              </div>
              <button class="btn-ghost" data-rescue="${escapeHtml(r.email)}" title="Remove from suppression list — future emails to this address will go through.">Rescue</button>
            </div>
          `).join('')}
        </div>` : '<div style="color:var(--text-dim);font-size:0.86rem;padding:14px;text-align:center;">No suppressions yet.</div>'}
      </div>
      <div class="modal-foot"><button class="btn-ghost" data-x>Close</button></div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  document.getElementById('sup-add').addEventListener('click', async () => {
    const email = document.getElementById('sup-email').value.trim();
    const reason = document.getElementById('sup-reason').value.trim() || 'manual';
    if (!email.includes('@')) { alert('Enter a valid email'); return; }
    try { await api('?api=suppressions-add', { method: 'POST', body: { email, reason } }); close(); openSuppressionsModal(); }
    catch (e) { alert('Failed: ' + e.message); }
  });
  m.querySelectorAll('[data-rescue]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`Remove ${b.dataset.rescue} from the suppression list? Future emails to this address will go through.`)) return;
    try { await api('?api=suppressions-remove', { method: 'POST', body: { email: b.dataset.rescue } }); close(); openSuppressionsModal(); }
    catch (e) { alert('Failed: ' + e.message); }
  }));
}

function openNewAutomationModal() {
  document.getElementById('newAutoModal')?.remove();
  const isTemplateMode = listView === 'templates';
  // Available options: Manual + every event NOT already in use, grouped.
  const groups = {};
  for (const e of availableEvents) { if (e.in_use) continue; (groups[e.group || 'Other'] = groups[e.group || 'Other'] || []).push(e); }
  let eventOpts = '';
  for (const [groupName, evs] of Object.entries(groups)) {
    eventOpts += `<optgroup label="${escapeHtml(groupName)}">`;
    for (const e of evs) {
      const planned = e.status === 'planned' ? ' (planned — needs wiring)' : '';
      eventOpts += `<option value="${escapeHtml(e.key)}">${escapeHtml(e.label + planned)}</option>`;
    }
    eventOpts += '</optgroup>';
  }
  const templateOpts = (availableTemplates || []).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  const m = document.createElement('div');
  m.id = 'newAutoModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>${isTemplateMode ? 'New email template' : 'New email automation'}</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="font-size:0.74rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">Name</label>
            <input id="na-name" placeholder="${isTemplateMode ? 'e.g. Friendly student check-in' : 'e.g. Re-engage students who paused'}" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px 14px;color:var(--text);font:inherit;font-size:0.92rem;">
          </div>
          ${availableTemplates.length ? `
          <div>
            <label style="font-size:0.74rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">Start from a template (optional)</label>
            <select id="na-template" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px 14px;color:var(--text);font:inherit;font-size:0.92rem;">
              <option value="">Start blank</option>
              ${templateOpts}
            </select>
            <div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">Picking a template copies its subject, body, and preheader into the new ${isTemplateMode ? 'template' : 'automation'}. You can edit afterwards.</div>
          </div>` : ''}
          ${isTemplateMode ? '' : `
          <div>
            <label style="font-size:0.74rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:6px;">When should it send?</label>
            <select id="na-trigger" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px 14px;color:var(--text);font:inherit;font-size:0.92rem;">
              <option value="manual" selected>Manual broadcast — you pick recipients each time</option>
              ${eventOpts}
            </select>
            <div style="font-size:0.74rem;color:var(--text-dim);margin-top:6px;">Manual = a button you press to email a list of students. Event = fires automatically when something happens in the system.</div>
          </div>
          <div id="na-vars-preview" style="font-size:0.78rem;color:var(--text-dim);background:var(--surface2);border:1px dashed var(--border);border-radius:9px;padding:10px 12px;"></div>
          `}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="na-create">${isTemplateMode ? 'Create template' : 'Create automation'}</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });

  const trigSel = document.getElementById('na-trigger');
  const varsPreview = document.getElementById('na-vars-preview');
  function updateVarsPreview() {
    if (!trigSel || !varsPreview) return;
    if (trigSel.value === 'manual') {
      varsPreview.innerHTML = `Available variables: <code>{{firstName}}</code> <code>{{email}}</code> <code>{{coachName}}</code> <code>{{companyName}}</code> <code>{{currentDateLong}}</code> …and more from the Student / Lifecycle / Global groups.`;
    } else {
      const evt = availableEvents.find(e => e.key === trigSel.value);
      if (!evt) return;
      varsPreview.innerHTML = `Available variables: ${(evt.vars || []).slice(0, 12).map(v => `<code>{{${v}}}</code>`).join(' ')}${(evt.vars||[]).length > 12 ? ` and ${(evt.vars.length - 12)} more.` : ''}`;
    }
  }
  if (trigSel) { trigSel.addEventListener('change', updateVarsPreview); updateVarsPreview(); }

  document.getElementById('na-create').addEventListener('click', async () => {
    const trig = trigSel?.value || 'manual';
    const tplId = document.getElementById('na-template')?.value || null;
    const name = document.getElementById('na-name').value.trim() || (isTemplateMode ? 'Untitled template' : (trig === 'manual' ? 'Untitled broadcast' : (availableEvents.find(e => e.key === trig)?.label || 'New automation')));
    try {
      const body = {
        name,
        is_template: isTemplateMode,
        from_template_id: tplId ? Number(tplId) : undefined,
      };
      if (!isTemplateMode) {
        if (trig === 'manual') body.trigger_type = 'manual';
        else { body.trigger_type = 'event'; body.trigger_event = trig; }
      }
      // If no template, supply default scaffolding
      if (!tplId) {
        body.subject = 'Hello {{firstName|there}}';
        body.html_body = '<p>Hi {{firstName|there}},</p><p>Write your message here…</p>';
        body.text_body = 'Hi {{firstName}}, write your message here.';
      }
      const j = await api('?api=create', { method: 'POST', body });
      close();
      await Promise.all([loadAutomations(), loadAvailableEvents(), loadAvailableTemplates()]);
      openAutomation(j.row.id);
    } catch (e) { alert('Create failed: ' + e.message); }
  });
}

async function openBroadcastModal() {
  await saveAutomation();
  if (!allStudents.length) {
    try {
      const r = await fetch(STUDENTS_BASE + '?api=list', { headers: { Authorization: 'Bearer ' + currentSession.access_token } });
      const j = await r.json();
      allStudents = j.rows || [];
    } catch (e) { alert('Failed to load students: ' + e.message); return; }
  }
  document.getElementById('broadcastModal')?.remove();
  const m = document.createElement('div');
  m.id = 'broadcastModal'; m.className = 'modal-bg';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head"><h2>Broadcast: ${escapeHtml(currentAutomation.name)}</h2><button class="close" data-x>×</button></div>
      <div class="modal-body">
        <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">Pick which students will receive this email.</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
          <input type="search" id="bc-search" placeholder="Search name or email…" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:9px 12px;color:var(--text);font:inherit;">
          <button class="btn-ghost" id="bc-all" type="button">All visible</button>
          <button class="btn-ghost" id="bc-none" type="button">None</button>
        </div>
        <div style="font-size:0.74rem;color:var(--text-dim);margin-bottom:6px;"><span id="bc-count">0 selected</span></div>
        <div class="picker-list" id="bc-list"></div>
      </div>
      <div class="modal-foot">
        <span id="bc-msg" style="flex:1;font-size:0.8rem;color:var(--text-dim);"></span>
        <button class="btn-ghost" data-x>Cancel</button>
        <button class="btn-primary" id="bc-send" disabled>Send 0 emails</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target === m || e.target.matches('[data-x]')) close(); });
  const sel = new Set();
  const search = document.getElementById('bc-search');
  const list = document.getElementById('bc-list');
  const count = document.getElementById('bc-count');
  const sendBtn = document.getElementById('bc-send');
  function render() {
    const q = (search.value || '').toLowerCase();
    let pool = allStudents.filter(s => s.email);
    if (q) pool = pool.filter(s => (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q));
    pool = pool.slice(0, 200);
    list.innerHTML = pool.map(s =>
      `<label><input type="checkbox" data-sid="${s.id}" ${sel.has(s.id)?'checked':''}> ${escapeHtml(s.name||'(unnamed)')} <span style="color:var(--text-dim);">${escapeHtml(s.email||'')}</span></label>`
    ).join('') || '<div style="padding:16px;color:var(--text-dim);font-size:0.84rem;">No matches.</div>';
    list.querySelectorAll('input[data-sid]').forEach(cb => cb.addEventListener('change', e => {
      const id = parseInt(cb.dataset.sid, 10);
      if (e.target.checked) sel.add(id); else sel.delete(id);
      count.textContent = sel.size + ' selected';
      sendBtn.textContent = `Send ${sel.size} email${sel.size === 1 ? '' : 's'}`;
      sendBtn.disabled = sel.size === 0;
    }));
  }
  render();
  search.addEventListener('input', render);
  document.getElementById('bc-all').addEventListener('click', () => { list.querySelectorAll('input[data-sid]').forEach(cb => { sel.add(parseInt(cb.dataset.sid,10)); cb.checked = true; }); count.textContent = sel.size + ' selected'; sendBtn.textContent = `Send ${sel.size}`; sendBtn.disabled = sel.size === 0; });
  document.getElementById('bc-none').addEventListener('click', () => { sel.clear(); render(); count.textContent = '0 selected'; sendBtn.textContent = 'Send 0 emails'; sendBtn.disabled = true; });
  sendBtn.addEventListener('click', async () => {
    if (!sel.size) return;
    if (!confirm(`Send "${currentAutomation.name}" to ${sel.size} student(s)?`)) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    const msg = document.getElementById('bc-msg');
    try {
      const j = await api('?api=send-broadcast', { method: 'POST', body: { id: currentAutomation.id, student_ids: [...sel] } });
      msg.textContent = `✓ ${j.sent} sent · ${j.failed} failed`;
      msg.style.color = j.failed ? 'var(--red)' : 'var(--accent)';
      sendBtn.textContent = 'Done';
      setTimeout(close, 1800);
      await loadAutomations();
    } catch (e) { msg.textContent = 'Failed: ' + e.message; msg.style.color = 'var(--red)'; sendBtn.disabled = false; sendBtn.textContent = `Send ${sel.size}`; }
  });
}

async function loadSends() {
  const wrap = document.getElementById('ea-sends');
  wrap.textContent = 'Loading…';
  try {
    const [sendsRes, statsRes] = await Promise.all([
      api('?api=sends&id=' + currentAutomation.id),
      api('?api=stats&id=' + currentAutomation.id),
    ]);
    const stats = statsRes || {};
    const rows = sendsRes.rows || [];
    const statsBar = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">
        <span class="pill pill-on">${stats.sent || 0} sent</span>
        <span class="pill pill-system">${stats.opened || 0} opened${stats.sent ? ' (' + stats.open_rate + '%)' : ''}</span>
        <span class="pill pill-manual">${stats.clicked || 0} clicked${stats.sent ? ' (' + stats.click_rate + '%)' : ''}</span>
        ${stats.bounced ? `<span class="pill pill-off">${stats.bounced} bounced</span>` : ''}
        ${stats.complained ? `<span class="pill pill-off" style="background:rgba(244,114,182,0.18);color:#f472b6;">${stats.complained} complaints</span>` : ''}
        ${stats.failed ? `<span class="pill pill-off">${stats.failed} failed</span>` : ''}
      </div>`;
    if (!rows.length) { wrap.innerHTML = statsBar + '<div style="color:var(--text-dim);padding:16px;">No sends yet.</div>'; return; }
    wrap.innerHTML = statsBar + rows.map(s => {
      const opened = s.opened_at ? `<span title="Opened ${new Date(s.opened_at).toLocaleString()}" style="color:var(--accent);font-size:0.78rem;">👁 ${s.open_count || 1}</span>` : '';
      const clicked = s.clicked_at ? `<span title="Clicked ${new Date(s.clicked_at).toLocaleString()}" style="color:#6b9eff;font-size:0.78rem;">🖱 ${s.click_count || 1}</span>` : '';
      const bounced = s.bounced_at ? `<span title="${escapeHtml(s.bounce_reason || 'bounced')}" style="color:var(--red);font-size:0.78rem;">⚠ bounced</span>` : '';
      return `<div class="send-row">
        <span class="pill ${s.status === 'sent' ? 'pill-on' : 'pill-off'}" style="width:60px;text-align:center;">${s.status}</span>
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHtml(s.recipient_email)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);">${escapeHtml(s.subject || '')}${s.error ? ' · ' + escapeHtml(s.error) : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">${opened} ${clicked} ${bounced}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">${new Date(s.sent_at).toLocaleString()}</div>
      </div>`;
    }).join('');
  } catch (e) { wrap.innerHTML = `<div style="color:var(--red);padding:16px;">${escapeHtml(e.message)}</div>`; }
}

boot();
