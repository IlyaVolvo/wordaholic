import assert from 'node:assert/strict';
import test from 'node:test';
import { languageHooks, spellInPlace } from '../../../../app/i18n/languages/index.js';
import { buildLexicon, lettersFromSeed } from './lexicon.ts';
import { contiguousRowWord, markedMissingRun, swipeRun, toggleMark } from './marks.ts';
import { offeredMatches } from './matches.ts';
import { drawField } from './render.ts';
import { PARAMS, pixelInterval } from './params.ts';
import { dropFactor, earlyBonus, scoredWord, wordValue } from './score.ts';
import {
  clearMissingWord,
  commitMissingWord,
  createSim,
  confirmChoice,
  exportState,
  importState,
  replaceMarks,
  dropBlocked,
  hardDrop,
  injectFalling,
  leaveWords,
  offerPoints,
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

const WORDS = ['cat', 'cats', 'dogs', 'tone', 'stone', 'test', 'tests'];

function lex() {
  return buildLexicon(WORDS, (w) => w);
}

function board(W = 6): Sim {
  return createSim({ W, H: 10, language: 'en', date: '2026-10-03', lex: lex(), A: 28 });
}

function matches(sim: Sim) {
  return offeredMatches(sim.grid, sim.W, sim.H + sim.E, sim, sim.suppressed, sim.rowGen, sim.colGen);
}

function paintSink(painted: string[]): CanvasRenderingContext2D {
  const sink = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop) {
      if (prop === 'fillText') return (text: string) => painted.push(text);
      return () => {};
    },
    set() {
      return true;
    },
  });
  return sink;
}

function makeTestDrop(): Sim {
  const sim = board();
  sim.dict = new Set(['test']);
  placeFrozen(sim, 7, 0, 't');
  placeFrozen(sim, 8, 0, 's');
  placeFrozen(sim, 9, 0, 'e');
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

test('a folded letter falls as its canonical letter and the removed word shows the real spelling', () => {
  const fold = (word: string) => word.replaceAll('ё', 'е');
  const dictionary = buildLexicon(['ёлка', 'ель', 'ель'], fold, { extraWords: ['берёза'] });
  const freq = Object.fromEntries(dictionary.table.map((row) => [row.letter, row.freq]));
  assert.equal(freq['ё'], undefined);
  assert.equal(freq['е'], 3);
  assert.equal(dictionary.values['ё'], undefined);
  assert.equal(dictionary.dict.has('елка'), true);
  assert.equal(dictionary.dict.has('ёлка'), false);
  assert.equal(dictionary.written('елка'), 'ёлка');
  assert.equal(dictionary.written('береза'), 'берёза');
  assert.equal(lettersFromSeed('yo|8|16', dictionary, 200).includes('ё'), false);

  const sim = createSim({ W: 4, H: 10, language: 'ru', date: '2026-10-03', lex: dictionary, A: 28 });
  for (const [i, ch] of ['е', 'л', 'к', 'а'].entries()) placeFrozen(sim, 0, i, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'елка');
  assert.equal(found[0].display, 'ёлка');
  assert.equal(found[0].value, wordValue('елка', dictionary.values));

  sim.phase = 'decide';
  sim.offer = found;
  const painted: string[] = [];
  drawField(paintSink(painted), sim, 0);
  assert.ok(painted.includes('Ё'));
  assert.equal(painted.includes('Е'), false);

  confirmChoice(sim, false);
  assert.deepEqual(sim.words, ['ёлка']);
  assert.equal(sim.grid[0][0], null);
});

test('two corpus spellings of one folded word leave the board letter in place', () => {
  const fold = (word: string) => word.replaceAll('ё', 'е');
  const dictionary = buildLexicon(['ёлка', 'елка'], fold);
  assert.equal(dictionary.written('елка'), null);
  const sim = createSim({ W: 4, H: 10, language: 'ru', date: '2026-10-03', lex: dictionary, A: 28 });
  for (const [i, ch] of ['е', 'л', 'к', 'а'].entries()) placeFrozen(sim, 0, i, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'елка');
  assert.equal(found[0].display, undefined);
});

test('a letter that folds into more than one character still falls', () => {
  const fold = (word: string) => word.replaceAll('ß', 'ss');
  const dictionary = buildLexicon(['straße'], fold);
  const freq = Object.fromEntries(dictionary.table.map((row) => [row.letter, row.freq]));
  assert.equal(freq['ß'], 1);
  assert.equal(freq['s'], 1);
  assert.equal(dictionary.dict.has('strasse'), true);
  const sim = createSim({ W: 6, H: 10, language: 'de', date: '2026-10-03', lex: dictionary, A: 28 });
  for (const [i, ch] of ['s', 't', 'r', 'a', 'ß', 'e'].entries()) placeFrozen(sim, 0, i, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'straße');
  assert.equal(found[0].display, undefined);
});

const HEBREW_FINALS = ['ם', 'ן', 'ץ', 'ף', 'ך'];

function lexiconFor(code: string, words: string[], rtl = false) {
  const hooks = languageHooks(code);
  const fold = (word: string) => Array.from(word, hooks.baseLetter).join('');
  return buildLexicon(words, fold, { baseLetter: hooks.baseLetter, spell: (w) => spellInPlace(w, hooks), rtl });
}

function hebrew(words: string[]) {
  return lexiconFor('he', words, true);
}

test('corpus2 words are allowed and do not change letter frequency', () => {
  const dictionary = buildLexicon(['cats', 'dogs'], (w) => w, { extraWords: ['books', 'zzzz'] });
  assert.equal(dictionary.dict.has('books'), true);
  assert.equal(dictionary.dict.has('zzzz'), true);
  const freq = Object.fromEntries(dictionary.table.map((row) => [row.letter, row.freq]));
  assert.equal(freq.s, 2);
  assert.equal(freq.o, 1);
  assert.equal(freq.b, undefined);
  assert.equal(freq.z, undefined);
});

test('final letters never fall and count as their regular letter', () => {
  const dictionary = hebrew(['מלך', 'כלב', 'שלום']);
  const freq = Object.fromEntries(dictionary.table.map((row) => [row.letter, row.freq]));
  for (const final of HEBREW_FINALS) {
    assert.equal(freq[final], undefined);
    assert.equal(dictionary.values[final], undefined);
  }
  assert.equal(freq['כ'], 2);
  assert.equal(freq['מ'], 2);
  assert.equal(dictionary.rtl, true);
  assert.equal(dictionary.spell('מלכ'), 'מלך');
});

test('a language without its own module changes nothing', () => {
  const hooks = languageHooks('ru');
  assert.equal(hooks.baseLetter('ё'), 'ё');
  assert.equal(spellInPlace('ёлка', hooks), 'ёлка');
  const sim = createSim({ W: 6, H: 10, language: 'en', date: '2026-10-03', lex: lexiconFor('en', ['cats']), A: 28 });
  for (const [i, ch] of ['c', 'a', 't', 's'].entries()) placeFrozen(sim, 0, i, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].display, undefined);
});

