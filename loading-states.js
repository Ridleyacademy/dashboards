// Auto-applies skeleton placeholders to KPI values containing "—" until they're updated.
// Watches for text changes and removes the skeleton when real data arrives.
(function () {
  const PLACEHOLDER = '—';

  function applySkel(el) {
    if (el.dataset.skelActive === '1') return;
    el.dataset.skelActive = '1';
    el.dataset.skelOrig   = el.textContent;
    el.innerHTML = '<span class="skel skel-row" style="width:60%;height:24px;"></span>';
  }

  function clearSkel(el) {
    if (el.dataset.skelActive !== '1') return;
    delete el.dataset.skelActive;
    delete el.dataset.skelOrig;
    // Element's text was changed by the page's renderer; nothing to do.
  }

  function start() {
    // Apply to all KPI placeholders showing "—" or empty
    const candidates = document.querySelectorAll('.kpi-value, .kpi-income, .kpi-sub');
    candidates.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt === PLACEHOLDER || txt === '') applySkel(el);
    });

    // Watch for text content changes — when a real value appears, drop the skeleton state
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        const target = m.target.nodeType === 3 ? m.target.parentElement : m.target;
        if (!target || !target.classList) continue;
        if (!target.classList.contains('kpi-value') &&
            !target.classList.contains('kpi-income') &&
            !target.classList.contains('kpi-sub')) continue;
        const txt = (target.textContent || '').trim();
        if (txt && txt !== PLACEHOLDER && !txt.includes('skel skel-row')) {
          clearSkel(target);
        }
      }
    });
    obs.observe(document.body, { subtree: true, characterData: true, childList: true });

    // Auto-cleanup after 30s in case nothing ever arrives
    setTimeout(() => obs.disconnect(), 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
