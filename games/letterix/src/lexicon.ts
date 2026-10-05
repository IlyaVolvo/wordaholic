import { PARAMS } from './params.ts';
import { hashSeed, nextUnit } from './rng.ts';

export type LetterRow = { letter: string; freq: number; cum: number };

export type Lexicon = {
  dict: Set<string>;
  values: Record<string, number>;
  table: LetterRow[];
  total: number;
};

export function buildLexicon(words: string[], normalize: (word: string) => string): Lexicon {
  const dict = new Set<string>();
  const freq = new Map<string, number>();
  for (const raw of words) {
    const word = Array.from(normalize(String(raw || '').trim().toLowerCase())).join('');
    if (!word) continue;
    for (const ch of word) freq.set(ch, (freq.get(ch) || 0) + 1);
    if (Array.from(word).length >= PARAMS.Nmin) dict.add(word);
  }

  const letters = [...freq.keys()].sort((a, b) => (a.codePointAt(0) || 0) - (b.codePointAt(0) || 0));
  let fMax = 0;
  let fMin = Number.POSITIVE_INFINITY;
  for (const letter of letters) {
    const n = freq.get(letter) || 0;
    if (n > fMax) fMax = n;
    if (n < fMin) fMin = n;
  }
  if (!letters.length) fMin = 0;

  const values: Record<string, number> = {};
  const span = fMax - fMin;
  for (const letter of letters) {
    const n = freq.get(letter) || 0;
    values[letter] = span === 0 ? 1 : 1 + (PARAMS.Vmax - 1) * ((fMax - n) / span);
  }

  let cum = 0;
  const table: LetterRow[] = letters.map((letter) => {
    cum += freq.get(letter) || 0;
    return { letter, freq: freq.get(letter) || 0, cum };
  });

  return { dict, values, table, total: cum };
}

export function pickLetter(u: number, table: LetterRow[], total: number): string {
  if (!table.length || total <= 0) return 'a';
  const target = u * total;
  for (const row of table) {
    if (target < row.cum) return row.letter;
  }
  return table[table.length - 1].letter;
}

export function lettersFromSeed(seed: string, lex: Lexicon, count: number): string[] {
  let state = hashSeed(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextUnit(state);
    state = next.state;
    out.push(pickLetter(next.u, lex.table, lex.total));
  }
  return out;
}
