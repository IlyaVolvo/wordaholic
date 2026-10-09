import type { Lexicon } from './lexicon.ts';
import { pickLetter } from './lexicon.ts';
import { lineGen, matchKey, offeredMatches, type Match, type Suppression } from './matches.ts';
import { dailySeed, PARAMS, pixelInterval } from './params.ts';
import { hashSeed, nextUnit } from './rng.ts';
import { dropBonus, earlyBonus, scaledWordPoints } from './score.ts';

export type PieceKind = 'play' | 'settle';

export type Piece = {
  id: number;
  letter: string;
  col: number;
  yPx: number;
  selected: boolean;
  kind: PieceKind;
};

export type Phase = 'ready' | 'fall' | 'decide' | 'settle' | 'over';
export type DecideChoice = 'use' | 'skip';

export type Sim = {
  W: number;
  H: number;
  E: number;
  A: number;
  language: string;
  date: string;
  score: number;
  rng: bigint;
  nextId: number;
  grid: (string | null)[][];
  rowGen: number[];
  colGen: number[];
  falling: Piece[];
  held: { row: number; col: number } | null;
  phase: Phase;
  choice: DecideChoice;
  paused: boolean;
  decideMsLeft: number;
  offer: Match[];
  suppressed: Suppression[];
  fallAccum: number;
  spawnWaitPx: number;
  speedPct: number;
  missedLock: boolean;
  aborted: boolean;
  revision: number;
  dict: Set<string>;
  values: Record<string, number>;
  table: Lexicon['table'];
  total: number;
};

export type PersistedSim = {
  version: 1 | 2;
  W: number;
  H: number;
  E: number;
  A: number;
  language: string;
  date: string;
  score: number;
  rng: string;
  nextId: number;
  grid: (string | null)[][];
  rowGen: number[];
  colGen: number[];
  falling: Piece[];
  phase: Phase;
  choice?: DecideChoice | 'keep';
  paused: boolean;
  decideMsLeft: number;
  offer: Match[];
  suppressed: Suppression[];
  fallAccum: number;
  spawnWaitPx?: number;
  speedPct?: number;
  missedLock: boolean;
  aborted: boolean;
};

const EMPTY_LEX: Pick<Lexicon, 'dict' | 'values' | 'table' | 'total'> = {
  dict: new Set(),
  values: {},
  table: [],
  total: 0,
};

function touch(sim: Sim) {
  sim.revision += 1;
}

function rowsOf(sim: Sim): number {
  return sim.H + sim.E;
}

function bump(sim: Sim, row: number, col: number) {
  if (row >= 0 && row < sim.rowGen.length) sim.rowGen[row] += 1;
  if (col >= 0 && col < sim.colGen.length) sim.colGen[col] += 1;
}

function pruneSuppressed(sim: Sim) {
  sim.suppressed = sim.suppressed.filter((s) => s.gen === lineGen(s.dir, s.line, sim.rowGen, sim.colGen));
}

export function landY(sim: Sim, col: number): number {
  let top = 0;
  const rows = rowsOf(sim);
  for (let r = 0; r < rows; r++) {
    if (sim.grid[r][col]) top = r + 1;
  }
  return top * sim.A;
}

function rowsOverlapped(yPx: number, A: number): [number, number] {
  const bottom = Math.floor(yPx / A);
  const top = Math.floor((yPx + A - 1e-6) / A);
  return [bottom, top];
}

function overflow(sim: Sim): boolean {
  for (let r = sim.H; r < rowsOf(sim); r++) {
    for (let c = 0; c < sim.W; c++) {
      if (sim.grid[r][c]) return true;
    }
  }
  return false;
}

function rememberSuppression(sim: Sim, m: Match) {
  const key = matchKey(m);
  const gen = lineGen(m.dir, m.line, sim.rowGen, sim.colGen);
  sim.suppressed = sim.suppressed.filter((s) => s.key !== key);
  sim.suppressed.push({
    key,
    dir: m.dir,
    line: m.line,
    start: m.start,
    end: m.end,
    text: m.text,
    gen,
  });
}

