# Wordaholic

Offline-first multi-game word platform (vanilla static PWA).

## Games

- **PolyWordlot** — multi-language Wordle-style (Daily / Training)
- **TransWord** — word transformation ladders (admin gated)

See [docs/PLAN.md](docs/PLAN.md) for architecture.

## Develop

```bash
npm run sync-dicts   # copy dicts from ../mlw and ../transword into each game
npm run build        # build dist/ (auto-syncs if dicts missing)
npm run serve        # http://127.0.0.1:4173
```

Dictionary layout (same as the old games):

- `games/polywordlot/dict/<Language>/<locale>/answers-N.txt` (+ `dictionary-N.txt`, `language.json`)
- `games/transword/data/languages/<Dir>/corpus.txt` (+ `language.json`, `index.json`)

Sibling repos required for `sync-dicts`:

- `../mlw`
- `../transword`

## Deploy (Render)

- Static site, publish `dist`, build `npm run build`
- Or use [render.yaml](render.yaml)
- Point **wordaholic.com** at the Render service after purchase

**Note:** Commit synced game dictionaries (under `games/*/dict` and `games/transword/data`) so Render does not need the sibling repos.

## TransWord admin

Default password: `wordaholic-admin`  
Change hash in `games/transword/admin-password.js`.
