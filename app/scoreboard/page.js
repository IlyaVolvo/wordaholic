import { browserId } from '../stats/plays.js';
import { getNickname } from '../identity/player.js';
import { loadLanguages } from '../shell/languages.js';
import { loadScoreboardPrefs, saveScoreboardPrefs } from './prefs.js';

const NAMES = ['PolyWordlot', 'TransWord', 'Hydra', 'Letterix'];
const PERIODS = [
  ['today', 'Today'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['lifetime', 'Lifetime'],
];

const $ = (sel) => document.querySelector(sel);

/** @type {{ game: number, language: string, variant: string }[]} */
let catalog = [];
/** @type {Map<string, string>} */
let languageNames = new Map();

function localISO(date) {
  const z = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

function parseLocalISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function mondayOf(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function weekInputValue(mondayISO) {
  const monday = parseLocalISO(mondayISO);
  const year = addDays(monday, 3).getFullYear();
  const week1 = mondayOf(new Date(year, 0, 4));
  const week = 1 + Math.round((monday.getTime() - week1.getTime()) / 86400000 / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function mondayFromWeekInput(value) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value || '');
  if (!match) return '';
  const week1 = mondayOf(new Date(Number(match[1]), 0, 4));
  return localISO(addDays(week1, (Number(match[2]) - 1) * 7));
}

/**
 * @param {string} period
 * @param {{ weekOf?: string, monthOf?: string, yearOf?: number }} favorite
 */
function rangeFor(period, favorite) {
  const today = localISO(new Date());
  if (period === 'today') return { from: today, to: today, gate: 'share' };
  if (period === 'lifetime') return { from: '2020-01-01', to: today, gate: 'lifetime' };
  if (period === 'week') {
    const monday = favorite.weekOf ? mondayOf(parseLocalISO(favorite.weekOf)) : mondayOf(new Date());
    const from = localISO(monday);
    if (from > today) return null;
    const end = localISO(addDays(monday, 6));
    return { from, to: end < today ? end : today, gate: 'share' };
  }
  if (period === 'month') {
    const month = favorite.monthOf || today.slice(0, 7);
    const [year, monthNum] = month.split('-').map(Number);
    const from = `${month}-01`;
    if (from > today) return null;
    const end = localISO(new Date(year, monthNum, 0));
    return { from, to: end < today ? end : today, gate: 'share' };
  }
  if (period === 'year') {
    const year = favorite.yearOf || Number(today.slice(0, 4));
    const from = `${year}-01-01`;
    if (from > today) return null;
    const end = `${year}-12-31`;
    return { from, to: end < today ? end : today, gate: 'share' };
  }
  return { from: today, to: today, gate: 'share' };
}

function periodHeading(period, range) {
  if (!range) return PERIODS.find(([id]) => id === period)?.[1] || period;
  if (period === 'week') {
    const start = parseLocalISO(range.from);
    const label = start.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${label}`;
  }
  if (period === 'month') {
    const start = parseLocalISO(range.from);
    return start.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  }
  if (period === 'year') return range.from.slice(0, 4);
  return PERIODS.find(([id]) => id === period)?.[1] || period;
}

function gateNote(range) {
  if (!range) return '';
  if (range.gate === 'lifetime') return 'At least 50 games.';
  if (range.gate !== 'share' || range.from === range.to) return '';
  const days = Math.round((parseLocalISO(range.to) - parseLocalISO(range.from)) / 86400000) + 1;
  const need = Math.ceil(days / 2);
  return `At least ${need} of ${days} games.`;
}

function formatValue(game, value) {
  if (game === 1) {
    const sec = Math.max(0, Math.round(Number(value) / 1000));
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  const rounded = Math.round(Number(value) * 100) / 100;
  return String(rounded);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function languageLabel(code) {
  return languageNames.get(code) || code;
}

/**
 * @param {number} game
 * @param {string} key variant, or variant|best for Letterix
 */
function paramLabel(game, key) {
  if (key === 'all') return 'All';
  if (game === 0) return `${key} letters`;
  if (game === 2) {
    const [length, boards] = key.split(',');
    return `${length} letters, ${boards} boards`;
  }
  if (game === 1) {
    const [vocab, difficulty] = key.split(',');
    const vocabLabel = Number(vocab) <= 1 ? 'Basic' : 'Standard';
    const level = Number(difficulty);
    const difficultyLabel = level <= 3 ? 'Easy' : level <= 5 ? 'Medium' : 'Hard';
    return `${vocabLabel}, ${difficultyLabel} (${difficulty})`;
  }
  if (game === 3) {
    const [size, kind] = key.split('|');
    const [width, height] = String(size || '').split(',');
    return `${width}×${height}, ${kind === 'best' ? 'best' : 'average'}`;
  }
  return key;
}

function boardTitle(favorite) {
  const name = NAMES[favorite.game] || 'Game';
  const languages = favorite.languages.map(languageLabel).join(', ');
  return `${name} · ${languages} · ${paramLabel(favorite.game, favorite.params)}`;
}

/**
 * @param {{ game: number, languages: string[], params: string }} favorite
 */
function slicesFor(favorite) {
  if (favorite.params === 'all') {
    const matches = catalog.filter(
      (row) => row.game === favorite.game && favorite.languages.includes(row.language)
    );
    if (favorite.game === 3) {
      return matches.flatMap((row) => [
        { language: row.language, variant: row.variant, board: 'average' },
        { language: row.language, variant: row.variant, board: 'best' },
      ]);
    }
    return matches.map((row) => ({ language: row.language, variant: row.variant, board: 'average' }));
  }
  const [variant, kind] = favorite.params.split('|');
  const board = favorite.game === 3 && kind === 'best' ? 'best' : 'average';
  return favorite.languages.map((language) => ({ language, variant, board }));
}

function sliceLabel(game, slice) {
  const key = game === 3 && slice.board === 'best' ? `${slice.variant}|best` : slice.variant;
  return `${languageLabel(slice.language)} · ${paramLabel(game, key)}`;
}

async function loadCatalog() {
  const res = await fetch('/api/scoreboard/catalog', { cache: 'no-store' });
  if (!res.ok) throw new Error('catalog');
  const body = await res.json();
  return Array.isArray(body.combinations) ? body.combinations : [];
}

async function loadBoard(game, slice, range, limit) {
  const params = new URLSearchParams({
    game: String(game),
    language: slice.language,
    variant: slice.variant,
    board: slice.board,
    from: range.from,
    to: range.to,
    gate: range.gate,
    limit: String(limit),
    browserId: browserId(),
  });
  const res = await fetch(`/api/scoreboard?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('board');
  return res.json();
}

function rowHtml(row, selfName) {
  const mine = selfName && row.nickname.toLowerCase() === selfName.toLowerCase();
  return `<tr class="${mine ? 'is-self' : ''}">
    <td>${row.place}</td>
    <td>${escapeHtml(row.nickname)}</td>
    <td>${escapeHtml(row.valueText)}</td>
    <td>${row.puzzles}</td>
  </tr>`;
}

function paintRows(table, board, game, selfName) {
  const rows = (board.top || []).map((row) => ({ ...row, valueText: formatValue(game, row.value) }));
  const extra =
    board.self && !rows.some((row) => row.nickname.toLowerCase() === board.self.nickname.toLowerCase())
      ? { ...board.self, valueText: formatValue(game, board.self.value) }
      : null;
  const body = rows.map((row) => rowHtml(row, selfName)).join('');
  const extraHtml = extra ? rowHtml(extra, selfName) : '';
  table.innerHTML = body || extraHtml
    ? `<thead><tr><th>Place</th><th>Name</th><th>Score</th><th>Puzzles</th></tr></thead><tbody>${body}${extraHtml}</tbody>`
    : '<tbody><tr><td class="scoreboard-empty">No player has enough games for this board.</td></tr></tbody>';
}

function paintSaved() {
  const list = $('#saved-boards');
  if (!list) return;
  const prefs = loadScoreboardPrefs();
  if (!prefs.favorites.length) {
    list.innerHTML = '<li class="scoreboard-empty">None yet.</li>';
    return;
  }
  list.innerHTML = prefs.favorites
    .map(
      (favorite) => `<li>
        <span>${escapeHtml(boardTitle(favorite))}</span>
        <button type="button" class="btn" data-remove-id="${escapeHtml(favorite.id)}">Remove</button>
      </li>`
    )
    .join('');
  list.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-remove-id');
      const next = loadScoreboardPrefs();
      next.favorites = next.favorites.filter((favorite) => favorite.id !== id);
      saveScoreboardPrefs(next);
      paintSaved();
      void render();
    });
  });
}

