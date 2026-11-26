import type { DictionaryEntry } from './types';
import { getHydraDailyWords as pickHydraWords, hydraDailySeed as hydraSeed } from '../../../app/daily/hydra-words.js';

/** Deterministic Hydra secrets. Tag keeps these unrelated to the one-board PolyWordlot daily. */
export function hydraDailySeed(date: string, language: string, wordLength: number, boardCount: number): number {
  return hydraSeed(date, language, wordLength, boardCount);
}

export function getHydraDailyWords(dictionary: DictionaryEntry, date: string, boardCount: number): string[] {
  return pickHydraWords(dictionary, date, boardCount);
}
