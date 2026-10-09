import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLexicon, lettersFromSeed } from './lexicon.ts';
import { offeredMatches } from './matches.ts';
import { drawField } from './render.ts';
import { PARAMS, pixelInterval } from './params.ts';
import { dropBonus, earlyBonus, wordValue } from './score.ts';
import {
  abort,
  createSim,
  confirmChoice,
  hardDrop,
  injectFalling,
  leaveWords,
  placeFrozen,
  selectChoice,
  selectTop,
  runUntil,
  setPaused,
  setSpeedPercent,
  start,
  tick,
  tryMove,
  type Sim,
} from './sim.ts';

const WORDS = ['cat', 'cats', 'dog', 'tone', 'stone', 'test'];

function lex() {
  return buildLexicon(WORDS, (w) => w);
}

function board(W = 6): Sim {
  return createSim({ W, H: 10, language: 'en', date: '2026-10-03', lex: lex(), A: 28 });
}

function matches(sim: Sim) {
  return offeredMatches(sim.grid, sim.W, sim.H + sim.E, sim, sim.suppressed, sim.rowGen, sim.colGen);
}

function makeTestDrop(): Sim {
  const sim = board();
  sim.dict = new Set(['test']);
  placeFrozen(sim, 7, 0, 't');
  placeFrozen(sim, 8, 0, 'e');
  placeFrozen(sim, 9, 0, 's');
  injectFalling(sim, 't', 0, (sim.H + sim.E - 1) * sim.A);
  hardDrop(sim);
  return sim;
}

test('letters spawn in a seeded column and not always the center', () => {
  function columns() {
    const sim = board();
    start(sim);
    const seen = new Map<number, number>();
    for (let i = 0; i < 80 && sim.phase !== 'over'; i++) {
      for (const piece of sim.falling) {
        if (piece.kind === 'play' && !seen.has(piece.id)) seen.set(piece.id, piece.col);
      }
      tick(sim, 100);
    }
    return [...seen.values()];
  }
  const a = columns();
  const b = columns();
  assert.deepEqual(a, b);
  assert.ok(a.length >= 2);
  assert.ok(a.every((col) => col >= 0 && col < 6));
  assert.ok(new Set(a).size >= 2, `expected more than one column, got ${a.join(',')}`);
});

test('the next letter waits a random number of rows from 1 to the open rows above the bucket', () => {
  const sim = createSim({
    W: 6,
    H: 40,
    language: 'en',
    date: '2026-10-03',
    lex: buildLexicon(['zzzzzzz'], (w) => w),
    A: 28,
  });
  start(sim);
  assert.equal(sim.falling.filter((piece) => piece.kind === 'play').length, 1);
  const gaps: number[] = [];
  for (let i = 0; i < 8 && sim.phase === 'fall'; i++) {
    const rows = sim.spawnWaitPx / sim.A;
    assert.equal(rows, Math.round(rows));
    assert.ok(rows >= 1 && rows <= sim.E, `gap ${rows}`);
    gaps.push(rows);
    const before = sim.falling.filter((piece) => piece.kind === 'play').length;
    const waitPx = sim.spawnWaitPx;
    tick(sim, pixelInterval(sim.A) * waitPx, { maxSteps: waitPx + 2 });
    assert.equal(sim.phase, 'fall');
    assert.equal(sim.falling.filter((piece) => piece.kind === 'play').length, before + 1);
  }
  assert.equal(gaps.length, 8);
  assert.ok(new Set(gaps).size >= 2, `gaps stayed ${gaps.join(',')}`);
});

test('a new letter appears immediately when nothing is falling', () => {
  const sim = board();
  sim.dict = new Set();
  start(sim);
  assert.equal(sim.falling.filter((piece) => piece.kind === 'play').length, 1);
  assert.ok(sim.spawnWaitPx >= sim.A);
  hardDrop(sim);
  assert.equal(sim.phase, 'fall');
  assert.equal(sim.falling.filter((piece) => piece.kind === 'play').length, 1);
  assert.ok(sim.spawnWaitPx >= sim.A);
});

