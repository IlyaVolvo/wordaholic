import type { Lexicon } from './lexicon.ts';
import { PARAMS } from './params.ts';
import { wordValue } from './score.ts';

export type Dir = 'h' | 'v';

export type Match = {
  dir: Dir;
  line: number;
  /** Positions along the line in reading order: right to left for RTL rows, top to bottom for columns. */
  start: number;
  end: number;
  text: string;
  value: number;
  /** In reading order, so the last cell is the end of the word. */
  cells: { r: number; c: number }[];
  /** The word as the language writes it when that differs from the board letters, e.g. a Hebrew final form at the end. */
  display?: string;
};

type Cell = { r: number; c: number };

export type MatchOptions = {
  normalize?: (word: string) => string;
  spell?: (word: string) => string;
  rtl?: boolean;
};

export type Suppression = {
  key: string;
  dir: Dir;
  line: number;
  start: number;
  end: number;
  text: string;
  gen: number;
};

export function matchKey(m: Pick<Match, 'dir' | 'line' | 'start' | 'end' | 'text'>): string {
  return `${m.dir}:${m.line}:${m.start}:${m.end}:${m.text}`;
}

/** `cellAt(i)` is the i-th cell of the line in reading order. */
function scanLine(
  dir: Dir,
  line: number,
  length: number,
  cellAt: (i: number) => Cell,
  grid: (string | null)[][],
  dict: Set<string>,
  values: Record<string, number>,
  normalize: (word: string) => string,
  spell: ((word: string) => string) | undefined,
  found: Match[],
) {
  const at = (i: number) => {
    const { r, c } = cellAt(i);
    return grid[r]?.[c] ?? null;
  };
  let i = 0;
  while (i < length) {
    while (i < length && !at(i)) i += 1;
    const seg = i;
    let text = '';
    while (i < length && at(i)) {
      text += at(i);
      i += 1;
    }
    const chars = Array.from(text);
    for (let a = 0; a < chars.length; a++) {
      for (let b = a + PARAMS.Nmin; b <= chars.length; b++) {
        const sub = chars.slice(a, b).join('');
        const folded = normalize(sub);
        if (!dict.has(folded)) continue;
        const start = seg + a;
        const end = seg + b;
        const cells: Cell[] = [];
        for (let k = start; k < end; k++) cells.push(cellAt(k));
        const spelled = spell?.(sub);
        const match: Match = {
          dir,
          line,
          start,
          end,
          text: sub,
          value: wordValue(sub, values),
          cells,
        };
        if (spelled && spelled !== sub && Array.from(spelled).length === b - a) match.display = spelled;
        found.push(match);
      }
    }
  }
}

/** Every dictionary match that is not strictly inside a longer match on the same line. */
export function findMatches(
  grid: (string | null)[][],
  W: number,
  rows: number,
  dict: Set<string>,
  values: Record<string, number>,
  options: MatchOptions = {},
): Match[] {
  const normalize = options.normalize ?? ((word: string) => word);
  const found: Match[] = [];
  for (let r = 0; r < rows; r++) {
    const cellAt = options.rtl ? (i: number) => ({ r, c: W - 1 - i }) : (i: number) => ({ r, c: i });
    scanLine('h', r, W, cellAt, grid, dict, values, normalize, options.spell, found);
  }
  for (let c = 0; c < W; c++) {
    scanLine('v', c, rows, (i) => ({ r: rows - 1 - i, c }), grid, dict, values, normalize, options.spell, found);
  }
  return found.filter(
    (m) =>
      !found.some(
        (o) =>
          o !== m &&
          o.dir === m.dir &&
          o.line === m.line &&
          o.start <= m.start &&
          o.end >= m.end &&
          (o.start < m.start || o.end > m.end),
      ),
  );
}

export function lineGen(dir: Dir, line: number, rowGen: number[], colGen: number[]): number {
  return dir === 'h' ? rowGen[line] || 0 : colGen[line] || 0;
}

export function offeredMatches(
  grid: (string | null)[][],
  W: number,
  rows: number,
  lex: Pick<Lexicon, 'dict' | 'values' | 'normalize'> & Partial<Pick<Lexicon, 'spell' | 'rtl'>>,
  suppressed: Suppression[],
  rowGen: number[],
  colGen: number[],
): Match[] {
  const options = { normalize: lex.normalize, spell: lex.spell, rtl: lex.rtl };
  return findMatches(grid, W, rows, lex.dict, lex.values, options).filter((m) => {
    const gen = lineGen(m.dir, m.line, rowGen, colGen);
    const key = matchKey(m);
    return !suppressed.some((s) => s.key === key && s.gen === gen);
  });
}
