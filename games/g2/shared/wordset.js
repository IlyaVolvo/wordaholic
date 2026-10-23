/**
 * Group g2 word sets: games/g2/data/languages/index.json + <Language>/corpus.txt.
 * Each corpus line is `word [level]`; level defaults to 1.
 */
export const LANGUAGES_BASE = '/games/g2/data/languages';

/** @returns {Promise<{ dir: string, code?: string, menu?: string, flag?: string, words?: number }[]>} */
export async function loadLanguageIndex() {
  const res = await fetch(`${LANGUAGES_BASE}/index.json`);
  if (!res.ok) throw new Error('Failed to load language index');
  return res.json();
}

/** @param {string} dir */
export async function loadCorpusText(dir) {
  const res = await fetch(`${LANGUAGES_BASE}/${dir}/corpus.txt`);
  if (!res.ok) throw new Error(`Failed to load corpus for ${dir}`);
  return res.text();
}

/** @param {string} text @returns {{ word: string, level: number }[]} */
export function parseCorpus(text) {
  const entries = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\t ]+/);
    const word = (parts[0] || '').toLowerCase();
    const level = parseInt(parts[1], 10) || 1;
    if (word) entries.push({ word, level });
  }
  return entries;
}

/** @param {string} dir */
export async function loadCorpus(dir) {
  return parseCorpus(await loadCorpusText(dir));
}
