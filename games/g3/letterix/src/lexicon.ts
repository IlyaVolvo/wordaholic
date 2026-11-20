import { PARAMS } from './params.ts';
import { hashSeed, nextUnit } from './rng.ts';

export type LetterRow = { letter: string; freq: number; cum: number };

export type Lexicon = {
  dict: Set<string>;
  values: Record<string, number>;
  table: LetterRow[];
  total: number;
  /** Folds a board word before the dictionary lookup. A one-letter fold is what falls. */
  normalize: (word: string) => string;
  /** The one corpus spelling of a normalized word, or null when more than one spelling shares it. */
  written: (word: string) => string | null;
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
  /** Playable words that do not affect letter frequency or values. */
  extraWords?: string[];
};

export function buildLexicon(
  words: string[],
  normalize: (word: string) => string,
  options: LexiconOptions = {},
): Lexicon {
  const baseLetter = options.baseLetter ?? ((letter: string) => letter);
  const fallingLetter = (ch: string) => {
    const base = baseLetter(ch);
    const folded = Array.from(normalize(base));
    return folded.length === 1 ? folded[0] : base;
  };
  const dict = new Set<string>();
  const freq = new Map<string, number>();
  const spellings = new Map<string, Set<string>>();
  const take = (raw: string, count: boolean) => {
    const surface = Array.from(String(raw || '').trim().toLowerCase()).join('');
    if (!surface) return;
    if (count) {
      for (const ch of surface) {
        const drawn = fallingLetter(ch);
        freq.set(drawn, (freq.get(drawn) || 0) + 1);
      }
    }
    const word = Array.from(normalize(surface)).join('');
    if (Array.from(surface).length >= PARAMS.Nmin && word) {
      dict.add(word);
      const known = spellings.get(word) ?? new Set<string>();
      known.add(surface);
      spellings.set(word, known);
    }
  };
  for (const raw of words) take(raw, true);
  for (const raw of options.extraWords || []) take(raw, false);

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
    written(word: string) {
      const known = spellings.get(word);
      if (!known || known.size !== 1) return null;
      return [...known][0];
    },
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
