/**
 * Collapse Manual + stats icons into the ⋯ menu when the top header row
 * cannot hold them next to the remaining chrome.
 *
 * Bar gets `header-chrome-compact` (icons → menu) and, if the row still
 * collides, `header-chrome-tight` (live-stat titles clip).
 *
 * Markup:
 *   [data-header-chrome="icons"]  — Manual and stats icon buttons
 *   [data-header-chrome="more"]   — ⋯ trigger + .header-more-menu
 *   [data-header-fit]             — row pieces that must not overlap
 */

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

function rowCollides(bar) {
  if (bar.scrollWidth > bar.clientWidth + 2) return true;
  const pieces = [...bar.querySelectorAll('[data-header-fit]')]
    .map(box)
    .filter(Boolean);
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      if (overlaps(pieces[i], pieces[j])) return true;
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

/**
 * @param {HTMLElement | null} bar
 * @returns {() => void}
 */
export function mountHeaderChrome(bar) {
  if (!bar) return () => {};

  const apply = () => {
    bar.classList.remove('header-chrome-compact', 'header-chrome-tight');
    setMoreOpen(bar, false);
    if (!rowCollides(bar)) return;
    bar.classList.add('header-chrome-compact');
    if (rowCollides(bar)) bar.classList.add('header-chrome-tight');
  };

  const onDocClick = (event) => {
    const more = bar.querySelector('[data-header-chrome="more"]');
    if (more && !more.contains(event.target)) setMoreOpen(bar, false);
  };

  const onMoreClick = (event) => {
    const trigger = event.target.closest('[aria-haspopup="menu"]');
    const more = bar.querySelector('[data-header-chrome="more"]');
    if (trigger && more?.contains(trigger)) {
      event.stopPropagation();
      const menu = more.querySelector('.header-more-menu');
      setMoreOpen(bar, !!menu?.classList.contains('hidden'));
      return;
    }
    if (event.target.closest('[data-header-action], [role="menuitem"]')) {
      setMoreOpen(bar, false);
    }
  };

  bar.addEventListener('click', onMoreClick);
  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', apply);
  const ro = new ResizeObserver(apply);
  ro.observe(bar);
  apply();
  requestAnimationFrame(apply);

  return () => {
    bar.removeEventListener('click', onMoreClick);
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('resize', apply);
    ro.disconnect();
  };
}
