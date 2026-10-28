/**
 * Load the saved hour files and the places file into the local Worker once.
 * The Worker does not read the Google bucket.
 *
 *   STATS_IMPORT_TOKEN=local-import node scripts/stats-import.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickRicherGeo } from './stats-combine.js';
import { parsePlacesDocument } from './stats-places.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hoursDir = path.resolve(process.env.STATS_HOURS_DIR || path.join(root, 'stats-hours'));
const placesFile = path.resolve(process.env.STATS_PLACES_FILE || path.join(root, 'scripts/stats-places.json'));
const origin = process.env.STATS_WORKER_ORIGIN || 'http://127.0.0.1:8787';
const token = process.env.STATS_IMPORT_TOKEN || 'local-import';
const cutover = process.env.STATS_CUTOVER || new Date().toISOString().slice(0, 10);

function addCounts(into, extra) {
  for (const [key, raw] of Object.entries(extra || {})) {
    const n = Number(raw) || 0;
    if (n > 0) into[key] = (into[key] || 0) + n;
  }
}

function aggregate(files) {
  /** @type {Map<string, { ip: string, day: string, homeHits: number, languages: Record<string, number>, games: Record<string, Record<string, number>>, geo: ReturnType<typeof pickRicherGeo> }>} */
  const days = new Map();
  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const bucket of body.hours || []) {
      const day = String(bucket.hour || '').slice(0, 10);
      if (!day) continue;
      for (const [ip, rec] of Object.entries(bucket.ips || {})) {
        const key = `${ip}\t${day}`;
        let slot = days.get(key);
        if (!slot) {
          slot = { ip, day, homeHits: 0, languages: {}, games: {}, geo: null };
          days.set(key, slot);
        }
        slot.homeHits += Number(rec.homeHits) || 0;
        addCounts(slot.languages, rec.languages);
        for (const [gameId, counts] of Object.entries(rec.games || {})) {
          if (!slot.games[gameId]) slot.games[gameId] = {};
          addCounts(slot.games[gameId], counts);
        }
        slot.geo = pickRicherGeo(slot.geo, rec.geo);
      }
    }
  }
  return [...days.values()];
}

const names = fs.existsSync(hoursDir)
  ? fs.readdirSync(hoursDir).filter((name) => name.endsWith('.json')).sort()
  : [];
const days = aggregate(names.map((name) => path.join(hoursDir, name)));
const places = fs.existsSync(placesFile)
  ? parsePlacesDocument(JSON.parse(fs.readFileSync(placesFile, 'utf8')))
  : { places: {} };

const placesRes = await fetch(`${origin}/api/stats/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ cutover, places }),
});
if (!placesRes.ok) {
  console.error(await placesRes.text());
  process.exit(1);
}
console.log('places', await placesRes.json());

for (let i = 0; i < days.length; i += 200) {
  const chunk = days.slice(i, i + 200);
  const res = await fetch(`${origin}/api/stats/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ days: chunk }),
  });
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
  console.log('days', i, await res.json());
}
console.log(`imported ${days.length} daily rows from ${names.length} hour files`);
