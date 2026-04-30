// Cross-dashboard filter persistence.
// - Saves the date range (preset OR custom from/to) in localStorage
// - Auto-restores it on every dashboard so switching pages keeps the view
// - Auto-wires: detects window.drApplyPreset and the #drApply custom-range
//   button, no per-page edits needed.
(function () {
  const KEY = 'ridley:dateRange';
  let restoring = false;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (_) { return null; }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  window.RidleyFilters = {
    dateRange: {
      load,
      save,
      clear: () => localStorage.removeItem(KEY),
    },
  };

  function isoFmt(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function autoWire() {
    if (typeof window.drApplyPreset !== 'function') return;

    // Wrap drApplyPreset so every preset click saves
    const origApply = window.drApplyPreset;
    window.drApplyPreset = function (preset, reload) {
      origApply(preset, reload);
      if (!restoring) save({ preset, from: null, to: null });
    };

    // Wrap custom-range Apply button so manual ranges save too
    const drApplyBtn = document.getElementById('drApply');
    if (drApplyBtn) {
      drApplyBtn.addEventListener('click', () => {
        if (restoring) return;
        const from = document.getElementById('dateFrom')?.value;
        const to   = document.getElementById('dateTo')?.value;
        if (from && to) save({ preset: null, from, to });
      });
    }

    // Restore previously saved range, if any. Only re-apply if it differs
    // from the page's default (this-week) so the default page load doesn't
    // double-fetch.
    const saved = load();
    if (!saved) return;
    if (saved.preset && saved.preset !== 'this-week') {
      restoring = true;
      origApply(saved.preset, true);
      restoring = false;
    } else if (!saved.preset && saved.from && saved.to) {
      restoring = true;
      const fromEl = document.getElementById('dateFrom');
      const toEl   = document.getElementById('dateTo');
      const lbl    = document.getElementById('drLabel');
      if (fromEl && toEl && lbl) {
        fromEl.value = saved.from;
        toEl.value   = saved.to;
        document.querySelectorAll('.dr-preset').forEach(b => b.classList.remove('active'));
        lbl.textContent = `${isoFmt(saved.from)} – ${isoFmt(saved.to)}`;
        if (typeof window.drTriggerLoad === 'function') window.drTriggerLoad();
      }
      restoring = false;
    }
  }

  // ── Per-page filter persistence ─────────────────────────────────
  // Each saved value is namespaced as ridley:filter:<page>:<field>.
  function rememberSelect(el, key) {
    if (!el) return;
    el.addEventListener('change', () => {
      try { localStorage.setItem(key, el.value); } catch (_) {}
    });
    let saved = null;
    try { saved = localStorage.getItem(key); } catch (_) {}
    if (!saved) return;
    // Options may populate asynchronously after auth — poll briefly.
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

  function wirePageFilters() {
    const file = (window.location.pathname || '').split('/').pop() || '';

    // Calls — rep selector (#repSelect)
    if (file === 'calls.html') {
      rememberSelect(document.getElementById('repSelect'), 'ridley:filter:calls:rep');
    }

    // Declarations — rep filter (#repFilter, only visible to admin / sales_manager)
    if (file === 'declarations.html') {
      rememberSelect(document.getElementById('repFilter'), 'ridley:filter:declarations:rep');
    }

    // Income — product tabs (.pill-tab[data-product])
    if (file === 'income.html') {
      const KEY = 'ridley:filter:income:product';
      const tabsEl = document.getElementById('productTabs');
      if (tabsEl) {
        tabsEl.addEventListener('click', (e) => {
          const btn = e.target.closest('.pill-tab');
          if (btn?.dataset.product) {
            try { localStorage.setItem(KEY, btn.dataset.product); } catch (_) {}
          }
        });
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch (_) {}
        if (saved && saved !== 'all') {
          let tries = 0;
          (function tick() {
            const btn = tabsEl.querySelector(`.pill-tab[data-product="${saved}"]`);
            if (btn) {
              if (!btn.classList.contains('active')) btn.click();
              return;
            }
            if (tries++ < 30) setTimeout(tick, 200);
          })();
        }
      }
    }
  }

  // Run after the page's own pickers/init have set their defaults.
  function init() {
    autoWire();
    wirePageFilters();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 60));
  } else {
    setTimeout(init, 60);
  }
})();
