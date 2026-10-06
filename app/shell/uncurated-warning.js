import { UNCURATED_WARNING } from './game-state.js';

export { UNCURATED_WARNING };

const FLASH_FOR_MS = 3_000;

/**
 * Show the warning over the play pane for 3 seconds when that word set opens.
 * The header stays usable, and the pane is fully visible again when the flash ends.
 * @param {HTMLElement | null} manualEl
 * @param {string} text
 */
export function mountUncuratedWarning(manualEl, text) {
  if (!manualEl) return () => {};
  const previous = manualEl.__uncuratedCleanup;
  if (typeof previous === 'function') previous();

  const message = String(text || '').trim();
  if (!message) return () => {};

  const root = manualEl.closest('.game-container, #game') || document.body;
  const pane = root.querySelector('.game-play-area, #chain-container') || root;
  const node = document.createElement('div');
  node.className = 'uncurated-warning is-on is-flash';
  node.setAttribute('role', 'status');
  node.textContent = message;
  pane.appendChild(node);

  const hideTimer = window.setTimeout(() => {
    node.classList.remove('is-on', 'is-flash');
  }, FLASH_FOR_MS);

  const cleanup = () => {
    window.clearTimeout(hideTimer);
    node.remove();
    if (manualEl.__uncuratedCleanup === cleanup) manualEl.__uncuratedCleanup = null;
  };
  manualEl.__uncuratedCleanup = cleanup;
  return cleanup;
}
