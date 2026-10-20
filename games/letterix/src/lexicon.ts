import { PARAMS } from './params.ts';
import { hashSeed, nextUnit } from './rng.ts';

export type LetterRow = { letter: string; freq: number; cum: number };

export type Lexicon = {
  dict: Set<string>;
  values: Record<string, number>;
  table: LetterRow[];
  total: number;
  /** Folds a board word before the dictionary lookup. Letter draws use base letters. */
  normalize: (word: string) => string;
  /** A board word (reading order) as the language writes it in place, e.g. a Hebrew final letter at the end. */
  spell: (word: string) => string;
  /** Horizontal words read right to left. */
  rtl: boolean;
};

/** Language hooks from app/i18n/languages; each defaults to no change. */
export type LexiconOptions = {
  /** The letter a positional form stands for (Hebrew ם → מ). Only base letters fall, and forms count toward them. */
  baseLetter?: (letter: string) => string;
  spell?: (word: string) => string;
  rtl?: boolean;
};

export function buildLexicon(
  words: string[],
  normalize: (word: string) => string,
  options: LexiconOptions = {},
): Lexicon {
  const baseLetter = options.baseLetter ?? ((letter: string) => letter);
  const dict = new Set<string>();
  const freq = new Map<string, number>();
  for (const raw of words) {
    const surface = Array.from(String(raw || '').trim().toLowerCase()).join('');
    if (!surface) continue;
    for (const ch of surface) {
      const drawn = baseLetter(ch);
      freq.set(drawn, (freq.get(drawn) || 0) + 1);
    }
    const word = Array.from(normalize(surface)).join('');
    if (Array.from(surface).length >= PARAMS.Nmin && word) dict.add(word);
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

  return {
    dict,
    values,
    table,
    total: cum,
    normalize,
    spell: options.spell ?? ((word: string) => word),
    rtl: Boolean(options.rtl),
  };
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
