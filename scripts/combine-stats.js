/**
 * Combine GET /api/stats JSON dumps.
 *
 * The in-memory store is a running snapshot, so the same UTC hour in two files
 * is overlap, not extra traffic. For each hour+IP, keep field-wise max (the
 * more complete snapshot). IPv6 addresses then collapse to the first 8 bytes
 * (/64 prefix); different IIDs in the same hour are summed. Different hours
 * are added. Distinct games are permutation keys as stored (polywordlot en,5
 * and transword en,2,4 are two).
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
 * Expand IPv6 to eight 16-bit hex groups (lowercase, zero-padded).
 * @param {string} ip
 * @returns {string[] | null}
 */
function expandIPv6(ip) {
  const bare = ip.split('%')[0].trim().toLowerCase();
  if (!bare.includes(':')) return null;
  const v4tail = bare.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  let core = v4tail ? bare.slice(0, -v4tail[1].length) : bare;
  if (v4tail) {
    const oct = v4tail[1].split('.').map(Number);
    if (oct.length !== 4 || oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const hi = ((oct[0] << 8) | oct[1]).toString(16).padStart(4, '0');
    const lo = ((oct[2] << 8) | oct[3]).toString(16).padStart(4, '0');
    core = `${core}${hi}:${lo}`;
  }
  let head;
  let tail;
  if (core.includes('::')) {
    const parts = core.split('::');
    if (parts.length !== 2) return null;
    head = parts[0] ? parts[0].split(':') : [];
    tail = parts[1] ? parts[1].split(':') : [];
  } else {
    head = core.split(':');
    tail = [];
  }
  const norm = (groups) =>
    groups
      .filter((g) => g.length > 0)
      .map((g) => {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        return g.padStart(4, '0');
      });
  const left = norm(head);
  const right = norm(tail);
  if (left.includes(null) || right.includes(null)) return null;
  const missing = 8 - left.length - right.length;
  if (core.includes('::')) {
    if (missing < 1) return null;
  } else if (missing !== 0) {
    return null;
  }
  const groups = [...left, ...Array(missing).fill('0000'), ...right];
  return groups.length === 8 ? groups : null;
}

/**
 * IPv6 identity is the first 8 bytes (network /64). IPv4-mapped IPv6 counts as
 * IPv4. IPv4 and unparseable values are unchanged.
 * @param {string} ip
 */
function ipIdentity(ip) {
  const bare = String(ip).split('%')[0].trim();
  const v4mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped) return v4mapped[1];
  if (bare.includes('.')) return bare;
  const groups = expandIPv6(bare);
  if (!groups) return bare;
  const prefix = groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+/, '') || '0')
    .join(':');
  return `${prefix}::/64`;
}

/**
 * @param {Map<string, ReturnType<typeof normalizeRecord>>} byIp
 * @returns {Map<string, { rec: ReturnType<typeof normalizeRecord>, addrs: Set<string> }>}
 */
function collapseHour(byIp) {
  /** @type {Map<string, { rec: ReturnType<typeof normalizeRecord>, addrs: Set<string> }>} */
  const out = new Map();
  for (const [ip, rec] of byIp) {
    const id = ipIdentity(ip);
    const prev = out.get(id);
    if (!prev) {
      out.set(id, { rec, addrs: new Set([ip]) });
    } else {
      prev.rec = sumRecord(prev.rec, rec);
      prev.addrs.add(ip);
    }
  }
  return out;
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

  /** @type {Map<string, { rec: ReturnType<typeof normalizeRecord>, addrs: Set<string> }>} */
  const byId = new Map();
  for (const hour of [...byHour.keys()].sort()) {
    const collapsed = collapseHour(byHour.get(hour) || new Map());
    for (const [id, { rec, addrs }] of collapsed) {
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, { rec, addrs: new Set(addrs) });
      } else {
        prev.rec = sumRecord(prev.rec, rec);
        for (const addr of addrs) prev.addrs.add(addr);
      }
    }
  }

  const ids = [...byId.keys()].sort();
  const rows = ids.map((ip) => {
    const { rec, addrs } = byId.get(ip) || { rec: emptyRecord(), addrs: new Set() };
    const perms = distinctPerms(rec);
    const poly = Object.keys(rec.games.polywordlot || {}).filter((k) => rec.games.polywordlot[k]);
    const trans = Object.keys(rec.games.transword || {}).filter((k) => rec.games.transword[k]);
    return {
      ip,
      addrs: addrs.size,
      games: perms.length,
      polywordlot: poly.length,
      transword: trans.length,
      homeHits: rec.homeHits,
      languages: Object.keys(rec.languages).length,
      perms: perms.join(' '),
    };
  });

  const headers = ['IP', 'addrs', 'games', 'polywordlot', 'transword', 'homeHits', 'languages', 'perms'];
  const widths = {
    ip: Math.max(
      2,
      ...rows.map((r) => r.ip.length),
      headers[0].length,
      `(${rows.length} networks)`.length
    ),
    addrs: Math.max(5, ...rows.map((r) => String(r.addrs).length), headers[1].length),
    games: Math.max(5, ...rows.map((r) => String(r.games).length)),
    polywordlot: headers[3].length,
    transword: headers[4].length,
    homeHits: headers[5].length,
    languages: headers[6].length,
  };

  const line = (r) =>
    [
      pad(r.ip, widths.ip),
      padLeft(r.addrs, widths.addrs),
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
      padLeft(headers[1], widths.addrs),
      padLeft(headers[2], widths.games),
      padLeft(headers[3], widths.polywordlot),
      padLeft(headers[4], widths.transword),
      padLeft(headers[5], widths.homeHits),
      padLeft(headers[6], widths.languages),
      headers[7],
    ].join('  ')
  );
  for (const r of rows) console.log(line(r));

  const totals = rows.reduce(
    (acc, r) => ({
      addrs: acc.addrs + r.addrs,
      games: acc.games + r.games,
      polywordlot: acc.polywordlot + r.polywordlot,
      transword: acc.transword + r.transword,
      homeHits: acc.homeHits + r.homeHits,
      languages: acc.languages + r.languages,
    }),
    { addrs: 0, games: 0, polywordlot: 0, transword: 0, homeHits: 0, languages: 0 }
  );
  if (rows.length) {
    console.log(
      line({
        ip: `(${rows.length} networks)`,
        addrs: totals.addrs,
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
