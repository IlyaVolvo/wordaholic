import {
  fetchRemoteManifest,
  getLocalManifest,
  setLocalManifest,
  diffManifests,
  setPendingUpdate,
  getPendingUpdate,
  clearPendingUpdate,
  getActiveSession,
} from '../updates/manifest.js';

/**
 * @param {HTMLElement} host
 */
export async function checkForUpdates(host) {
  if (!navigator.onLine) return;
  try {
    const remote = await fetchRemoteManifest();
    const local = getLocalManifest();
    const { firstInstall, changes } = diffManifests(local, remote);
    if (firstInstall) {
      setLocalManifest(remote);
      return;
    }
    if (!changes.length) return;
    setPendingUpdate(remote);
    showUpdateDialog(host, changes, remote);
  } catch (err) {
    console.warn('Update check failed', err);
  }
}

/**
 * @param {HTMLElement} host
 * @param {Array<{detail: string}>} changes
 * @param {object} remote
 */
function showUpdateDialog(host, changes, remote) {
  const existing = host.querySelector('.update-dialog');
  if (existing) existing.remove();

  const active = getActiveSession();
  const dialog = document.createElement('div');
  dialog.className = 'update-dialog';
  dialog.innerHTML = `
    <div class="update-dialog-backdrop" data-action="backdrop"></div>
    <div class="update-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="upd-title">
      <h2 id="upd-title">Update available</h2>
      <p class="update-lead">A newer offline package is ready. Apply it to keep playing with the latest content.</p>
      <ul class="update-list">${changes.map((c) => `<li>${c.detail}</li>`).join('')}</ul>
      <div class="update-actions">
        <button type="button" class="btn primary" data-action="now">Update now</button>
        ${active ? '<button type="button" class="btn" data-action="later">Update when this game ends</button>' : ''}
      </div>
    </div>
  `;
  host.appendChild(dialog);

  dialog.querySelector('[data-action="now"]')?.addEventListener('click', () => applyUpdate(remote));
  dialog.querySelector('[data-action="later"]')?.addEventListener('click', () => {
    dialog.remove();
    window.addEventListener(
      'wordaholic:session-ended',
      () => applyUpdate(getPendingUpdate() || remote),
      { once: true }
    );
  });
}

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

export function notifySessionEnded() {
  window.dispatchEvent(new CustomEvent('wordaholic:session-ended'));
}
