// Drop-in forgot-password / recovery flow.
// Requires: a global `supa` Supabase client and a #loginForm with #loginEmail.
// Auto-injects: "Forgot password?" link, reset-email view, set-password view.
// Auto-detects recovery links (hash contains type=recovery) and shows set-pw.
(function () {
  if (typeof supa === 'undefined') { console.warn('[forgot-pw] supa client not found'); return; }

  // Inject overlay styles + DOM
  const style = document.createElement('style');
  style.textContent = `
    .fp-overlay { position:fixed; inset:0; background:rgba(8,9,18,0.95); z-index:9999;
      display:none; align-items:center; justify-content:center; padding:24px;
      font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; }
    .fp-overlay.show { display:flex; }
    .fp-card { background:#13141f; border:1px solid #1f2438; border-radius:24px; padding:36px 32px;
      width:100%; max-width:380px; box-shadow:0 24px 60px rgba(0,0,0,0.6); }
    .fp-card h2 { font-size:1.4rem; font-weight:800; letter-spacing:-0.03em; color:#eaecf8;
      text-align:center; margin:0 0 4px; }
    .fp-card p { color:#7880a8; font-size:0.84rem; text-align:center; margin:0 0 22px; }
    .fp-input { width:100%; background:#0f1120; border:1px solid #1f2438; border-radius:10px;
      padding:11px 14px; font-size:0.86rem; color:#eaecf8; box-sizing:border-box; outline:none; }
    .fp-input:focus { border-color:#6b9eff; }
    .fp-label { display:block; font-size:0.72rem; color:#7880a8; margin-bottom:6px;
      font-weight:600; text-transform:uppercase; letter-spacing:0.08em; }
    .fp-btn { width:100%; background:linear-gradient(135deg,#6b9eff,#5783e8); color:#fff;
      border:none; border-radius:10px; padding:12px; font-size:0.86rem; font-weight:700;
      cursor:pointer; margin-top:6px; }
    .fp-btn:disabled { opacity:0.6; cursor:wait; }
    .fp-link { color:#6b9eff; font-size:0.78rem; text-decoration:none; }
    .fp-msg-err { color:#f87171; font-size:0.78rem; margin-top:10px; text-align:center; min-height:1em; }
    .fp-msg-ok  { color:#34d399; font-size:0.78rem; margin-top:10px; text-align:center; }
    .fp-row { margin-bottom:14px; }
    .fp-foot { text-align:center; margin-top:14px; }
  `;
  document.head.appendChild(style);

  const html = `
    <div id="fpForgot" class="fp-overlay">
      <div class="fp-card">
        <h2>Reset password</h2>
        <p>Enter your email — we'll send you a reset link.</p>
        <form id="fpForgotForm">
          <div class="fp-row">
            <label class="fp-label">Email</label>
            <input class="fp-input" type="email" id="fpEmail" placeholder="you@company.com" required>
          </div>
          <button type="submit" class="fp-btn" id="fpForgotBtn">Send reset link</button>
          <div class="fp-msg-err" id="fpForgotErr"></div>
          <div class="fp-msg-ok"  id="fpForgotOk" style="display:none;"></div>
          <div class="fp-foot"><a href="#" id="fpBack" style="color:#7880a8;font-size:0.78rem;text-decoration:none;">← Back to sign in</a></div>
        </form>
      </div>
    </div>
    <div id="fpSetPw" class="fp-overlay">
      <div class="fp-card">
        <h2>Choose a new password</h2>
        <p>Pick a strong password to secure your account.</p>
        <form id="fpSetPwForm">
          <div class="fp-row">
            <label class="fp-label">New password</label>
            <input class="fp-input" type="password" id="fpNewPw" placeholder="Min 8 characters" required autocomplete="new-password">
          </div>
          <div class="fp-row">
            <label class="fp-label">Confirm password</label>
            <input class="fp-input" type="password" id="fpNewPw2" placeholder="Confirm" required autocomplete="new-password">
          </div>
          <button type="submit" class="fp-btn" id="fpSetPwBtn">Update password</button>
          <div class="fp-msg-err" id="fpSetPwErr"></div>
        </form>
      </div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const $ = id => document.getElementById(id);
  const showForgot = () => $('fpForgot').classList.add('show');
  const hideForgot = () => $('fpForgot').classList.remove('show');
  const showSetPw  = () => $('fpSetPw').classList.add('show');
  const hideSetPw  = () => $('fpSetPw').classList.remove('show');

  // Inject "Forgot password?" link below the existing sign-in button
  function injectLink() {
    const form = document.getElementById('loginForm');
    if (!form || form.dataset.fpInjected) return;
    form.dataset.fpInjected = '1';
    const link = document.createElement('div');
    link.style.cssText = 'text-align:center;margin-top:12px;';
    link.innerHTML = `<a href="#" id="fpForgotLink" class="fp-link">Forgot password?</a>`;
    form.appendChild(link);
    document.getElementById('fpForgotLink').addEventListener('click', e => {
      e.preventDefault();
      const emailInput = document.getElementById('loginEmail') || document.getElementById('email');
      $('fpEmail').value = emailInput ? emailInput.value.trim() : '';
      $('fpForgotErr').textContent = '';
      $('fpForgotOk').style.display = 'none';
      showForgot();
    });
  }
  // Try now, and again on next tick (in case loginForm is rendered later)
  injectLink();
  setTimeout(injectLink, 0);
  setTimeout(injectLink, 500);

  $('fpBack').addEventListener('click', e => { e.preventDefault(); hideForgot(); });

  $('fpForgotForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('fpForgotBtn'), err = $('fpForgotErr'), ok = $('fpForgotOk');
    err.textContent = ''; ok.style.display = 'none';
    const email = $('fpEmail').value.trim();
    if (!email) { err.textContent = 'Enter your email'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await supa.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
    } catch (_) { /* swallow — don't leak */ }
    ok.textContent = 'If that email is registered, a reset link is on its way.';
    ok.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send reset link';
  });

  $('fpSetPwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('fpNewPw').value, pw2 = $('fpNewPw2').value;
    const err = $('fpSetPwErr'), btn = $('fpSetPwBtn');
    err.textContent = '';
    if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
    if (pw !== pw2) { err.textContent = 'Passwords do not match'; return; }
    btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const { error } = await supa.auth.updateUser({ password: pw });
      if (error) throw error;
      history.replaceState({}, '', window.location.pathname);
      hideSetPw();
      // Page's existing onAuthStateChange should pick up the session and route the user
    } catch (e2) {
      err.textContent = e2.message || 'Could not update password';
      btn.disabled = false; btn.textContent = 'Update password';
    }
  });

  // Detect recovery flow from BOTH the URL hash (legacy implicit flow)
  // and the query string (newer PKCE flow). Don't fight the page-level
  // initAuth — only show this overlay if the page itself didn't already
  // route the user into a set-password view (state="set-password" /
  // "setPw"). Checked on a tiny delay to let the page's own init run first.
  const _hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const _query = new URLSearchParams(window.location.search);
  const _type  = _hash.get('type') || _query.get('type') || '';
  if (_type === 'recovery') {
    setTimeout(() => {
      const st = document.body.dataset.state || '';
      // The page's own state machine handles set-password if it knows
      // about recovery flow. Only show our overlay as a fallback.
      if (st !== 'set-password' && st !== 'setPw') showSetPw();
    }, 100);
    supa.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        const st = document.body.dataset.state || '';
        if (st !== 'set-password' && st !== 'setPw') showSetPw();
      }
    });
  }
})();