test('a Hebrew row reads right to left and shows the final form at its end', () => {
  const sim = createSim({ W: 6, H: 10, language: 'he', date: '2026-10-03', lex: hebrew(['שלום']), A: 28 });
  for (const [c, ch] of [[5, 'ש'], [4, 'ל'], [3, 'ו'], [2, 'מ']] as const) placeFrozen(sim, 0, c, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'שלומ');
  assert.equal(found[0].display, 'שלום');
  assert.deepEqual(found[0].cells.at(-1), { r: 0, c: 2 });

  const mirrored = createSim({ W: 6, H: 10, language: 'he', date: '2026-10-03', lex: hebrew(['שלום']), A: 28 });
  for (const [i, ch] of ['ש', 'ל', 'ו', 'מ'].entries()) placeFrozen(mirrored, 0, i, ch);
  assert.deepEqual(matches(mirrored), []);
});

test('a word that already ends in its own spelling gets no display', () => {
  const sim = createSim({ W: 6, H: 10, language: 'he', date: '2026-10-03', lex: hebrew(['ילדה']), A: 28 });
  for (const [c, ch] of [[5, 'י'], [4, 'ל'], [3, 'ד'], [2, 'ה']] as const) placeFrozen(sim, 0, c, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].display, undefined);
});

test('a column reads top to bottom', () => {
  const sim = board();
  for (const [r, ch] of ['s', 't', 'a', 'c'].entries()) placeFrozen(sim, r, 0, ch);
  const found = matches(sim);
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'cats');
  assert.deepEqual(found[0].cells, [{ r: 3, c: 0 }, { r: 2, c: 0 }, { r: 1, c: 0 }, { r: 0, c: 0 }]);

  const upward = board();
  for (const [r, ch] of ['c', 'a', 't', 's'].entries()) placeFrozen(upward, r, 0, ch);
  assert.deepEqual(matches(upward), []);
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
  assert.equal(dropFactor(0, 10), 1);
  assert.equal(dropFactor(10, 10), 2);
  assert.equal(dropFactor(5, 10), 1.5);
  assert.equal(scoredWord('aaaa', [{ drop: 2 }, { drop: 1 }, { drop: 1 }, { drop: 1 }], { a: 1 }, 0), 8);
  assert.equal(scoredWord('aaaa', [{ drop: 2 }, { drop: 1 }, { drop: 1 }, { drop: 1 }], { a: 1 }, 100), 15);
});

