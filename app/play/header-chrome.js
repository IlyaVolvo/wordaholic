/**
 * Collapse header chrome when the top row cannot hold every control.
 *
 * 1. `header-chrome-compact` — Manual + stats icons → ⋯ menu
 * 2. `header-chrome-short-name` — game title uses its short label
 * 3. `header-chrome-tight` — live-stat titles clip; date is icon-only (today brighter)
 * 4. `header-chrome-stats-tip` — live play stats move into a target tooltip
 * 5. `data-def-overflow` — definition controls fold into a dropdown,
 *    least important first: other settings → language → date
 *
 * Markup:
 *   [data-header-chrome="icons"]  — Manual and stats icon buttons
 *   [data-header-chrome="more"]   — ⋯ trigger + .header-more-menu
 *   [data-header-fit]             — row pieces that must not overlap
 *   [data-header-live]            — play stats that can become a target tooltip
 *   [data-header-live-home]       — restore targets for those stats
 *   [data-header-live-tip]        — tooltip host under the target
 *   [data-header-def="other"|"language"|"date"] — definition groups
 *   [data-header-def-home]        — vanilla restore targets (not React)
 *   [data-header-def="more"]      — definition overflow trigger + menu
 *   [data-header-react]           — React owns its nodes; do not move them
 *   [data-def-min]                — least overflow level to keep (other|language|date)
 */

const DEF_STEPS = ['other', 'language', 'date'];
const DEF_RANK = { other: 1, language: 2, date: 3 };

function box(el) {
  if (!el || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  return r;
}

function overlaps(a, b) {
  return a.left < b.right - 6 && b.left < a.right - 6 && a.top < b.bottom - 4 && b.top < a.bottom - 4;
}

function isDefPiece(el) {
  return el.matches('.header-right, .game-header-right')
    || !!el.closest('.header-right, .game-header-right');
}

function isLivePiece(el) {
  return el.matches('[data-header-live]') || !!el.closest('[data-header-live]');
}

function rowCollides(bar, mode = 'all') {
  if (bar.scrollWidth > bar.clientWidth + 2) return true;
  const pieces = [...bar.querySelectorAll('[data-header-fit]')]
    .map((el) => ({ el, box: box(el) }))
    .filter((piece) => piece.box);
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      if (!overlaps(pieces[i].box, pieces[j].box)) continue;
      if (mode === 'def' && !isDefPiece(pieces[i].el) && !isDefPiece(pieces[j].el)) continue;
      if (mode === 'live' && !isLivePiece(pieces[i].el) && !isLivePiece(pieces[j].el)) continue;
      return true;
    }
  }
  return false;
}

