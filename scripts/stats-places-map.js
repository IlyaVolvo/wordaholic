/**
 * Scan local hour archives and append missing country/region/city → lat/lon rows.
 * Existing keys in the target file are left unchanged.
 *
 *   node scripts/stats-places-map.js <hoursDir> <target.json>
 *
 * Upload later:
 *   gcloud storage cp <target.json> gs://wordaholic-stats/places.json
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  appendMissingPlaces,
  emptyPlacesDocument,
  fillUnresolvedPlaces,
  geosFromHourBody,
  parsePlacesDocument,
  sortPlaces,
} from './stats-places.js';

const hoursDir = path.resolve(process.argv[2] || '');
const targetPath = path.resolve(process.argv[3] || '');

if (!hoursDir || !targetPath || process.argv.length < 4) {
  console.error('Usage: node scripts/stats-places-map.js <hoursDir> <target.json>');
  process.exit(1);
}

if (!fs.existsSync(hoursDir) || !fs.statSync(hoursDir).isDirectory()) {
  console.error(`Not a directory: ${hoursDir}`);
  process.exit(1);
}

const files = fs.readdirSync(hoursDir).filter((name) => name.endsWith('.json')).sort();
/** @type {Map<string, { country: string, region: string, city: string }>} */
const discovered = new Map();
let scanned = 0;
let bad = 0;
for (const name of files) {
  let body;
  try {
    body = JSON.parse(fs.readFileSync(path.join(hoursDir, name), 'utf8'));
    scanned += 1;
  } catch {
    bad += 1;
    continue;
  }
  for (const geo of geosFromHourBody(body)) {
    discovered.set(`${geo.country}|${geo.region}|${geo.city}`, geo);
  }
}

let doc = emptyPlacesDocument();
if (fs.existsSync(targetPath)) {
  try {
    doc = parsePlacesDocument(JSON.parse(fs.readFileSync(targetPath, 'utf8')));
  } catch (err) {
    console.error(`Could not read ${targetPath}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function writeTarget() {
  doc.places = sortPlaces(doc.places);
  doc.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(doc, null, 2)}\n`);
}

const before = Object.keys(doc.places).length;
const added = appendMissingPlaces(doc.places, [...discovered.values()]);
writeTarget();

const geo = await fillUnresolvedPlaces(doc.places, {
  onFilled: (place, remaining) => {
    writeTarget();
    console.log(`geocoded ${place.city}, ${place.region || place.country} (${remaining} left)`);
  },
  onFailed: (place, remaining) => {
    console.log(`unresolved ${place.city}, ${place.region || place.country} (${remaining} left)`);
  },
});
writeTarget();

const unresolved = Object.values(doc.places).filter((p) => p.lat == null || p.lon == null).length;
console.log(
  `${targetPath}: scanned ${scanned} files (${bad} bad), ${discovered.size} places in hours, ` +
    `${before} existing, +${added}, now ${Object.keys(doc.places).length}`
);
console.log(`geocode: ${geo.filled} filled, ${geo.failed} failed, ${unresolved} still without coords`);