test('shorter words inside a longer match are dropped; separate words on one row stay', () => {
  const stacked = board();
  for (const [i, ch] of ['t', 'e', 's', 't', 's'].entries()) placeFrozen(stacked, 0, i, ch);
  assert.deepEqual(
    matches(stacked).map((m) => m.text),
    ['tests'],
  );

  const wide = board(10);
  for (const [i, ch] of ['c', 'a', 't', 's', 'x', 'd', 'o', 'g', 's'].entries()) placeFrozen(wide, 0, i, ch);
  assert.deepEqual(
    matches(wide)
      .map((m) => m.text)
      .sort(),
    ['cats', 'dogs'],
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

test('a selected falling letter keeps falling but cannot drop while another letter is falling below it', () => {
  const sim = board();
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  injectFalling(sim, 'a', 0, 2 * sim.A);
  const lower = sim.falling.find((f) => f.letter === 'a');
  assert.ok(lower);
  injectFalling(sim, 'b', 0, 8 * sim.A);
  const upper = sim.falling.find((f) => f.letter === 'b');
  assert.ok(upper);
  assert.equal(upper.selected, true);
  assert.equal(dropBlocked(sim), true);
  const y = upper.yPx;
  const score = sim.score;
  hardDrop(sim);
  assert.equal(upper.yPx, y);
  assert.equal(sim.grid.some((row) => row.includes('b')), false);
  tick(sim, pixelInterval(sim.A) * 5);
  assert.equal(upper.yPx, y - 5);
  assert.equal(lower.yPx, 2 * sim.A - 5);
  assert.equal(dropBlocked(sim), true);
  assert.equal(sim.score, score);
  upper.col = 1;
  assert.equal(dropBlocked(sim), false);
});

test('a top letter moved over a gap keeps falling until it reaches the letter below', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  placeFrozen(sim, 0, 0, 'a');
  placeFrozen(sim, 3, 0, 'b');
  placeFrozen(sim, 0, 1, 'c');
  const score = sim.score;
  assert.equal(selectTop(sim, 3, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.grid[3][1], null);
  assert.equal(sim.grid[0][1], 'c');
  assert.equal(sim.held, null);
  const piece = sim.falling.find((f) => f.letter === 'b');
  assert.ok(piece);
  assert.equal(piece.kind, 'play');
  assert.equal(piece.selected, true);
  assert.equal(piece.col, 1);
  assert.equal(piece.yPx, 3 * sim.A);
  assert.equal(dropBlocked(sim), false);
  assert.equal(sim.score, score);
  tick(sim, pixelInterval(sim.A) * 4);
  assert.equal(piece.yPx, 3 * sim.A - 4);
  runUntil(sim, pixelInterval(sim.A) * (3 * sim.A + 40));
  assert.equal(sim.grid[1][1], 'b');
  assert.equal(sim.grid[0][1], 'c');
});

test('removing the top letter lets a letter with a gap below start falling', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  placeFrozen(sim, 0, 0, 'a');
  placeFrozen(sim, 2, 0, 'b');
  placeFrozen(sim, 4, 0, 'c');
  assert.equal(selectTop(sim, 4, 0), true);
  assert.equal(tryMove(sim, 1), true);
  const left = sim.falling.find((f) => f.letter === 'b');
  const moved = sim.falling.find((f) => f.letter === 'c');
  assert.ok(left);
  assert.equal(left.kind, 'play');
  assert.equal(left.col, 0);
  assert.equal(left.yPx, 2 * sim.A);
  assert.equal(left.selected, false);
  assert.ok(moved);
  assert.equal(moved.col, 1);
  assert.equal(moved.selected, true);
  assert.equal(dropBlocked(sim), false);
});

test('two falling letters a cell apart can move into the same column', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  injectFalling(sim, 'a', 0, 4 * sim.A);
  const lower = sim.falling.find((f) => f.letter === 'a');
  injectFalling(sim, 'b', 1, 5 * sim.A);
  const upper = sim.falling.find((f) => f.letter === 'b');
  assert.ok(lower);
  assert.ok(upper);
  tick(sim, pixelInterval(sim.A));
  assert.equal(upper.yPx - lower.yPx, sim.A);
  assert.equal(tryMove(sim, -1), true);
  assert.equal(upper.col, 0);
  assert.equal(lower.col, 0);
});

test('falling letters cannot share a column when their pixels overlap', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  injectFalling(sim, 'a', 0, 4 * sim.A);
  injectFalling(sim, 'b', 1, 4 * sim.A + sim.A / 2);
  const upper = sim.falling.find((f) => f.letter === 'b');
  assert.ok(upper);
  assert.equal(tryMove(sim, -1), false);
  assert.equal(upper.col, 1);
});

