import { gameIdForKey, parseConfiguration, resolveDefinition } from '/scripts/scoreboard-defs.js';

const KEY = 'wordaholic-scoreboard-v2';
const MODES = ['language', 'configuration', 'custom'];

/**
 * @param {unknown} value
 */
function gameKey(value) {
  const key = String(value || '');
  return gameIdForKey(key) == null ? '' : key;
}

/**
 * @param {unknown} raw
 */
function asTable(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const game = gameKey(rec.game);
  const gameId = gameIdForKey(game);
  if (!game || gameId == null) return null;
  const language = String(rec.language || '').toLowerCase();
  const configuration = String(rec.configuration || '');
  const definition = String(rec.definition || '');
  if (!/^[a-z]{2,8}$/.test(language)) return null;
  if (!parseConfiguration(gameId, configuration) || !resolveDefinition(gameId, definition)) return null;
  const id = typeof rec.id === 'string' && rec.id.length <= 80 ? rec.id : crypto.randomUUID();
  return { id, game, language, configuration, definition, hidden: rec.hidden === true };
}

/**
 * @param {unknown} raw
 * @param {Set<string>} tableIds
 */
function asGroups(raw, tableIds) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {{ id: string, name: string, tableIds: string[] }[]} */
  const groups = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = /** @type {Record<string, unknown>} */ (item);
    const id = typeof rec.id === 'string' && rec.id.length <= 80 ? rec.id : '';
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 40) : '';
    if (!id || !name) continue;
    const ids = Array.isArray(rec.tableIds)
      ? rec.tableIds.map((tableId) => String(tableId || '')).filter((tableId) => tableIds.has(tableId) && !seen.has(tableId))
      : [];
    for (const tableId of ids) seen.add(tableId);
    groups.push({ id, name, tableIds: ids });
  }
  return groups;
}

/**
 * @param {unknown} raw
 */
export function normalizeScoreboardPrefs(raw) {
  const rec = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
  const limitRaw = Number(rec.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 3;
  const legacyOnly = !Array.isArray(rec.tables) && Array.isArray(rec.favorites);
  if (legacyOnly) return { limit, selected: '', tables: [], layouts: {} };
  const tables = Array.isArray(rec.tables) ? rec.tables.map(asTable).filter(Boolean) : [];
  const ids = new Set();
  const unique = [];
  for (const table of tables) {
    if (ids.has(table.id)) continue;
    ids.add(table.id);
    unique.push(table);
  }
  /** @type {Record<string, { mode: string, groups?: { id: string, name: string, tableIds: string[] }[] }>} */
  const layouts = {};
  const layoutRaw = rec.layouts && typeof rec.layouts === 'object' ? /** @type {Record<string, unknown>} */ (rec.layouts) : {};
  for (const [key, value] of Object.entries(layoutRaw)) {
    if (!gameKey(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const layout = /** @type {Record<string, unknown>} */ (value);
    const mode = MODES.includes(String(layout.mode)) ? String(layout.mode) : 'language';
    const gameTables = new Set(unique.filter((table) => table.game === key).map((table) => table.id));
    if (!gameTables.size) continue;
    if (mode === 'custom') layouts[key] = { mode, groups: asGroups(layout.groups, gameTables) };
    else layouts[key] = { mode };
  }
  const selected = gameKey(rec.selected);
  const selectedOk = unique.some((table) => table.game === selected) ? selected : '';
  return { limit, selected: selectedOk, tables: unique, layouts };
}

export function loadScoreboardPrefs() {
  try {
    return normalizeScoreboardPrefs(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return normalizeScoreboardPrefs({});
  }
}

/**
 * @param {unknown} prefs
 */
export function saveScoreboardPrefs(prefs) {
  const next = normalizeScoreboardPrefs(prefs);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function scoreboardPrefsForBackup() {
  return loadScoreboardPrefs();
}

/**
 * @param {unknown} raw
 */
export function applyScoreboardPrefs(raw) {
  if (!raw || typeof raw !== 'object') return;
  saveScoreboardPrefs(raw);
}
