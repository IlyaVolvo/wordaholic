import type { DictionaryEntry } from './types';

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Hydra secrets. Tag keeps these unrelated to the one-board PolyWordlot daily.
 */
export function hydraDailySeed(date: string, language: string, wordLength: number, boardCount: number): number {
  const dateStr = date.replace(/-/g, '');
  return hashString(`hydra-${dateStr}-${language}-${wordLength}-${boardCount}`);
}

export function getHydraDailyWords(
  dictionary: DictionaryEntry,
  date: string,
  boardCount: number
): string[] {
  const answers = dictionary.answerWords;
  if (!answers.length || boardCount < 1) return [];
  const seed = hydraDailySeed(date, dictionary.language, dictionary.wordLength, boardCount);
  const rng = mulberry32(seed);
  const words: string[] = [];
  for (let i = 0; i < boardCount; i++) {
    words.push(answers[Math.floor(rng() * answers.length)]);
  }
  return words;
}