test('a falling letter blocks a move into its cell, and blocks the drop of a letter above it', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  sim.spawnWaitPx = 80000;
  placeFrozen(sim, 4, 0, 'b');
  injectFalling(sim, 'z', 1, 4 * sim.A);
  assert.equal(selectTop(sim, 4, 0), true);
  assert.equal(tryMove(sim, 1), false);
  assert.equal(sim.grid[4][0], 'b');
  injectFalling(sim, 'a', 0, sim.A);
  tick(sim, pixelInterval(sim.A));
  const upper = sim.falling.find((f) => f.letter === 'b');
  assert.ok(upper);
  assert.equal(upper.kind, 'play');
  assert.equal(upper.selected, true);
  assert.equal(upper.yPx, 4 * sim.A - 1);
  assert.equal(dropBlocked(sim), true);
  tick(sim, pixelInterval(sim.A) * 3);
  assert.equal(upper.yPx, 4 * sim.A - 4);
  hardDrop(sim);
  assert.equal(upper.yPx, 4 * sim.A - 4);
});

test('a top letter moved over an empty column becomes a falling letter', () => {
  const sim = board();
  sim.phase = 'fall';
  sim.dict = new Set();
  placeFrozen(sim, 0, 0, 'a');
  placeFrozen(sim, 2, 0, 'b');
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
  assert.equal(sim.grid[0][1], 'b');
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
  placeFrozen(sim, 0, 0, 'p');
  placeFrozen(sim, 0, 1, 'q');
  placeFrozen(sim, 0, 2, 'r');
  placeFrozen(sim, 0, 3, 's');
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
  assert.equal(saved.score, 0);
  assert.equal(saved.bonus[10][0].drop, dropFactor(3, saved.H));
  const points = offerPoints(saved);
  assert.equal(saved.choice, 'use');
  runUntil(saved, PARAMS.N * 1000 + 50);
  assert.notEqual(saved.phase, 'over');
  assert.equal(saved.grid[10][0], null);
  assert.equal(saved.score, points);

  const kept = makeTestDrop();
  selectChoice(kept, 'skip');
  leaveWords(kept);
  assert.equal(kept.phase, 'over');
  assert.equal(kept.grid[10][0], 't');
});

