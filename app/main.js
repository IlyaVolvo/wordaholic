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
import { AUTHOR_EMAIL } from './shell/author.js';
import { downloadSiteBackup, exportSiteBackup, importSiteBackup } from './shell/site-backup.js';
import {
  AUTO_EXPORT_STATUS_EVENT,
  applyAutoExportBadge,
  getAutoExportStatus,
  getBackupOrigin,
  openAutoExportPanel,
  runHomeAutoExport,
} from './shell/auto-export.js';
import { reloadLatestFromServer } from './updates/reload-latest.js';
import { openHelp } from './help/dialog.js';
import { reportStats } from './stats/report.js';

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
  languages: ['en', 'es', 'fr', 'ru', 'de'],
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

function gameNamesForLanguage(lang) {
  return listGames()
    .filter((g) => (lang.games || []).includes(g.id) && (g.languages || []).includes(lang.code))
    .map((g) => g.name);
}

function renderFavoritesChrome() {
  const favorites = favoriteLanguageObjects();
  renderFavoriteChips();
  renderGameRail($('#game-rail'), {
    games: listGames(),
    favoriteLanguages: favorites,
    onGameSelect: (gameId, langCodes) => openGame(gameId, langCodes),
  });
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
    .map((l) => {
      const gameNames = gameNamesForLanguage(l);
      const tip = gameNames.length
        ? `<span class="fav-chip-tip" role="tooltip">${gameNames
            .map((n) => `<span class="fav-chip-tip-game">${n}</span>`)
            .join('')}</span>`
        : '';
      return `
      <span class="fav-chip" tabindex="0" data-code="${l.code}">
        <span class="fav-chip-flag">${l.flag || ''}</span>
        <span class="fav-chip-name">${l.menu}</span>
        ${tip}
      </span>`;
    })
    .join('');
}