function lockPiece(sim: Sim, piece: Piece) {
  sim.falling = sim.falling.filter((f) => f.id !== piece.id);
  const row = Math.round(piece.yPx / sim.A);
  if (row < 0 || row >= rowsOf(sim)) {
    sim.missedLock = true;
    return;
  }
  sim.grid[row][piece.col] = piece.letter;
  bump(sim, row, piece.col);
  if (piece.selected) {
    const next = sim.falling.find((f) => f.kind === 'play');
    if (next) next.selected = true;
  }
}

function beginSettle(sim: Sim): boolean {
  const pieces: Piece[] = [];
  const rows = rowsOf(sim);
  for (let c = 0; c < sim.W; c++) {
    const stack: { r: number; letter: string }[] = [];
    for (let r = 0; r < rows; r++) {
      const letter = sim.grid[r][c];
      if (letter) stack.push({ r, letter });
    }
    let write = 0;
    for (const item of stack) {
      if (item.r !== write) {
        sim.grid[item.r][c] = null;
        bump(sim, item.r, c);
        pieces.push({
          id: sim.nextId++,
          letter: item.letter,
          col: c,
          yPx: item.r * sim.A,
          selected: false,
          kind: 'settle',
        });
      }
      write += 1;
    }
  }
  if (!pieces.length) return false;
  sim.falling.push(...pieces);
  sim.phase = 'settle';
  return true;
}

function scanOffer(sim: Sim): Match[] {
  pruneSuppressed(sim);
  return offeredMatches(sim.grid, sim.W, rowsOf(sim), sim, sim.suppressed, sim.rowGen, sim.colGen);
}

function nextSpawnWaitPx(sim: Sim): number {
  const draw = nextUnit(sim.rng);
  sim.rng = draw.state;
  const span = Math.max(1, sim.E);
  const rows = 1 + Math.floor(draw.u * span);
  return rows * sim.A;
}

function trySpawn(sim: Sim) {
  if (!sim.falling.some((f) => f.kind === 'play')) sim.spawnWaitPx = 0;
  if (sim.phase !== 'fall' || sim.missedLock || sim.spawnWaitPx > 0) return;
  const play = sim.falling.filter((f) => f.kind === 'play');
  if (!sim.table.length || sim.total <= 0) return;
  const spawnY = (rowsOf(sim) - 1) * sim.A;
  const spawnRow = rowsOf(sim) - 1;
  const open: number[] = [];
  for (let c = 0; c < sim.W; c++) {
    if (!sim.grid[spawnRow][c]) open.push(c);
  }
  if (!open.length) return;
  const colDraw = nextUnit(sim.rng);
  sim.rng = colDraw.state;
  const col = open[Math.floor(colDraw.u * open.length)] ?? open[0];

  const next = nextUnit(sim.rng);
  sim.rng = next.state;
  const letter = pickLetter(next.u, sim.table, sim.total);
  const piece: Piece = {
    id: sim.nextId++,
    letter,
    col,
    yPx: spawnY,
    selected: !sim.held && !play.some((f) => f.selected),
    kind: 'play',
  };
  sim.falling.push(piece);
  sim.spawnWaitPx = nextSpawnWaitPx(sim);
  const land = landY(sim, col);
  if (piece.yPx <= land) {
    piece.yPx = land;
    lockPiece(sim, piece);
    resolve(sim);
  }
  touch(sim);
}

function beginDecide(sim: Sim, offer: Match[]) {
  sim.offer = offer;
  sim.phase = 'decide';
  sim.choice = 'use';
  sim.decideMsLeft = PARAMS.N * 1000;
  sim.fallAccum = 0;
}

function resolve(sim: Sim) {
  if (sim.falling.some((f) => f.kind === 'settle')) {
    sim.phase = 'settle';
    return;
  }
  const offer = scanOffer(sim);
  if (offer.length) {
    beginDecide(sim, offer);
    touch(sim);
    return;
  }
  sim.offer = [];
  if (overflow(sim) || sim.missedLock) {
    sim.phase = 'over';
    sim.paused = false;
    touch(sim);
    return;
  }
  sim.phase = 'fall';
  trySpawn(sim);
  touch(sim);
}

