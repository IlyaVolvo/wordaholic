import { browserId } from '../stats/plays.js';
import { getNickname } from '../identity/player.js';
import { loadLanguages } from '../shell/languages.js';
import '../game-registry.js';
import { listGames } from '../games-contract.js';
import { definitionsForGame, gameIdForKey, qualificationLine, resolveDefinition } from '../../scripts/scoreboard-defs.js';
import { loadScoreboardPrefs, saveScoreboardPrefs } from './prefs.js';
import {
  addCustomGroup,
  dropTable,
  layoutMode,
  moveTable,
  placeNewTable,
  removeEmptyGroup,
  setArrangement,
  viewGroups,
} from './layout.js';

const $ = (sel) => document.querySelector(sel);

/** @type {Map<string, { code: string, menu?: string, polywordlotLengths?: number[] }>} */
let languageByCode = new Map();
/** @type {ReturnType<typeof loadScoreboardPrefs>} */
let prefs = loadScoreboardPrefs();
/** @type {string} */
let addGame = '';
/** @type {string} */
let dragId = '';
/** @type {string} */
let focusTable = '';
let renderSerial = 0;

function localISO(date) {
  const z = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function games() {
  return listGames().filter((game) => game.scoreboard && gameIdForKey(game.id) != null);
}

function gameByKey(key) {
  return games().find((game) => game.id === key) || null;
}

function languageRecord(code) {
  return languageByCode.get(code) || { code };
}

function languageLabel(code) {
  return languageByCode.get(code)?.menu || code;
}

/**
 * @param {string} gameKey
 * @param {string} code
 */
function configurationsFor(gameKey, code) {
  const game = gameByKey(gameKey);
  if (!game?.scoreboard) return [];
  return game.scoreboard.configurations(languageRecord(code));
}

/**
 * @param {string} gameKey
 * @param {string} configuration
 */
function configurationLabel(gameKey, configuration) {
  const game = gameByKey(gameKey);
  if (!game) return configuration;
  for (const code of game.languages) {
    const match = configurationsFor(gameKey, code).find((item) => item.id === configuration);
    if (match) return match.label;
  }
  return configuration;
}

/**
 * @param {string} gameKey
 */
function labelsFor(gameKey) {
  const gameId = gameIdForKey(gameKey);
  const order = gameId == null ? [] : definitionsForGame(gameId).map((definition) => definition.id);
  return {
    languageLabel,
    configurationLabel: (configuration) => configurationLabel(gameKey, configuration),
    definitionIndex: (definition) => {
      const index = order.indexOf(definition);
      return index < 0 ? order.length : index;
    },
  };
}

function gamesWithTables() {
  const have = new Set(prefs.tables.map((table) => table.game));
  return games().filter((game) => have.has(game.id));
}

function selectedGame() {
  const available = gamesWithTables();
  if (available.some((game) => game.id === prefs.selected)) return prefs.selected;
  return available[0]?.id || '';
}

function commit(next) {
  prefs = saveScoreboardPrefs(next);
}

function openDialog(id) {
  $(id)?.removeAttribute('hidden');
}

function closeDialog(id) {
  $(id)?.setAttribute('hidden', '');
}

function paintTabs() {
  const host = $('#tabs');
  if (!host) return;
  const current = selectedGame();
  const tabs = gamesWithTables()
    .map((game) => {
      const selected = game.id === current ? 'true' : 'false';
      return `<button type="button" class="scoreboard-tab" role="tab" data-game="${escapeHtml(game.id)}" aria-selected="${selected}">${escapeHtml(game.name)}</button>`;
    })
    .join('');
  const menu = games()
    .map(
      (game) =>
        `<li><button type="button" data-add-game="${escapeHtml(game.id)}">${escapeHtml(game.name)}</button></li>`
    )
    .join('');
  host.innerHTML = `${tabs}<div class="scoreboard-plus-wrap"><button type="button" class="scoreboard-plus" id="plus" aria-expanded="false" aria-haspopup="menu">+</button><ul id="plus-menu" class="scoreboard-menu" hidden>${menu}</ul></div>`;
}

function paintToolbar(gameKey) {
  const host = $('#toolbar');
  if (!host) return;
  if (!gameKey) {
    host.innerHTML = '';
    return;
  }
  const mode = layoutMode(prefs, gameKey);
  const pressed = (id) => (mode === id ? 'true' : 'false');
  host.innerHTML = `
    <button type="button" class="btn" data-arrange="language" aria-pressed="${pressed('language')}">By language</button>
    <button type="button" class="btn" data-arrange="configuration" aria-pressed="${pressed('configuration')}">By configuration</button>
    <button type="button" class="btn" id="new-group">New group</button>`;
}

/**
 * @param {string} gameKey
 * @param {'language' | 'configuration' | 'custom'} mode
 * @param {{ key: string, tableIds: string[] }} cluster
 */
function clusterHeading(gameKey, mode, cluster) {
  if (!cluster.key || mode === 'custom') return '';
  const label = mode === 'language' ? configurationLabel(gameKey, cluster.key) : languageLabel(cluster.key);
  return `<h3>${escapeHtml(label)}</h3>`;
}

/**
 * @param {string[]} tableIds
 * @param {{ id: string, language: string, configuration: string, definition: string }[]} tables
 * @param {'language' | 'configuration' | 'custom'} mode
 */
function clusters(tableIds, tables, mode) {
  const byId = new Map(tables.map((table) => [table.id, table]));
  /** @type {{ key: string, tableIds: string[] }[]} */
  const groups = [];
  for (const id of tableIds) {
    const table = byId.get(id);
    if (!table) continue;
    const key = mode === 'custom' ? '' : mode === 'language' ? table.configuration : table.language;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.tableIds.push(id);
    else groups.push({ key, tableIds: [id] });
  }
  return groups;
}

/**
 * @param {{ id: string, game: string, language: string, configuration: string, definition: string, hidden: boolean }} table
 * @param {string} groupId
 */
function cardHtml(table, groupId) {
  const gameId = gameIdForKey(table.game);
  const definition = gameId == null ? null : resolveDefinition(gameId, table.definition);
  const title = definition?.title || table.definition;
  const line = definition ? qualificationLine(definition) : '';
  const where = `${languageLabel(table.language)} · ${configurationLabel(table.game, table.configuration)}`;
  const attrs = `data-table-id="${escapeHtml(table.id)}" data-group-id="${escapeHtml(groupId)}" data-drop draggable="true"`;
  if (table.hidden) {
    return `<div class="scoreboard-chip" ${attrs}><span>Show ${escapeHtml(title)}</span><button type="button" class="scoreboard-mini" data-show="${escapeHtml(table.id)}">Show</button></div>`;
  }
  return `<article class="scoreboard-card" ${attrs}>
    <header>
      <h3>${escapeHtml(title)}</h3>
      <div class="scoreboard-card-actions">
        <button type="button" class="scoreboard-mini" data-hide="${escapeHtml(table.id)}">Hide</button>
        <button type="button" class="scoreboard-mini" data-remove="${escapeHtml(table.id)}">Remove</button>
      </div>
    </header>
    <p class="scoreboard-meta">${escapeHtml(where)}</p>
    <p class="scoreboard-gate">${escapeHtml(line)}</p>
    <div data-body="${escapeHtml(table.id)}"><p class="scoreboard-empty">Loading…</p></div>
  </article>`;
}

function paintBoards(gameKey) {
  const root = $('#boards');
  if (!root) return;
  if (!gameKey) {
    root.innerHTML = '<p class="scoreboard-empty">Choose a game with + to add a scoreboard.</p>';
    return;
  }
  const mode = layoutMode(prefs, gameKey);
  const tables = prefs.tables.filter((table) => table.game === gameKey);
  const groups = viewGroups(prefs, gameKey, labelsFor(gameKey));
  root.innerHTML = groups
    .map((group) => {
      const body = group.tableIds.length
        ? clusters(group.tableIds, tables, mode)
            .map(
              (cluster) =>
                `<div class="scoreboard-cluster">${clusterHeading(gameKey, mode, cluster)}<div class="scoreboard-row">${cluster.tableIds
                  .map((id) => tables.find((table) => table.id === id))
                  .filter(Boolean)
                  .map((table) => cardHtml(table, group.id))
                  .join('')}</div></div>`
            )
            .join('')
        : '<p class="scoreboard-empty">Drag a scoreboard here.</p>';
      const remove = mode === 'custom' && !group.tableIds.length
        ? `<button type="button" class="scoreboard-mini" data-remove-group="${escapeHtml(group.id)}">Remove group</button>`
        : '';
      return `<section class="scoreboard-group" data-group-id="${escapeHtml(group.id)}" data-drop><header><h2>${escapeHtml(group.name)}</h2>${remove}</header>${body}</section>`;
    })
    .join('');
}

function rowHtml(row, valueText, selfName) {
  const mine = selfName && row.nickname.toLowerCase() === selfName.toLowerCase();
  return `<tr class="${mine ? 'is-self' : ''}"><td>${row.place}</td><td>${escapeHtml(row.nickname)}</td><td>${escapeHtml(valueText)}</td><td>${row.puzzles}</td></tr>`;
}

/**
 * @param {HTMLElement} host
 * @param {{ top?: { place: number, nickname: string, value: number, puzzles: number }[], self?: { place: number, nickname: string, value: number, puzzles: number } | null }} board
 * @param {(value: number) => string} formatScore
 * @param {string} selfName
 */
function paintRows(host, board, formatScore, selfName) {
  const rows = (board.top || []).map((row) => ({ ...row, valueText: formatScore(row.value) }));
  const extra =
    board.self && !rows.some((row) => row.nickname.toLowerCase() === board.self.nickname.toLowerCase())
      ? { ...board.self, valueText: formatScore(board.self.value) }
      : null;
  const body = rows.map((row) => rowHtml(row, row.valueText, selfName)).join('');
  const extraHtml = extra ? rowHtml(extra, extra.valueText, selfName) : '';
  host.innerHTML = body || extraHtml
    ? `<table><thead><tr><th>Place</th><th>Name</th><th>Score</th><th>Games</th></tr></thead><tbody>${body}${extraHtml}</tbody></table>`
    : '<p class="scoreboard-empty">No player has enough games for this board.</p>';
}

async function loadBoard(table) {
  const gameId = gameIdForKey(table.game);
  const params = new URLSearchParams({
    game: String(gameId),
    language: table.language,
    configuration: table.configuration,
    definition: table.definition,
    limit: String(prefs.limit),
    browserId: browserId(),
    today: localISO(new Date()),
  });
  const res = await fetch(`/api/scoreboard?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('board');
  return res.json();
}

function fillBoards(serial) {
  const selfName = getNickname();
  const visible = prefs.tables.filter((table) => table.game === selectedGame() && !table.hidden);
  for (const table of visible) {
    const game = gameByKey(table.game);
    const formatScore = game?.scoreboard?.formatScore || ((value) => String(value));
    void loadBoard(table)
      .then((board) => {
        if (serial !== renderSerial) return;
        const host = document.querySelector(`[data-body="${CSS.escape(table.id)}"]`);
        if (host instanceof HTMLElement) paintRows(host, board, formatScore, selfName);
      })
      .catch(() => {
        if (serial !== renderSerial) return;
        const host = document.querySelector(`[data-body="${CSS.escape(table.id)}"]`);
        if (host instanceof HTMLElement) host.innerHTML = '<p class="scoreboard-empty">The scoreboard could not be loaded.</p>';
      });
  }
}

function render() {
  const serial = ++renderSerial;
  if (prefs.selected !== selectedGame()) commit({ ...prefs, selected: selectedGame() });
  const limitInput = /** @type {HTMLInputElement | null} */ ($('#limit'));
  if (limitInput && document.activeElement !== limitInput) limitInput.value = String(prefs.limit);
  paintTabs();
  paintToolbar(prefs.selected);
  paintBoards(prefs.selected);
  fillBoards(serial);
  const focus = document.querySelector(`[data-table-id="${CSS.escape(focusTable)}"]`);
  focusTable = '';
  if (focus instanceof HTMLElement) focus.scrollIntoView({ block: 'nearest' });
}

function languagesForAdd(gameKey) {
  const game = gameByKey(gameKey);
  if (!game) return [];
  return game.languages.filter((code) => configurationsFor(gameKey, code).length);
}

function paintAddConfigurations() {
  const language = /** @type {HTMLSelectElement | null} */ ($('#add-language'))?.value || '';
  const host = /** @type {HTMLSelectElement | null} */ ($('#add-configuration'));
  if (!host) return;
  const previous = host.value;
  const options = configurationsFor(addGame, language);
  host.innerHTML = options
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
    .join('');
  if (options.some((item) => item.id === previous)) host.value = previous;
}

function openAdd(gameKey) {
  addGame = gameKey;
  const game = gameByKey(gameKey);
  const title = $('#add-title');
  if (title && game) title.textContent = `Add a ${game.name} scoreboard`;
  const languages = languagesForAdd(gameKey);
  const languageHost = /** @type {HTMLSelectElement | null} */ ($('#add-language'));
  const definitionHost = /** @type {HTMLSelectElement | null} */ ($('#add-definition'));
  const error = $('#add-error');
  if (error) error.textContent = '';
  if (languageHost) {
    languageHost.innerHTML = languages
      .map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(languageLabel(code))}</option>`)
      .join('');
  }
  const gameId = gameIdForKey(gameKey);
  if (definitionHost) {
    definitionHost.innerHTML = (gameId == null ? [] : definitionsForGame(gameId))
      .map((definition) => `<option value="${escapeHtml(definition.id)}">${escapeHtml(definition.title)}</option>`)
      .join('');
  }
  paintAddConfigurations();
  if (!languages.length && error) error.textContent = 'This game has no configurations to add.';
  $('#plus-menu')?.setAttribute('hidden', '');
  $('#plus')?.setAttribute('aria-expanded', 'false');
  openDialog('#add-dialog');
  languageHost?.focus();
}

