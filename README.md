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

## Game groups

Games that share word sets form a group. The folder tree is the source of truth:

```
games/<group>/
  data/languages/<Language>/…   word sets shared by the group's games
  shared/                       the group's word-set loader
  <game>/                       one folder per game (registration.js, help/, …)
```

| Group | Games | Word sets |
|---|---|---|
| `g1` | PolyWordlot, Hydra | `answers-N.txt` (+ `dictionary-N.txt`) |
| `g2` | TransWord | `corpus.txt` (+ `index.json`) |
| `g3` | Letterix | `corpus.txt` (+ optional `corpus2.txt`) |

Games are served at `/games/<group>/<game>/` and word sets at `/games/<group>/data/languages/`. Old `/games/<game>/…` URLs redirect.

To add a game, put it in an existing group's folder (to reuse its word sets) or create `games/g<N+1>/` with its own `data/` and `shared/`. Then import its `registration.js` in `app/game-registry.js`, where the order is the home screen order. `scripts/games-layout.js` scans the folders and regenerates `app/games-layout.js` on every build (do not edit that file). The build fails if the registry and the folders disagree.

## Word data

- **Shared language definition (all games):** `word-data/<Language>/language.json`
- Group word sets: `games/<group>/data/languages/<Language>/…` (see the table above)

Sibling repos required for `sync-dicts`:

- `../mlw`
- `../transword`

## Deploy (Render)

- Static site, publish `dist`, build `npm run build`
- Or use [render.yaml](render.yaml)
- Point **wordaholic.com** at the Render service after purchase

**Note:** Commit `word-data/` and game dictionaries so Render does not need the sibling repos.

## TransWord admin

Hidden at `/games/g2/transword/admin` (password gate; not linked from the play UI).

On Render, set env `ADMIN_PASSWORD` to the **SHA-256 hex** of your password (hashed form — not plaintext):

```bash
node scripts/hash-admin-password.js 'your-password'
# → paste the printed hex as ADMIN_PASSWORD
```

Build embeds that hash into the admin gate. Local builds without the env var fall back to password `sobaka12`.
