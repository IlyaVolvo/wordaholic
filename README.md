# Wordaholic

Offline-first multi-game word platform (vanilla static PWA).

## Games

- **PolyWordlot** — multi-language Wordle-style (Daily / Training)
- **TransWord** — word transformation ladders (admin gated)

See [docs/PLAN.md](docs/PLAN.md) for architecture.

## Develop

```bash
npm run sync-dicts   # copy word lists from ../mlw and ../transword (not language.json)
npm run build        # build dist/ (auto-syncs word lists if missing)
npm run serve        # http://127.0.0.1:4173
```

## Word data

- **Shared language definition (all games):** `word-data/<Language>/<locale>/language.json`
- PolyWordlot word lists: `games/polywordlot/dict/<Language>/<locale>/answers-N.txt` (+ `dictionary-N.txt`)
- TransWord corpora: `games/transword/data/languages/<Dir>/corpus.txt` (+ `index.json`)

Sibling repos required for `sync-dicts`:

- `../mlw`
- `../transword`

## Deploy (Render)

- Static site, publish `dist`, build `npm run build`
- Or use [render.yaml](render.yaml)
- Point **wordaholic.com** at the Render service after purchase

**Note:** Commit `word-data/` and game dictionaries so Render does not need the sibling repos.

## TransWord admin

Default password: `wordaholic-admin`  
Change hash in `games/transword/admin-password.js`.