function commitClear(sim: Sim) {
  const doomed = new Set<string>();
  let base = 0;
  for (const m of sim.offer) {
    base += m.value;
    for (const cell of m.cells) doomed.add(`${cell.r},${cell.c}`);
  }
  sim.score += scaledWordPoints(base, sim.speedPct);
  for (const key of doomed) {
    const [r, c] = key.split(',').map((n) => Number(n));
    if (sim.grid[r]?.[c]) {
      sim.grid[r][c] = null;
      bump(sim, r, c);
    }
  }
  sim.offer = [];
  if (sim.held && !sim.grid[sim.held.row]?.[sim.held.col]) sim.held = null;
  if (!beginSettle(sim)) resolve(sim);
  touch(sim);
}

function stepDown(sim: Sim, piece: Piece): boolean {
  const land = landY(sim, piece.col);
  if (piece.yPx - 1 < land - 1e-6) {
    piece.yPx = land;
    lockPiece(sim, piece);
    return true;
  }
  piece.yPx -= 1;
  return false;
}

function stepPlay(sim: Sim) {
  const pieces = sim.falling.filter((f) => f.kind === 'play');
  let locked = false;
  for (const piece of pieces) {
    if (stepDown(sim, piece)) locked = true;
  }
  if (!sim.falling.some((f) => f.kind === 'play')) sim.spawnWaitPx = 0;
  else if (sim.spawnWaitPx > 0) sim.spawnWaitPx -= 1;
  if (sim.spawnWaitPx <= 0) sim.spawnWaitPx = 0;
  if (locked) resolve(sim);
  else if (sim.phase === 'fall' && sim.spawnWaitPx === 0) trySpawn(sim);
}

function stepSettle(sim: Sim) {
  const pieces = sim.falling.filter((f) => f.kind === 'settle');
  for (const piece of pieces) stepDown(sim, piece);
  if (!sim.falling.some((f) => f.kind === 'settle')) resolve(sim);
}

export function createSim(opts: {
  W: number;
  H: number;
  language: string;
  date: string;
  lex: Lexicon;
  A?: number;
}): Sim {
  const E = PARAMS.E;
  const rows = opts.H + E;
  const sim: Sim = {
    W: opts.W,
    H: opts.H,
    E,
    A: opts.A && opts.A > 0 ? opts.A : PARAMS.Amin,
    language: opts.language,
    date: opts.date,
    score: 0,
    rng: hashSeed(dailySeed(opts.date, opts.W, opts.H)),
    nextId: 1,
    grid: Array.from({ length: rows }, () => Array(opts.W).fill(null)),
    rowGen: Array(rows).fill(0),
    colGen: Array(opts.W).fill(0),
    falling: [],
    held: null,
    phase: 'ready',
    choice: 'use',
    paused: false,
    decideMsLeft: 0,
    offer: [],
    suppressed: [],
    fallAccum: 0,
    spawnWaitPx: 0,
    speedPct: 0,
    missedLock: false,
    aborted: false,
    revision: 0,
    dict: opts.lex.dict,
    values: opts.lex.values,
    table: opts.lex.table,
    total: opts.lex.total,
  };
  return sim;
}

export function start(sim: Sim) {
  if (sim.phase !== 'ready') return;
  sim.phase = 'fall';
  trySpawn(sim);
  touch(sim);
}

export function tick(sim: Sim, dtMs: number, opts?: { maxSteps?: number }) {
  if (sim.paused || sim.phase === 'over' || sim.phase === 'ready') return;
  if (sim.phase === 'decide') {
    sim.decideMsLeft -= dtMs;
    if (sim.decideMsLeft <= 0) confirmChoice(sim, false);
    return;
  }
  sim.fallAccum += dtMs;
  const x = pixelInterval(sim.A, sim.speedPct);
  const maxSteps = opts?.maxSteps ?? Math.min(20000, Math.max(48, Math.ceil(32 / x)));
  let steps = 0;
  while (sim.fallAccum >= x && steps < maxSteps) {
    sim.fallAccum -= x;
    steps += 1;
    if (sim.phase === 'fall') stepPlay(sim);
    else if (sim.phase === 'settle') stepSettle(sim);
    if (sim.phase !== 'fall' && sim.phase !== 'settle') break;
  }
}

export function selectedPiece(sim: Sim): Piece | null {
  return sim.falling.find((f) => f.kind === 'play' && f.selected) || null;
}

function columnTopRow(sim: Sim, col: number): number {
  for (let r = rowsOf(sim) - 1; r >= 0; r--) {
    if (sim.grid[r][col]) return r;
  }
  return -1;
}

