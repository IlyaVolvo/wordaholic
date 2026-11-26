/** Deterministic Hydra secrets. Tag keeps these unrelated to the one-board daily. */

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hydraDailySeed(date, language, wordLength, boardCount) {
  const dateStr = String(date).replace(/-/g, '');
  return hashString(`hydra-${dateStr}-${language}-${wordLength}-${boardCount}`);
}

/**
 * @param {{ language: string, wordLength: number, answerWords: string[] }} dictionary
 * @param {string} date
 * @param {number} boardCount
 */
export function getHydraDailyWords(dictionary, date, boardCount) {
  const answers = dictionary.answerWords;
  if (!answers.length || boardCount < 1) return [];
  const seed = hydraDailySeed(date, dictionary.language, dictionary.wordLength, boardCount);
  const rng = mulberry32(seed);
  const pool = answers.slice();
  const words = [];
  for (let i = 0; i < boardCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const picked = pool[j];
    pool[j] = pool[i];
    pool[i] = picked;
    words.push(picked);
  }
  return words;
}
