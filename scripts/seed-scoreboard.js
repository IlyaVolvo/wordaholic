/**
 * Post ten players so the staging scoreboards have enough finished games.
 * test1 ranks first and plays 80% of the days. Players 2–9 play every day.
 * Player 10 plays every day with no nickname, so those finishes stay off the board.
 *
 * Odd players play English and Russian. Even players play English only.
 * The script does not clear the database. The same browser ids make a second run a no-op.
 *
 *   node scripts/seed-scoreboard.js
 *   STATS_WORKER_ORIGIN=http://127.0.0.1:8787 node scripts/seed-scoreboard.js
 */
import { GAME_DEFINITIONS } from './scoreboard-defs.js';
import { parsePlayReport } from './play-model.js';

const origin = (process.env.STATS_WORKER_ORIGIN || 'https://wordaholic-staging.volvovski.com').replace(/\/$/, '');
const BATCH = 50;

const GAMES = [
  { gameId: 0, variants: ['5', '6'], score: guessScore(6) },
  { gameId: 1, variants: ['1,4', '2,6'], score: timeScore },
  { gameId: 2, variants: ['4,3', '4,8', '4,16'], score: hydraScore },
  { gameId: 3, variants: ['8,12', '10,16'], score: pointsScore },
];

function guessScore(max) {
  return (player) => (player === 1 ? 1 : Math.min(max, player));
}

function hydraScore(player, variant) {
  const boards = Number(variant.split(',')[1]);
  const max = boards + 5;
  return player === 1 ? 1 : Math.min(max, player);
}

function timeScore(player) {
  return player === 1 ? 30_000 : 60_000 + player * 15_000;
}

function pointsScore(player) {
  return player === 1 ? 1000 : 1000 - player * 40;
}

function assertOrigin(raw) {
  const host = new URL(raw).hostname;
  if (host === 'wordaholic-staging.volvovski.com' || host === 'localhost' || host === '127.0.0.1') return;
  console.error(`Refusing to post to ${host}`);
  process.exit(1);
}

function utcDay(offset) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

/** Twenty days in the older part of the range. Day 0, today, and the last 28 days stay. */
function skippedIndexes() {
  const skip = new Set();
  for (let k = 0; k < 20; k += 1) skip.add(1 + Math.floor((k * 72) / 20));
  return skip;
}

function browserId(player) {
  return `00000000-0000-4000-8000-${String(player).padStart(12, '0')}`;
}

function languagesFor(player) {
  return player % 2 === 1 ? ['en', 'ru'] : ['en'];
}

function configurations(game) {
  if (game.gameId !== 3) return game.variants;
  return game.variants.flatMap((variant) => [`${variant}|average`, `${variant}|best`]);
}

function expectedNames(language) {
  const names = [];
  for (let player = 1; player <= 9; player += 1) {
    if (language === 'ru' && player % 2 === 0) continue;
    names.push(`test${player}`);
  }
  return names;
}

function expectedPuzzles(definition, nickname) {
  if (definition === 'daily') return 1;
  if (definition === 'two-week') return 14;
  if (definition === 'four-week') return 28;
  if (definition === 'lifetime') return nickname === 'test1' ? 81 : 101;
  return 0;
}

/**
 * @param {string} today
 * @param {Set<number>} skip
 */
function buildReports(today, skip) {
  /** @type {Record<string, unknown>[]} */
  const reports = [];
  for (let player = 1; player <= 10; player += 1) {
    const id = browserId(player);
    for (let index = 0; index <= 100; index += 1) {
      if (player === 1 && skip.has(index)) continue;
      const puzzleDate = utcDay(index - 100);
      const started = Date.parse(`${puzzleDate}T12:00:00.000Z`);
      for (const language of languagesFor(player)) {
        for (const game of GAMES) {
          for (const variant of game.variants) {
            const value = game.score(player, variant);
            reports.push({
              browserId: id,
              gameId: game.gameId,
              puzzleDate,
              language,
              variant,
              kind: 'start',
              clientTime: started,
            });
            reports.push({
              browserId: id,
              gameId: game.gameId,
              puzzleDate,
              language,
              variant,
              kind: 'end',
              clientTime: started + 60_000,
              value,
              lossReason: null,
            });
          }
        }
      }
    }
  }
  if (utcDay(0) !== today) throw new Error('The UTC date changed while building reports');
  return reports;
}

