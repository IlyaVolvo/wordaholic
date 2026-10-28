import { browserId } from '../stats/plays.js';
import { getNickname } from '../identity/player.js';
import { loadScoreboardPrefs, saveScoreboardPrefs } from './prefs.js';

const NAMES = ['PolyWordlot', 'Transword', 'Hydra', 'Letterix'];
const PERIODS = [
  ['today', 'Today'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['lifetime', 'Lifetime'],
];

const $ = (sel) => document.querySelector(sel);

function localISO(date) {
  const z = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

function rangeFor(period) {
  const now = new Date();
  const today = localISO(now);
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return { from: localISO(start), to: today };
  }
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: '2020-01-01', to: today };
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

function labelOf(favorite) {
  const name = NAMES[favorite.game] || 'Game';
  const kind = favorite.board === 'best' ? ' best' : '';
  return `${name} ${favorite.language} ${favorite.variant}${kind}`;
}

async function loadCatalog() {
  const res = await fetch('/api/scoreboard/catalog', { cache: 'no-store' });
  if (!res.ok) throw new Error('catalog');
  const body = await res.json();
  return Array.isArray(body.combinations) ? body.combinations : [];
}

async function loadBoard(favorite, period, limit) {
  const range = rangeFor(period);
  const params = new URLSearchParams({
    game: String(favorite.game),
    language: favorite.language,
    variant: favorite.variant,
    board: favorite.board,
    from: range.from,
    to: range.to,
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
    : '<tbody><tr><td class="scoreboard-empty">No nicknamed finishes in this period.</td></tr></tbody>';
}

async function render() {
  const root = $('#boards');
  const prefs = loadScoreboardPrefs();
  const selfName = getNickname();
  const limitInput = /** @type {HTMLInputElement | null} */ ($('#limit'));
  if (limitInput) limitInput.value = String(prefs.limit);
  if (!prefs.favorites.length) {
    root.innerHTML = '<p class="scoreboard-empty">Choose a game below. It stays at the top of this page.</p>';
    return;
  }
  root.innerHTML = prefs.favorites
    .map(
      (favorite, index) => `
      <section class="scoreboard-favorite" data-index="${index}">
        <header>
          <h2>${escapeHtml(labelOf(favorite))}</h2>
          <button type="button" class="btn" data-remove="${index}">Remove</button>
        </header>
        <div class="scoreboard-periods">
          ${PERIODS.map(
            ([id, label]) =>
              `<label><input type="checkbox" data-period="${id}" data-index="${index}" ${
                favorite.periods.includes(id) ? 'checked' : ''
              }> ${label}</label>`
          ).join('')}
        </div>
        <div class="scoreboard-tables" data-tables="${index}">Loading…</div>
      </section>`
    )
    .join('');

  root.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-remove'));
      const next = loadScoreboardPrefs();
      next.favorites.splice(index, 1);
      saveScoreboardPrefs(next);
      void render();
    });
  });
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

  await Promise.all(
    prefs.favorites.map(async (favorite, index) => {
      const host = root.querySelector(`[data-tables="${index}"]`);
      if (!host) return;
      const blocks = await Promise.all(
        favorite.periods.map(async (period) => {
          try {
            const board = await loadBoard(favorite, period, prefs.limit);
            const table = document.createElement('table');
            paintRows(table, board, favorite.game, selfName);
            const title = PERIODS.find(([id]) => id === period)?.[1] || period;
            return `<h3>${title}</h3>${table.outerHTML}`;
          } catch {
            return `<h3>${period}</h3><p class="scoreboard-empty">The scoreboard could not be loaded.</p>`;
          }
        })
      );
      host.innerHTML = blocks.join('');
    })
  );
}

function addFavorite(combo, board) {
  const prefs = loadScoreboardPrefs();
  const favorite = {
    id: crypto.randomUUID(),
    game: combo.game,
    language: combo.language,
    variant: combo.variant,
    board: combo.game === 3 && board === 'best' ? 'best' : 'average',
    periods: ['today'],
  };
  const same = prefs.favorites.find(
    (item) =>
      item.game === favorite.game &&
      item.language === favorite.language &&
      item.variant === favorite.variant &&
      item.board === favorite.board
  );
  if (!same) prefs.favorites.push(favorite);
  saveScoreboardPrefs(prefs);
  void render();
}

async function fillCatalog() {
  const select = /** @type {HTMLSelectElement | null} */ ($('#catalog'));
  if (!select) return;
  select.innerHTML = '<option value="">Games with a finished play</option>';
  try {
    const combinations = await loadCatalog();
    for (const combo of combinations) {
      const option = document.createElement('option');
      option.value = JSON.stringify(combo);
      option.textContent = labelOf({ ...combo, board: 'average' });
      select.appendChild(option);
    }
  } catch {
    select.innerHTML = '<option value="">Scoreboard unavailable</option>';
  }
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
  $('#add')?.addEventListener('click', () => {
    const select = /** @type {HTMLSelectElement | null} */ ($('#catalog'));
    if (!select?.value) return;
    const board = /** @type {HTMLSelectElement | null} */ ($('#board-kind'))?.value || 'average';
    addFavorite(JSON.parse(select.value), board);
  });
}

bind();
void fillCatalog();
void render();
