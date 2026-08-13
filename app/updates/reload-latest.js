/**
 * Drop the offline shell cache and reload whatever the server has now.
 * IndexedDB (favorites, game saves) is left intact.
 */

const CACHE_PREFIX = 'wordaholic-';

/**
 * @returns {Promise<void>}
 */
export async function reloadLatestFromServer() {
  if (!navigator.onLine) {
    throw new Error('Connect to the internet to reload the latest version');
  }

  const probe = await fetch('/index.html', { cache: 'no-store' });
  if (!probe.ok) {
    throw new Error('Could not reach the server');
  }

  if (navigator.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }

  if (window.caches) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
    );
  }

  location.reload();
}
