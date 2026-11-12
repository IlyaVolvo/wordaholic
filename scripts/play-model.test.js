import assert from 'node:assert/strict';
import { aggregateBoard, inclusiveDays, minimumShare, parseNickname, parsePlayReport, qualifyBoard, rankBoard, suffixSuggestions } from './play-model.js';
import { statsInputsFromTables } from './stats-hours.js';

const ada = parseNickname('Ada');
assert.equal(ada.display, 'Ada');
assert.equal(ada.nameKey, 'ada');
assert.equal(parseNickname('ad'), null);
assert.equal(parseNickname('Ada Bee'), null);
assert.deepEqual(
  suffixSuggestions('Ada', (key) => key === 'ada' || key === 'ada2'),
  ['Ada3', 'Ada4', 'Ada5']
);

const now = Date.parse('2026-10-26T12:00:00.000Z');
const start = parsePlayReport(
  { browserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gameId: 0, language: 'en', variant: '5', puzzleDate: '2026-10-26', kind: 'start', clientTime: now },
  now
);
assert.equal(start.ok, true);
const future = parsePlayReport(
  { browserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gameId: 0, language: 'en', variant: '5', puzzleDate: '2026-10-30', kind: 'end', value: 3, clientTime: now },
  now
);
assert.equal(future.ok, false);
const fastClock = parsePlayReport(
  { browserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gameId: 0, language: 'en', variant: '5', puzzleDate: '2026-10-26', kind: 'end', value: 4, clientTime: now + 3 * 86400000 },
  now
);
assert.equal(fastClock.report.clientTime, now);
const endBase = {
  browserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  language: 'en',
  puzzleDate: '2026-10-26',
  kind: 'end',
  clientTime: now,
};
const wordlotLoss = parsePlayReport({ ...endBase, gameId: 0, variant: '5', value: 6, lossReason: 1 }, now);
assert.equal(wordlotLoss.ok && wordlotLoss.report.lossReason, 1);
const wordlotWin = parsePlayReport({ ...endBase, gameId: 0, variant: '5', value: 6 }, now);
assert.equal(wordlotWin.ok && wordlotWin.report.lossReason, null);
assert.equal(parsePlayReport({ ...endBase, gameId: 0, variant: '5', value: 6, lossReason: 2 }, now).ok, false);
const hinted = parsePlayReport({ ...endBase, gameId: 1, variant: '2,4', value: 1000, lossReason: 2 }, now);
assert.equal(hinted.ok && hinted.report.lossReason, 2);
const clean = parsePlayReport({ ...endBase, gameId: 1, variant: '2,4', value: 1000, lossReason: 0 }, now);
assert.equal(clean.ok && clean.report.lossReason, null);
const hydraLoss = parsePlayReport({ ...endBase, gameId: 2, variant: '5,8', value: 7, lossReason: 7 }, now);
assert.equal(hydraLoss.ok && hydraLoss.report.lossReason, 7);
assert.equal(parsePlayReport({ ...endBase, gameId: 2, variant: '5,8', value: 7, lossReason: 14 }, now).ok, false);
assert.equal(parsePlayReport({ ...endBase, gameId: 3, variant: '8,12', value: 40, lossReason: 1 }, now).ok, false);
const letterixWin = parsePlayReport({ ...endBase, gameId: 3, variant: '8,12', value: 40 }, now);
assert.equal(letterixWin.ok && letterixWin.report.lossReason, null);

const finishes = [
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-01', rankValue: 4, lossReason: 1, finishedAt: 1, browserId: 'a' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-01', rankValue: 2, lossReason: null, finishedAt: 2, browserId: 'b' },
  { nickname: 'Bea', nameKey: 'bea', puzzleDate: '2026-10-01', rankValue: 3, lossReason: null, finishedAt: 3, browserId: 'c' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-02', rankValue: 2, lossReason: null, finishedAt: 4, browserId: 'a' },
];
const transword = aggregateBoard(finishes, 1, 'average');
assert.deepEqual(
  transword.map((row) => [row.nickname, row.value, row.puzzles]),
  [['Bea', 3, 1], ['Ada', 2, 1]]
);
const lostWordlot = aggregateBoard(finishes, 0, 'average');
assert.deepEqual(
  lostWordlot.map((row) => [row.nickname, row.value, row.puzzles]),
  [['Bea', 3, 1], ['Ada', 2, 1]]
);
const wordlot = aggregateBoard(
  finishes.map((row) => ({ ...row, lossReason: null })),
  0,
  'average'
);
const adaWordlot = wordlot.find((row) => row.nameKey === 'ada');
assert.equal(adaWordlot.value, 3);
assert.equal(adaWordlot.puzzles, 2);

const ranked = rankBoard(
  [
    { nickname: 'Cara', nameKey: 'cara', value: 2, puzzles: 1 },
    { nickname: 'Ada', nameKey: 'ada', value: 2, puzzles: 4 },
    { nickname: 'Bea', nameKey: 'bea', value: 3, puzzles: 1 },
    { nickname: 'Dee', nameKey: 'dee', value: 4, puzzles: 1 },
  ],
  { lowerBetter: true, limit: 2, selfKey: 'dee' }
);
assert.deepEqual(
  ranked.top.map((row) => [row.place, row.nickname]),
  [[1, 'Ada'], [1, 'Cara']]
);
assert.equal(ranked.self.place, 4);
assert.equal(ranked.self.nickname, 'Dee');

assert.equal(inclusiveDays('2026-10-19', '2026-10-25'), 7);
assert.equal(minimumShare(7), 4);
assert.equal(minimumShare(31), 16);
assert.equal(minimumShare(1), 1);
const weekRows = [
  { nickname: 'Ada', puzzles: 4 },
  { nickname: 'Bea', puzzles: 3 },
];
assert.deepEqual(
  qualifyBoard(weekRows, '2026-10-19', '2026-10-25', 'share').map((row) => row.nickname),
  ['Ada']
);
assert.deepEqual(
  qualifyBoard(
    [
      { nickname: 'Ada', puzzles: 50 },
      { nickname: 'Bea', puzzles: 49 },
    ],
    '2020-01-01',
    '2026-10-28',
    'lifetime'
  ).map((row) => row.nickname),
  ['Ada']
);

const inputs = statsInputsFromTables({
  cutover: '2026-10-26',
  frozen: [
    {
      ip: '1.1.1.1',
      day: '2026-10-25',
      homeHits: 2,
      languages: { en: 1 },
      games: { polywordlot: { 'en,5': 4 } },
      geo: { country: 'US', city: 'Seattle', region: '', asOrg: '' },
    },
  ],
  live: [
    {
      ip: '1.1.1.1',
      day: '2026-10-26',
      homeHits: 1,
      languages: { he: 1 },
      geo: { country: 'IL', city: 'Haifa', region: '', asOrg: '' },
    },
  ],
  plays: [{ ip: '1.1.1.1', day: '2026-10-26', gameId: 2, language: 'en', variant: '5,8', n: 1 }],
});
const hour = inputs[0].body.hours;
assert.equal(hour.length, 2);
assert.equal(hour[0].ips['1.1.1.1'].games.polywordlot['en,5'], 4);
assert.equal(hour[1].ips['1.1.1.1'].games.polyhydra['en,5,8'], 1);
assert.equal(hour[1].ips['1.1.1.1'].homeHits, 1);
assert.equal(hour[1].ips['1.1.1.1'].games.polywordlot, undefined);

console.log('play-model ok');