function overlapsFalling(sim: Sim, row: number, col: number): boolean {
  const y0 = row * sim.A;
  const y1 = y0 + sim.A;
  return sim.falling.some((f) => f.col === col && f.yPx < y1 - 1e-6 && f.yPx + sim.A > y0 + 1e-6);
}

export function selectTop(sim: Sim, row: number, col: number): boolean {
  if (sim.paused || sim.phase !== 'fall') return false;
  if (col < 0 || col >= sim.W || row < 0 || row >= rowsOf(sim)) return false;
  if (columnTopRow(sim, col) !== row) return false;
  if (!sim.grid[row][col]) return false;
  for (const f of sim.falling) if (f.kind === 'play') f.selected = false;
  sim.held = { row, col };
  touch(sim);
  return true;
}

/** A moved top letter with empty space below becomes an ordinary falling letter. */
function releaseUnsupported(sim: Sim, row: number, col: number, select: boolean): boolean {
  if (row <= 0 || sim.grid[row - 1]?.[col]) return false;
  const letter = sim.grid[row]?.[col];
  if (!letter) return false;
  sim.grid[row][col] = null;
  bump(sim, row, col);
  if (select) {
    for (const f of sim.falling) if (f.kind === 'play') f.selected = false;
  }
  sim.falling.push({
    id: sim.nextId++,
    letter,
    col,
    yPx: row * sim.A,
    selected: select,
    kind: 'play',
  });
  return true;
}

function shiftHeld(sim: Sim, dir: -1 | 1): boolean {
  const held = sim.held;
  if (!held) return false;
  const letter = sim.grid[held.row]?.[held.col];
  if (!letter || columnTopRow(sim, held.col) !== held.row) {
    sim.held = null;
    return false;
  }
  const moving: number[] = [held.col];
  let dest = held.col + dir;
  while (dest >= 0 && dest < sim.W && sim.grid[held.row][dest]) {
    if (columnTopRow(sim, dest) !== held.row) return false;
    moving.push(dest);
    dest += dir;
  }
  if (dest < 0 || dest >= sim.W) return false;
  for (const col of moving) {
    if (overlapsFalling(sim, held.row, col + dir)) return false;
  }
  for (let i = moving.length - 1; i >= 0; i--) {
    const from = moving[i];
    const to = from + dir;
    sim.grid[held.row][to] = sim.grid[held.row][from];
    sim.grid[held.row][from] = null;
    bump(sim, held.row, from);
    bump(sim, held.row, to);
  }
  const heldDest = held.col + dir;
  let heldReleased = false;
  for (const col of moving.map((from) => from + dir)) {
    if (releaseUnsupported(sim, held.row, col, col === heldDest) && col === heldDest) heldReleased = true;
  }
  sim.held = heldReleased ? null : { row: held.row, col: heldDest };
  const offer = scanOffer(sim);
  if (offer.length) beginDecide(sim, offer);
  touch(sim);
  return true;
}

function dropHeld(sim: Sim) {
  const held = sim.held;
  if (!held) return;
  const letter = sim.grid[held.row]?.[held.col];
  if (!letter || columnTopRow(sim, held.col) !== held.row) {
    sim.held = null;
    return;
  }
  if (held.row === 0 || sim.grid[held.row - 1][held.col]) return;
  sim.grid[held.row][held.col] = null;
  bump(sim, held.row, held.col);
  const landRow = Math.round(landY(sim, held.col) / sim.A);
  const rowsSkipped = held.row - landRow;
  if (rowsSkipped > 0) sim.score += dropBonus(sim.values[letter] ?? 1, rowsSkipped);
  if (landRow < 0 || landRow >= rowsOf(sim)) sim.missedLock = true;
  else {
    sim.grid[landRow][held.col] = letter;
    bump(sim, landRow, held.col);
  }
  sim.held = null;
  resolve(sim);
  touch(sim);
}

