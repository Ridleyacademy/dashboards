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

  // Run after the page's own date-picker init has set the default.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(autoWire, 60));
  } else {
    setTimeout(autoWire, 60);
  }
})();
