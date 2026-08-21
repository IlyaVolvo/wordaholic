import { storage } from '../storage/idb.js';
import { getFavoriteLanguages, getLastLanguage, setFavoriteLanguages, setLastLanguage } from '../i18n-prefs/favorites.js';
import { listGameIds } from '../games-contract.js';

const FORMAT = 'wordaholic-site-backup';
/** Version this build writes. */
const WRITER_FORMAT_VERSION = 2;
/** Files with no formatVersion are the first write of this tree. */
const DEFAULT_READER_VERSION = 2;

const READERS = {
  2: importFormatV2,
};

/**
 * @param {{ origin?: { browserFamily: string, browserId: string } }} [opts]
 */
export async function exportSiteBackup(opts = {}) {
  const games = {};
  for (const id of listGameIds()) {
    games[id] = await storage.exportGame(id);
  }
  const payload = {
    format: FORMAT,
    formatVersion: WRITER_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      favoriteLanguages: getFavoriteLanguages(),
      lastLanguage: getLastLanguage(),
    },
    games,
  };
  if (opts.origin && opts.origin.browserFamily && opts.origin.browserId) {
    payload.origin = {
      browserFamily: opts.origin.browserFamily,
      browserId: opts.origin.browserId,
    };
  }
  return payload;
}

function backupFileName() {
  return `wordaholic-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** iPad/iPhone, including Chrome (desktop UA + touch). WebKit will not honor a hidden download. */
export function needsTapToSave() {
  const ua = navigator.userAgent || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (/iPad|iPhone|iPod|CriOS|FxiOS/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && touchPoints > 1) return true;
  if (/Chrome\//.test(ua) && !/Android/.test(ua) && (touchPoints > 1 || coarse)) return true;
  return false;
}

function canShareFile(file) {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * @param {File} file
 * @param {string} url
 * @param {string} name
 * @param {{ title?: string, onSaved?: () => void, onDismissed?: () => void }} [opts]
 */
function offerBackupSave(file, url, name, opts = {}) {
  document.querySelector('[data-backup-save]')?.remove();
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.backupSave = '';
  const shareOk = canShareFile(file);
  const title = opts.title || 'Save backup';
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-close></div>
    <div class="update-dialog-card" role="dialog" aria-modal="true" aria-labelledby="backup-save-title">
      <h2 id="backup-save-title">${title}</h2>
      <p class="update-lead">${
        shareOk
          ? 'Tap Save to Files, then choose Downloads or iCloud Drive.'
          : 'Tap Open file, then use Share → Save to Files.'
      }</p>
      <div class="update-actions">
        ${shareOk ? '<button type="button" class="btn primary" data-share>Save to Files</button>' : ''}
        <a class="btn${shareOk ? '' : ' primary'}" data-open href="${url}" target="_blank" rel="noopener" download="${name}">Open file</a>
        <button type="button" class="btn" data-close>Close</button>
      </div>
    </div>
  `;
  let settled = false;
  const finish = (saved) => {
    if (settled) return;
    settled = true;
    if (saved) opts.onSaved?.();
    else opts.onDismissed?.();
  };
  const close = () => {
    host.remove();
    URL.revokeObjectURL(url);
  };
  host.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => {
      finish(false);
      close();
    })
  );
  host.querySelector('[data-open]')?.addEventListener('click', () => {
    finish(true);
  });
  host.querySelector('[data-share]')?.addEventListener('click', async () => {
    try {
      await navigator.share({ files: [file], title: name });
      finish(true);
      close();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      window.open(url, '_blank', 'noopener');
      finish(true);
    }
  });
  document.body.appendChild(host);
}

/**
 * @param {object} payload
 * @param {{ filename?: string, title?: string, onSaved?: () => void, onDismissed?: () => void }} [opts]
 */
export async function downloadSiteBackup(payload, opts = {}) {
  const name = opts.filename || backupFileName();
  const text = JSON.stringify(payload, null, 2);
  const type = 'application/json';
  const file = new File([text], name, { type });
  const url = URL.createObjectURL(new Blob([text], { type }));

  if (needsTapToSave()) {
    offerBackupSave(file, url, name, opts);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
  opts.onSaved?.();
}

/**
 * Full site backup, or a file whose top-level key is a game id
 * (`polywordlot` / `transword`) with that game's `{ general, records }` tree.
 * @param {object} payload
 */
export async function importSiteBackup(payload) {
  const parsed = parseBackup(payload);
  const reader = READERS[parsed.formatVersion];
  if (!reader) {
    throw new Error(
      `Unsupported backup formatVersion ${parsed.formatVersion}. This app reads version ${DEFAULT_READER_VERSION}.`
    );
  }
  return reader(parsed);
}

function readFormatVersion(payload) {
  if (payload.formatVersion == null) return DEFAULT_READER_VERSION;
  const version = Number(payload.formatVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Invalid formatVersion');
  }
  return version;
}

function knownGameIds() {
  return new Set(listGameIds());
}

function normalizeGameTree(gameId, tree) {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    return { general: { gameId }, records: [] };
  }
  const records = Array.isArray(tree.records) ? tree.records : [];
  return {
    general: { gameId: tree.general?.gameId || gameId },
    records,
  };
}

function gamesFromNamedKeys(payload, knownIds) {
  const games = {};
  for (const id of knownIds) {
    if (payload[id] && typeof payload[id] === 'object' && !Array.isArray(payload[id])) {
      games[id] = normalizeGameTree(id, payload[id]);
    }
  }
  return games;
}

function parseBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid backup file');
  }
  const formatVersion = readFormatVersion(payload);
  const knownIds = knownGameIds();

  if (payload.format && payload.format !== FORMAT) {
    throw new Error('Unrecognized backup format');
  }

  if (payload.format === FORMAT || (payload.games && typeof payload.games === 'object')) {
    const games = {};
    for (const [id, tree] of Object.entries(payload.games || {})) {
      if (!knownIds.has(id)) continue;
      games[id] = normalizeGameTree(id, tree);
    }
    return {
      formatVersion,
      applySettings: payload.format === FORMAT,
      settings: payload.settings || null,
      games,
    };
  }

  const named = gamesFromNamedKeys(payload, knownIds);
  if (Object.keys(named).length) {
    return { formatVersion, applySettings: false, settings: null, games: named };
  }

  const bareId = payload.general?.gameId;
  if (bareId && knownIds.has(bareId) && Array.isArray(payload.records)) {
    return {
      formatVersion,
      applySettings: false,
      settings: null,
      games: { [bareId]: normalizeGameTree(bareId, payload) },
    };
  }

  throw new Error(
    'Unrecognized backup. Use a Wordaholic export, or a file that starts with a game name (polywordlot or transword).'
  );
}

async function importFormatV2(parsed) {
  if (parsed.applySettings && parsed.settings) {
    if (Array.isArray(parsed.settings.favoriteLanguages)) {
      await setFavoriteLanguages(parsed.settings.favoriteLanguages);
    }
    if (parsed.settings.lastLanguage) {
      await setLastLanguage(parsed.settings.lastLanguage);
    }
  }

  let importedGames = 0;
  let importedRecords = 0;
  for (const tree of Object.values(parsed.games)) {
    const result = await storage.importGame(tree);
    importedGames += 1;
    importedRecords += result.importedRecords || 0;
  }
  return { importedGames, importedRecords };
}