test('daily seed is stable and changes with the date and width', () => {
  const dictionary = lex();
  const a = lettersFromSeed('2026-10-03|8|16', dictionary, 8);
  const b = lettersFromSeed('2026-10-03|8|16', dictionary, 8);
  const otherDay = lettersFromSeed('2026-10-04|8|16', dictionary, 8);
  const otherWidth = lettersFromSeed('2026-10-03|9|16', dictionary, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, otherDay);
  assert.notDeepEqual(a, otherWidth);
});

test('letter values reverse frequency into 1..Vmax', () => {
  const dictionary = buildLexicon(['aaaa', 'z'], (w) => w);
  assert.equal(dictionary.values.a, 1);
  assert.equal(dictionary.values.z, PARAMS.Vmax);
  assert.equal(buildLexicon(['qqqq'], (w) => w).values.q, 1);
});

test('frequency intervals prefer the more common letter', () => {
  const dictionary = buildLexicon(['aaa', 'b'], (w) => w);
  const draws = lettersFromSeed('interval-check|6|10', dictionary, 400);
  const as = draws.filter((ch) => ch === 'a').length;
  const bs = draws.filter((ch) => ch === 'b').length;
  assert.ok(as > bs * 2, `expected a to dominate, got a=${as} b=${bs}`);
});

test('word value and drop bonus', () => {
  const values = { a: 1, z: 10 };
  assert.equal(wordValue('aaa', values), 3);
  assert.equal(wordValue('aaaa', values), 6);
  assert.equal(wordValue('zzz', values), 30);
  assert.equal(dropBonus(10, 0), 0);
  assert.equal(dropBonus(10, 4), 6);
});

test('shorter words inside a longer match are dropped; separate words on one row stay', () => {
  const stacked = board();
  for (const [i, ch] of ['c', 'a', 't', 's'].entries()) placeFrozen(stacked, 0, i, ch);
  assert.deepEqual(
    matches(stacked).map((m) => m.text),
    ['cats'],
  );

  const wide = board(8);
  for (const [i, ch] of ['c', 'a', 't', 'x', 'd', 'o', 'g'].entries()) placeFrozen(wide, 0, i, ch);
  assert.deepEqual(
    matches(wide)
      .map((m) => m.text)
      .sort(),
    ['cat', 'dog'],
  );

  const stone = board();
  for (const [i, ch] of ['s', 't', 'o', 'n', 'e'].entries()) placeFrozen(stone, 1, i, ch);
  assert.deepEqual(
    matches(stone).map((m) => m.text),
    ['stone'],
  );
});

