import assert from 'node:assert/strict';
import { aggregateBoard, parseNickname, parsePlayReport, rankBoard, suffixSuggestions } from './play-model.js';
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

const finishes = [
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-01', rankValue: 4, helpCount: 1, finishedAt: 1, browserId: 'a' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-01', rankValue: 2, helpCount: 0, finishedAt: 2, browserId: 'b' },
  { nickname: 'Bea', nameKey: 'bea', puzzleDate: '2026-10-01', rankValue: 3, helpCount: 0, finishedAt: 3, browserId: 'c' },
  { nickname: 'Ada', nameKey: 'ada', puzzleDate: '2026-10-02', rankValue: 2, helpCount: 0, finishedAt: 4, browserId: 'a' },
];
const transword = aggregateBoard(finishes, 1, 'average');
assert.deepEqual(
  transword.map((row) => [row.nickname, row.value, row.puzzles]),
  [['Bea', 3, 1], ['Ada', 2, 1]]
);
const wordlot = aggregateBoard(
  finishes.map((row) => ({ ...row, helpCount: null })),
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
