import type { Lexicon } from './lexicon.ts';
import { PARAMS } from './params.ts';
import { wordValue } from './score.ts';

export type Dir = 'h' | 'v';

export type Match = {
  dir: Dir;
  line: number;
  start: number;
  end: number;
  text: string;
  value: number;
  cells: { r: number; c: number }[];
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

function cellsOf(dir: Dir, line: number, start: number, end: number): { r: number; c: number }[] {
  const cells = [];
  for (let i = start; i < end; i++) {
    cells.push(dir === 'h' ? { r: line, c: i } : { r: i, c: line });
  }
  return cells;
}

function scanLine(
  dir: Dir,
  line: number,
  length: number,
  at: (i: number) => string | null,
  dict: Set<string>,
  values: Record<string, number>,
  found: Match[],
) {
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
        if (!dict.has(sub)) continue;
        const start = seg + a;
        const end = seg + b;
        found.push({
          dir,
          line,
          start,
          end,
          text: sub,
          value: wordValue(sub, values),
          cells: cellsOf(dir, line, start, end),
        });
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
): Match[] {
  const found: Match[] = [];
  for (let r = 0; r < rows; r++) {
    scanLine('h', r, W, (i) => grid[r][i], dict, values, found);
  }
  for (let c = 0; c < W; c++) {
    scanLine('v', c, rows, (i) => grid[i][c], dict, values, found);
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
  lex: Pick<Lexicon, 'dict' | 'values'>,
  suppressed: Suppression[],
  rowGen: number[],
  colGen: number[],
): Match[] {
  return findMatches(grid, W, rows, lex.dict, lex.values).filter((m) => {
    const gen = lineGen(m.dir, m.line, rowGen, colGen);
    const key = matchKey(m);
    return !suppressed.some((s) => s.key === key && s.gen === gen);
  });
}