test('a kept match is not offered again until its line changes', () => {
  const sim = board();
  for (const [i, ch] of ['c', 'a', 't', 's'].entries()) placeFrozen(sim, 0, i, ch);
  sim.offer = matches(sim);
  sim.phase = 'decide';
  sim.choice = 'skip';
  leaveWords(sim);
  assert.equal(sim.phase, 'fall');
  assert.deepEqual(matches(sim), []);
  placeFrozen(sim, 0, 5, 'q');
  assert.deepEqual(
    matches(sim).map((m) => m.text),
    ['cats'],
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

test('a flashing Hebrew word shows its final form on the last tile', () => {
  const sim = createSim({ W: 6, H: 10, language: 'he', date: '2026-10-03', lex: hebrew(['שלום']), A: 28 });
  for (const [c, ch] of [[5, 'ש'], [4, 'ל'], [3, 'ו'], [2, 'מ']] as const) placeFrozen(sim, 0, c, ch);
  sim.offer = matches(sim);
  sim.phase = 'decide';
  const texts: { text: string; x: number }[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
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
    fill() {},
    fillText(text: string, x: number) { texts.push({ text, x }); },
  } as unknown as CanvasRenderingContext2D;
  for (const now of [0, 280]) {
    texts.length = 0;
    drawField(ctx, sim, now);
    const tiles = texts.filter((t) => /\p{L}/u.test(t.text)).sort((a, b) => b.x - a.x).map((t) => t.text);
    assert.deepEqual(tiles, ['ש', 'ל', 'ו', 'ם']);
  }
  assert.equal(sim.grid[0][2], 'מ');
});

test('timeout uses the word by default; space confirms early and adds a small bonus', () => {
  const waited = makeTestDrop();
  const waitedScore = waited.score;
  const points = offerPoints(waited);
  runUntil(waited, PARAMS.N * 1000 + 50);
  assert.notEqual(waited.phase, 'over');
  assert.equal(waited.grid[10][0], null);
  assert.equal(waited.score, waitedScore + points);

  const early = makeTestDrop();
  const base = offerPoints(early);
  const before = early.score;
  confirmChoice(early, true);
  assert.equal(early.score, before + base + earlyBonus(base));
  assert.equal(early.grid[10][0], null);
});

test('100% speed is twice as fast and doubles the word score, and mid-game only changes while paused', () => {
  assert.equal(pixelInterval(28), 53);
  assert.equal(pixelInterval(28, 100), 1493 / 2 / 28);
  const sim = makeTestDrop();
  assert.equal(sim.score, 0);
  setSpeedPercent(sim, 100);
  assert.equal(sim.speedPct, 0);
  setPaused(sim, true);
  const atBase = offerPoints(sim);
  setSpeedPercent(sim, 1000);
  assert.equal(sim.speedPct, 400);
  setSpeedPercent(sim, 100);
  assert.equal(sim.speedPct, 100);
  const atFast = offerPoints(sim);
  assert.ok(atFast > atBase);
  setPaused(sim, false);
  assert.equal(sim.choice, 'use');
  confirmChoice(sim, false);
  assert.equal(sim.score, atFast);
});

test('speed can be set before the game starts', () => {
  const sim = board();
  setSpeedPercent(sim, 250);
  assert.equal(sim.speedPct, 250);
});

function blankGrid(rows = 8, cols = 6): (string | null)[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function writeRow(grid: (string | null)[][], row: number, col: number, word: string) {
  Array.from(word).forEach((letter, index) => {
    grid[row][col + index] = letter;
  });
}

test('two taps on one row mark the letters between them when nothing is empty', () => {
  const grid = blankGrid();
  writeRow(grid, 1, 0, 'stone');
  const run = contiguousRowWord(grid, { row: 1, col: 0 }, { row: 1, col: 4 }, false);
  assert.equal(run?.word, 'stone');
  assert.equal(contiguousRowWord(grid, { row: 1, col: 0 }, { row: 1, col: 0 }, false), null);
  grid[1][2] = null;
  assert.equal(contiguousRowWord(grid, { row: 1, col: 0 }, { row: 1, col: 4 }, false), null);
});

test('a marked missing word stays pink when its top letter is pushed', () => {
  const sim = board();
  sim.phase = 'fall';
  placeFrozen(sim, 0, 0, 's');
  placeFrozen(sim, 0, 1, 't');
  placeFrozen(sim, 0, 2, 'o');
  placeFrozen(sim, 0, 3, 'n');
  commitMissingWord(sim, 'ston', [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 3 },
  ]);
  assert.equal(selectTop(sim, 0, 0), true);
  assert.equal(tryMove(sim, 1), true);
  assert.equal(sim.bonus[0][1]?.missing, true);
  assert.equal(sim.bonus[0][4]?.missing, true);
  assert.equal(sim.bonus[0][0]?.missing, undefined);
  assert.deepEqual(sim.marks, [{ word: 'ston', kind: 'missing' }]);
});

test('a double-click inside a missing word clears that word and leaves the letter beside it', () => {
  const sim = board();
  placeFrozen(sim, 0, 0, 's');
  placeFrozen(sim, 0, 1, 't');
  placeFrozen(sim, 0, 2, 'o');
  placeFrozen(sim, 0, 3, 'n');
  placeFrozen(sim, 0, 4, 'e');
  commitMissingWord(sim, 'ston', [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 3 },
  ]);
  const run = markedMissingRun(sim.grid, (r, c) => Boolean(sim.bonus[r]?.[c]?.missing), 0, 2, false, sim);
  assert.equal(run?.word, 'ston');
  assert.equal(run?.cells.length, 4);
  clearMissingWord(sim, run!.word, run!.cells);
  assert.equal(sim.bonus[0][2]?.missing, undefined);
  assert.equal(sim.bonus[0][0]?.missing, undefined);
  assert.equal(sim.grid[0][4], 'e');
  assert.deepEqual(sim.marks, []);
});

test('a taken word that uses a pink letter hides that missing word and keeps it in the list', () => {
  const sim = board();
  for (const [c, ch] of ['a', 'e', 'b', 'c'].entries()) placeFrozen(sim, 0, c, ch);
  for (const [r, ch] of ['e', 'n', 'o', 't'].entries()) if (r > 0) placeFrozen(sim, r, 1, ch);
  commitMissingWord(sim, 'aebc', [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 3 },
  ]);
  const tone = matches(sim).find((match) => match.text === 'tone');
  assert.ok(tone);
  sim.offer = [tone!];
  sim.phase = 'decide';
  sim.choice = 'use';
  confirmChoice(sim, false);
  assert.equal(sim.grid[0][1], null);
  assert.equal(sim.grid[0][0], 'a');
  assert.equal(sim.bonus[0][0]?.missing, undefined);
  assert.equal(sim.bonus[0][2]?.missing, undefined);
  assert.equal(sim.bonus[0][3]?.missing, undefined);
  assert.deepEqual(sim.marks, [{ word: 'aebc', kind: 'missing' }]);
});

test('a left-to-right swipe marks the whole settled row', () => {
  const grid = blankGrid();
  writeRow(grid, 1, 0, 'stone');
  const run = swipeRun(grid, false, { row: 1, col: 0 }, { row: 1, col: 4 });
  assert.equal(run?.word, 'stone');
  assert.deepEqual(run?.cells.map((cell) => cell.c), [0, 1, 2, 3, 4]);
});

test('a swipe against the reading direction marks nothing', () => {
  const grid = blankGrid();
  writeRow(grid, 1, 0, 'stone');
  assert.equal(swipeRun(grid, false, { row: 1, col: 4 }, { row: 1, col: 0 }), null);
  assert.equal(swipeRun(grid, false, { row: 1, col: 0 }, { row: 1, col: 2 }), null);
});

test('Hebrew marks a row only from right to left', () => {
  const grid = blankGrid();
  writeRow(grid, 2, 1, 'enot');
  const run = swipeRun(grid, true, { row: 2, col: 4 }, { row: 2, col: 1 });
  assert.equal(run?.word, 'tone');
  assert.deepEqual(run?.cells.map((cell) => cell.c), [4, 3, 2, 1]);
  assert.equal(swipeRun(grid, true, { row: 2, col: 1 }, { row: 2, col: 4 }), null);
});

test('a downward swipe marks a column from top to bottom', () => {
  const grid = blankGrid();
  ['t', 'o', 'n', 'e'].forEach((letter, index) => {
    grid[4 - index][1] = letter;
  });
  const run = swipeRun(grid, false, { row: 4, col: 1 }, { row: 1, col: 1 });
  assert.equal(run?.word, 'tone');
  assert.deepEqual(run?.cells.map((cell) => cell.r), [4, 3, 2, 1]);
  assert.equal(swipeRun(grid, false, { row: 1, col: 1 }, { row: 4, col: 1 }), null);
});

test('a run shorter than four letters is not a mark', () => {
  const grid = blankGrid();
  writeRow(grid, 0, 0, 'cat');
  assert.equal(swipeRun(grid, false, { row: 0, col: -1 }, { row: 0, col: 3 }), null);
});

test('marking adds, moves, and removes a word', () => {
  const added = toggleMark([], 'stone', 'missing');
  assert.deepEqual(added, [{ word: 'stone', kind: 'missing' }]);
  const moved = toggleMark(added, 'Stone', 'questionable', (word) => word.toLowerCase());
  assert.deepEqual(moved, [{ word: 'Stone', kind: 'questionable' }]);
  assert.deepEqual(toggleMark(moved, 'stone', 'questionable', (word) => word.toLowerCase()), []);
});

test('marked words survive a saved run', () => {
  const sim = board();
  replaceMarks(sim, toggleMark(sim.marks, 'stone', 'missing'));
  const saved = exportState(sim);
  const loaded = importState(saved, lex());
  assert.deepEqual(loaded.marks, [{ word: 'stone', kind: 'missing' }]);
  const older = exportState(board());
  delete older.marks;
  assert.deepEqual(importState(older, lex()).marks, []);
});

test('pause freezes the clear countdown', () => {
  const sim = makeTestDrop();
  const left = sim.decideMsLeft;
  setPaused(sim, true);
  tick(sim, 500);
  assert.equal(sim.decideMsLeft, left);
  assert.equal(sim.phase, 'decide');
});
