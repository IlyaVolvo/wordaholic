import { storage } from '../storage/idb.js';
import { getFavoriteLanguages, getLastLanguage, setFavoriteLanguages, setLastLanguage } from '../i18n-prefs/favorites.js';
import { listGames } from '../games-contract.js';

const FORMAT = 'wordaholic-site-backup';
const FORMAT_VERSION = 1;
const POLY_GAME_ID = 'polywordlot';

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

  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      favoriteLanguages: getFavoriteLanguages(),
      lastLanguage: getLastLanguage(),
    },
    games,
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
      await ingestLegacyPolywordlot(payload.polywordlotLocal);
      importedGames += 1;
    } catch (err) {
      console.warn('PolyWordlot legacy import failed', err);
    }
  }

  return { importedGames };
}

/**
 * Old backups stored PolyWordlot in a localStorage blob. Write into records.
 * Identity must match games/polywordlot/src/storage/platform.ts.
 * @param {object} store
 */
async function ingestLegacyPolywordlot(store) {
  const games = Array.isArray(store.games) ? store.games : [];
  for (const game of games) {
    if (!game || typeof game !== 'object') continue;
    const identity = `${game.language}|${game.word_length}|${game.game_date}|${game.is_random_mode}|${game.word_seed ?? ''}`;
    await storage.putRecord({
      ...game,
      id: `${POLY_GAME_ID}:game:${identity}`,
      gameId: POLY_GAME_ID,
      kind: 'game',
      numericId: game.id,
    });
  }
  const nextId = Math.max(
    store.nextId || 1,
    ...games.map((g) => (g.id || 0) + 1),
    1
  );
  await storage.setGameState(POLY_GAME_ID, 'meta', { nextId });
  if (store.selectedLanguages) {
    const prefs = (await storage.getGameState(POLY_GAME_ID, 'prefs')) || {
      randomMode: false,
      language: 'en',
      wordLength: 5,
    };
    await storage.setGameState(POLY_GAME_ID, 'prefs', {
      ...prefs,
      selectedLanguages: store.selectedLanguages,
    });
  }
  if (Array.isArray(store.feedback) && store.feedback.length) {
    const current = (await storage.getGameState(POLY_GAME_ID, 'feedback')) || [];
    await storage.setGameState(POLY_GAME_ID, 'feedback', [...current, ...store.feedback]);
  }
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
