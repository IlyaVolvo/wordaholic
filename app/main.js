import { registerGame, listGames } from './games-contract.js';
import { loadLanguages } from './shell/languages.js';
import { renderWorldMap, renderGameRail } from './shell/map.js';
import { prepareOffline } from './shell/offline-prep.js';
import { checkForUpdates } from './shell/update-ui.js';
import {
  initFavorites,
  getFavoriteLanguages,
  setFavoriteLanguages,
  getLastLanguage,
  setLastLanguage,
} from './i18n-prefs/favorites.js';
import { storage } from './storage/idb.js';

registerGame({
  id: 'polywordlot',
  name: 'PolyWordlot',
  storageSchema: 1,
  languages: ['en', 'ru', 'fr', 'es', 'he', 'hy', 'de'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
});

registerGame({
  id: 'transword',
  name: 'TransWord',
  storageSchema: 1,
  languages: ['en', 'es', 'fr', 'ru', 'hy', 'he', 'de'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
});

const $ = (sel) => document.querySelector(sel);

/** @type {import('./shell/languages.js').LanguageInfo[]} */
let allLanguages = [];

async function showPreparing() {
  const overlay = $('#prep-overlay');
  const bar = $('#prep-bar');
  const label = $('#prep-label');
  overlay.hidden = false;
  try {
    await prepareOffline((pct, text) => {
      bar.style.width = `${pct}%`;
      label.textContent = text;
    });
  } finally {
    overlay.hidden = true;
  }
}

function showView(name) {
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.hidden = el.getAttribute('data-view') !== name;
  });
}

function favoriteLanguageObjects() {
  const fav = new Set(getFavoriteLanguages());
  return allLanguages.filter((l) => fav.has(l.code));
}

function renderFavoriteChips() {
  const host = $('#fav-chips');
  if (!host) return;
  const favorites = favoriteLanguageObjects();
  if (!favorites.length) {
    host.innerHTML = `<span class="fav-chips-empty">Click a country to pick languages</span>`;
    return;
  }
  host.innerHTML = favorites
    .map(
      (l) => `
      <span class="fav-chip" title="${l.menu}" data-code="${l.code}">
        <span class="fav-chip-flag">${l.flag || ''}</span>
        <span class="fav-chip-name">${l.menu}</span>
      </span>`
    )
    .join('');
}

async function renderGateway() {
  const favorites = favoriteLanguageObjects();
  renderFavoriteChips();
  const languageMenus = Object.fromEntries(allLanguages.map((l) => [l.code, l.menu]));
  await renderWorldMap($('#map-root'), {
    favoriteLanguages: favorites,
    supportedLanguageCodes: allLanguages.map((l) => l.code),
    languageMenus,
    onFavoriteLanguages: async (codes) => {
      const current = getFavoriteLanguages();
      const next = [...current];
      for (const code of codes) {
        if (!next.includes(code)) next.push(code);
      }
      if (next.length === current.length) return;
      await setFavoriteLanguages(next);
      await renderGateway();
      showPreparing().catch((err) => console.warn('Offline prep failed', err));
    },
    onUnfavoriteLanguages: async (codes) => {
      const remove = new Set(codes);
      const current = getFavoriteLanguages();
      const next = current.filter((code) => !remove.has(code));
      if (next.length === current.length) return;
      await setFavoriteLanguages(next);
      await renderGateway();
      showPreparing().catch((err) => console.warn('Offline prep failed', err));
    },
  });
  renderGameRail($('#game-rail'), {
    games: listGames(),
    favoriteLanguages: favorites,
    onGameSelect: (gameId, langCodes) => openGame(gameId, langCodes),
  });
}

/**
 * Launch game in its own UI with preferred languages passed through.
 * @param {string} gameId
 * @param {string[]} langCodes
 */
async function openGame(gameId, langCodes) {
  const game = listGames().find((g) => g.id === gameId);
  if (!game || !langCodes.length) return;

  const last = getLastLanguage();
  const primary = langCodes.includes(last) ? last : langCodes[0];
  await setLastLanguage(primary);
  const qs = new URLSearchParams({
    lang: primary,
    langs: langCodes.join(','),
  });
  location.href = `/games/${gameId}/?${qs.toString()}`;
}

async function boot() {
  await storage.open();
  await initFavorites();

  allLanguages = await loadLanguages();
  await renderGateway();
  showView('map');

  showPreparing().catch((err) => console.warn('Offline prep failed', err));

  const aboutDialog = $('#about-dialog');
  const openAbout = async () => {
    aboutDialog.hidden = false;
    try {
      const res = await fetch('/deployment-manifest.json', { cache: 'no-store' });
      if (res.ok) {
        const manifest = await res.json();
        const commitEl = $('#about-commit');
        const builtEl = $('#about-built');
        if (commitEl) commitEl.textContent = manifest.commit || '—';
        if (builtEl) {
          builtEl.textContent = manifest.builtAt
            ? new Date(manifest.builtAt).toLocaleString()
            : '—';
        }
      }
    } catch {
      /* keep placeholders */
    }
  };
  const closeAbout = () => {
    aboutDialog.hidden = true;
  };
  $('#btn-about')?.addEventListener('click', () => {
    void openAbout();
  });
  aboutDialog?.querySelectorAll('[data-about-close]').forEach((el) => {
    el.addEventListener('click', closeAbout);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aboutDialog && !aboutDialog.hidden) closeAbout();
  });

  checkForUpdates(document.body).catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  const label = $('#prep-label');
  if (label) {
    label.textContent = `Startup error: ${err.message}`;
    $('#prep-overlay').hidden = false;
  }
});
