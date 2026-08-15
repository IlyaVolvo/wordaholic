import { storage } from '../storage/idb.js';
import { getFavoriteLanguages, getLastLanguage, setFavoriteLanguages, setLastLanguage } from '../i18n-prefs/favorites.js';
import { listGames } from '../games-contract.js';

const FORMAT = 'wordaholic-site-backup';
/** Version this build writes. */
const WRITER_FORMAT_VERSION = 2;
/** Files with no formatVersion are the first write of this tree. */
const DEFAULT_READER_VERSION = 2;

const READERS = {
  2: importFormatV2,
};

export async function exportSiteBackup() {
  const games = {};
  for (const game of listGames()) {
    games[game.id] = await storage.exportGame(game.id);
  }
  return {
    format: FORMAT,
    formatVersion: WRITER_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      favoriteLanguages: getFavoriteLanguages(),
      lastLanguage: getLastLanguage(),
    },
    games,
  };
}

export function downloadSiteBackup(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wordaholic-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  return new Set(listGames().map((game) => game.id));
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
