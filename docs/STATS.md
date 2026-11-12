# How site statistics are collected

This is the anonymous site counter (home visits, favorite-language toggles, games started) and the play rows behind the scoreboard. It is separate from the in-game Statistics screen, which stays in the browser’s IndexedDB and is never uploaded.

Production host: `wordaholic.volvovski.com`. The Worker is `workers/stats` (`wordaholic-stats`). One SQLite database inside the `StatsStore` Durable Object, named `site`, is the only store. The Worker does not read or write a bucket.

```
browser  POST /api/stats          home hits and language toggles
         POST /api/plays          start, then finish, from a local queue
            │
            ▼
Cloudflare edge                    IP + country/city/region/network
            │
            ▼
Durable Object StatsStore          SQLite
            │
            ├── daily_frozen       imported days before the cutover
            ├── daily_live         home and language on and after the cutover
            ├── plays              one row per browser, game, puzzle, language, variant
            └── places             city → coordinates
            │
            ├── GET /stats                 operator page (includes IPs)
            └── GET /api/stats/geo         home-map bubbles (no IPs)
```

Local `scripts/serve.js` (port 4173) proxies these routes to the Worker (`npm run dev:stats`, port 8787). It does not keep its own copy.

---

## What the application sends

`reportStats` (`app/stats/report.js`) POSTs JSON to `/api/stats` with `keepalive: true` and ignores failure and offline. Success is HTTP 204 with an empty body.

| Field | When it is sent | Shape |
| --- | --- | --- |
| `homeHits` | Home map is painted (`app/main.js`) | integer, always `1` |
| `languages` | A language is added to or removed from favorites | `{ "en": 1, "he": 1 }` |

`languages` counts favorite-list changes. Adding and removing both send `1` for that language code. It is not the list of languages currently selected.

A `games` field is still accepted from older clients and is not stored. Current games do not send it. A game count is a play start.

Play reports go to `POST /api/plays`. The device keeps them in one queue (`app/stats/plays.js`), in the order they happened. Offline, they stay on the device. Online, they are sent in that order, start before finish. Each report keeps the device time from the moment it happened.

A start is one browser, one game, one puzzle date, one language, and one variant. The server stores that device time as `started_at`, plus the edge IP and place. A later start for the same puzzle does not change the row. A finish fills the result and does not change the start time, the IP, or the place. A finish that arrives before its start is stored is rejected and left on the device to send again.

Game ids: 0 PolyWordlot, 1 Transword, 2 Hydra, 3 Letterix.

The operator page counts a play on the UTC date of `started_at`, including a start that never finishes. The puzzle date stays on the row for the scoreboard and is not that day.

Home hits and language toggles use the UTC date the server receives `POST /api/stats`.

---

## Tables

| Table | Key | What it holds |
| --- | --- | --- |
| `meta` | `cutover` | The UTC date chosen by the first import. A later import does not move it. |
| `daily_frozen` | IP + day | Home hits, language toggles, game counts, and place for days before the cutover. |
| `daily_live` | IP + day | Home hits, language toggles, and place on and after the cutover. |
| `plays` | browser + game + puzzle date + language + variant | The start, and the finish when it arrives. |
| `places` | country, region, city | Coordinates. The map reads this table. |
| `nicknames`, `browsers` | name, browser id | Scoreboard identity. A play counts without a nickname. |

Days before the cutover come from `daily_frozen`. On and after the cutover, home and language come from `daily_live`, and game counts come from play starts. Every frozen day, every live day, and every play is kept.

---

## Cutover import

`scripts/stats-import.js` reads the hour files and the places file already on disk and posts them to `POST /api/stats/import`. The Worker does not fetch them itself.

The cutover date defaults to the next UTC date. Frozen rows are the days in those files before that date. The current UTC day is a gap: it is not in the import, and live rows before the cutover are not shown. Deploy this Worker before that midnight. The cutover day starts empty.

The first import stores the date. A second import does not move it and does not replace a frozen day already inserted.

---

## Places

The places file is copied into `places` by the same import. After that, a home-map point is a city in the table.

When a visitor’s city is missing, the Worker asks ipwho.is, then geojs.io, then Team Cymru, once. The city, and coordinates when that lookup has them, are inserted into `places`. The next request reads the table. Private and documentation addresses are not looked up. Frozen rows are not rewritten.

---

## What Cloudflare adds

The browser does not send an IP or a place.

1. **IP.** `CF-Connecting-IP`, or the first address in `X-Forwarded-For`. An IPv4-mapped IPv6 prefix (`::ffff:`) is stripped.
2. **Place, from the edge request only.** `request.cf`: `country`, `city`, `region`, `asOrganization`. `CF-IPCountry` is the country fallback. Country `XX` and `T1` are treated as empty.
3. **That geo is copied onto the Durable Object call.** A fetch into a Durable Object does not keep `request.cf`. Before forwarding, the Worker deletes any client `X-Wordaholic-Geo` header and, for POSTs only, sets both that header and the query parameter `wh_geo` from the edge geo. A client cannot supply its own location.

Routes are in `workers/stats/wrangler.toml`: `/api/*` and `/stats*` on `wordaholic.volvovski.com` and `www.wordaholic-games.com`. Another hostname stays silent until it is proxied and given the same routes. The steps are in [STATS-NEW-DOMAIN.md](STATS-NEW-DOMAIN.md).

`POST /api/word-report` is not stored. It is posted into the Missing or Questionable Telegram topic when the Telegram secrets are set.

`GET /api/stats` returns the cutover date. `GET /stats` is the operator report. `GET /api/stats/geo` is the map, without IP addresses.
