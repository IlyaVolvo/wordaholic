import { storage } from '../storage/idb.js';
import { getFavoriteLanguages, getLastLanguage, setFavoriteLanguages, setLastLanguage } from '../i18n-prefs/favorites.js';
import { listGames } from '../games-contract.js';

const POLY_KEY = 'wordaholic-polywordlot-v1';
const FORMAT = 'wordaholic-site-backup';
const FORMAT_VERSION = 1;

/**
 * Export favorites + every registered game's persisted data.
 */
export async function exportSiteBackup() {
  const games = {};
  for (const game of listGames()) {
    try {
      games[game.id] = await storage.exportGame(game.id);
    } catch (err) {
      console.warn(`Export failed for ${game.id}`, err);
    }
  }

  let polywordlotLocal = null;
  try {
    const raw = localStorage.getItem(POLY_KEY);
    if (raw) polywordlotLocal = JSON.parse(raw);
  } catch {
    polywordlotLocal = null;
  }

  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      favoriteLanguages: getFavoriteLanguages(),
      lastLanguage: getLastLanguage(),
    },
    games,
    polywordlotLocal,
  };
}

/**
 * @param {object} payload
 */
export async function importSiteBackup(payload) {
  if (!payload || payload.format !== FORMAT) {
    throw new Error('Invalid Wordaholic backup file');
  }

  if (payload.settings?.favoriteLanguages) {
    await setFavoriteLanguages(payload.settings.favoriteLanguages);
  }
  if (payload.settings?.lastLanguage) {
    await setLastLanguage(payload.settings.lastLanguage);
  }

  let importedGames = 0;
  if (payload.games && typeof payload.games === 'object') {
    for (const [gameId, gamePayload] of Object.entries(payload.games)) {
      const envelope =
        gamePayload?.format === 'wordaholic-game-backup'
          ? gamePayload
          : { ...gamePayload, format: 'wordaholic-game-backup', gameId };
      try {
        await storage.importGame(envelope);
        importedGames += 1;
      } catch (err) {
        console.warn(`Import failed for ${gameId}`, err);
      }
    }
  }

  if (payload.polywordlotLocal && typeof payload.polywordlotLocal === 'object') {
    try {
      const currentRaw = localStorage.getItem(POLY_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : { nextId: 1, games: [], selectedLanguages: null, feedback: [] };
      const incoming = payload.polywordlotLocal;
      const byKey = new Map();
      const keyOf = (g) =>
        `${g.language}|${g.word_length}|${g.game_date}|${g.is_random_mode}|${g.word_seed ?? ''}`;
      for (const g of current.games || []) byKey.set(keyOf(g), g);
      for (const g of incoming.games || []) {
        if (g && typeof g === 'object') byKey.set(keyOf(g), g);
      }
      const games = [...byKey.values()];
      const nextId = Math.max(
        current.nextId || 1,
        incoming.nextId || 1,
        ...games.map((g) => (g.id || 0) + 1),
        1
      );
      localStorage.setItem(
        POLY_KEY,
        JSON.stringify({
          nextId,
          games,
          selectedLanguages: incoming.selectedLanguages ?? current.selectedLanguages,
          feedback: current.feedback || [],
        })
      );
    } catch (err) {
      console.warn('PolyWordlot local import failed', err);
    }
  }

  return { importedGames };
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
