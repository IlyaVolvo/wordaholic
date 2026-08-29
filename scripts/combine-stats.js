/**
 * Combine GET /api/stats JSON dumps.
 *
 *   node scripts/combine-stats.js dump1.json dump2.json
 *   curl -sS https://wordaholic.volvovski.com/api/stats | node scripts/combine-stats.js
 *   curl -sS http://127.0.0.1:4173/api/stats | node scripts/combine-stats.js
 */
import fs from 'node:fs';
import { stdin } from 'node:process';
import { combineBodies, combineTotals } from './stats-combine.js';

function usage() {
  console.error('Usage: node scripts/combine-stats.js <stats.json> [stats.json ...]');
  console.error('   or: curl -sS <host>/api/stats | node scripts/combine-stats.js');
  process.exit(1);
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

async function main() {
  const paths = process.argv.slice(2).filter((a) => a !== '--');
  const inputs = await loadBodies(paths);
  const rows = combineBodies(inputs);

  const headers = [
    'IP',
    'location',
    'addrs',
    'languages',
    'games',
    'polywordlot',
    'transword',
    'homeHits',
    'perms',
  ];
  const widths = {
    ip: Math.max(
      2,
      ...rows.map((r) => r.ip.length),
      headers[0].length,
      `(${rows.length} networks)`.length
    ),
    location: Math.max(
      headers[1].length,
      ...rows.map((r) => (r.location || '').length)
    ),
    addrs: Math.max(5, ...rows.map((r) => String(r.addrs).length), headers[2].length),
    languages: Math.max(headers[3].length, ...rows.map((r) => String(r.languages).length)),
    games: Math.max(5, ...rows.map((r) => String(r.games).length), headers[4].length),
    polywordlot: headers[5].length,
    transword: headers[6].length,
    homeHits: headers[7].length,
  };

  const line = (r) =>
    [
      pad(r.ip, widths.ip),
      pad(r.location || '', widths.location),
      padLeft(r.addrs, widths.addrs),
      padLeft(r.languages, widths.languages),
      padLeft(r.games, widths.games),
      padLeft(r.polywordlot, widths.polywordlot),
      padLeft(r.transword, widths.transword),
      padLeft(r.homeHits, widths.homeHits),
      r.perms,
    ].join('  ');

  console.log(
    [
      pad(headers[0], widths.ip),
      pad(headers[1], widths.location),
      padLeft(headers[2], widths.addrs),
      padLeft(headers[3], widths.languages),
      padLeft(headers[4], widths.games),
      padLeft(headers[5], widths.polywordlot),
      padLeft(headers[6], widths.transword),
      padLeft(headers[7], widths.homeHits),
      headers[8],
    ].join('  ')
  );
  for (const r of rows) console.log(line(r));

  const totals = combineTotals(rows);
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
        location: '',
      })
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