function periodControls(favorite, index) {
  const today = localISO(new Date());
  const weekOf = favorite.weekOf || localISO(mondayOf(new Date()));
  const monthOf = favorite.monthOf || today.slice(0, 7);
  const yearOf = favorite.yearOf || Number(today.slice(0, 4));
  const maxYear = Number(today.slice(0, 4));
  return PERIODS.map(([id, label]) => {
    const checked = favorite.periods.includes(id) ? 'checked' : '';
    const box = `<label><input type="checkbox" data-period="${id}" data-index="${index}" ${checked}> ${label}</label>`;
    if (id === 'week') {
      return `<span class="scoreboard-period">${box}<input type="week" data-span="week" data-index="${index}" max="${weekInputValue(localISO(mondayOf(new Date())))}" value="${weekInputValue(weekOf)}" aria-label="Week"></span>`;
    }
    if (id === 'month') {
      return `<span class="scoreboard-period">${box}<input type="month" data-span="month" data-index="${index}" max="${today.slice(0, 7)}" value="${monthOf}" aria-label="Month"></span>`;
    }
    if (id === 'year') {
      return `<span class="scoreboard-period">${box}<input type="number" data-span="year" data-index="${index}" min="2020" max="${maxYear}" value="${yearOf}" aria-label="Year"></span>`;
    }
    return `<span class="scoreboard-period">${box}</span>`;
  }).join('');
}

