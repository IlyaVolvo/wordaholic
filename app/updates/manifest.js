const LOCAL_MANIFEST_KEY = 'wordaholic.localManifest';
const PENDING_UPDATE_KEY = 'wordaholic.pendingUpdate';

export async function fetchRemoteManifest() {
  const res = await fetch('/deployment-manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Unable to fetch deployment manifest');
  return res.json();
}

export function getLocalManifest() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MANIFEST_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setLocalManifest(manifest) {
  localStorage.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
}

/**
 * @param {object} local
 * @param {object} remote
 */
export function diffManifests(local, remote) {
  if (!local) {
    return { firstInstall: true, changes: [{ kind: 'site', detail: 'Initial offline package' }] };
  }
  const changes = [];
  if (local.siteHash !== remote.siteHash) {
    changes.push({ kind: 'shell', detail: 'Application shell updated' });
  }
  const localGames = local.games || {};
  const remoteGames = remote.games || {};
  for (const id of new Set([...Object.keys(localGames), ...Object.keys(remoteGames)])) {
    if (localGames[id]?.hash !== remoteGames[id]?.hash) {
      changes.push({ kind: 'game', gameId: id, detail: `Game ${id} updated` });
    }
  }
  const localWords = local.words || {};
  const remoteWords = remote.words || {};
  for (const key of new Set([...Object.keys(localWords), ...Object.keys(remoteWords)])) {
    if (localWords[key] !== remoteWords[key]) {
      changes.push({ kind: 'words', key, detail: `Word data ${key} updated` });
    }
  }
  return { firstInstall: false, changes };
}

export function setPendingUpdate(remote) {
  sessionStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(remote));
}

export function getPendingUpdate() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_UPDATE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearPendingUpdate() {
  sessionStorage.removeItem(PENDING_UPDATE_KEY);
}

/** Active game session flag for deferred mandatory updates */
export function setSessionActive(gameId, active) {
  if (active) sessionStorage.setItem('wordaholic.activeSession', gameId);
  else sessionStorage.removeItem('wordaholic.activeSession');
}

export function getActiveSession() {
  return sessionStorage.getItem('wordaholic.activeSession');
}
