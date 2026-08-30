/**
 * Site-stats registry. Ingest, store, combine, /stats, and the CLI all read this.
 * A new game is one entry here plus reportStats({ games: { [id]: { 'lang,rest': 1 } } }).
 */

export const STATS_LANG = '[a-z]{2,8}';

export const STATS_GAMES = [
  { id: 'polywordlot', keyAfterLang: String.raw`\d{1,2}` },
  { id: 'transword', keyAfterLang: String.raw`\d{1,2},\d{1,2}` },
  { id: 'polyhydra', keyAfterLang: String.raw`\d{1,2},\d{1,2}` },
];

export const STATS_GAME_IDS = STATS_GAMES.map((g) => g.id);

/**
 * @param {{ id: string, keyAfterLang: string }} game
 */
export function statsGameKeyRe(game) {
  return new RegExp(`^${STATS_LANG},${game.keyAfterLang}$`);
}