async function render() {
  const root = $('#boards');
  const prefs = loadScoreboardPrefs();
  const selfName = getNickname();
  const limitInput = /** @type {HTMLInputElement | null} */ ($('#limit'));
  if (limitInput && document.activeElement !== limitInput) limitInput.value = String(prefs.limit);
  paintSaved();
  if (!prefs.favorites.length) {
    root.innerHTML = '<p class="scoreboard-empty">Add a scoreboard in Settings.</p>';
    return;
  }
  root.innerHTML = prefs.favorites
    .map((favorite, index) => {
      const slices = slicesFor(favorite);
      return `
      <section class="scoreboard-favorite" data-index="${index}">
        <header>
          <h2>${escapeHtml(boardTitle(favorite))}</h2>
        </header>
        <div class="scoreboard-periods">
          ${periodControls(favorite, index)}
        </div>
        <div class="scoreboard-tables" data-tables="${index}">${
          slices.length ? 'Loading…' : '<p class="scoreboard-empty">No finished games match this scoreboard.</p>'
        }</div>
      </section>`;
    })
    .join('');

  root.querySelectorAll('[data-period]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.getAttribute('data-index'));
      const period = input.getAttribute('data-period');
      const next = loadScoreboardPrefs();
      const favorite = next.favorites[index];
      if (!favorite || !period) return;
      const set = new Set(favorite.periods);
      if (input instanceof HTMLInputElement && input.checked) set.add(period);
      else set.delete(period);
      favorite.periods = PERIODS.map(([id]) => id).filter((id) => set.has(id));
      if (!favorite.periods.length) favorite.periods = ['today'];
      saveScoreboardPrefs(next);
      void render();
    });
  });
  root.querySelectorAll('[data-span]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.getAttribute('data-index'));
      const span = input.getAttribute('data-span');
      const next = loadScoreboardPrefs();
      const favorite = next.favorites[index];
      if (!favorite || !(input instanceof HTMLInputElement) || !span) return;
      if (span === 'week') favorite.weekOf = mondayFromWeekInput(input.value);
      if (span === 'month') favorite.monthOf = /^\d{4}-\d{2}$/.test(input.value) ? input.value : '';
      if (span === 'year') favorite.yearOf = Number(input.value);
      saveScoreboardPrefs(next);
      void render();
    });
  });

  await Promise.all(
    prefs.favorites.map(async (favorite, index) => {
      const host = root.querySelector(`[data-tables="${index}"]`);
      const slices = slicesFor(favorite);
      if (!host || !slices.length) return;
      const blocks = await Promise.all(
        slices.map(async (slice) => {
          const heading = `<h3>${escapeHtml(sliceLabel(favorite.game, slice))}</h3>`;
          const periods = await Promise.all(
            favorite.periods.map(async (period) => {
              const range = rangeFor(period, favorite);
              const title = periodHeading(period, range);
              const note = gateNote(range);
              const noteHtml = note ? `<p class="scoreboard-gate">${escapeHtml(note)}</p>` : '';
              if (!range) return `<h4>${escapeHtml(title)}</h4>${noteHtml}<p class="scoreboard-empty">That period has not started.</p>`;
              try {
                const board = await loadBoard(favorite.game, slice, range, prefs.limit);
                const table = document.createElement('table');
                paintRows(table, board, favorite.game, selfName);
                return `<h4>${escapeHtml(title)}</h4>${noteHtml}${table.outerHTML}`;
              } catch {
                return `<h4>${escapeHtml(title)}</h4>${noteHtml}<p class="scoreboard-empty">The scoreboard could not be loaded.</p>`;
              }
            })
          );
          return heading + periods.join('');
        })
      );
      host.innerHTML = blocks.join('');
    })
  );
}

