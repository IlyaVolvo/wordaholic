# Deploy the stats database to the live hosts

Follow this on the day the `feature/scoreboard` database replaces the live Worker. Do the steps in order. The live hosts stay on `wordaholic-stats` until the last deploy.

The database is the Durable Object named `site` on the Worker `wordaholic-games-stats`. Do not drop that object. Do not add a migration tag. `v1` is already applied.

The cutover date is the next UTC date after the import. Finish the last deploy before that midnight. The UTC day of the import is a gap: it is not in the hour files, and it is not collected as frozen history.

## 1. Deploy this Worker to staging

`workers/stats/wrangler.toml` must still contain only the two `wordaholic-staging.volvovski.com` routes. The four live routes stay commented out.

```bash
npm run deploy:stats
```

That is `npx wrangler deploy --config workers/stats/wrangler.toml`. The first request after this deploy renames `help_count` to `loss_reason` on the existing `site` object.

## 2. Set the secrets on wordaholic-games-stats

Secrets on `wordaholic-stats` are not copied. Set these on `wordaholic-games-stats`:

```bash
npx wrangler secret put STATS_IMPORT_TOKEN --config workers/stats/wrangler.toml
npx wrangler secret put STATS_ALLOW_RESET --config workers/stats/wrangler.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/stats/wrangler.toml
npx wrangler secret put TELEGRAM_CHAT_ID --config workers/stats/wrangler.toml
```

`STATS_ALLOW_RESET` must be the single character `1`. Delete it in step 7. Use the same Telegram values as the live Worker. Topic ids are already in the file.

## 3. Download the hour files once

`stats-hours/` is empty in this checkout. The files are the `hours/*.json` objects in the bucket the live Worker still archives. This branch does not talk to that bucket. Download them with the scripts from main, into this checkout:

```bash
mkdir -p /tmp/stats-pull
git show origin/main:scripts/gcs-xml-put.js > /tmp/stats-pull/gcs-xml-put.js
git show origin/main:scripts/stats-pull-gcs.js > /tmp/stats-pull/stats-pull-gcs.js
cd /tmp/stats-pull
GCS_BUCKET=… GCS_HMAC_ACCESS_KEY=… GCS_HMAC_SECRET=… node stats-pull-gcs.js /path/to/wordaholic/stats-hours
```

Use the bucket name and HMAC keys already set on the live Worker. After this download, nothing in the new Worker reads the bucket.

## 4. Clear the test rows

This deletes every row in `plays`, `browsers`, `nicknames`, `daily_live`, `daily_frozen`, `places`, and `meta`. The tables stay. Run it before the import. An import that runs first stores the cutover date, and a later import does not move that date.

From the repo root:

```bash
STATS_IMPORT_TOKEN=… STATS_WORKER_ORIGIN=https://wordaholic-staging.volvovski.com node scripts/stats-reset.js
```

The response lists how many rows were removed from each table. A missing token or `STATS_ALLOW_RESET` other than `1` returns 404. A body other than `{"confirm":"clear-site"}` returns 400.

## 5. Import frozen history

`scripts/stats-places.json` is already in the repo. The import refuses to start when `stats-hours/` has no JSON files, so an empty directory cannot set the cutover date.

```bash
STATS_IMPORT_TOKEN=… STATS_WORKER_ORIGIN=https://wordaholic-staging.volvovski.com node scripts/stats-import.js
```

Days in the hour files before the cutover go into `daily_frozen`. The places file goes into `places`. The command prints the cutover date. Write it down. The live route deploy in step 8 has to finish before that date starts at 00:00 UTC.

To choose a later date, set `STATS_CUTOVER=YYYY-MM-DD` on that command. It must be a UTC date after today.

## 6. Check the staging database

- `GET https://wordaholic-staging.volvovski.com/api/stats` returns `{"cutover":"YYYY-MM-DD"}` with the date from step 5.
- `GET https://wordaholic-staging.volvovski.com/stats` shows frozen days and no test plays.
- In Data Studio, namespace `StatsStore` bound to `wordaholic-games-stats`, object name `site`:

```sql
SELECT COUNT(*) AS n FROM plays;
SELECT COUNT(*) AS n FROM nicknames;
SELECT COUNT(*) AS n FROM daily_frozen;
SELECT value FROM meta WHERE key = 'cutover';
```

`plays` and `nicknames` are 0. `daily_frozen` is greater than 0. `meta` holds the cutover date. The column on `plays` is `loss_reason`.

## 7. Remove the clear switch

```bash
npx wrangler secret delete STATS_ALLOW_RESET --config workers/stats/wrangler.toml
```

`POST /api/stats/reset` then returns 404. Leave `STATS_IMPORT_TOKEN` in place.

## 8. Move the live hosts

Deploy the site from the merged branch so `www.wordaholic-games.com` and `wordaholic.volvovski.com` serve this build. The Render service builds with `npm run build`. A browser still on an older bundle does not send `lossReason`.

In `workers/stats/wrangler.toml`, delete the two `wordaholic-staging.volvovski.com` routes and uncomment the four routes for `www.wordaholic-games.com` and `wordaholic.volvovski.com`. Deploy again:

```bash
npm run deploy:stats
```

Do this before the cutover midnight from step 5.

After this deploy:

- `https://wordaholic.volvovski.com/` and `https://www.wordaholic-games.com/` still load from the origin.
- `POST /api/stats` on each live host returns 204.
- `GET /api/stats` on each live host returns the same cutover date.
- `GET /stats` on each live host shows the frozen days.
- `https://wordaholic-staging.volvovski.com/api/stats` no longer reaches this Worker.

A new play shows up in `plays` on the object named `site`. A loss has `loss_reason` set. A win has `loss_reason` NULL.
