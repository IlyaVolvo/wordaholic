/**
 * Date-seeded answer for PolyWordlot.
 * Same selection the games use: sorted answer list, index from the date hash.
 */

function generateSeed(date, language, wordLength) {
  const dateStr = String(date).replace(/-/g, '');
  const combined = `${dateStr}-${language}-${wordLength}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * @param {{ language: string, wordLength: number, answerWords: string[] }} dictionary
 * @param {string} [date]
 */
export function getDailyWord(dictionary, date = formatDate()) {
  const seed = generateSeed(date, dictionary.language, dictionary.wordLength);
  const answerWords = dictionary.answerWords;
  const index = seed % answerWords.length;
  return answerWords[index];
}

/** @param {Date} [date] */
export function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
