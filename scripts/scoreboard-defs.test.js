import assert from 'node:assert/strict';
import {
  GAME_OVERRIDES,
  addIsoDays,
  definitionsForGame,
  parseConfiguration,
  qualificationLine,
  resolveDefinition,
  scoreDefined,
  tallyFinishes,
  windowFor,
} from './scoreboard-defs.js';

const today = '2026-11-11';

assert.deepEqual(windowFor(resolveDefinition(1, 'daily'), today), { from: today, to: today });
assert.deepEqual(windowFor(resolveDefinition(1, 'two-week'), today), {
  from: '2026-10-29',
  to: today,
});
assert.equal(addIsoDays(today, -13), '2026-10-29');
assert.deepEqual(windowFor(resolveDefinition(1, 'four-week'), today), {
  from: '2026-10-15',
  to: today,
});
assert.equal(windowFor(resolveDefinition(1, 'lifetime'), today).from, '2020-01-01');
assert.equal(resolveDefinition(0, 'daily'), null);
assert.deepEqual(
  definitionsForGame(0).map((definition) => definition.id),
  ['two-week', 'four-week', 'lifetime']
);
assert.deepEqual(
  definitionsForGame(3).map((definition) => definition.id),
  ['daily', 'two-week', 'four-week', 'lifetime']
);

assert.equal(qualificationLine(resolveDefinition(1, 'daily')), 'At least 1 game today.');
assert.equal(
  qualificationLine(resolveDefinition(1, 'two-week')),
  'At least 10 games in the last 14 days.'
);
assert.match(qualificationLine(resolveDefinition(1, 'lifetime')), /21 games/);
assert.match(qualificationLine(resolveDefinition(1, 'lifetime')), /half the days/);

GAME_OVERRIDES[0] = { 'two-week': { qualify: { minGames: 3 } } };
const overridden = resolveDefinition(0, 'two-week');
assert.equal(overridden.qualify.minGames, 3);
assert.equal(overridden.window.days, 14);
assert.equal(resolveDefinition(1, 'two-week').qualify.minGames, 10);
delete GAME_OVERRIDES[0];

assert.deepEqual(parseConfiguration(0, '5'), { variant: '5', aggregate: 'average' });
assert.deepEqual(parseConfiguration(1, '2,4'), { variant: '2,4', aggregate: 'average' });
assert.deepEqual(parseConfiguration(3, '8,12|best'), { variant: '8,12', aggregate: 'best' });
assert.equal(parseConfiguration(3, '8,12'), null);
assert.equal(parseConfiguration(0, '8,12|best'), null);

const finishes = [
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-11-01', rankValue: 1000, helpCount: 1, finishedAt: 1, browserId: 'a' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-11-01', rankValue: 500, helpCount: 0, finishedAt: 2, browserId: 'b' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-11-02', rankValue: 900, helpCount: 0, finishedAt: 3, browserId: 'a' },
  { nickname: 'Bea', nameKey: 'bea', puzzleDate: '2026-11-02', rankValue: 400, helpCount: 0, finishedAt: 4, browserId: 'c' },
];
const transword = tallyFinishes(finishes, 1);
const ada = transword.find((row) => row.nameKey === 'ada');
assert.deepEqual(ada.days.map((day) => day.date), ['2026-11-02']);
assert.equal(ada.days[0].value, 900);

function daysFrom(start, count, value) {
  const days = [];
  for (let i = 0; i < count; i += 1) {
    days.push({ date: addIsoDays(start, i), value });
  }
  return days;
}

const lifetime = resolveDefinition(1, 'lifetime');
const qualifies = scoreDefined(
  [{ nickname: 'Ada', nameKey: 'ada', days: daysFrom('2026-10-13', 21, 2) }],
  lifetime,
  today,
  'average'
);
assert.equal(qualifies.length, 1);
assert.equal(qualifies[0].value, 2);
assert.equal(qualifies[0].puzzles, 21);

const tooSpread = scoreDefined(
  [{ nickname: 'Ada', nameKey: 'ada', days: daysFrom('2026-08-04', 21, 2) }],
  lifetime,
  today,
  'average'
);
assert.equal(tooSpread.length, 0);

const tooFew = scoreDefined(
  [{ nickname: 'Ada', nameKey: 'ada', days: daysFrom('2026-10-23', 20, 2) }],
  lifetime,
  today,
  'average'
);
assert.equal(tooFew.length, 0);

const twoWeek = resolveDefinition(1, 'two-week');
const ten = daysFrom('2026-10-29', 10, 4);
assert.equal(scoreDefined([{ nickname: 'Ada', nameKey: 'ada', days: ten }], twoWeek, today, 'average').length, 1);
assert.equal(
  scoreDefined([{ nickname: 'Ada', nameKey: 'ada', days: ten.slice(0, 9) }], twoWeek, today, 'average').length,
  0
);

const best = scoreDefined(
  [{ nickname: 'Ada', nameKey: 'ada', days: [{ date: today, value: 10 }, { date: today, value: 40 }] }],
  resolveDefinition(3, 'daily'),
  today,
  'best'
);
assert.equal(best[0].value, 40);

console.log('scoreboard-defs ok');