export function tryMove(sim: Sim, dir: -1 | 1): boolean {
  if (sim.paused || sim.phase !== 'fall') return false;
  const piece = selectedPiece(sim);
  if (!piece) return shiftHeld(sim, dir);
  const col = piece.col + dir;
  if (col < 0 || col >= sim.W) return false;
  const [r0, r1] = rowsOverlapped(piece.yPx, sim.A);
  for (let r = r0; r <= r1; r++) {
    if (r < 0 || r >= rowsOf(sim)) continue;
    if (sim.grid[r][col]) return false;
  }
  piece.col = col;
  touch(sim);
  return true;
}

export function moveToColumn(sim: Sim, col: number) {
  for (let guard = 0; guard < sim.W + 2; guard++) {
    const at = selectedPiece(sim)?.col ?? sim.held?.col;
    if (at == null || at === col) return;
    if (!tryMove(sim, at < col ? 1 : -1)) return;
  }
}

export function hardDrop(sim: Sim) {
  if (sim.paused || sim.phase !== 'fall') return;
  const piece = selectedPiece(sim);
  if (!piece) {
    dropHeld(sim);
    return;
  }
  const land = landY(sim, piece.col);
  const startRow = Math.floor(piece.yPx / sim.A + 1e-6);
  const landRow = Math.round(land / sim.A);
  const rowsSkipped = startRow - landRow;
  if (rowsSkipped > 0) {
    sim.score += dropBonus(sim.values[piece.letter] ?? 1, rowsSkipped);
  }
  piece.yPx = land;
  lockPiece(sim, piece);
  resolve(sim);
  touch(sim);
}

export function abort(sim: Sim) {
  if (!sim.paused || sim.phase === 'ready' || sim.phase === 'over') return;
  sim.phase = 'over';
  sim.paused = false;
  sim.aborted = true;
  touch(sim);
}

export function selectChoice(sim: Sim, choice: DecideChoice) {
  if (sim.paused || sim.phase !== 'decide' || sim.choice === choice) return;
  sim.choice = choice;
  touch(sim);
}

export function confirmChoice(sim: Sim, early: boolean) {
  if (sim.paused || sim.phase !== 'decide') return;
  if (early && sim.decideMsLeft > 0) sim.score += earlyBonus(offerPoints(sim));
  if (sim.choice === 'skip') leaveWords(sim);
  else commitClear(sim);
}

export function leaveWords(sim: Sim) {
  if (sim.paused || sim.phase !== 'decide') return;
  for (const m of sim.offer) rememberSuppression(sim, m);
  sim.offer = [];
  if (overflow(sim) || sim.missedLock) {
    sim.phase = 'over';
    touch(sim);
    return;
  }
  sim.phase = 'fall';
  trySpawn(sim);
  touch(sim);
}

export function setSpeedPercent(sim: Sim, percent: number) {
  if (!(sim.paused || sim.phase === 'ready') || !Number.isFinite(percent)) return;
  sim.speedPct = Math.min(PARAMS.speedMax, Math.max(0, percent));
  touch(sim);
}

export function setPaused(sim: Sim, paused: boolean) {
  if (sim.phase === 'over' || sim.phase === 'ready') {
    sim.paused = false;
    return;
  }
  sim.paused = paused;
  touch(sim);
}

export function togglePause(sim: Sim) {
  setPaused(sim, !sim.paused);
}

export function pieceAt(sim: Sim, col: number, yFromFloor: number): Piece | null {
  return (
    sim.falling.find(
      (f) => f.kind === 'play' && f.col === col && yFromFloor >= f.yPx && yFromFloor < f.yPx + sim.A,
    ) || null
  );
}

export function selectPiece(sim: Sim, id: number) {
  if (sim.paused || sim.phase !== 'fall') return;
  let found = false;
  for (const f of sim.falling) {
    if (f.kind !== 'play') continue;
    if (f.id === id) found = true;
  }
  if (!found) return;
  sim.held = null;
  for (const f of sim.falling) {
    if (f.kind === 'play') f.selected = f.id === id;
  }
  touch(sim);
}

export function offerHasCell(sim: Sim, row: number, col: number): boolean {
  return sim.offer.some((m) => m.cells.some((cell) => cell.r === row && cell.c === col));
}

export function offerPoints(sim: Sim): number {
  const base = sim.offer.reduce((sum, m) => sum + m.value, 0);
  return scaledWordPoints(base, sim.speedPct);
}

