/**
 * Site-stats registry. Ingest still accepts a legacy games field from older clients and does not store it.
 * A new game needs an entry here so that field stays valid, and a play-start report for the count.
 */

export const STATS_LANG = '[a-z]{2,8}';

export const STATS_GAMES = [
  { id: 'polywordlot', keyAfterLang: String.raw`\d{1,2}` },
  { id: 'transword', keyAfterLang: String.raw`\d{1,2},\d{1,2}` },
  { id: 'polyhydra', keyAfterLang: String.raw`\d{1,2},\d{1,2}` },
  { id: 'letterix', keyAfterLang: String.raw`\d{1,2},\d{1,2}` },
];

export const STATS_GAME_IDS = STATS_GAMES.map((g) => g.id);

/**
 * @param {{ id: string, keyAfterLang: string }} game
 */
export function statsGameKeyRe(game) {
  return new RegExp(`^${STATS_LANG},${game.keyAfterLang}$`);
}