function selectedGame() {
  const raw = /** @type {HTMLSelectElement | null} */ ($('#game'))?.value;
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function checkedLanguages() {
  return [...document.querySelectorAll('#languages input:checked')].map((input) =>
    /** @type {HTMLInputElement} */ (input).value
  );
}

function paramChoices(game, languages) {
  const rows = catalog.filter((row) => row.game === game && (!languages.length || languages.includes(row.language)));
  const keys = new Set();
  for (const row of rows) {
    if (game === 3) {
      keys.add(row.variant);
      keys.add(`${row.variant}|best`);
    } else keys.add(row.variant);
  }
  return [...keys];
}

function paintGameChoices() {
  const select = /** @type {HTMLSelectElement | null} */ ($('#game'));
  const languages = $('#languages');
  const params = $('#params');
  const error = $('#add-error');
  if (!select || !languages || !params) return;
  if (error) error.textContent = '';
  const games = [...new Set(catalog.map((row) => row.game))].sort((a, b) => a - b);
  if (!games.length) {
    select.innerHTML = '<option value="">No finished games yet</option>';
    languages.innerHTML = '';
    params.innerHTML = '';
    return;
  }
  select.innerHTML = games
    .map((game) => `<option value="${game}">${escapeHtml(NAMES[game] || 'Game')}</option>`)
    .join('');
  paintLanguageChoices();
}

function paintLanguageChoices() {
  const game = selectedGame();
  const host = $('#languages');
  if (!host || game == null) return;
  const codes = [...new Set(catalog.filter((row) => row.game === game).map((row) => row.language))];
  codes.sort((a, b) => languageLabel(a).localeCompare(languageLabel(b)));
  host.innerHTML = codes
    .map(
      (code) =>
        `<label class="scoreboard-check"><input type="checkbox" value="${escapeHtml(code)}" checked> ${escapeHtml(languageLabel(code))}</label>`
    )
    .join('');
  host.querySelectorAll('input').forEach((input) => input.addEventListener('change', paintParamChoices));
  paintParamChoices();
}

function paintParamChoices() {
  const game = selectedGame();
  const host = $('#params');
  if (!host || game == null) return;
  const previous = /** @type {HTMLInputElement | null} */ (host.querySelector('input:checked'))?.value || 'all';
  const keys = paramChoices(game, checkedLanguages());
  const options = ['all', ...keys];
  host.innerHTML = options
    .map(
      (key) =>
        `<label class="scoreboard-check"><input type="radio" name="scoreboard-params" value="${escapeHtml(key)}" ${
          key === previous || (previous !== 'all' && !options.includes(previous) && key === 'all') ? 'checked' : ''
        }> ${escapeHtml(paramLabel(game, key))}</label>`
    )
    .join('');
  if (!host.querySelector('input:checked')) {
    const first = /** @type {HTMLInputElement | null} */ (host.querySelector('input'));
    if (first) first.checked = true;
  }
}

function addScoreboard() {
  const error = $('#add-error');
  const game = selectedGame();
  const languages = checkedLanguages();
  const params = /** @type {HTMLInputElement | null} */ ($('#params input:checked'))?.value || 'all';
  if (game == null || !catalog.some((row) => row.game === game)) {
    if (error) error.textContent = 'Choose a game.';
    return;
  }
  if (!languages.length) {
    if (error) error.textContent = 'Choose at least one language.';
    return;
  }
  if (error) error.textContent = '';
  const prefs = loadScoreboardPrefs();
  const favorite = {
    id: crypto.randomUUID(),
    game,
    languages,
    params,
    periods: ['today'],
  };
  const same = prefs.favorites.find(
    (item) =>
      item.game === favorite.game &&
      item.params === favorite.params &&
      item.languages.length === favorite.languages.length &&
      item.languages.every((code) => favorite.languages.includes(code))
  );
  if (!same) prefs.favorites.push(favorite);
  saveScoreboardPrefs(prefs);
  void render();
}

function openSettings() {
  $('#settings-dialog')?.removeAttribute('hidden');
}

function closeSettings() {
  $('#settings-dialog')?.setAttribute('hidden', '');
}

function bind() {
  $('#limit')?.addEventListener('change', (event) => {
    const value = Number(/** @type {HTMLInputElement} */ (event.target).value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    const prefs = loadScoreboardPrefs();
    prefs.limit = value;
    saveScoreboardPrefs(prefs);
    void render();
  });
  $('#game')?.addEventListener('change', paintLanguageChoices);
  $('#add')?.addEventListener('click', addScoreboard);
  $('#settings')?.addEventListener('click', openSettings);
  document.querySelectorAll('[data-settings-close]').forEach((el) => el.addEventListener('click', closeSettings));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSettings();
  });
}

async function start() {
  bind();
  try {
    const languages = await loadLanguages();
    languageNames = new Map(languages.map((language) => [language.code, language.menu]));
  } catch {
    languageNames = new Map();
  }
  try {
    catalog = await loadCatalog();
  } catch {
    catalog = [];
    const select = $('#game');
    if (select) select.innerHTML = '<option value="">Scoreboard unavailable</option>';
  }
  paintGameChoices();
  void render();
}

void start();
