import {
  fetchRemoteManifest,
  getLocalManifest,
  setLocalManifest,
  diffManifests,
  clearPendingUpdate,
} from '../updates/manifest.js';

function isGamePage() {
  return location.pathname.startsWith('/games/');
}

/**
 * @param {object} [remote]
 */
async function applyUpdate(remote) {
  if (remote) setLocalManifest(remote);
  clearPendingUpdate();
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'activate-update' });
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg?.waiting) reg.waiting.postMessage({ type: 'activate-update' });
  location.reload();
}

/**
 * Apply a newer deploy when online and not in a game. Game pages wait until the
 * player returns home so a puzzle is not interrupted.
 */
export async function checkForUpdates() {
  if (!navigator.onLine) return;
  try {
    void navigator.serviceWorker?.getRegistration()?.then((reg) => reg?.update());
    const remote = await fetchRemoteManifest();
    const local = getLocalManifest();
    const { firstInstall, changes } = diffManifests(local, remote);
    if (firstInstall) {
      setLocalManifest(remote);
      return;
    }
    if (!changes.length) return;
    if (isGamePage()) return;
    await applyUpdate(remote);
  } catch (err) {
    console.warn('Update check failed', err);
  }
}

export function notifySessionEnded() {
  window.dispatchEvent(new CustomEvent('wordaholic:session-ended'));
}

let bound = false;

/** Home: check on boot, reconnect, and tab focus. Reload when a new SW takes over. */
export function bindSilentUpdates() {
  if (bound) return;
  bound = true;
  const run = () => {
    void checkForUpdates();
  };
  run();
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  if (!navigator.serviceWorker) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isGamePage()) return;
      location.reload();
    });
  }
}
