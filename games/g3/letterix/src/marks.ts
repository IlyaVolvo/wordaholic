import { PARAMS } from './params.ts';

export type MarkKind = 'missing' | 'questionable';

export type WordMark = {
  word: string;
  kind: MarkKind;
};

export type MarkCell = { r: number; c: number };

export type MarkRun = {
  word: string;
  cells: MarkCell[];
};

type SpellHooks = {
  normalize: (word: string) => string;
  written: (word: string) => string | null;
  spell: (word: string) => string;
};

const IDENTITY: SpellHooks = {
  normalize: (word) => word,
  written: () => null,
  spell: (word) => word,
};

/** Marking is possible only when every letter has settled. */
export function canMark(falling: readonly unknown[]): boolean {
  return falling.length === 0;
}

/**
 * The contiguous settled run a swipe covers, when the swipe follows the language.
 * Row 0 is the floor. Across is left to right, except right to left when `rtl`.
 * Down a column is top to bottom. The opposite direction selects nothing.
 */
export function swipeRun(
  grid: (string | null)[][],
  rtl: boolean,
  start: { row: number; col: number },
  end: { row: number; col: number },
  hooks: SpellHooks = IDENTITY,
  minLen = PARAMS.Nmin,
): MarkRun | null {
  const dCol = end.col - start.col;
  const dRow = end.row - start.row;
  const adCol = Math.abs(dCol);
  const adRow = Math.abs(dRow);
  if (adCol === adRow) return null;
  if (adCol > adRow) {
    if (rtl ? dCol >= 0 : dCol <= 0) return null;
    if (adCol < minLen - 1) return null;
    const line = grid[start.row];
    if (!line) return null;
    return coveredRun(
      line.length,
      (index) => line[index] ?? null,
      (index) => ({ r: start.row, c: index }),
      rtl,
      Math.min(start.col, end.col),
      Math.max(start.col, end.col),
      end.col,
      minLen,
      hooks,
    );
  }
  if (dRow >= 0) return null;
  if (adRow < minLen - 1) return null;
  return coveredRun(
    grid.length,
    (index) => grid[index]?.[start.col] ?? null,
    (index) => ({ r: index, c: start.col }),
    true,
    Math.min(start.row, end.row),
    Math.max(start.row, end.row),
    end.row,
    minLen,
    hooks,
  );
}

/** Keeps a word that is already filed under this kind. */
export function addMark(
  marks: WordMark[],
  word: string,
  kind: MarkKind,
  normalize: (word: string) => string = (value) => value.toLowerCase(),
): WordMark[] {
  const key = normalize(word);
  if (marks.some((mark) => normalize(mark.word) === key && mark.kind === kind)) return marks;
  const rest = marks.filter((mark) => normalize(mark.word) !== key);
  return [...rest, { word, kind }];
}

/**
 * Letters from the first tap through the second, when they share a row and have no empty cell between them.
 * The word is spelled in the language's reading direction.
 */
export function contiguousRowWord(
  grid: (string | null)[][],
  anchor: { row: number; col: number },
  tap: { row: number; col: number },
  rtl: boolean,
  hooks: SpellHooks = IDENTITY,
): MarkRun | null {
  if (anchor.row !== tap.row || anchor.col === tap.col) return null;
  const line = grid[anchor.row];
  if (!line) return null;
  const lo = Math.min(anchor.col, tap.col);
  const hi = Math.max(anchor.col, tap.col);
  const cells: MarkCell[] = [];
  let text = '';
  for (let col = lo; col <= hi; col++) {
    const letter = line[col];
    if (!letter) return null;
    text += letter;
    cells.push({ r: anchor.row, c: col });
  }
  if (rtl) {
    text = Array.from(text).reverse().join('');
    cells.reverse();
  }
  return { word: spellWord(text, hooks), cells };
}

/**
 * A shown column marks down. After the game, two taps in one column mark down as well.
 */
export function marksColumn(shownColumn: boolean, phaseOver: boolean, anchorCol: number, tapCol: number): boolean {
  return shownColumn || (phaseOver && anchorCol === tapCol);
}