function saveAdd() {
  const error = $('#add-error');
  const language = /** @type {HTMLSelectElement | null} */ ($('#add-language'))?.value || '';
  const configuration = /** @type {HTMLSelectElement | null} */ ($('#add-configuration'))?.value || '';
  const definition = /** @type {HTMLSelectElement | null} */ ($('#add-definition'))?.value || '';
  if (!addGame || !language || !configuration || !definition) {
    if (error) error.textContent = 'Choose a language, configuration, and scoreboard.';
    return;
  }
  const existing = prefs.tables.find(
    (table) =>
      table.game === addGame &&
      table.language === language &&
      table.configuration === configuration &&
      table.definition === definition
  );
  if (existing) {
    const tables = prefs.tables.map((table) => (table.id === existing.id ? { ...table, hidden: false } : table));
    commit({ ...prefs, selected: addGame, tables });
    focusTable = existing.id;
    closeDialog('#add-dialog');
    render();
    return;
  }
  const table = {
    id: crypto.randomUUID(),
    game: addGame,
    language,
    configuration,
    definition,
    hidden: false,
  };
  commit(placeNewTable(prefs, table, labelsFor(addGame)));
  focusTable = table.id;
  closeDialog('#add-dialog');
  render();
}

function bind() {
  $('#settings')?.addEventListener('click', () => openDialog('#settings-dialog'));
  document.querySelectorAll('[data-settings-close]').forEach((el) => el.addEventListener('click', () => closeDialog('#settings-dialog')));
  document.querySelectorAll('[data-add-close]').forEach((el) => el.addEventListener('click', () => closeDialog('#add-dialog')));
  document.querySelectorAll('[data-group-close]').forEach((el) => el.addEventListener('click', () => closeDialog('#group-dialog')));
  $('#add-language')?.addEventListener('change', paintAddConfigurations);
  $('#add-save')?.addEventListener('click', saveAdd);
  $('#limit')?.addEventListener('change', (event) => {
    const value = Number(/** @type {HTMLInputElement} */ (event.target).value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    commit({ ...prefs, limit: value });
    render();
  });
  $('#group-save')?.addEventListener('click', () => {
    const input = /** @type {HTMLInputElement | null} */ ($('#group-name'));
    const error = $('#group-error');
    const name = input?.value.trim() || '';
    const game = selectedGame();
    if (!game || !name) {
      if (error) error.textContent = 'Enter a name.';
      return;
    }
    commit(addCustomGroup(prefs, game, name, labelsFor(game)));
    closeDialog('#group-dialog');
    render();
  });
  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest('#plus') || target.closest('#plus-menu')) return;
    $('#plus-menu')?.setAttribute('hidden', '');
    $('#plus')?.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDialog('#settings-dialog');
    closeDialog('#add-dialog');
    closeDialog('#group-dialog');
    $('#plus-menu')?.setAttribute('hidden', '');
  });
  $('#tabs')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const tab = target.closest('[data-game]');
    if (tab) {
      commit({ ...prefs, selected: tab.getAttribute('data-game') || '' });
      render();
      return;
    }
    const add = target.closest('[data-add-game]');
    if (add) {
      openAdd(add.getAttribute('data-add-game') || '');
      return;
    }
    if (target.closest('#plus')) {
      const menu = $('#plus-menu');
      const plus = $('#plus');
      const open = menu?.hasAttribute('hidden');
      if (open) menu?.removeAttribute('hidden');
      else menu?.setAttribute('hidden', '');
      plus?.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });
  $('#toolbar')?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const arrange = target.closest('[data-arrange]');
    const game = selectedGame();
    if (!game) return;
    if (arrange) {
      const mode = arrange.getAttribute('data-arrange');
      if (mode === 'language' || mode === 'configuration') {
        commit(setArrangement(prefs, game, mode));
        render();
      }
      return;
    }
    if (target.closest('#new-group')) {
      const input = /** @type {HTMLInputElement | null} */ ($('#group-name'));
      const error = $('#group-error');
      if (input) input.value = '';
      if (error) error.textContent = '';
      openDialog('#group-dialog');
      input?.focus();
    }
  });
  const boards = $('#boards');
  boards?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const hide = target.closest('[data-hide]');
    const show = target.closest('[data-show]');
    const remove = target.closest('[data-remove]');
    const removeGroup = target.closest('[data-remove-group]');
    const game = selectedGame();
    if (hide || show) {
      const id = (hide || show)?.getAttribute(hide ? 'data-hide' : 'data-show') || '';
      commit({
        ...prefs,
        tables: prefs.tables.map((table) => (table.id === id ? { ...table, hidden: Boolean(hide) } : table)),
      });
      render();
      return;
    }
    if (remove) {
      commit(dropTable(prefs, remove.getAttribute('data-remove') || ''));
      render();
      return;
    }
    if (removeGroup && game) {
      commit(removeEmptyGroup(prefs, game, removeGroup.getAttribute('data-remove-group') || ''));
      render();
    }
  });
  boards?.addEventListener('dragstart', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest('button')) {
      event.preventDefault();
      return;
    }
    const card = /** @type {HTMLElement} */ (event.target).closest('[data-table-id]');
    const transfer = /** @type {DragEvent} */ (event).dataTransfer;
    dragId = card?.getAttribute('data-table-id') || '';
    if (!dragId || !transfer) return;
    transfer.setData('text/plain', dragId);
    transfer.effectAllowed = 'move';
  });
  boards?.addEventListener('dragover', (event) => {
    if (!dragId || !/** @type {HTMLElement} */ (event.target).closest('[data-drop]')) return;
    event.preventDefault();
  });
  boards?.addEventListener('drop', (event) => {
    event.preventDefault();
    const target = /** @type {HTMLElement} */ (event.target);
    const group = target.closest('[data-group-id]');
    const before = target.closest('[data-table-id]');
    const game = selectedGame();
    const tableId = dragId;
    dragId = '';
    if (!game || !tableId || !group) return;
    commit(
      moveTable(
        prefs,
        game,
        tableId,
        group.getAttribute('data-group-id') || '',
        before?.getAttribute('data-table-id') || '',
        labelsFor(game)
      )
    );
    render();
  });
}

async function start() {
  bind();
  try {
    const languages = await loadLanguages();
    languageByCode = new Map(languages.map((language) => [language.code, language]));
  } catch {
    languageByCode = new Map();
  }
  prefs = loadScoreboardPrefs();
  render();
}

void start();
