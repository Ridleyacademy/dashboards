// Cross-dashboard filter persistence.
//
// Two design rules:
// 1. Save by listening for button clicks (event delegation), so we work
//    regardless of which page-internal API renders the picker.
// 2. Restore by triggering the button BEFORE auth resolves. That way the
//    page's `if (currentSession) loadData()` check inside the click handler
//    silently no-ops, and the eventual auth-complete loadData fires once,
//    with the restored preset already active. No double-fetch race.
//
// Supports both naming conventions in use:
//   - .dr-preset[data-preset="last-30"]   (calls/income/index/meta-ads/perf)
//   - .dr-preset-item[data-p="last30"]    (declarations)
(function () {
  // v2: schema unchanged but bumping resets stale values from the previous
  // (drApplyPreset-wrapping) implementation that may have been saved with
  // page-specific aliases.
  const KEY = 'ridley:dateRange:v2';
  // Clean up the v1 key so it doesn't sit there forever
  try { localStorage.removeItem('ridley:dateRange'); } catch (_) {}

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (_) { return null; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  window.RidleyFilters = {
    dateRange: { load, save, clear: () => localStorage.removeItem(KEY) },
  };

  // Normalize preset names so a value saved on one page works on another.
  // We always save the canonical key (left side), and resolve to either form
  // when restoring.
  const PRESET_ALIASES = {
    'last-30':   ['last-30', 'last30'],
    'this-week': ['this-week'],
    'last-week': ['last-week'],
    'mtd':       ['mtd'],
    'all':       ['all'],
  };
  function canonicalPreset(raw) {
    if (!raw) return null;
    if (raw === 'last30') return 'last-30';
    return raw;
  }

  function findPresetButton(preset) {
    const candidates = PRESET_ALIASES[preset] || [preset];
    for (const v of candidates) {
      const btn = document.querySelector(
        `.dr-preset[data-preset="${v}"], .dr-preset-item[data-p="${v}"]`
      );
      if (btn) return btn;
    }
    return null;
  }

  // Save when user clicks a preset button anywhere. Event delegation means
  // we don't care if the page rerenders the picker.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.dr-preset, .dr-preset-item');
    if (!btn) return;
    const preset = canonicalPreset(btn.dataset.preset || btn.dataset.p);
    if (preset) save({ preset, from: null, to: null });
  }, true);

  // Save when user picks a custom range via the Apply button.
  document.addEventListener('click', e => {
    if (!e.target.closest('#drApply')) return;
    const from = document.getElementById('dateFrom')?.value;
    const to   = document.getElementById('dateTo')?.value;
    if (from && to) save({ preset: null, from, to });
  }, true);

  // ── Per-page filter persistence ─────────────────────────────────
  function rememberSelect(el, key) {
    if (!el) return;
    el.addEventListener('change', () => {
      try { localStorage.setItem(key, el.value); } catch (_) {}
    });
    let saved = null;
    try { saved = localStorage.getItem(key); } catch (_) {}
    if (!saved) return;
    let tries = 0;
    (function tick() {
      const opt = [...el.options].find(o => o.value === saved);
      if (opt) {
        if (el.value !== saved) {
          el.value = saved;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (tries++ < 30) setTimeout(tick, 200);
    })();
  }

  function restoreDateRange() {
    const saved = load();
    if (!saved) return;
    if (saved.preset && saved.preset !== 'this-week') {
      const btn = findPresetButton(saved.preset);
      if (btn && !btn.classList.contains('active')) {
        // Click triggers the page's existing handler. If auth has not yet
        // completed, the handler's `if (currentSession) loadData()` check
        // is a no-op and the eventual onAuthed runs loadData() once with
        // the restored preset already applied.
        btn.click();
      }
    } else if (!saved.preset && saved.from && saved.to) {
      const fromEl = document.getElementById('dateFrom');
      const toEl   = document.getElementById('dateTo');
      const apply  = document.getElementById('drApply');
      if (fromEl && toEl && apply) {
        fromEl.value = saved.from;
        toEl.value   = saved.to;
        apply.click();
      }
    }
  }

  function wirePageFilters() {
    const file = (window.location.pathname || '').split('/').pop() || '';
    if (file === 'calls.html')        rememberSelect(document.getElementById('repSelect'), 'ridley:filter:calls:rep');
    if (file === 'declarations.html') rememberSelect(document.getElementById('repFilter'), 'ridley:filter:declarations:rep');
    if (file === 'income.html') {
      const KEY2 = 'ridley:filter:income:product';
      const tabsEl = document.getElementById('productTabs');
      if (tabsEl) {
        tabsEl.addEventListener('click', e => {
          const btn = e.target.closest('.pill-tab');
          if (btn?.dataset.product) localStorage.setItem(KEY2, btn.dataset.product);
        });
        let saved = null;
        try { saved = localStorage.getItem(KEY2); } catch (_) {}
        if (saved && saved !== 'all') {
          let tries = 0;
          (function tick() {
            const btn = tabsEl.querySelector(`.pill-tab[data-product="${saved}"]`);
            if (btn) { if (!btn.classList.contains('active')) btn.click(); return; }
            if (tries++ < 30) setTimeout(tick, 200);
          })();
        }
      }
    }
  }

  // Run as early as we can. The buttons exist after parse (they are static
  // markup), so a small delay after DOMContentLoaded lets the page's own
  // init click 'this-week' first; then we override only if needed.
  function init() {
    restoreDateRange();
    wirePageFilters();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 30));
  } else {
    setTimeout(init, 30);
  }
})();