export function setCellSize(sim: Sim, A: number) {
  if (!Number.isFinite(A) || A < 1 || A === sim.A) return;
  const scale = A / sim.A;
  for (const f of sim.falling) f.yPx *= scale;
  sim.spawnWaitPx *= scale;
  sim.A = A;
}

/** Test hook: put a frozen letter on the board and invalidate that line. */
export function placeFrozen(sim: Sim, row: number, col: number, letter: string | null) {
  if (row < 0 || col < 0 || row >= rowsOf(sim) || col >= sim.W) return;
  sim.grid[row][col] = letter;
  bump(sim, row, col);
  touch(sim);
}

/** Test hook: a controllable letter already in the air. */
export function injectFalling(sim: Sim, letter: string, col: number, yPx: number) {
  for (const f of sim.falling) if (f.kind === 'play') f.selected = false;
  sim.falling.push({
    id: sim.nextId++,
    letter,
    col,
    yPx,
    selected: true,
    kind: 'play',
  });
  if (sim.phase === 'ready') sim.phase = 'fall';
  touch(sim);
}

export function attachLexicon(sim: Sim, lex: Lexicon) {
  sim.dict = lex.dict;
  sim.values = lex.values;
  sim.table = lex.table;
  sim.total = lex.total;
}

export function exportState(sim: Sim): PersistedSim {
  return {
    version: 2,
    W: sim.W,
    H: sim.H,
    E: sim.E,
    A: sim.A,
    language: sim.language,
    date: sim.date,
    score: sim.score,
    rng: sim.rng.toString(),
    nextId: sim.nextId,
    grid: sim.grid.map((row) => row.slice()),
    rowGen: sim.rowGen.slice(),
    colGen: sim.colGen.slice(),
    falling: sim.falling.map((f) => ({ ...f })),
    phase: sim.phase,
    choice: sim.choice,
    paused: sim.paused,
    decideMsLeft: sim.decideMsLeft,
    offer: sim.offer.map((m) => ({ ...m, cells: m.cells.map((c) => ({ ...c })) })),
    suppressed: sim.suppressed.map((s) => ({ ...s })),
    fallAccum: sim.fallAccum,
    spawnWaitPx: sim.spawnWaitPx,
    speedPct: sim.speedPct,
    missedLock: sim.missedLock,
    aborted: sim.aborted,
  };
}

function importedChoice(data: PersistedSim): DecideChoice {
  if (data.version >= 2) return data.choice === 'skip' ? 'skip' : 'use';
  if (data.choice === 'skip') return 'use';
  if (data.choice === 'keep') return 'skip';
  return 'use';
}

export function importState(data: PersistedSim, lex: Lexicon = EMPTY_LEX as Lexicon): Sim {
  const sim = createSim({
    W: data.W,
    H: data.H,
    language: data.language,
    date: data.date,
    lex,
    A: data.A,
  });
  sim.score = data.score;
  sim.rng = BigInt(data.rng);
  sim.nextId = data.nextId;
  sim.grid = data.grid.map((row) => row.slice());
  sim.rowGen = data.rowGen.slice();
  sim.colGen = data.colGen.slice();
  sim.falling = data.falling.map((f) => ({ ...f }));
  sim.phase = data.phase;
  sim.choice = importedChoice(data);
  sim.paused = data.paused;
  sim.decideMsLeft = data.decideMsLeft;
  sim.offer = data.offer.map((m) => ({ ...m, cells: m.cells.map((c) => ({ ...c })) }));
  sim.suppressed = data.suppressed.map((s) => ({ ...s }));
  sim.fallAccum = data.fallAccum;
  sim.spawnWaitPx = typeof data.spawnWaitPx === 'number' && data.spawnWaitPx > 0 ? data.spawnWaitPx : 0;
  sim.speedPct = typeof data.speedPct === 'number' && data.speedPct > 0 ? Math.min(PARAMS.speedMax, data.speedPct) : 0;
  sim.missedLock = data.missedLock;
  sim.aborted = Boolean(data.aborted);
  return sim;
}

export function runUntil(sim: Sim, ms: number) {
  let left = ms;
  while (left > 0 && sim.phase !== 'over') {
    const slice = Math.min(left, 500);
    const phase = sim.phase;
    tick(sim, slice, { maxSteps: 5000 });
    left -= slice;
    if (sim.phase === 'decide' && phase !== 'decide') break;
  }
}
