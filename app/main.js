import { registerGame, listGames } from './games-contract.js';
import { loadLanguages } from './shell/languages.js';
import { renderWorldMap, renderGameRail } from './shell/map.js';
import { prepareOffline } from './shell/offline-prep.js';
import { checkForUpdates } from './shell/update-ui.js';
import {
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

async function renderGateway() {
  const favorites = favoriteLanguageObjects();
  await renderWorldMap($('#map-root'), { favoriteLanguages: favorites });
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
function openGame(gameId, langCodes) {
  const game = listGames().find((g) => g.id === gameId);
  if (!game || !langCodes.length) return;

  const last = getLastLanguage();
  const primary = langCodes.includes(last) ? last : langCodes[0];
  setLastLanguage(primary);
  const qs = new URLSearchParams({
    lang: primary,
    langs: langCodes.join(','),
  });
  location.href = `/games/${gameId}/?${qs.toString()}`;
}

function renderLanguageMenu() {
  const fav = new Set(getFavoriteLanguages());
  const box = $('#fav-list');
  box.innerHTML = allLanguages
    .map(
      (l) => `
      <label class="fav-row">
        <input type="checkbox" value="${l.code}" ${fav.has(l.code) ? 'checked' : ''}/>
        <span>${l.flag || ''} ${l.menu}</span>
      </label>`
    )
    .join('');
}

function setLanguagesMenuOpen(open) {
  const menu = $('#lang-menu');
  const btn = $('#btn-languages');
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

async function boot() {
  await storage.open();

  allLanguages = await loadLanguages();
  renderLanguageMenu();
  await renderGateway();
  showView('map');

  showPreparing().catch((err) => console.warn('Offline prep failed', err));

  $('#btn-languages').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('#lang-menu').hidden;
    if (open) renderLanguageMenu();
    setLanguagesMenuOpen(open);
  });

  $('#btn-save-fav').addEventListener('click', async () => {
    const codes = [...$('#fav-list').querySelectorAll('input:checked')].map((el) => el.value);
    setFavoriteLanguages(codes);
    setLanguagesMenuOpen(false);
    await renderGateway();
    showPreparing().catch((err) => console.warn('Offline prep failed', err));
  });

  document.addEventListener('click', (e) => {
    const dd = $('#lang-dropdown');
    if (!dd.contains(e.target)) setLanguagesMenuOpen(false);
  });

  checkForUpdates(document.body).catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  const label = $('#prep-label');
  if (label) label.textContent = `Startup error: ${err.message}`;
});