function assertShape(today, skip, reports) {
  if (skip.size !== 20) throw new Error(`Expected 20 skipped days, got ${skip.size}`);
  if (skip.has(0) || skip.has(100) || [...skip].some((index) => index < 1 || index > 72)) {
    throw new Error('Skipped days landed in a window that must stay full');
  }
  const now = Date.now();
  for (const report of reports) {
    const parsed = parsePlayReport(report, now);
    if (!parsed.ok) throw new Error(`Invalid report ${JSON.stringify(report)}`);
  }
  const ends = reports.filter((report) => report.kind === 'end');
  const player1 = ends.filter((report) => report.browserId === browserId(1)).length;
  const player2 = ends.filter((report) => report.browserId === browserId(2)).length;
  if (player1 !== 2 * 9 * 81) throw new Error(`Player 1 finish count ${player1}`);
  if (player2 !== 9 * 101) throw new Error(`Player 2 finish count ${player2}`);
  if (!ends.some((report) => report.puzzleDate === today && report.browserId === browserId(1))) {
    throw new Error('Player 1 does not play today');
  }
}

async function postJson(path, body) {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

async function setNicknames() {
  for (let player = 1; player <= 9; player += 1) {
    const nickname = `test${player}`;
    const result = await postJson('/api/player', {
      browserId: browserId(player),
      action: 'set',
      nickname,
    });
    if (result.status === 409) throw new Error(`${nickname} is already used by another browser`);
    if (result.status !== 200 || result.body?.nickname !== nickname) {
      throw new Error(`Nickname ${nickname} failed: ${result.status} ${JSON.stringify(result.body)}`);
    }
  }
}

async function postReports(reports) {
  for (let offset = 0; offset < reports.length; offset += BATCH) {
    const batch = reports.slice(offset, offset + BATCH);
    const result = await postJson('/api/plays', batch);
    if (result.status !== 200 || !Array.isArray(result.body?.results)) {
      throw new Error(`Plays failed at ${offset}: ${result.status} ${JSON.stringify(result.body)}`);
    }
    const failed = result.body.results.findIndex((row) => !row.ok);
    if (failed !== -1) {
      throw new Error(`Play rejected at ${offset + failed}: ${JSON.stringify(batch[failed])}`);
    }
    const done = Math.min(offset + BATCH, reports.length);
    if (done === reports.length || done % 2500 === 0) console.log(`posted ${done} / ${reports.length}`);
  }
}

async function checkBoards(today) {
  /** @type {string[]} */
  const problems = [];
  for (const game of GAMES) {
    const definitions = GAME_DEFINITIONS[game.gameId] || [];
    for (const configuration of configurations(game)) {
      for (const language of ['en', 'ru']) {
        for (const definition of definitions) {
          const params = new URLSearchParams({
            game: String(game.gameId),
            language,
            configuration,
            definition,
            limit: '100',
            today,
          });
          const res = await fetch(`${origin}/api/scoreboard?${params}`);
          const body = await res.json().catch(() => null);
          const label = `${language} game ${game.gameId} ${configuration} ${definition}`;
          if (!res.ok || !body || !Array.isArray(body.top)) {
            problems.push(`${label}: ${res.status}`);
            continue;
          }
          const winner = body.top.find((row) => row.nickname === 'test1');
          if (!winner || winner.place !== 1) {
            problems.push(`${label}: test1 is ${winner ? `place ${winner.place}` : 'missing'}`);
          } else if (body.top.some((row) => row.nickname !== 'test1' && row.place === 1)) {
            problems.push(`${label}: test1 is tied for first`);
          }
          for (const nickname of expectedNames(language)) {
            const row = body.top.find((item) => item.nickname === nickname);
            const puzzles = expectedPuzzles(definition, nickname);
            if (!row) problems.push(`${label}: ${nickname} is missing`);
            else if (row.puzzles !== puzzles) problems.push(`${label}: ${nickname} has ${row.puzzles} puzzles, expected ${puzzles}`);
          }
        }
      }
    }
  }
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    throw new Error(`${problems.length} scoreboard checks failed`);
  }
  console.log('scoreboards ok');
}

assertOrigin(origin);
const today = utcDay(0);
const skip = skippedIndexes();
const reports = buildReports(today, skip);
assertShape(today, skip, reports);
console.log(`origin ${origin}`);
console.log(`${reports.length / 2} finishes, ${reports.length} reports, today ${today}`);

await setNicknames();
await postReports(reports);
await checkBoards(today);
