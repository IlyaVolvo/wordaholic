/**
 * Combine GET /api/stats JSON dumps.
 *
 * The in-memory store is a running snapshot, so the same UTC hour in two files
 * is overlap, not extra traffic. For each hour+IP, keep field-wise max (the
 * more complete snapshot). Different hours are then added. Distinct games are
 * permutation keys as stored (polywordlot en,5 and transword en,2,4 are two).
 *
 *   node scripts/combine-stats.js dump1.json dump2.json
 *   curl -sS http://127.0.0.1:4173/api/stats | node scripts/combine-stats.js
 */
import fs from 'node:fs';
import { stdin } from 'node:process';

const GAME_IDS = ['polywordlot', 'transword'];

function usage() {
  console.error('Usage: node scripts/combine-stats.js <stats.json> [stats.json ...]');
  console.error('   or: curl -sS <host>/api/stats | node scripts/combine-stats.js');
  process.exit(1);
}

/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
function asCountMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (!key || !Number.isFinite(n) || n <= 0) continue;
    out[key] = n;
  }
  return out;
}

/**
 * @param {unknown} raw
 */
function normalizeRecord(raw) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const gamesIn = rec.games && typeof rec.games === 'object' ? rec.games : {};
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  for (const gameId of new Set([...GAME_IDS, ...Object.keys(gamesIn)])) {
    games[gameId] = asCountMap(gamesIn[gameId]);
  }
  return {
    homeHits: Math.max(0, Number(rec.homeHits) || 0),
    languages: asCountMap(rec.languages),
    games,
  };
}

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 */
function maxMap(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = Math.max(out[key] || 0, value);
  }
  return out;
}

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 */
function sumMap(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

function maxRecord(a, b) {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  const ids = new Set([...Object.keys(a.games), ...Object.keys(b.games)]);
  for (const gameId of ids) {
    games[gameId] = maxMap(a.games[gameId] || {}, b.games[gameId] || {});
  }
  return {
    homeHits: Math.max(a.homeHits, b.homeHits),
    languages: maxMap(a.languages, b.languages),
    games,
  };
}

function sumRecord(a, b) {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  const ids = new Set([...Object.keys(a.games), ...Object.keys(b.games)]);
  for (const gameId of ids) {
    games[gameId] = sumMap(a.games[gameId] || {}, b.games[gameId] || {});
  }
  return {
    homeHits: a.homeHits + b.homeHits,
    languages: sumMap(a.languages, b.languages),
    games,
  };
}

function emptyRecord() {
  return normalizeRecord({});
}

/**
 * @param {unknown} body
 * @param {string} source
 * @returns {{ hour: string, ip: string, rec: ReturnType<typeof normalizeRecord> }[]}
 */
function extractRows(body, source) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${source}: expected { hours: [...] }`);
  }
  const hours = /** @type {{ hours?: unknown }} */ (body).hours;
  if (!Array.isArray(hours)) throw new Error(`${source}: missing hours array`);
  /** @type {{ hour: string, ip: string, rec: ReturnType<typeof normalizeRecord> }[]} */
  const rows = [];
  for (const bucket of hours) {
    if (!bucket || typeof bucket !== 'object') continue;
    const hour = String(bucket.hour || '');
    if (!hour) continue;
    const ips = bucket.ips && typeof bucket.ips === 'object' ? bucket.ips : {};
    for (const [ip, rec] of Object.entries(ips)) {
      if (!ip) continue;
      rows.push({ hour, ip, rec: normalizeRecord(rec) });
    }
  }
  return rows;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {string[]} paths
 */
async function loadBodies(paths) {
  if (paths.length) {
    return paths.map((file) => ({
      source: file,
      body: JSON.parse(fs.readFileSync(file, 'utf8')),
    }));
  }
  if (stdin.isTTY) usage();
  const text = (await readStdin()).trim();
  if (!text) usage();
  return [{ source: 'stdin', body: JSON.parse(text) }];
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padLeft(value, width) {
  return String(value).padStart(width);
}

function distinctPerms(rec) {
  /** @type {string[]} */
  const keys = [];
  for (const [gameId, counts] of Object.entries(rec.games)) {
    for (const perm of Object.keys(counts).sort()) {
      if (counts[perm]) keys.push(`${gameId}:${perm}`);
    }
  }
  return keys;
}

async function main() {
  const paths = process.argv.slice(2).filter((a) => a !== '--');
  const inputs = await loadBodies(paths);

  /** @type {Map<string, Map<string, ReturnType<typeof normalizeRecord>>>} */
  const byHour = new Map();
  for (const { source, body } of inputs) {
    for (const { hour, ip, rec } of extractRows(body, source)) {
      let byIp = byHour.get(hour);
      if (!byIp) {
        byIp = new Map();
        byHour.set(hour, byIp);
      }
      const prev = byIp.get(ip);
      byIp.set(ip, prev ? maxRecord(prev, rec) : rec);
    }
  }

  /** @type {Map<string, ReturnType<typeof normalizeRecord>>} */
  const byIp = new Map();
  for (const hour of [...byHour.keys()].sort()) {
    for (const [ip, rec] of byHour.get(hour) || []) {
      const prev = byIp.get(ip);
      byIp.set(ip, prev ? sumRecord(prev, rec) : rec);
    }
  }

  const ips = [...byIp.keys()].sort();
  const rows = ips.map((ip) => {
    const rec = byIp.get(ip) || emptyRecord();
    const perms = distinctPerms(rec);
    const poly = Object.keys(rec.games.polywordlot || {}).filter((k) => rec.games.polywordlot[k]);
    const trans = Object.keys(rec.games.transword || {}).filter((k) => rec.games.transword[k]);
    return {
      ip,
      games: perms.length,
      polywordlot: poly.length,
      transword: trans.length,
      homeHits: rec.homeHits,
      languages: Object.keys(rec.languages).length,
      perms: perms.join(' '),
    };
  });

  const headers = ['IP', 'games', 'polywordlot', 'transword', 'homeHits', 'languages', 'perms'];
  const widths = {
    ip: Math.max(2, ...rows.map((r) => r.ip.length), headers[0].length),
    games: Math.max(5, ...rows.map((r) => String(r.games).length)),
    polywordlot: headers[2].length,
    transword: headers[3].length,
    homeHits: headers[4].length,
    languages: headers[5].length,
  };

  const line = (r) =>
    [
      pad(r.ip, widths.ip),
      padLeft(r.games, widths.games),
      padLeft(r.polywordlot, widths.polywordlot),
      padLeft(r.transword, widths.transword),
      padLeft(r.homeHits, widths.homeHits),
      padLeft(r.languages, widths.languages),
      r.perms,
    ].join('  ');

  console.log(
    [
      pad(headers[0], widths.ip),
      padLeft(headers[1], widths.games),
      padLeft(headers[2], widths.polywordlot),
      padLeft(headers[3], widths.transword),
      padLeft(headers[4], widths.homeHits),
      padLeft(headers[5], widths.languages),
      headers[6],
    ].join('  ')
  );
  for (const r of rows) console.log(line(r));

  const totals = rows.reduce(
    (acc, r) => ({
      games: acc.games + r.games,
      polywordlot: acc.polywordlot + r.polywordlot,
      transword: acc.transword + r.transword,
      homeHits: acc.homeHits + r.homeHits,
      languages: acc.languages + r.languages,
    }),
    { games: 0, polywordlot: 0, transword: 0, homeHits: 0, languages: 0 }
  );
  if (rows.length) {
    console.log(
      line({
        ip: `(${rows.length} IPs)`,
        games: totals.games,
        polywordlot: totals.polywordlot,
        transword: totals.transword,
        homeHits: totals.homeHits,
        languages: totals.languages,
        perms: '',
      })
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