async function renderGateway() {
  const favorites = favoriteLanguageObjects();
  renderFavoritesChrome();
  const languageMenus = Object.fromEntries(allLanguages.map((l) => [l.code, l.menu]));
  let autoExportEnabled = false;
  let autoExportOutOfSync = false;
  try {
    const status = await getAutoExportStatus();
    autoExportEnabled = status.enabled;
    autoExportOutOfSync = status.outOfSync;
  } catch {
    autoExportEnabled = false;
    autoExportOutOfSync = false;
  }
  await renderWorldMap($('#map-root'), {
    favoriteLanguages: favorites,
    supportedLanguageCodes: allLanguages.map((l) => l.code),
    languageMenus,
    autoExportEnabled,
    autoExportOutOfSync,
    onFavoriteLanguages: async (codes) => {
      const current = getFavoriteLanguages();
      const added = codes.filter((code) => !current.includes(code));
      if (!added.length) return;
      const next = [...current, ...added];
      await setFavoriteLanguages(next);
      reportStats({ languages: Object.fromEntries(added.map((code) => [code, 1])) });
      renderFavoritesChrome();
      showPreparing().catch((err) => console.warn('Offline prep failed', err));
    },
    onUnfavoriteLanguages: async (codes) => {
      const remove = new Set(codes);
      const current = getFavoriteLanguages();
      const removed = current.filter((code) => remove.has(code));
      if (!removed.length) return;
      const next = current.filter((code) => !remove.has(code));
      await setFavoriteLanguages(next);
      reportStats({ languages: Object.fromEntries(removed.map((code) => [code, 1])) });
      renderFavoritesChrome();
      showPreparing().catch((err) => console.warn('Offline prep failed', err));
    },
    onExportData: async () => {
      try {
        let origin;
        try {
          origin = await getBackupOrigin();
        } catch {
          origin = undefined;
        }
        const payload = await exportSiteBackup({ origin });
        await downloadSiteBackup(payload);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Export failed');
      }
    },
    onAutoExport: () => {
      void openAutoExportPanel();
    },
    onImportData: async (file) => {
      try {
        const text = await file.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error('File is not valid JSON');
        }
        await importSiteBackup(payload);
        await renderGateway();
        showPreparing().catch((err) => console.warn('Offline prep failed', err));
        runHomeAutoExport().catch((err) => console.warn('Auto export failed', err));
        alert('Import complete');
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Import failed');
      }
    },
    onReloadLatest: async () => {
      try {
        await reloadLatestFromServer();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Reload failed');
      }
    },
    onFeedback: () => {
      const dialog = $('#feedback-dialog');
      const text = $('#feedback-text');
      const status = $('#feedback-status');
      const emailEl = $('#feedback-author-email');
      if (emailEl) emailEl.textContent = AUTHOR_EMAIL;
      if (text) text.value = '';
      if (status) {
        status.hidden = true;
        status.textContent = '';
        status.classList.remove('feedback-status--hint');
      }
      if (dialog) dialog.hidden = false;
    },
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
  void setLastLanguage(primary);
  const qs = new URLSearchParams({
    lang: primary,
    langs: langCodes.join(','),
  });
  location.href = `/games/${gameId}/?${qs.toString()}`;
}

async function paintHome() {
  allLanguages = await loadLanguages();
  await renderGateway();
  showView('map');
  reportStats({ homeHits: 1 });
  runHomeAutoExport().catch((err) => console.warn('Auto export failed', err));
}

let chromeBound = false;

function bindChrome() {
  if (chromeBound) return;
  chromeBound = true;

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
  $('#btn-howto')?.addEventListener('click', () => {
    openHelp('site');
  });
  aboutDialog?.querySelectorAll('[data-about-close]').forEach((el) => {
    el.addEventListener('click', closeAbout);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (aboutDialog && !aboutDialog.hidden) closeAbout();
    const feedbackDialog = $('#feedback-dialog');
    if (feedbackDialog && !feedbackDialog.hidden) feedbackDialog.hidden = true;
    document.querySelector('[data-auto-export-panel]')?.remove();
  });

  const feedbackDialog = $('#feedback-dialog');
  const feedbackText = /** @type {HTMLTextAreaElement | null} */ ($('#feedback-text'));
  const feedbackStatus = $('#feedback-status');

  /**
   * @param {string} value
   * @param {string} okMessage
   */
  async function copyText(value, okMessage) {
    try {
      await navigator.clipboard.writeText(value);
      if (feedbackStatus) {
        feedbackStatus.hidden = false;
        feedbackStatus.textContent = okMessage;
        feedbackStatus.classList.add('feedback-status--hint');
      }
    } catch {
      if (feedbackStatus) {
        feedbackStatus.hidden = false;
        feedbackStatus.textContent = value;
        feedbackStatus.classList.remove('feedback-status--hint');
      }
    }
  }

  const closeFeedback = () => {
    if (feedbackDialog) feedbackDialog.hidden = true;
  };
  feedbackDialog?.querySelectorAll('[data-feedback-close]').forEach((el) => {
    el.addEventListener('click', closeFeedback);
  });
  $('#btn-feedback-copy')?.addEventListener('click', () => {
    void copyText(AUTHOR_EMAIL, `Copied ${AUTHOR_EMAIL}`);
  });
  window.addEventListener(AUTO_EXPORT_STATUS_EVENT, () => {
    void getAutoExportStatus()
      .then((status) => {
        applyAutoExportBadge(document.querySelector('[data-transfer="auto-export"]'), status);
      })
      .catch(() => {});
  });

  $('#btn-feedback-copy-note')?.addEventListener('click', () => {
    const note = (feedbackText?.value || '').trim();
    if (!note) {
      if (feedbackStatus) {
        feedbackStatus.hidden = false;
        feedbackStatus.textContent = 'Write a note first, or just copy the address.';
        feedbackStatus.classList.remove('feedback-status--hint');
      }
      return;
    }
    void copyText(note, 'Note copied — paste it into your email.');
  });
}

async function boot() {
  bindChrome();
  await paintHome();

  try {
    const before = getFavoriteLanguages().join(',');
    await initFavorites();
    if (getFavoriteLanguages().join(',') !== before) {
      await renderGateway();
    }
  } catch (err) {
    console.warn('Favorites init failed', err);
  }

  showPreparing().catch((err) => console.warn('Offline prep failed', err));
  checkForUpdates(document.body).catch(() => {});
}

window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  void paintHome().catch((err) => console.warn('Restore home failed', err));
});

boot().catch((err) => {
  console.error(err);
  const label = $('#prep-label');
  if (label) {
    label.textContent = `Startup error: ${err.message}`;
    $('#prep-overlay').hidden = false;
  }
});
