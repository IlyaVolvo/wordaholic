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

function isValidManifest(m) {
  return Boolean(m && typeof m === 'object' && typeof m.siteHash === 'string' && m.siteHash.length > 0);
}

/**
 * @param {object} local
 * @param {object} remote
 */
export function diffManifests(local, remote) {
  if (!isValidManifest(local) || !isValidManifest(remote)) {
    return { firstInstall: true, changes: [] };
  }
  if (local.siteHash === remote.siteHash) {
    return { firstInstall: false, changes: [] };
  }

  // siteHash already covers the whole deploy. Summarize what meaningfully changed.
  /** @type {Array<{kind: string, detail: string}>} */
  const changes = [];
  const localGames = local.games || {};
  const remoteGames = remote.games || {};
  const gameNames = {
    polywordlot: 'PolyWordlot',
    transword: 'TransWord',
  };
  const updatedGames = [];
  for (const id of new Set([...Object.keys(localGames), ...Object.keys(remoteGames)])) {
    if (localGames[id]?.hash !== remoteGames[id]?.hash) {
      updatedGames.push(gameNames[id] || id);
    }
  }

  const localWords = local.words || {};
  const remoteWords = remote.words || {};
  let wordsChanged = 0;
  for (const key of new Set([...Object.keys(localWords), ...Object.keys(remoteWords)])) {
    if (localWords[key] !== remoteWords[key]) wordsChanged += 1;
  }

  if (updatedGames.length) {
    changes.push({
      kind: 'games',
      detail: updatedGames.length === 1
        ? `${updatedGames[0]} was updated`
        : `Games updated: ${updatedGames.join(', ')}`,
    });
  }
  if (wordsChanged) {
    changes.push({
      kind: 'words',
      detail: wordsChanged === 1
        ? 'Language word data was updated'
        : `Language word data updated (${wordsChanged} sets)`,
    });
  }
  if (!changes.length) {
    changes.push({ kind: 'site', detail: 'A new version of Wordaholic is ready' });
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
