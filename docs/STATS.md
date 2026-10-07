# How site statistics are collected

This is the anonymous site counter (home visits, favorite-language toggles, games started). It is separate from the in-game Statistics screen, which stays in the browser’s IndexedDB and is never uploaded.

Production host: `wordaholic.volvovski.com`. The Worker is `workers/stats` (`wordaholic-stats`). Bucket name used by the places upload comment: `wordaholic-stats`.

```
browser  POST /api/stats          { counts only }
            │
            ▼
Cloudflare edge                    IP + country/city/region/network
            │
            ▼
Durable Object StatsStore          one global object, name "site"
            │  every 10 minutes, closed UTC hours
            ▼
GCS  hours/<hour>.json             long-term archive
     places.json                   city → lat/lon (uploaded by hand)
            │
            ├── GET /stats                 operator page (includes IPs)
            └── GET /api/stats/geo         home-map bubbles (no IPs)
```

Local `scripts/serve.js` (port 4173) runs the same ingest and pages in process memory. It has no Cloudflare geo and reads archives from `./stats-hours/` instead of the bucket.

---

## What the application does

The page never sends a user id, cookie, word, guess, or score. `reportStats` (`app/stats/report.js`) POSTs JSON to `/api/stats` with `keepalive: true` and ignores failure and offline. The browser does not read the response (success is HTTP 204 with an empty body).

Three kinds of delta, any of which may be omitted:

| Field | When it is sent | Shape |
| --- | --- | --- |
| `homeHits` | Home map is painted (`app/main.js`) | integer, always `1` |
| `languages` | A language is added to or removed from favorites | `{ "en": 1, "he": 1 }` |
| `games` | The first valid move of a play | see below |

`languages` counts favorite-list changes. Adding and removing both send `1` for that language code. It is not a list of languages the player currently has selected.

A game event fires once, on the first committed valid move of that play, not on later guesses and not on a win:

| Game | Key | Example |
| --- | --- | --- |
| `polywordlot` | `language,wordLength` | `en,5` |
| `transword` | `language,vocabLevel,difficulty` | `en,2,3` |
| `polyhydra` | `language,wordLength,boardCount` | `en,5,4` |

Language codes are lowercase `[a-z]{2,8}`. The registry is `scripts/stats-games.js`. A new game needs an entry there and one `reportStats` call.

The Worker rejects a body that is not this shape: larger than 8 KiB, `homeHits` above 100, more than 32 keys in one map, a count above 100, an unknown game id, or a key that does not match that game’s pattern. Zero counts are dropped. Extra fields are ignored.

The only stats read the page itself does is `GET /api/stats/geo` (`app/shell/map-geo.js`), used to draw play-activity bubbles on the home map.

---

## What Cloudflare does

Routes in `workers/stats/wrangler.toml`:

- `wordaholic.volvovski.com/api/*` → the Worker
- `wordaholic.volvovski.com/stats*` → the Worker (`/stats` and `/stats/` are the same path)

Everything else on the host is the static site. The Worker answers only:

| Method and path | Result |
| --- | --- |
| `POST /api/stats` | Validate the delta, merge it, `204` |
| `GET /api/stats` | JSON dump of the last 24 hours, keyed by IP |
| `GET /stats` | HTML report (live dump plus archived hours) |
| `GET /api/stats/geo` | Locality totals for the map, no IP addresses |

One Durable Object, `StatsStore`, id from the name `site`, holds every visitor. SQLite-backed class (`new_sqlite_classes`).

### What the edge adds

The browser does not send an IP or a place. The Worker does.

1. **IP.** `CF-Connecting-IP`, or the first address in `X-Forwarded-For`. An IPv4-mapped IPv6 prefix (`::ffff:`) is stripped. This string is the storage key for that hour.
2. **Place, from the edge request only.** `request.cf`: `country`, `city`, `region`, `asOrganization` (the network name). `CF-IPCountry` is the country fallback. Country `XX` and `T1` are treated as empty.
3. **That geo is copied onto the Durable Object call.** A fetch into a Durable Object does not keep `request.cf`. Before forwarding, the Worker deletes any client `X-Wordaholic-Geo` header and, for POSTs only, sets both that header and the query parameter `wh_geo` from the edge geo. A client cannot supply its own location.

### How a hit is stored

Hours are UTC, truncated to the hour (`2026-08-27T14:00:00.000Z`). For that hour and that IP the object adds the counts and keeps the richer of the old and new geo (more filled fields wins). A side map remembers geo by identity: IPv4 stays as-is; IPv6 is the first 64 bits (`…::/64`), so later lookups can reuse a place without storing a new one on every address.

The snapshot (`dump` plus the set of hours already uploaded, plus the geo memory) is written to Durable Object storage after each POST.

### Alarm, every 10 minutes

`PRUNE_INTERVAL_MS` is 10 minutes.

When the three GCS secrets are set:

