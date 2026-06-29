// Shared theme controller. Three states cycled by the topbar button:
//   light → dark → auto → light → ...
// `auto` follows the OS prefers-color-scheme and listens for live changes.
// Persisted in localStorage under `theme`.
(function () {
  const KEY = 'theme';
  const valid = ['light', 'dark', 'auto'];

  function osPrefersLight() {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches === true;
  }
  function effective(mode) {
    if (mode === 'auto') return osPrefersLight() ? 'light' : 'dark';
    return mode;
  }
  function apply(mode) {
    const eff = effective(mode);
    document.body.classList.toggle('light', eff === 'light');
    document.documentElement.dataset.theme = mode;
    syncBtn(mode);
  }
  function syncBtn(mode) {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    const eff = effective(mode);
    if (mode === 'auto') {
      btn.textContent = '🌓';
      btn.title = `Theme: Auto (currently ${eff})`;
    } else if (mode === 'light') {
      btn.textContent = '🌙';
      btn.title = 'Theme: Light — click for Dark';
    } else {
      btn.textContent = '☀️';
      btn.title = 'Theme: Dark — click for Auto';
    }
  }

  // Bootstrap as early as possible (before paint where we can): pick the
  // saved or default mode, apply.
  let mode = localStorage.getItem(KEY);
  if (!valid.includes(mode)) mode = 'dark';
  // body might not exist yet if script runs before <body>; do the apply
  // pass when DOM is ready, but also early-tag <html> for paint.
  document.documentElement.dataset.theme = mode;
  function bootstrap() {
    apply(mode);
    const btn = document.getElementById('themeBtn');
    if (btn) {
      // Replace any previous handler set by per-page inline JS by cloning
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        const i = valid.indexOf(mode);
        mode = valid[(i + 1) % valid.length];
        localStorage.setItem(KEY, mode);
        apply(mode);
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
  // Live OS theme changes (only meaningful in 'auto')
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (mode === 'auto') apply(mode);
  });

  window.RidleyTheme = { get: () => mode, set: m => { if (valid.includes(m)) { mode = m; localStorage.setItem(KEY, m); apply(m); } } };
})();