/**
 * Letters from the first tap through the second, when they share a column and have no empty cell between them.
 * The word is read from the top of the range down to the floor.
 */
export function contiguousColumnWord(
  grid: (string | null)[][],
  anchor: { row: number; col: number },
  tap: { row: number; col: number },
  hooks: SpellHooks = IDENTITY,
): MarkRun | null {
  if (anchor.col !== tap.col || anchor.row === tap.row) return null;
  const lo = Math.min(anchor.row, tap.row);
  const hi = Math.max(anchor.row, tap.row);
  const cells: MarkCell[] = [];
  let text = '';
  for (let row = hi; row >= lo; row--) {
    const letter = grid[row]?.[anchor.col];
    if (!letter) return null;
    text += letter;
    cells.push({ r: row, c: anchor.col });
  }
  return { word: spellWord(text, hooks), cells };
}

/**
 * The word a double-click clears. A letter on both a horizontal and a vertical word clears nothing.
 * Letters that also belong to the other word stay pink.
 */
export function missingUnselect(
  grid: (string | null)[][],
  marked: (row: number, col: number) => boolean,
  row: number,
  col: number,
  rtl: boolean,
  hooks: SpellHooks = IDENTITY,
): MarkRun | null {
  if (!grid[row]?.[col] || !marked(row, col)) return null;
  const horizontal = horizontalPinkRun(grid, marked, row, col, rtl, hooks);
  const vertical = verticalPinkRun(grid, marked, row, col, hooks);
  const across = horizontal.cells.length >= 2;
  const down = vertical.cells.length >= 2;
  if (across && down) return null;
  if (across) {
    return {
      word: horizontal.word,
      cells: horizontal.cells.filter((cell) => verticalPinkRun(grid, marked, cell.r, cell.c, hooks).cells.length < 2),
    };
  }
  if (down) {
    return {
      word: vertical.word,
      cells: vertical.cells.filter((cell) => horizontalPinkRun(grid, marked, cell.r, cell.c, rtl, hooks).cells.length < 2),
    };
  }
  return horizontal;
}

/**
 * The pink letters of one missing word: the contiguous marked letters on this row or column that contain the click.
 */
export function markedMissingRun(
  grid: (string | null)[][],
  marked: (row: number, col: number) => boolean,
  row: number,
  col: number,
  rtl: boolean,
  hooks: SpellHooks = IDENTITY,
): MarkRun | null {
  const line = grid[row];
  if (!line?.[col] || !marked(row, col)) return null;
  const horizontal = horizontalPinkRun(grid, marked, row, col, rtl, hooks);
  const vertical = verticalPinkRun(grid, marked, row, col, hooks);
  if (horizontal && vertical) {
    return horizontal.cells.length >= vertical.cells.length ? horizontal : vertical;
  }
  return horizontal || vertical;
}

function horizontalPinkRun(
  grid: (string | null)[][],
  marked: (row: number, col: number) => boolean,
  row: number,
  col: number,
  rtl: boolean,
  hooks: SpellHooks,
): MarkRun | null {
  const line = grid[row];
  if (!line?.[col]) return null;
  let lo = col;
  let hi = col;
  while (lo > 0 && line[lo - 1] && marked(row, lo - 1)) lo -= 1;
  while (hi + 1 < line.length && line[hi + 1] && marked(row, hi + 1)) hi += 1;
  const cells: MarkCell[] = [];
  let text = '';
  for (let c = lo; c <= hi; c++) {
    text += line[c];
    cells.push({ r: row, c });
  }
  if (rtl) {
    text = Array.from(text).reverse().join('');
    cells.reverse();
  }
  return { word: spellWord(text, hooks), cells };
}

function verticalPinkRun(
  grid: (string | null)[][],
  marked: (row: number, col: number) => boolean,
  row: number,
  col: number,
  hooks: SpellHooks,
): MarkRun | null {
  let lo = row;
  let hi = row;
  while (lo > 0 && grid[lo - 1]?.[col] && marked(lo - 1, col)) lo -= 1;
  while (grid[hi + 1]?.[col] && marked(hi + 1, col)) hi += 1;
  const cells: MarkCell[] = [];
  let text = '';
  for (let r = hi; r >= lo; r--) {
    text += grid[r][col];
    cells.push({ r, c: col });
  }
  return { word: spellWord(text, hooks), cells };
}