function setMoreOpen(bar, open) {
  const more = bar.querySelector('[data-header-chrome="more"]');
  const menu = more?.querySelector('.header-more-menu');
  const trigger = more?.querySelector('[aria-haspopup="menu"]');
  menu?.classList.toggle('hidden', !open);
  trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function setDefOpen(bar, open) {
  const menu = bar.querySelector('[data-header-def-menu]');
  const trigger = bar.querySelector('[data-header-def-trigger]');
  if (!menu || !trigger) return;
  menu.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function isDefOpen(bar) {
  return !!bar.querySelector('[data-header-def-menu]')?.classList.contains('is-open');
}

function defHidden(key, level) {
  if (!level) return false;
  if (level === 'date') return true;
  if (level === 'language') return key === 'other' || key === 'language';
  return key === 'other';
}

function syncDefinitionHomes(bar) {
  if (bar.hasAttribute('data-header-react')) return;
  const level = bar.getAttribute('data-def-overflow') || '';
  const menu = bar.querySelector('[data-header-def-menu]');
  if (!menu) return;
  for (const key of DEF_STEPS) {
    const el = bar.querySelector(`[data-header-def="${key}"]`);
    const home = bar.querySelector(`[data-header-def-home="${key}"]`);
    if (!el || !home) continue;
    const dest = defHidden(key, level) ? menu : home;
    if (el.parentElement !== dest) dest.appendChild(el);
  }
}

function syncLiveTip(bar) {
  const tip = bar.querySelector('[data-header-live-tip]');
  if (!tip) return;
  const on = bar.classList.contains('header-chrome-stats-tip');
  for (const el of bar.querySelectorAll('[data-header-live]')) {
    const key = el.getAttribute('data-header-live');
    const home = key ? bar.querySelector(`[data-header-live-home="${key}"]`) : null;
    const dest = on ? tip : home;
    if (dest && el.parentElement !== dest) dest.appendChild(el);
  }
  const wrap = bar.querySelector('.header-target-wrap');
  if (wrap) {
    if (on) wrap.setAttribute('aria-describedby', tip.id || 'header-live-tip');
    else wrap.removeAttribute('aria-describedby');
  }
  if (!on) wrap?.classList.remove('is-tip-open');
}

function setStatsTip(bar, on) {
  bar.classList.toggle('header-chrome-stats-tip', on);
  syncLiveTip(bar);
}

function setDefOverflow(bar, level) {
  if (level) bar.setAttribute('data-def-overflow', level);
  else bar.removeAttribute('data-def-overflow');
  syncDefinitionHomes(bar);
}

/**
 * @param {HTMLElement | null} bar
 * @returns {() => void}
 */
export function mountHeaderChrome(bar) {
  if (!bar) return () => {};

  const apply = () => {
    bar.classList.remove(
      'header-chrome-compact',
      'header-chrome-short-name',
      'header-chrome-tight',
      'header-chrome-stats-tip'
    );
    setMoreOpen(bar, false);
    setDefOpen(bar, false);
    setDefOverflow(bar, '');
    syncLiveTip(bar);
    const min = bar.getAttribute('data-def-min') || '';
    if (!rowCollides(bar, 'all')) {
      if (min) setDefOverflow(bar, min);
      return;
    }
    bar.classList.add('header-chrome-compact');
    if (rowCollides(bar, 'all') && bar.querySelector('[data-header-name="short"]')) {
      bar.classList.add('header-chrome-short-name');
    }
    if (rowCollides(bar, 'all')) bar.classList.add('header-chrome-tight');
    const toolbar = bar.ownerDocument.getElementById('toolbar');
    if (toolbar) toolbar.classList.toggle('header-chrome-tight', rowCollides(toolbar, 'all'));
    if (
      bar.querySelector('[data-header-live]')
      && (rowCollides(bar, 'live') || rowCollides(bar, 'def'))
    ) {
      setStatsTip(bar, true);
    }
    for (const step of DEF_STEPS) {
      if (!rowCollides(bar, 'def')) break;
      setDefOverflow(bar, step);
    }
    const current = bar.getAttribute('data-def-overflow') || '';
    if ((DEF_RANK[min] || 0) > (DEF_RANK[current] || 0)) setDefOverflow(bar, min);
  };

  const onBarClick = (event) => {
    const defTrigger = event.target.closest('[data-header-def-trigger]');
    if (defTrigger && bar.contains(defTrigger)) {
      event.stopPropagation();
      setMoreOpen(bar, false);
      setDefOpen(bar, !isDefOpen(bar));
      return;
    }
    const more = bar.querySelector('[data-header-chrome="more"]');
    const moreTrigger = event.target.closest('[aria-haspopup="menu"]');
    if (moreTrigger && more?.contains(moreTrigger)) {
      event.stopPropagation();
      setDefOpen(bar, false);
      const menu = more.querySelector('.header-more-menu');
      setMoreOpen(bar, !!menu?.classList.contains('hidden'));
      return;
    }
    if (event.target.closest('[data-header-action], [role="menuitem"]')) {
      setMoreOpen(bar, false);
    }
    const wrap = event.target.closest('.header-target-wrap');
    if (wrap && bar.contains(wrap) && bar.classList.contains('header-chrome-stats-tip')) {
      wrap.classList.toggle('is-tip-open');
    }
  };

  const onDocClick = (event) => {
    const more = bar.querySelector('[data-header-chrome="more"]');
    if (more && !more.contains(event.target)) setMoreOpen(bar, false);
    const def = bar.querySelector('[data-header-def="more"]');
    if (def && !def.contains(event.target)) setDefOpen(bar, false);
    const wrap = bar.querySelector('.header-target-wrap');
    if (wrap && !wrap.contains(event.target)) wrap.classList.remove('is-tip-open');
  };

  bar.addEventListener('click', onBarClick);
  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', apply);
  const ro = new ResizeObserver(apply);
  ro.observe(bar);
  const toolbar = bar.ownerDocument.getElementById('toolbar');
  if (toolbar) ro.observe(toolbar);
  apply();
  requestAnimationFrame(apply);

  return () => {
    bar.removeEventListener('click', onBarClick);
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('resize', apply);
    ro.disconnect();
  };
}
