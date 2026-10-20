# Turn on site statistics for another domain

The live Worker is `wordaholic-stats` (`workers/stats`). It already collects on `wordaholic.volvovski.com` only. Those two routes are in `workers/stats/wrangler.toml`:

- `wordaholic.volvovski.com/api/*`
- `wordaholic.volvovski.com/stats*`

The page posts to the host it was loaded from (`POST /api/stats` in `app/stats/report.js`). It never sends counts to `wordaholic.volvovski.com` from somewhere else. A new public hostname stays silent until that hostname is proxied by Cloudflare and those same paths are routed to this Worker.

Do this when the new domain is ready. Leave the existing volvovski routes in place. Counts from every routed hostname share one Durable Object, the object named `site`. Do not create a second Worker, a second Durable Object, or a second set of Google bucket secrets.

How collection works is in [STATS.md](STATS.md).

---

## 1. Proxy the hostname

The zone must be in the same Cloudflare account as `wordaholic-stats`.

1. Add the domain as a Cloudflare zone and switch it to Cloudflare nameservers.
2. Point DNS at the origin that serves the site (Render, or whatever is already hosting it).
3. Turn the record **proxied** (orange cloud). A DNS-only record never reaches the Worker.

Do this for every hostname that actually serves the app. Apex and `www` are separate routes.

## 2. Add path routes on the existing Worker

Workers & Pages → **wordaholic-stats** → Settings → Domains & Routes → Add route.

For a hostname `example.com` in zone `example.com`:

| Route pattern | Zone |
| --- | --- |
| `example.com/api/*` | `example.com` |
| `example.com/stats*` | `example.com` |

`/stats*` is required. A pattern of `/stats` does not match `/stats/`, and browsers add the slash.

Use a **route**, not a Worker custom domain. A custom domain sends every path on that host to the Worker and the site stops loading. A route sends only `/api/*` and `/stats*` to the Worker. Every other path still goes to the origin.

`/api/*` is wider than the two stats URLs. On that host the Worker answers:

| Path | Used for |
| --- | --- |
| `POST /api/stats` | Ingest |
| `GET /api/stats` | Raw 24-hour dump, includes IPs |
| `GET /api/stats/geo` | Home-map bubbles, no IPs |
| `GET /stats` | Operator HTML report |

Any other `/api/...` URL on that hostname returns the Worker’s 404 and never reaches the origin. The app only calls `/api/stats` and `/api/stats/geo`.

Repeat the pair for `www.example.com` if that name serves the site too. Its zone is still `example.com`.

## 3. Put the same routes in wrangler.toml

`npm run deploy:stats` replaces the Worker’s routes with the `[[routes]]` blocks in `workers/stats/wrangler.toml`. Dashboard-only routes disappear on the next deploy.

Add one block per pattern, and keep the volvovski blocks:

```toml
[[routes]]
pattern = "example.com/api/*"
zone_name = "example.com"

[[routes]]
pattern = "example.com/stats*"
zone_name = "example.com"
```

Then deploy from the repo:

```bash
npm run deploy:stats
```

That command is `npx wrangler deploy --config workers/stats/wrangler.toml`.

Do not run `wrangler secret put` again. `GCS_BUCKET`, `GCS_HMAC_ACCESS_KEY`, and `GCS_HMAC_SECRET` already belong to this Worker and apply to every route. The `v1` Durable Object migration is already applied. Do not add another `new_sqlite_classes` migration.

## 4. Check the new host

From the new origin:

- `POST /api/stats` with a small JSON body returns **204**.
- `GET /api/stats/geo` returns JSON with `localities`.
- `GET /stats` returns the HTML report.
- A normal page (for example `/`) still comes from the origin, not the Worker.

Cloudflare fills the visitor IP and place (`CF-Connecting-IP`, `request.cf`) on this hostname the same way it does on `wordaholic.volvovski.com`, because the browser hit this zone’s edge. No app change is required for that.
