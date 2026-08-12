# Wordaholic offline multi-game platform

Approved design record from planning interview (2026-08-09). Source conversation architecture notes: [ChatGPT share](https://chatgpt.com/share/6a78daee-7448-83e8-834b-228c6c7f2298).

## Goal

Ship a public, offline-first word-games site at **wordaholic.com** (Render static) where users pick a language on a world map, then launch independently pluggable games. v1 games: **PolyWordlot** and **TransWord**. Memorandom is out of v1.

## Scope

**In:** vanilla static shell + PWA; map gateway; favorite languages; per-game wordsets checked into the repo; content-hash updates; IndexedDB + per-game import/export; PolyWordlot offline port (local daily/training/stats, no server); TransWord player + password-gated admin.

**Out:** Memorandom; cloud accounts/sync; automated language-superset → per-game generation (future only); detailed export merge rules (parked).

## Constraints

- Runtime: prefer pure static; Node allowed at build (and runtime only if later forced).
- Games own their screens; shell owns languages, offline/update, word delivery, storage envelope.
- Full plugin contract for interface standardization; per-game semantics for state/stats.
- Updates mandatory; if a session is active → **Update now** or **Update when this game ends** (no ignore forever).

## Design decisions (interview)

| Branch | Decision |
|--------|----------|
| Product | Public users; PolyWordlot + TransWord playable; Memorandom skipped; per-game language sets may differ |
| Platform | Render static; vanilla preferred; PolyWordlot rewrite OK; Node OK at build/runtime if needed; domain wordaholic.com |
| Plugin contract | IDs `polywordlot`, `transword`; independent screens; shared favorite languages; Full contract with per-game semantics; offline required |
| Word data | **Per game, per language — completely separate.** Each game’s wordsets are independent entities, manually maintained for now, and checked into the repo under that game. No shared runtime corpus. Future option: a language-level word superset that *generates* each game’s sets; outputs remain separate checked-in trees |
| Gateway UX | Realistic world map (no flags); Languages dropdown for favorites; game icons on map positioned from favorite languages |
| Persistence | IndexedDB; per-game import/export; smart stats preservation rules later; schemas parked |
| Offline/updates | Cache shell + games + favorite-language wordsets; hash manifest; preparing-offline UX; mandatory session-aware upgrades |
| Migration | Old repos read-only sources; PolyWordlot drop auth/server; TransWord keep admin behind client-side password |

## Architecture

```mermaid
flowchart TB
  subgraph shell [Platform shell]
    Map[World map gateway]
    Settings[Favorite languages settings]
    SW[Service worker + hash manifest]
    IDB[IndexedDB + per-game import/export]
  end
  subgraph build [Build pipeline]
    Scan[Scan per-game word trees]
    Hash[Hash assets + deployment-manifest]
  end
  subgraph games [Pluggable games]
    PW[polywordlot + its dicts]
    TW[transword + its corpora]
  end
  PW --> Scan
  TW --> Scan
  Scan --> Hash
  Hash --> SW
  Map --> PW
  Map --> TW
  Settings --> SW
  PW --> IDB
  TW --> IDB
  SW --> PW
  SW --> TW
```

### Repo layout (canonical: `wordaholic`)

- Site root / `public/`: shell HTML/CSS/JS, SW, manifest
- `app/shell/`, `app/storage/`, `app/updates/`, `app/i18n-prefs/`
- `games/polywordlot/` (UI + `dict/…` wordsets), `games/transword/` (UI + `data/languages/…`)
- `scripts/` build: sync/copy helpers, language catalog from game trees, hash → `deployment-manifest.json`
- Old repos (`mlw`, `transword`) remain **optional sources** for ports/sync; game trees in this repo are the deployable source of truth

### Navigation

- `/` — realistic world map (no flags); **game icons** placed from favorite languages
- `/games/polywordlot/…`, `/games/transword/…` (exact paths deferred but stable **game IDs**: `polywordlot`, `transword`)
- **Languages** dropdown: pick favorite languages (offline cache + map placement)
- Admin: TransWord admin UI kept; gated by a **single hardcoded client-side password** (changeable in source). On a static site this deters casual access only; it is not server-grade secrecy.

### Word data

- **Independence rule:** wordsets are separate per game and per language. PolyWordlot’s English set and TransWord’s English set are not one shared list at runtime or in git.
- Layout (original app shapes):
  - `games/polywordlot/dict/<Language>/<locale>/…`
  - `games/transword/data/languages/<Dir>/…`
- **Now:** each tree is populated/maintained independently (manual edits and/or `npm run sync-dicts` from sibling sources). All of these trees are **committed** as independent entities for Render builds.
- **Later (optional):** introduce a language-level word *superset* and automate generation of each game’s sets from it; generated outputs still land as separate checked-in trees under each game (no runtime merge of a central corpus).
- Shell `data/languages.json` is generated by scanning those per-game trees at build time

### Offline / updates

- First load: **“preparing offline…”** until shell + both games + favorite-language wordsets are cached
- `deployment-manifest.json` with content hashes (hashed filenames where practical)
- Online check → show what changed → mandatory upgrade with session-aware timing
- Persist schema IDs only where IndexedDB compatibility needs migration

### Game ports

| Game | Source | v1 approach |
|------|--------|-------------|
| PolyWordlot | `/Users/ilya/cursor/mlw` | Rewrite to vanilla; keep gameplay, daily/training, local stats/calendar; drop auth/API/Postgres |
| TransWord | `/Users/ilya/cursor/transword` | Port `graph.js` / `solver.js` / player UI; keep admin behind password gate |
| Memorandom | — | Skipped |

Reuse: mlw game logic/normalization/keyboard concepts; TransWord graph/solver and corpus levels; language.json patterns (keyboard, RTL, normalization).

### Persistence

- IndexedDB for results/stats/settings
- **Per-game** import/export; “smart preserve stats” rules discussed later
- Shell may share favorite-language prefs only

## Success criteria

- Airplane mode: map + both games playable for cached favorite languages
- Language sets can differ per game; PolyWordlot starts with its existing language set
- Online visit detects hashed changes and applies mandatory session-aware update
- Progress survives reload; per-game export/import works at a basic level
- New game can register via the plugin contract without rewriting the shell

## Implementation order

1. Scaffold static site + SW + manifest hashing + preparing-offline UX
2. Shell: map gateway, language home, favorites settings, plugin registry (full contract stubs)
3. Keep per-game word trees populated and committed; catalog scan at build
4. Port TransWord player + gated admin onto contract
5. PolyWordlot offline React port onto contract (local daily/training/stats)
6. IndexedDB + per-game import/export skeleton
7. Render static deploy wiring; domain `wordaholic.com` when purchased

## Parked / later

- Memorandom
- Language word **superset** + automated generation of per-game sets (outputs remain separate repo trees)
- Exact export merge/preservation rules
- Final URL path scheme and brand visual system beyond functional SVG map
- Hardening admin beyond client-side password (if ever needed)

## Risks

- PolyWordlot vanilla rewrite is the largest slice — mitigate by porting logic modules before UI chrome
- Large dictionaries + compression/SW caching need careful quota testing on mobile
- Client-side admin password is intentional soft gate only

## Implementation todos

- [ ] Scaffold wordaholic static shell, SW, hash manifest, preparing-offline UX
- [ ] World map language gateway, language home, favorite-language settings, plugin registry
- [x] Per-game word trees checked in; build catalogs by scanning them (no shared runtime corpus)
- [ ] Port TransWord player + password-gated admin to plugin contract
- [ ] PolyWordlot offline port (daily/training/local stats; no server)
- [ ] IndexedDB + per-game import/export skeleton
- [ ] Render static deploy wiring; prepare for wordaholic.com