test('the top letter of a column stays put when the cell below its new column is filled', () => {
  const sim = board();
  sim.phase = 'fall';
  placeFrozen(sim, 0, 0, 'a');
  placeFrozen(sim, 1, 0, 'b');
  placeFrozen(sim, 0, 1, 'c');
  assert.equal(selectTop(sim, 0, 0), false);
  injectFalling(sim, 'z', 0, 8 * sim.A);
  assert.equal(selectTop(sim, 1, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.grid[1][1], 'b');
  assert.equal(sim.grid[1][0], null);
  assert.equal(sim.falling.length, 1);
  tick(sim, 400);
  assert.equal(sim.grid[1][1], 'b');
  hardDrop(sim);
  assert.equal(sim.grid[1][1], 'b');
});

test('a top letter moved over empty space becomes a falling letter', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  placeFrozen(sim, 0, 0, 'a');
  placeFrozen(sim, 2, 0, 'b');
  placeFrozen(sim, 0, 1, 'c');
  const score = sim.score;
  assert.equal(selectTop(sim, 2, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.grid[2][0], null);
  assert.equal(sim.grid[2][1], null);
  assert.equal(sim.held, null);
  const piece = sim.falling.find((f) => f.letter === 'b');
  assert.ok(piece);
  assert.equal(piece.kind, 'play');
  assert.equal(piece.selected, true);
  assert.equal(piece.col, 1);
  assert.equal(piece.yPx, 2 * sim.A);
  assert.equal(sim.score, score);
  const before = piece.yPx;
  tick(sim, pixelInterval(sim.A) * 2);
  assert.ok(piece.yPx < before);
  runUntil(sim, pixelInterval(sim.A) * (2 * sim.A + 40));
  assert.equal(sim.grid[1][1], 'b');
  assert.equal(sim.grid[0][1], 'c');
});

test('a pushed top letter falls when its new cell has nothing under it', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  placeFrozen(sim, 0, 0, 'x');
  placeFrozen(sim, 0, 1, 'y');
  placeFrozen(sim, 1, 0, 'a');
  placeFrozen(sim, 1, 1, 'b');
  assert.equal(selectTop(sim, 1, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.grid[1][1], 'a');
  assert.equal(sim.held?.col, 1);
  assert.equal(sim.grid[1][2], null);
  const piece = sim.falling.find((f) => f.letter === 'b');
  assert.equal(piece?.col, 2);
  assert.equal(piece?.kind, 'play');
  assert.equal(piece?.selected, false);
  assert.equal(piece?.yPx, sim.A);
});

test('a top letter pushes other top letters in the same row', () => {
  const sim = board();
  sim.phase = 'fall';
  placeFrozen(sim, 1, 0, 'x');
  placeFrozen(sim, 1, 1, 'y');
  placeFrozen(sim, 1, 2, 'z');
  placeFrozen(sim, 1, 3, 'w');
  placeFrozen(sim, 2, 0, 'a');
  placeFrozen(sim, 2, 1, 'b');
  placeFrozen(sim, 2, 2, 'c');
  assert.equal(selectTop(sim, 2, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.grid[2][0], null);
  assert.equal(sim.grid[2][1], 'a');
  assert.equal(sim.grid[2][2], 'b');
  assert.equal(sim.grid[2][3], 'c');
  assert.equal(sim.held?.col, 1);
  placeFrozen(sim, 3, 4, 'e');
  placeFrozen(sim, 2, 4, 'd');
  assert.equal(tryMove(sim, 1), false);
  assert.equal(sim.grid[2][1], 'a');
  assert.equal(sim.grid[2][4], 'd');
});

test('abort ends the run and keeps the score already earned', () => {
  const sim = makeTestDrop();
  assert.equal(sim.phase, 'decide');
  const earned = sim.score;
  const pending = sim.offer.reduce((sum, match) => sum + match.value, 0);
  assert.ok(pending > 0);
  abort(sim);
  assert.equal(sim.phase, 'decide');
  setPaused(sim, true);
  abort(sim);
  assert.equal(sim.phase, 'over');
  assert.equal(sim.aborted, true);
  assert.equal(sim.score, earned);
  tick(sim, PARAMS.N * 1000 + 50);
  assert.equal(sim.score, earned);
  assert.equal(sim.phase, 'over');
});

test('gravity closes a gap', () => {
  const sim = board();
  sim.dict = new Set();
  sim.falling = [{ id: 1, letter: 'a', col: 0, yPx: 3 * sim.A, selected: false, kind: 'settle' }];
  sim.phase = 'settle';
  sim.nextId = 2;
  runUntil(sim, pixelInterval(sim.A) * (3 * sim.A + 30));
  assert.equal(sim.grid[0][0], 'a');
  assert.equal(sim.grid[3][0], null);
});

test('clearing the overflow letter continues; keeping it ends the game', () => {
  const saved = makeTestDrop();
  assert.equal(saved.phase, 'decide');
  assert.ok(saved.offer.some((m) => m.text === 'test'));
  const bonus = dropBonus(saved.values.t ?? 1, 3);
  assert.equal(saved.choice, 'use');
  runUntil(saved, PARAMS.N * 1000 + 50);
  assert.notEqual(saved.phase, 'over');
  assert.equal(saved.grid[10][0], null);
  assert.ok(saved.score >= wordValue('test', saved.values) + bonus);

  const kept = makeTestDrop();
  selectChoice(kept, 'skip');
  leaveWords(kept);
  assert.equal(kept.phase, 'over');
  assert.equal(kept.grid[10][0], 't');
});

test('a kept match is not offered again until its line changes', () => {
  const sim = board();
  for (const [i, ch] of ['c', 'a', 't'].entries()) placeFrozen(sim, 0, i, ch);
  sim.offer = matches(sim);
  sim.phase = 'decide';
  sim.choice = 'skip';
  leaveWords(sim);
  assert.equal(sim.phase, 'fall');
  assert.deepEqual(matches(sim), []);
  placeFrozen(sim, 0, 4, 'q');
  assert.deepEqual(
    matches(sim).map((m) => m.text),
    ['cat'],
  );
});

test('a discovered word flashes while the choice is held', () => {
  const sim = makeTestDrop();
  assert.equal(sim.phase, 'decide');
  assert.equal(sim.choice, 'use');
  assert.equal(sim.decideMsLeft, PARAMS.N * 1000);
  const tileFills: string[] = [];
  const ctx = {
    _fill: '',
    set fillStyle(value: string) { this._fill = value; },
    get fillStyle() { return this._fill; },
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arcTo() {},
    closePath() {},
    fillText() {},
    fill() { tileFills.push(this._fill); },
  } as unknown as CanvasRenderingContext2D;
  drawField(ctx, sim, 0);
  assert.ok(tileFills.includes('#f0c400'));
  tileFills.length = 0;
  drawField(ctx, sim, 280);
  assert.equal(tileFills.includes('#f0c400'), false);
});

test('timeout uses the word by default; space confirms early and adds a small bonus', () => {
  const waited = makeTestDrop();
  const waitedScore = waited.score;
  const points = waited.offer.reduce((sum, match) => sum + match.value, 0);
  runUntil(waited, PARAMS.N * 1000 + 50);
  assert.notEqual(waited.phase, 'over');
  assert.equal(waited.grid[10][0], null);
  assert.equal(waited.score, waitedScore + points);

  const early = makeTestDrop();
  const base = early.offer.reduce((sum, match) => sum + match.value, 0);
  const before = early.score;
  confirmChoice(early, true);
  assert.equal(early.score, before + base + earlyBonus(base));
  assert.equal(early.grid[10][0], null);
});

test('100% speed is twice as fast and doubles the word score, and mid-game only changes while paused', () => {
  assert.equal(pixelInterval(28), 53);
  assert.equal(pixelInterval(28, 100), 1493 / 2 / 28);
  const sim = makeTestDrop();
  const base = sim.offer.reduce((sum, match) => sum + match.value, 0);
  setSpeedPercent(sim, 100);
  assert.equal(sim.speedPct, 0);
  setPaused(sim, true);
  setSpeedPercent(sim, 1000);
  assert.equal(sim.speedPct, 400);
  setSpeedPercent(sim, 100);
  assert.equal(sim.speedPct, 100);
  setPaused(sim, false);
  const before = sim.score;
  assert.equal(sim.choice, 'use');
  confirmChoice(sim, false);
  assert.equal(sim.score, before + Math.round(base * 2));
});

test('speed can be set before the game starts', () => {
  const sim = board();
  setSpeedPercent(sim, 250);
  assert.equal(sim.speedPct, 250);
});

test('pause freezes the clear countdown', () => {
  const sim = makeTestDrop();
  const left = sim.decideMsLeft;
  setPaused(sim, true);
  tick(sim, 500);
  assert.equal(sim.decideMsLeft, left);
  assert.equal(sim.phase, 'decide');
});
