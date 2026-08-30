/**
 * Full game plugin contract for Wordaholic.
 * Each game keeps its own screens; semantics of state/stats are per-game.
 */

/**
 * @typedef {object} GameContext
 * @property {string} language
 * @property {import('./storage/idb.js').WordaholicStorage} storage
 * @property {object} settings
 * @property {(event: string, payload?: unknown) => void} emit
 * @property {(paths: string[]) => Promise<void>} ensureWordsets
 * @property {(relPath: string) => Promise<unknown>} loadWordset
 */

/**
 * @typedef {object} GamePlugin
 * @property {string} id
 * @property {string} name
 * @property {number} storageSchema
 * @property {string[]} languages
 * @property {(ctx: GameContext) => Promise<void>|void} initialize
 * @property {() => Promise<void>|void} start
 * @property {() => unknown} saveState
 * @property {(state: unknown) => Promise<void>|void} restoreState
 * @property {() => unknown} getStatistics
 * @property {() => boolean} [isSessionActive]
 * @property {() => Promise<void>|void} [onUpdateApproved]
 */

/** Stable ids even when the plugin registry has not been populated (game pages). */
export const KNOWN_GAME_IDS = ['polywordlot', 'transword', 'polyhydra'];

/** @type {Map<string, GamePlugin>} */
const registry = new Map();

/**
 * @param {GamePlugin} plugin
 */
export function registerGame(plugin) {
  if (!plugin?.id) throw new Error('Game plugin requires a stable id');
  registry.set(plugin.id, plugin);
}

/** @returns {GamePlugin[]} */
export function listGames() {
  return [...registry.values()];
}

/** @returns {string[]} */
export function listGameIds() {
  const ids = new Set(KNOWN_GAME_IDS);
  for (const id of registry.keys()) ids.add(id);
  return [...ids];
}

/** @param {string} id */
export function getGame(id) {
  return registry.get(id) || null;
}