1. Every hour strictly before the current UTC hour, and not yet marked archived, is uploaded. An hour with no IPs is marked archived and no object is written. A failed PUT stays pending for the next alarm.
2. Uploaded hours are copied into the Durable Object hour cache.
3. Up to 20 hour objects missing from that cache are pulled from the bucket (`hours/` prefix).
4. `places.json` is re-read (the in-memory copy is otherwise reused for 5 minutes).
5. Hours older than 24 hours are deleted from memory only if they are marked archived. Unarchived hours are kept so a failed upload is not lost.

When GCS is not configured, the alarm still drops hours older than 24 hours, and nothing is uploaded.

`GET /api/stats` is the live 24-hour window. It does not include the bucket. `GET /stats` and `GET /api/stats/geo` combine the live window with every hour cached from the bucket.

If a row has a country but no city, those two GET handlers ask ipwho.is, then geojs.io, then Team Cymru (DNS TXT via Cloudflare DNS) and store a better geo on the live record. Private and documentation addresses are not looked up.

---

## Google bucket requirements

The Worker talks to the [Cloud Storage XML API](https://cloud.google.com/storage/docs/xml-api/overview) at `https://storage.googleapis.com`, signed as AWS SigV4 (`region=auto`, `service=s3`, `UNSIGNED-PAYLOAD`). It does not use the JSON API or a Google OAuth token.

### Secrets

Set with Wrangler, not committed (`workers/stats/wrangler.toml`):

| Secret | Use |
| --- | --- |
| `GCS_BUCKET` | Bucket name |
| `GCS_HMAC_ACCESS_KEY` | HMAC access id |
| `GCS_HMAC_SECRET` | HMAC secret |

All three must be set or the Worker treats storage as off. The same three environment variables are read by `scripts/stats-push-gcs.js` and `scripts/stats-pull-gcs.js`.

Create the HMAC key on the Cloud Storage **Interoperability** tab for a Google account or service account that can see this bucket. The code sends path-style URLs (`/{bucket}/{object}`) and never sets an object ACL, so the bucket can use uniform bucket-level access. The HMAC identity needs to:

- **create** objects (`PUT` `hours/….json`)
- **get** objects (`GET` an hour file and `places.json`)
- **list** objects (`GET /{bucket}?prefix=hours/`, XML `ListBucket` with `marker`)

`roles/storage.objectAdmin` on that bucket covers those three. A narrower role is enough if it includes `storage.objects.create`, `storage.objects.get`, and `storage.objects.list`.

### Objects the Worker expects

| Key | Who writes it | Body |
| --- | --- | --- |
| `hours/<ISO hour>.json` | Worker alarm, or `node scripts/stats-push-gcs.js` | `{ "hours": [{ "hour": "2026-08-27T14:00:00.000Z", "ips": { "<ip>": { "homeHits", "languages", "games", "geo?" } } }] }` |
| `places.json` | A person, via `gcloud storage cp` | Place → latitude/longitude map. The Worker only reads it. |

Hour object names contain colons (`2026-08-27T14:00:00.000Z`). Cloud Storage allows that. `Content-Type` on upload is `application/json; charset=utf-8`.

`places.json` is built offline: pull hours, run `node scripts/stats-places-map.js <hoursDir> <target.json>` (it geocodes missing cities and never overwrites an existing key), then:

```
gcloud storage cp <target.json> gs://wordaholic-stats/places.json
```

The Worker refreshes its copy at least every 5 minutes, and also on each alarm. Local serve reads `scripts/stats-places.json` instead.

`stats-push-gcs.js` is a one-shot of the same archive step: it GETs `https://wordaholic.volvovski.com/api/stats` and PUTs closed hours. It does not mark those hours archived inside the Durable Object, so the alarm may upload the same hour again later. `stats-pull-gcs.js` downloads `hours/*.json` into `stats-hours/` and skips names already present.

---

## What the application knows

“Application” here is the browser. It does not know the visitor’s IP, city, or network, and it does not keep a copy of what it posted.

### It sends

Only the counters in the table above: that this page view happened, that a favorite language was toggled, or that a play of a given game, language, and size just started.

### It can read back

`GET /api/stats/geo` only. Each locality is country, region, city, a label, lat/lon, whether the pin fell back to a capital, a total, and a per-game split. IP addresses are not in that JSON. Places with no resolved coordinates are omitted. The home map uses the totals to size and color bubbles.

### It does not know

- The IP address stored next to the counts.
- Country, city, region, or network name. Those exist only after the request hits Cloudflare.
- Other players’ rows, the raw hour files, or `places.json`.
- Whether the POST was stored. Failures are dropped.
- Anything about the words played. Game statistics shown inside a game (attempt charts, calendars) are local and are not this pipeline.

### What the Worker and the bucket know

For each IP, for each UTC hour: home-hit count, language-toggle counts, per-game start counts, and when the edge or a later lookup provided it, `{ country, city, region, asOrg }`. The live object keeps about 24 hours. The bucket keeps every non-empty closed hour that uploaded successfully.

`GET /api/stats` and `GET /stats` include those IP keys. The home map does not call them. Nothing in this pipeline authenticates the caller.
