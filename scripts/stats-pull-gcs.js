/**
 * Download hour archives from GCS into a local directory.
 * Objects whose basename already exists locally are skipped.
 *
 *   GCS_BUCKET=… GCS_HMAC_ACCESS_KEY=… GCS_HMAC_SECRET=… node scripts/stats-pull-gcs.js [dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { gcsConfigured, getGcsObject, listGcsKeys } from './gcs-xml-put.js';

const outDir = process.argv[2] || 'stats-hours';

const env = {
  GCS_BUCKET: process.env.GCS_BUCKET,
  GCS_HMAC_ACCESS_KEY: process.env.GCS_HMAC_ACCESS_KEY,
  GCS_HMAC_SECRET: process.env.GCS_HMAC_SECRET,
};

if (!gcsConfigured(env)) {
  console.error('Set GCS_BUCKET, GCS_HMAC_ACCESS_KEY, and GCS_HMAC_SECRET in the environment.');
  process.exit(1);
}

const creds = {
  accessKey: env.GCS_HMAC_ACCESS_KEY,
  secret: env.GCS_HMAC_SECRET,
  bucket: env.GCS_BUCKET,
};

const keys = (await listGcsKeys({ ...creds, prefix: 'hours/' })).filter((key) =>
  key.endsWith('.json')
);
if (!keys.length) {
  console.error('No hours/*.json objects in the bucket yet.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
let skipped = 0;
for (const key of keys) {
  const dest = path.join(outDir, path.basename(key));
  if (fs.existsSync(dest)) {
    skipped += 1;
    continue;
  }
  const body = await getGcsObject({ ...creds, objectKey: key });
  fs.writeFileSync(dest, body);
  console.log(dest);
}
if (skipped) {
  console.log(`skipped ${skipped} existing`);
}
