/**
 * Delete every row in the site database and leave the tables in place.
 * The Worker accepts this only while STATS_ALLOW_RESET is 1.
 *
 *   STATS_IMPORT_TOKEN=… STATS_WORKER_ORIGIN=https://wordaholic-staging.volvovski.com node scripts/stats-reset.js
 */
const origin = process.env.STATS_WORKER_ORIGIN || 'http://127.0.0.1:8787';
const token = process.env.STATS_IMPORT_TOKEN || 'local-import';

const res = await fetch(`${origin}/api/stats/reset`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ confirm: 'clear-site' }),
});
const text = await res.text();
if (!res.ok) {
  console.error(res.status, text);
  process.exit(1);
}
console.log(text);