/**
 * Pink cells that still spell a missing word, across or down.
 * A broken run is absent, so its letters lose the color.
 */
export function cellsKeepingMissingColor(
  grid: (string | null)[][],
  marked: (row: number, col: number) => boolean,
  words: readonly string[],
  rtl: boolean,
  hooks: SpellHooks = IDENTITY,
): Set<string> {
  const wanted = new Set(words.map((word) => hooks.normalize(word)));
  const keep = new Set<string>();
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let row = 0; row < rows; row++) {
    let col = 0;
    while (col < cols) {
      while (col < cols && !(grid[row]?.[col] && marked(row, col))) col += 1;
      const start = col;
      while (col < cols && grid[row]?.[col] && marked(row, col)) col += 1;
      if (col - start < 2) continue;
      const run = horizontalPinkRun(grid, marked, row, start, rtl, hooks);
      if (run && wanted.has(hooks.normalize(run.word))) {
        for (const cell of run.cells) keep.add(`${cell.r},${cell.c}`);
      }
    }
  }
  for (let col = 0; col < cols; col++) {
    let row = rows - 1;
    while (row >= 0) {
      while (row >= 0 && !(grid[row]?.[col] && marked(row, col))) row -= 1;
      const hi = row;
      while (row >= 0 && grid[row]?.[col] && marked(row, col)) row -= 1;
      if (hi - row < 2) continue;
      const run = verticalPinkRun(grid, marked, hi, col, hooks);
      if (run && wanted.has(hooks.normalize(run.word))) {
        for (const cell of run.cells) keep.add(`${cell.r},${cell.c}`);
      }
    }
  }
  return keep;
}

/** Same kind again removes the word. The other kind moves it. */
export function toggleMark(
  marks: WordMark[],
  word: string,
  kind: MarkKind,
  normalize: (word: string) => string = (value) => value.toLowerCase(),
): WordMark[] {
  const key = normalize(word);
  const existing = marks.find((mark) => normalize(mark.word) === key);
  const rest = marks.filter((mark) => normalize(mark.word) !== key);
  if (existing?.kind === kind) return rest;
  return [...rest, { word, kind }];
}

function coveredRun(
  length: number,
  letterAt: (index: number) => string | null,
  cellAt: (index: number) => MarkCell,
  reverse: boolean,
  lo: number,
  hi: number,
  prefer: number,
  minLen: number,
  hooks: SpellHooks,
): MarkRun | null {
  let best: { a: number; b: number } | null = null;
  let i = 0;
  while (i < length) {
    while (i < length && !letterAt(i)) i += 1;
    const a = i;
    while (i < length && letterAt(i)) i += 1;
    const b = i - 1;
    if (b < a) continue;
    const count = b - a + 1;
    if (count < minLen || a < lo || b > hi) continue;
    if (!best || count > best.b - best.a + 1 || (count === best.b - best.a + 1 && nearer(a, b, prefer, best))) {
      best = { a, b };
    }
  }
  if (!best) return null;
  const cells: MarkCell[] = [];
  let text = '';
  if (reverse) {
    for (let k = best.b; k >= best.a; k -= 1) {
      text += letterAt(k);
      cells.push(cellAt(k));
    }
  } else {
    for (let k = best.a; k <= best.b; k += 1) {
      text += letterAt(k);
      cells.push(cellAt(k));
    }
  }
  return { word: spellWord(text, hooks), cells };
}

function nearer(a: number, b: number, prefer: number, best: { a: number; b: number }): boolean {
  return Math.abs((a + b) / 2 - prefer) < Math.abs((best.a + best.b) / 2 - prefer);
}

function spellWord(text: string, hooks: SpellHooks): string {
  const folded = hooks.normalize(text);
  const corpus = hooks.written(folded);
  const restored = corpus && Array.from(corpus).length === Array.from(text).length ? corpus : text;
  const spelled = hooks.spell(restored);
  return Array.from(spelled).length === Array.from(text).length ? spelled : text;
}
