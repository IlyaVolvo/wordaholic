import { WordGraph } from './graph.js';
import { bfs, shortestPath } from './solver.js';
import {
  formatLocalDate,
  getDailyPuzzle,
  isPathSolved,
} from './dailyPuzzle.js';
import { getDaily, upsertDaily, listDailies, computeDailyStats } from './daily-store.js';
import { loadCorpus, loadCorpusText, loadLanguageIndex } from '../shared/wordset.js';
import { storage } from '../../../app/storage/idb.js';
import { setSessionActive } from '../../../app/updates/manifest.js';
import { notifySessionEnded } from '../../../app/shell/update-ui.js';
import {
  getPreferredLanguageCodes,
  pickActiveLanguage,
  setLastLanguage,
} from '../../../app/i18n-prefs/preferred.js';
import { languageDirForTranswordDir } from '../../../app/shell/locales.js';
import { getGame } from '../../../app/games-contract.js';
import './registration.js';
import { normalizeWithMappings } from '../../../app/i18n/normalize.js';
import { languageHooks, spellInPlace } from '../../../app/i18n/languages/index.js';
import { openHelp } from '../../../app/help/dialog.js';
import helpTopic from './help/topic.js';
import { mountPortraitGate } from '../../../app/play/portrait-gate.js';
import { mountHeaderChrome } from '../../../app/play/header-chrome.js';
import { reportPlayEnd, reportPlayStart } from '../../../app/stats/report.js';
import {
  calendarMonthForSelection,
  openVariant,
  selectVariantDate,
} from '../../../app/daily/variantVisit.js';

mountPortraitGate();

const GAME_ID = 'transword';
const PREFS_KEY = 'wordaholic-transword-prefs';
const $ = (sel) => document.querySelector(sel);

const DEFAULT_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const DEFAULT_ACTIONS = {
  enter: { label: 'ENTER', position: 'start', row: 2 },
  backspace: { label: '⌫', position: 'end', row: 2 },
};
const OP_LABELS = { substitute: 'replaced', insert: 'added', delete: 'removed', anagram: 'anagrammed' };

const DEFAULT_DISPLAY_PREFS = { showTime: true, showOptimal: true, mode: 'daily' };

/** @type {{ showTime: boolean, showOptimal: boolean }} */
let displayPrefs = { ...DEFAULT_DISPLAY_PREFS };

function normalizeDisplayPrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DISPLAY_PREFS };
  return {
    showTime: raw.showTime !== false,
    showOptimal: raw.showOptimal !== false,
    mode: 'daily',
  };
}

function loadDisplayPrefsFromLs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_PREFS };
    return normalizeDisplayPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFS };
  }
}

function saveDisplayPrefs() {
  void storage.setGameState(GAME_ID, 'prefs', displayPrefs);
}

async function hydrateDisplayPrefs() {
  const fromIdb = await storage.getGameState(GAME_ID, 'prefs');
  if (fromIdb) {
    displayPrefs = normalizeDisplayPrefs(fromIdb);
  } else {
    displayPrefs = loadDisplayPrefsFromLs();
    await storage.setGameState(GAME_ID, 'prefs', displayPrefs);
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      /* ignore */
    }
  }
  displayPrefs.mode = 'daily';
}

function applyDisplayPrefs() {
  const timeOn = displayPrefs.showTime;
  const optOn = displayPrefs.showOptimal;
  $('#stat-time')?.classList.toggle('stat--hidden', !timeOn);
  $('#stat-optimal')?.classList.toggle('stat--hidden', !optOn);
  $('#win-stat-time')?.classList.toggle('stat--hidden', !timeOn);
  $('#win-stat-optimal')?.classList.toggle('stat--hidden', !optOn);
  document.querySelectorAll('[data-display-pref="showTime"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = timeOn;
  });
  document.querySelectorAll('[data-display-pref="showOptimal"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = optOn;
  });
}

function wireDisplayPrefs() {
  document.querySelectorAll('[data-display-pref]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const key = input.dataset.displayPref;
      if (key !== 'showTime' && key !== 'showOptimal') return;
      displayPrefs[key] = input.checked;
      saveDisplayPrefs();
      applyDisplayPrefs();
      if (key === 'showTime' && displayPrefs.showTime) updateTimerDisplay();
    });
  });
  applyDisplayPrefs();
}

let corpusEntries = [];
let fullGraph = null;
let puzzleGraph = null;
let puzzle = null;
let chain = [];
/** Accumulated ms while paused + current segment */
let elapsedMsStored = 0;
let timerSegmentStart = null;
let timerHandle = null;
/** False until the player types (or uses help) for the first time. */
let timerStarted = false;
/** In-progress input text, restored when returning to this game. */
let inputDraft = '';
let solved = false;
let readOnly = false;
/** Times the player entered a position with no path to the target. */
let deadendCount = 0;
/** Times the player asked for a next-word hint. */
let helpCount = 0;
/** True while the current chain end cannot reach the target. */
let inDeadend = false;
/** BFS from the target — `prev` is the next word toward the end. */
let endBfs = null;
/** Selected daily date (local YYYY-MM-DD) */
let selectedGameDate = formatLocalDate();
let calendarMonth = new Date();
calendarMonth.setDate(1);

let language = 'en';
let languageDir = 'English';
let languageConfig = {};
let languageOptions = [];

const WORD_DATA_BASE = '/word-data';

function normalizeForLanguage(word) {
  return normalizeWithMappings(word, languageConfig?.normalization);
}

/** Dictionary key. Hebrew final letters (ם) match their regular form (מ). */
function canonicalWord(word) {
  return normalizeForLanguage(String(word || '').toLowerCase());
}

/** Word as written. Hebrew uses a final letter at the end. */
function displayWord(word) {
  return spellInPlace(canonicalWord(word), languageHooks(language));
}

function wordDir() {
  return languageConfig?.rtl ? 'rtl' : 'ltr';
}

function applyWordDir(el) {
  if (el) el.dir = wordDir();
}

function showTarget() {
  const el = $('#target-word');
  if (!el) return;
  applyWordDir(el);
  if (puzzle) el.textContent = displayWord(puzzle.end);
}

function selectedLevel() {
  return parseInt($('#level-select').value, 10);
}

function selectedDifficulty() {
  return parseInt($('#difficulty').value, 10);
}

/** Shortest path in transforms (words − 1), using the same dictionary the player can use. */
function optimalStepCount(start, end, fallback) {
  if (!fullGraph || !start || !end) return fallback;
  const result = shortestPath(fullGraph, start, end);
  if (!result) return fallback;
  return result.dist;
}

function dailyVariantParts() {
  return [language, selectedLevel(), selectedDifficulty()];
}

function currentCombo() {
  return {
    language,
    vocabLevel: selectedLevel(),
    difficulty: selectedDifficulty(),
    gameDate: selectedGameDate,
  };
}

/** Combo the current puzzle was started with — used so mid-game setting changes persist the old game. */
let activeCombo = null;

function rememberActiveCombo() {
  activeCombo = currentCombo();
}

async function purgePracticeState() {
  const rows = await storage.listGameStates(GAME_ID);
  const prefix = `${GAME_ID}:`;
  for (const row of rows) {
    const key = String(row.key || '');
    const local = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    if (!local.startsWith('practice:')) continue;
    await storage.deleteGameState(GAME_ID, local);
  }
}

function refreshEndBfs() {
  endBfs = fullGraph && puzzle?.end ? bfs(fullGraph, puzzle.end) : null;
}

function currentIsDeadend() {
  if (!puzzle || !endBfs || solved) return false;
  const cur = chain[chain.length - 1];
  if (!cur || cur === puzzle.end) return false;
  return !endBfs.has(cur);
}

function nextHelpWord() {
  if (!puzzle || !endBfs || solved) return null;
  const cur = chain[chain.length - 1];
  const info = endBfs.get(cur);
  if (!info || info.prev == null) return null;
  return info.prev;
}

/**
 * @param {{ countEntry?: boolean }} [opts]
 */
function syncDeadendState(opts = {}) {
  const now = currentIsDeadend();
  if (opts.countEntry && now && !inDeadend) deadendCount += 1;
  inDeadend = now;
  updateAssistChrome();
}

function resetAssist(record = null) {
  deadendCount = Math.max(0, Number(record?.deadendCount) || 0);
  helpCount = Math.max(0, Number(record?.helpCount) || 0);
  refreshEndBfs();
  inDeadend = currentIsDeadend();
  updateAssistChrome();
}

function updateAssistChrome() {
  const banner = $('#deadend-banner');
  if (banner) {
    const show = inDeadend && !solved && !readOnly;
    banner.hidden = !show;
    banner.classList.toggle('hidden', !show);
  }
  const helpBtn = /** @type {HTMLButtonElement | null} */ ($('#btn-help'));
  if (helpBtn) {
    const canHelp = !solved && !readOnly && !!nextHelpWord();
    helpBtn.disabled = !canHelp;
    helpBtn.title = canHelp
      ? 'Add the next word toward the target'
      : inDeadend
        ? 'Undo first — this position cannot reach the target'
        : 'Help';
  }
  const deadendEl = $('#deadend-count');
  const helpEl = $('#help-count');
  if (deadendEl) deadendEl.textContent = String(deadendCount);
  if (helpEl) helpEl.textContent = String(helpCount);
}

function dailyFields(extra = {}) {
  const combo = extra.combo || activeCombo || currentCombo();
  return {
    language: combo.language,
    vocabLevel: combo.vocabLevel,
    difficulty: combo.difficulty,
    gameDate: combo.gameDate,
    start: puzzle.start,
    end: puzzle.end,
    optimal: puzzle.dist,
    path: [...chain],
    elapsedMs: extra.elapsedMs ?? currentElapsedMs(),
    isComplete: extra.isComplete ?? (solved || isPathSolved(chain, puzzle.start, puzzle.end)),
    deadendCount,
    helpCount,
    timerStarted: extra.timerStarted ?? timerStarted,
    draft: extra.draft ?? (solved ? '' : currentDraft()),
  };
}

function buildGraphs(entries) {
  const lvl = selectedLevel();
  const levels = new Map();
  for (const { word, level } of entries) {
    const key = canonicalWord(word);
    if (!key) continue;
    const prev = levels.get(key);
    if (prev == null || level < prev) levels.set(key, level);
  }
  const allWords = [...levels.keys()];
  const puzzleWords = allWords.filter((word) => levels.get(word) <= lvl);
  fullGraph = new WordGraph(allWords);
  fullGraph.build();
  puzzleGraph = new WordGraph(puzzleWords);
  puzzleGraph.build();
}

async function loadLanguageConfig(dir) {
  const wordDir = languageDirForTranswordDir(dir) || dir;
  const res = await fetch(`${WORD_DATA_BASE}/${wordDir}/language.json`);
  if (!res.ok) throw new Error(`Failed to load language config for ${dir}`);
  return res.json();
}

function isRegisteredLanguage(code) {
  return (getGame(GAME_ID)?.languages || []).includes(code);
}

async function loadLanguagesCatalog() {
  const preferred = new Set(getPreferredLanguageCodes());
  let list = [];
  try {
    list = await loadLanguageIndex();
  } catch {
    /* empty */
  }
  const playable = [];
  for (const entry of list) {
    if (!entry?.dir || !(Number(entry.words || 0) > 0)) continue;
    try {
      const cfg = await loadLanguageConfig(entry.dir);
      const code = entry.code || cfg.code || entry.dir.slice(0, 2).toLowerCase();
      if (!isRegisteredLanguage(code)) continue;
      const text = await loadCorpusText(entry.dir);
      if (!text.trim()) continue;
      playable.push({
        dir: entry.dir,
        code,
        menu: entry.menu || cfg.menu || entry.dir,
        flag: entry.flag || cfg.flag || '',
      });
    } catch {
      /* skip */
    }
  }
  const filtered = playable.filter((l) => preferred.has(l.code));
  return filtered.length ? filtered : playable;
}

function applyModeChrome() {
  displayPrefs.mode = 'daily';
  updateDateDisplay();
}

function formatDateDisplay(selectedDate, today) {
  if (!selectedDate || selectedDate === today) return 'today';
  const [ys, ms, ds] = selectedDate.split('-').map(Number);
  const selected = new Date(ys, ms - 1, ds);
  const [yt, mt, dt] = today.split('-').map(Number);
  const todayObj = new Date(yt, mt - 1, dt);
  const diffDays = Math.round((todayObj.getTime() - selected.getTime()) / 86400000);
  if (diffDays === 1) return 'yesterday';
  const startOfWeek = new Date(todayObj);
  startOfWeek.setDate(todayObj.getDate() - todayObj.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  if (selected >= startOfWeek && selected <= endOfWeek) {
    return selected.toLocaleDateString('en-US', { weekday: 'long' });
  }
  const month = selected.toLocaleDateString('en-US', { month: 'short' });
  const day = selected.getDate();
  if (selected.getFullYear() === todayObj.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${selected.getFullYear()}`;
}

function updateDateDisplay() {
  const el = $('#date-display');
  if (!el) return;
  const today = formatLocalDate();
  const label = formatDateDisplay(selectedGameDate, today);
  const todaySelected = !selectedGameDate || selectedGameDate === today;
  el.textContent = label;
  const button = $('#btn-calendar');
  button?.classList.toggle('is-today', todaySelected);
  if (button) {
    button.title = todaySelected ? 'Calendar' : label;
    button.setAttribute('aria-label', todaySelected ? 'Choose daily date' : `Choose daily date, ${label}`);
  }
}

function currentLanguageOption() {
  return languageOptions.find((l) => l.code === language);
}

function renderLanguageDropdown() {
  const flag = $('#language-flag');
  const trigger = $('#language-trigger');
  const list = $('#language-list');
  const cur = currentLanguageOption();
  if (flag) flag.textContent = cur?.flag || '🌐';
  if (trigger) {
    const name = cur?.menu || 'Language';
    trigger.title = name;
    trigger.setAttribute('aria-label', `Language: ${name}`);
  }
  if (!list) return;
  list.innerHTML = languageOptions
    .map(
      (l) =>
        `<li role="option" class="language-dropdown-option${l.code === language ? ' selected' : ''}" data-code="${l.code}" aria-selected="${l.code === language}">` +
        `<span class="language-dropdown-option-flag">${l.flag || ''}</span>` +
        `<span class="language-dropdown-option-name">${l.menu}</span></li>`
    )
    .join('');
}

function setLanguageMenuOpen(open) {
  const list = $('#language-list');
  const trigger = $('#language-trigger');
  const chev = trigger?.querySelector('.language-dropdown-chevron');
  list?.classList.toggle('hidden', !open);
  trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (chev) chev.textContent = open ? '▲' : '▼';
}

async function switchLanguage(code, startPuzzle = true) {
  const opt = languageOptions.find((l) => l.code === code) || languageOptions.find((l) => l.dir === code);
  if (!opt) throw new Error(`Unknown language ${code}`);
  await persistLeavingGame();
  language = opt.code;
  languageDir = opt.dir;
  setLastLanguage(language);
  showLoading('Loading language corpus…');
  languageConfig = await loadLanguageConfig(languageDir);
  corpusEntries = await loadCorpus(languageDir);
  setLoading(`Building graphs (${corpusEntries.length} words)…`);
  await new Promise((r) => requestAnimationFrame(r));
  buildGraphs(corpusEntries);
  renderKeyboard();
  renderLanguageDropdown();
  hideLoading();
  if (startPuzzle) {
    await beginForCurrentSettings();
  }
}

async function loadDailyForSelection() {
  readOnly = false;
  solved = false;
  updateDateDisplay();
  const combo = currentCombo();
  let record = await getDaily(combo);

  if (!record) {
    const generated = getDailyPuzzle(puzzleGraph, combo);
    if (!generated) {
      alert('Could not find a daily puzzle for this combination.');
      return;
    }
    puzzle = {
      start: generated.start,
      end: generated.end,
      dist: optimalStepCount(generated.start, generated.end, generated.path.length - 1),
    };
    chain = [puzzle.start];
    elapsedMsStored = 0;
    timerStarted = false;
    inputDraft = '';
    resetAssist();
    rememberActiveCombo();
    record = await upsertDaily({
      ...dailyFields({ elapsedMs: 0, isComplete: false, timerStarted: false, draft: '' }),
    });
  } else {
    const start = canonicalWord(record.start);
    const end = canonicalWord(record.end);
    puzzle = {
      start,
      end,
      dist: optimalStepCount(start, end, record.optimal),
    };
    chain = Array.isArray(record.path) && record.path.length
      ? record.path.map((word) => canonicalWord(word))
      : [start];
    elapsedMsStored = Number(record.elapsedMs) || 0;
    timerStarted =
      !!record.timerStarted || elapsedMsStored > 0 || (Array.isArray(record.path) && record.path.length > 1);
    inputDraft = record.isComplete ? '' : String(record.draft || '');
    resetAssist(record);
    rememberActiveCombo();
    if (record.isComplete || isPathSolved(chain, puzzle.start, puzzle.end)) {
      solved = true;
      readOnly = true;
      timerStarted = true;
      inputDraft = '';
      stopTimer();
      setSessionActive(GAME_ID, false);
      showTarget();
      $('#optimal-count').textContent = String(puzzle.dist);
      renderChain();
      return;
    }
  }

  setSessionActive(GAME_ID, true);
  showTarget();
  $('#optimal-count').textContent = String(puzzle.dist);
  $('#win-overlay').classList.add('hidden');
  if (timerStarted) startTimer();
  else {
    stopTimer(false);
    updateTimerDisplay();
  }
  renderChain();
}

function currentElapsedMs() {
  let total = elapsedMsStored;
  if (timerSegmentStart != null) total += Date.now() - timerSegmentStart;
  return Math.max(0, total);
}

function currentDraft() {
  const input = $('#word-input');
  if (input) inputDraft = input.value;
  return inputDraft;
}

function noteTyping() {
  if (solved || readOnly) return;
  currentDraft();
  if (timerStarted && timerSegmentStart != null) return;
  timerStarted = true;
  startTimer();
}

function startTimer() {
  stopTimer(false);
  if (solved || readOnly || !timerStarted) {
    updateTimerDisplay();
    return;
  }
  timerSegmentStart = Date.now();
  updateTimerDisplay();
  timerHandle = setInterval(updateTimerDisplay, 250);
}

function stopTimer(accumulate = true) {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (accumulate && timerSegmentStart != null) {
    elapsedMsStored += Date.now() - timerSegmentStart;
    timerSegmentStart = null;
  } else {
    timerSegmentStart = null;
  }
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** @param {number} count @param {number} steps */
function formatStepShare(count, steps) {
  if (!steps) return '—';
  return `${Math.round((count / steps) * 100)}%`;
}

function elapsedStr() {
  return formatElapsed(currentElapsedMs());
}

function updateTimerDisplay() {
  if (!displayPrefs.showTime) return;
  $('#timer').textContent = elapsedStr();
}

async function persistLeavingGame() {
  currentDraft();
  stopTimer(true);
  const combo = activeCombo;
  if (!puzzle || !combo) return;
  if (solved && readOnly) return;
  await upsertDaily(dailyFields({ combo, elapsedMs: elapsedMsStored, draft: inputDraft, timerStarted }));
}

async function pauseAndPersist() {
  await persistLeavingGame();
}

async function beginForCurrentSettings() {
  selectedGameDate = await openVariant(GAME_ID, dailyVariantParts());
  await loadDailyForSelection();
}

function diffLetters(prev, cur, op) {
  const result = cur.split('').map((ch) => ({ char: ch, cls: '' }));
  if (!op || !prev) return result;
  if (op === 'substitute') {
    for (let i = 0; i < cur.length; i++) if (prev[i] !== cur[i]) result[i].cls = 'letter-green';
  } else if (op === 'insert') {
    for (let i = 0; i < cur.length; i++) {
      if (cur.slice(0, i) + cur.slice(i + 1) === prev) {
        result[i].cls = 'letter-green';
        break;
      }
    }
  } else if (op === 'delete') {
    for (let i = 0; i < prev.length; i++) {
      if (prev.slice(0, i) + prev.slice(i + 1) === cur) {
        if (i - 1 >= 0) result[i - 1].cls = 'letter-yellow';
        if (i < cur.length) result[i].cls = 'letter-yellow';
        break;
      }
    }
  } else if (op === 'anagram') {
    for (let i = 0; i < cur.length; i++) if (prev[i] !== cur[i]) result[i].cls = 'letter-red';
  }
  return result;
}

function renderChain() {
  const container = $('#chain');
  container.innerHTML = '';
  for (let i = 0; i < chain.length; i++) {
    if (i > 0) container.appendChild(makeConnector(chain[i - 1], chain[i]));
    container.appendChild(
      makeWordNode(
        chain[i],
        i === 0,
        chain[i] === puzzle.end,
        !readOnly && !solved && i === chain.length - 1 && i > 0,
        i > 0 ? chain[i - 1] : null,
        !solved && !readOnly && i === chain.length - 1 && inDeadend
      )
    );
  }
  if (!solved && !readOnly) {
    container.appendChild(makeConnector(null, null));
    container.appendChild(makeInputNode());
  }
  $('#step-count').textContent = String(Math.max(0, chain.length - 1));
  updateAssistChrome();
  const c = $('#chain-container');
  requestAnimationFrame(() => {
    c.scrollTop = c.scrollHeight;
  });
}

function makeWordNode(word, isStart, isEnd, canUndo, prevWord, isDeadend = false) {
  const node = document.createElement('div');
  node.className = 'node';
  const wrap = document.createElement('div');
  wrap.className = 'word-slot-wrap';
  const slot = document.createElement('div');
  slot.className = 'word-slot';
  applyWordDir(slot);
  if (isStart) slot.classList.add('start-word');
  if (isEnd) slot.classList.add('end-word');
  if (isDeadend) slot.classList.add('deadend-word');
  const shown = Array.from(displayWord(word));
  if (prevWord) {
    const op = fullGraph.classifyOp(prevWord, word);
    diffLetters(prevWord, word, op).forEach(({ cls }, i) => {
      const span = document.createElement('span');
      span.textContent = shown[i] || '';
      if (cls) span.className = cls;
      slot.appendChild(span);
    });
  } else slot.textContent = shown.join('');
  wrap.appendChild(slot);
  if (canUndo) {
    const x = document.createElement('button');
    x.className = 'undo-x';
    x.textContent = '↑';
    x.addEventListener('click', async () => {
      if (chain.length > 1 && !solved && !readOnly) {
        chain.pop();
        syncDeadendState();
        renderChain();
        await persistDailyProgress();
      }
    });
    wrap.appendChild(x);
  }
  node.appendChild(wrap);
  return node;
}

function makeConnector(prev, cur) {
  const conn = document.createElement('div');
  conn.className = 'connector';
  const line = document.createElement('div');
  line.className = 'connector-line';
  conn.appendChild(line);
  if (prev && cur) {
    const op = fullGraph.classifyOp(prev, cur);
    if (op) {
      const badge = document.createElement('span');
      badge.className = `op-badge ${op}`;
      badge.textContent = OP_LABELS[op] || op;
      conn.appendChild(badge);
    }
  }
  return conn;
}

function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function typeIntoWordInput(key) {
  const input = $('#word-input');
  if (!input || solved || readOnly) return;
  if (key === 'Enter') {
    void submitWord(input.value.trim().toLowerCase());
    return;
  }
  if (key === 'Backspace') {
    input.value = input.value.slice(0, -1);
    if (input.value) noteTyping();
    else currentDraft();
    return;
  }
  if (key.length === 1) {
    input.value = `${input.value}${key}`.toLowerCase();
    noteTyping();
  }
}

function configureWordInput(input) {
  applyWordDir(input);
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('inputmode', 'none');
  input.setAttribute('enterkeyhint', 'enter');
  if (isCoarsePointer()) {
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
    input.addEventListener('focus', () => input.blur());
  }
  input.addEventListener('input', () => {
    if (input.value) noteTyping();
    else currentDraft();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitWord(input.value.trim().toLowerCase());
      return;
    }
    if (!input.readOnly) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      typeIntoWordInput('Backspace');
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typeIntoWordInput(e.key);
    }
  });
}

function makeInputNode() {
  const node = document.createElement('div');
  node.className = 'node';
  const wrap = document.createElement('div');
  wrap.className = 'word-slot-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input-slot';
  input.placeholder = 'type a word…';
  input.id = 'word-input';
  input.value = inputDraft;
  configureWordInput(input);
  const hint = document.createElement('div');
  hint.className = 'error-hint';
  hint.id = 'error-hint';
  wrap.appendChild(input);
  const help = document.createElement('button');
  help.type = 'button';
  help.id = 'btn-help';
  help.className = 'help-x';
  help.textContent = '?';
  help.addEventListener('click', (e) => {
    e.preventDefault();
    void requestHelp();
  });
  wrap.appendChild(help);
  node.appendChild(wrap);
  node.appendChild(hint);
  if (!isCoarsePointer()) {
    requestAnimationFrame(() => input.focus());
  }
  return node;
}

async function persistDailyProgress() {
  if (!puzzle) return;
  await upsertDaily(dailyFields());
}

async function submitWord(word, opts = {}) {
  if (readOnly || solved) return;
  const input = $('#word-input');
  const hint = $('#error-hint');
  if (!word) return;
  noteTyping();
  const normalizedWord = normalizeForLanguage(word);
  const prev = chain[chain.length - 1];
  if (normalizedWord === prev) return flashError(input, hint, 'Same as previous word');
  if (!fullGraph.has(normalizedWord)) return flashError(input, hint, 'Not in dictionary');
  const op = fullGraph.classifyOp(prev, normalizedWord);
  if (!op) return flashError(input, hint, 'Not a valid single-step transform');
  const isGameStart = chain.length === 1;
  chain.push(normalizedWord);
  const combo = activeCombo || currentCombo();
  if (isGameStart) {
    reportPlayStart({
      gameId: 1,
      language: combo.language,
      variant: `${combo.vocabLevel},${combo.difficulty}`,
      puzzleDate: combo.gameDate,
    });
  }
  if (opts.fromHelp) helpCount += 1;
  if (normalizedWord === puzzle.end || isPathSolved(chain, puzzle.start, puzzle.end)) {
    solved = true;
    inDeadend = false;
    stopTimer(true);
    setSessionActive(GAME_ID, false);
    notifySessionEnded();
    updateAssistChrome();
    renderChain();
    inputDraft = '';
    readOnly = true;
    await upsertDaily(dailyFields({ elapsedMs: elapsedMsStored, isComplete: true, draft: '' }));
    reportPlayEnd({
      gameId: 1,
      language: combo.language,
      variant: `${combo.vocabLevel},${combo.difficulty}`,
      puzzleDate: combo.gameDate,
      value: Math.max(0, Math.round(elapsedMsStored)),
      helpCount,
    });
    showWin(true);
    return;
  }
  inputDraft = '';
  syncDeadendState({ countEntry: true });
  renderChain();
  await persistDailyProgress();
}

async function requestHelp() {
  if (readOnly || solved) return;
  const next = nextHelpWord();
  if (!next) {
    const input = $('#word-input');
    const hint = $('#error-hint');
    if (input && hint) {
      flashError(input, hint, inDeadend ? 'Undo first — dead end' : 'No hint available');
    }
    return;
  }
  await submitWord(next, { fromHelp: true });
}

function flashError(input, hint, msg) {
  input.classList.remove('shake');
  void input.offsetWidth;
  input.classList.add('shake');
  hint.textContent = msg;
  hint.classList.add('visible');
}

function renderKeyboard() {
  const root = $('#keyboard');
  root.innerHTML = '';
  const layout = Array.isArray(languageConfig?.layout) ? languageConfig.layout : DEFAULT_LAYOUT;
  const actions = languageConfig?.actions || DEFAULT_ACTIONS;
  const lastRow = Math.max(layout.length - 1, 0);
  const enterCfg = {
    label: actions?.enter?.label || 'ENTER',
    position: actions?.enter?.position || 'start',
    row: Number.isInteger(actions?.enter?.row) ? actions.enter.row : lastRow,
  };
  const backCfg = {
    label: actions?.backspace?.label || '⌫',
    position: actions?.backspace?.position || 'end',
    row: Number.isInteger(actions?.backspace?.row) ? actions.backspace.row : lastRow,
  };

  let maxRowKeys = 1;
  for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
    let count = layout[rowIndex].length;
    if (enterCfg.row === rowIndex) count += 1;
    if (backCfg.row === rowIndex) count += 1;
    if (count > maxRowKeys) maxRowKeys = count;
  }
  root.style.setProperty('--kb-max-keys', String(maxRowKeys));

  for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard-row';
    const maybe = (cfg, type, pos) => {
      if (cfg.row !== rowIndex || cfg.position !== pos) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key key-action';
      btn.textContent = cfg.label;
      btn.addEventListener('click', () => {
        const input = $('#word-input');
        if (!input || solved || readOnly) return;
        if (type === 'enter') typeIntoWordInput('Enter');
        else typeIntoWordInput('Backspace');
      });
      rowEl.appendChild(btn);
    };
    maybe(enterCfg, 'enter', 'start');
    maybe(backCfg, 'backspace', 'start');
    for (const key of layout[rowIndex]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key';
      btn.textContent = String(key).toUpperCase();
      btn.addEventListener('click', () => {
        const input = $('#word-input');
        if (!input || solved || readOnly) return;
        typeIntoWordInput(String(key));
      });
      rowEl.appendChild(btn);
    }
    maybe(enterCfg, 'enter', 'end');
    maybe(backCfg, 'backspace', 'end');
    root.appendChild(rowEl);
  }
}

/**
 * @param {boolean} [freshSolve]
 */
function showWin(freshSolve = true) {
  const steps = Math.max(0, chain.length - 1);
  $('#win-steps').textContent = String(steps);
  $('#win-optimal').textContent = String(puzzle.dist);
  $('#win-time').textContent = formatElapsed(elapsedMsStored || currentElapsedMs());
  const winDeadend = $('#win-deadends');
  const winHelp = $('#win-helps');
  if (winDeadend) winDeadend.textContent = formatStepShare(deadendCount, steps);
  if (winHelp) winHelp.textContent = formatStepShare(helpCount, steps);

  $('#win-overlay').classList.remove('hidden');
  void freshSolve;
}

function setLoading(msg) {
  $('#loading-msg').textContent = msg;
}
function showLoading(msg) {
  const el = $('#loading');
  el.classList.remove('hidden', 'fade-out');
  el.style.opacity = '1';
  setLoading(msg);
}
function hideLoading() {
  $('#loading').classList.add('fade-out');
  setTimeout(() => $('#loading').classList.add('hidden'), 400);
}

/* ---------- History calendar ---------- */

function openHistory() {
  const overlay = $('#history-overlay');
  if (!overlay) return;
  const combo = currentCombo();
  const diffLabel =
    combo.difficulty <= 3 ? 'Easy' : combo.difficulty <= 5 ? 'Medium' : 'Hard';
  const vocabLabel = combo.vocabLevel <= 1 ? 'Basic' : 'Standard';
  $('#history-combo-label').textContent = `${vocabLabel} · ${diffLabel}`;
  calendarMonth = calendarMonthForSelection(selectedGameDate);
  overlay.hidden = false;
  overlay.classList.remove('hidden');
  void renderCalendar();
}

function closeHistory() {
  const overlay = $('#history-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.add('hidden');
}

async function renderCalendar() {
  const label = $('#cal-month-label');
  const grid = $('#calendar-grid');
  if (!label || !grid) return;
  label.textContent = calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const combo = currentCombo();
  const rows = await listDailies({
    language: combo.language,
    vocabLevel: combo.vocabLevel,
    difficulty: combo.difficulty,
  });
  const byDate = new Map(rows.map((r) => [r.gameDate, r]));

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = formatLocalDate();

  grid.innerHTML = '';
  for (let i = 0; i < startPad; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day other';
    grid.appendChild(cell);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day';
    cell.textContent = String(day);
    if (dateStr === today) cell.classList.add('today');
    if (dateStr > today) {
      cell.classList.add('future');
      cell.disabled = true;
    } else {
      const rec = byDate.get(dateStr);
      if (rec?.isComplete) cell.classList.add('won');
      else if (rec && (rec.path?.length || 0) > 1) cell.classList.add('incomplete');
      cell.addEventListener('click', async () => {
        closeHistory();
        await pauseAndPersist();
        selectedGameDate = await selectVariantDate(GAME_ID, dailyVariantParts(), dateStr);
        displayPrefs.mode = 'daily';
        saveDisplayPrefs();
        applyModeChrome();
        await loadDailyForSelection();
      });
    }
    grid.appendChild(cell);
  }
}

/* ---------- Stats ---------- */

function openStats() {
  const overlay = $('#stats-overlay');
  if (!overlay) return;
  const langSel = $('#stats-lang');
  if (langSel && langSel.options.length <= 1) {
    for (const l of languageOptions) {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = `${l.flag || ''} ${l.menu}`.trim();
      langSel.appendChild(opt);
    }
  }
  if (langSel) langSel.value = language;
  const vocab = $('#stats-vocab');
  const diff = $('#stats-diff');
  if (vocab) vocab.value = String(selectedLevel());
  if (diff) diff.value = String(selectedDifficulty());
  overlay.hidden = false;
  overlay.classList.remove('hidden');
  void refreshStats();
}

function closeStats() {
  const overlay = $('#stats-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.add('hidden');
}

function displayAnchor() {
  return $('#btn-display');
}

function placeDisplayPopover() {
  const pop = $('#display-popover');
  const anchor = displayAnchor();
  if (!pop || !anchor || pop.classList.contains('hidden')) return;
  const r = anchor.getBoundingClientRect();
  pop.style.top = `${Math.round(r.bottom + 8)}px`;
  const width = pop.getBoundingClientRect().width || 184;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  pop.style.left = `${Math.round(left)}px`;
}

function openDisplay() {
  const pop = $('#display-popover');
  if (!pop) return;
  applyDisplayPrefs();
  pop.hidden = false;
  pop.classList.remove('hidden');
  placeDisplayPopover();
}

function closeDisplay() {
  const pop = $('#display-popover');
  if (!pop) return;
  pop.hidden = true;
  pop.classList.add('hidden');
}

function toggleDisplay() {
  const pop = $('#display-popover');
  if (!pop || pop.classList.contains('hidden')) openDisplay();
  else closeDisplay();
}

async function refreshStats() {
  const filters = {
    language: $('#stats-lang')?.value || 'all',
    vocabLevel: $('#stats-vocab')?.value || 'all',
    difficulty: $('#stats-diff')?.value || 'all',
  };
  const rows = await listDailies(filters);
  const stats = computeDailyStats(rows, filters);
  $('#stats-played').textContent = String(stats.played);
  $('#stats-streak').textContent = stats.streak == null ? '—' : String(stats.streak);
  $('#stats-avg-time').textContent = stats.played ? formatElapsed(stats.avgElapsedMs) : '—';
  const bestTime = $('#stats-best-time');
  if (bestTime) bestTime.textContent = stats.bestElapsedMs != null ? formatElapsed(stats.bestElapsedMs) : '—';
  const avgDead = $('#stats-avg-deadends');
  const avgHelp = $('#stats-avg-helps');
  if (avgDead) avgDead.textContent = stats.played ? `${Math.round(stats.deadendRate * 100)}%` : '—';
  if (avgHelp) avgHelp.textContent = stats.played ? `${Math.round(stats.helpRate * 100)}%` : '—';
  const clean = $('#stats-clean');
  const optimalSolves = $('#stats-optimal-solves');
  if (clean) clean.textContent = stats.played ? `${Math.round(stats.cleanRate * 100)}%` : '—';
  if (optimalSolves) optimalSolves.textContent = stats.played ? `${Math.round(stats.optimalRate * 100)}%` : '—';
}

async function onComboControlsChanged() {
  await persistLeavingGame();
  buildGraphs(corpusEntries);
  await beginForCurrentSettings();
}

async function init() {
  await storage.open();
  await purgePracticeState();
  await hydrateDisplayPrefs();
  showLoading('Loading languages…');
  languageOptions = await loadLanguagesCatalog();
  const preferred = getPreferredLanguageCodes();
  const picked = pickActiveLanguage(
    preferred,
    languageOptions.map((l) => l.code)
  );
  if (!picked) throw new Error('No TransWord languages available');
  language = picked;
  renderLanguageDropdown();
  $('#game').classList.remove('hidden');
  wireDisplayPrefs();
  applyModeChrome();

  $('#btn-calendar')?.addEventListener('click', () => openHistory());
  $('#btn-stats')?.addEventListener('click', () => openStats());
  $('#btn-display')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDisplay();
  });
  $('#btn-howto')?.addEventListener('click', () => openHelp(helpTopic));
  const headerBar = $('#header');
  const phoneHeader = window.matchMedia('(max-width: 720px)');
  const syncHeaderMin = () => {
    if (phoneHeader.matches) headerBar?.setAttribute('data-def-min', 'other');
    else headerBar?.removeAttribute('data-def-min');
  };
  syncHeaderMin();
  phoneHeader.addEventListener('change', () => {
    syncHeaderMin();
    window.dispatchEvent(new Event('resize'));
  });
  mountHeaderChrome(headerBar);
  $('#header-more-menu')?.addEventListener('click', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-header-action]');
    if (!item) return;
    e.stopPropagation();
    const action = item.getAttribute('data-header-action');
    if (action === 'stats') openStats();
    else if (action === 'howto') openHelp(helpTopic);
  });
  $('#language-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const list = $('#language-list');
    setLanguageMenuOpen(!!list?.classList.contains('hidden'));
  });
  $('#language-list')?.addEventListener('click', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-code]');
    if (!item) return;
    setLanguageMenuOpen(false);
    void switchLanguage(item.getAttribute('data-code'), true);
  });
  document.addEventListener('click', (e) => {
    const target = /** @type {Node} */ (e.target);
    const dd = $('#language-dropdown');
    if (dd && !dd.contains(target)) setLanguageMenuOpen(false);
    const pop = $('#display-popover');
    const displayBtn = $('#btn-display');
    if (
      pop &&
      !pop.classList.contains('hidden') &&
      !pop.contains(target) &&
      !displayBtn?.contains(target)
    ) {
      closeDisplay();
    }
  });
  window.addEventListener('resize', placeDisplayPopover);
  $('#win-close-btn')?.addEventListener('click', () => {
    $('#win-overlay').classList.add('hidden');
  });
  document.querySelectorAll('[data-history-close]').forEach((el) => el.addEventListener('click', closeHistory));
  document.querySelectorAll('[data-stats-close]').forEach((el) => el.addEventListener('click', closeStats));
  document.querySelectorAll('[data-display-close]').forEach((el) => el.addEventListener('click', closeDisplay));
  $('#history-overlay')?.addEventListener('click', (e) => {
    if (e.target === $('#history-overlay')) closeHistory();
  });
  $('#stats-overlay')?.addEventListener('click', (e) => {
    if (e.target === $('#stats-overlay')) closeStats();
  });
  $('#cal-prev')?.addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    void renderCalendar();
  });
  $('#cal-next')?.addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    void renderCalendar();
  });
  ['stats-lang', 'stats-vocab', 'stats-diff'].forEach((id) => {
    $(`#${id}`)?.addEventListener('change', () => void refreshStats());
  });

  $('#level-select').addEventListener('change', () => void onComboControlsChanged());
  $('#difficulty').addEventListener('change', () => void onComboControlsChanged());

  document.addEventListener('keydown', (e) => {
    if (!isCoarsePointer()) return;
    const input = $('#word-input');
    if (!input || solved || readOnly) return;
    if (document.activeElement === input) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (e.key === 'Enter' && t instanceof HTMLButtonElement) return;
    if (e.key === 'Enter' || e.key === 'Backspace') {
      e.preventDefault();
      typeIntoWordInput(e.key);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typeIntoWordInput(e.key);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void pauseAndPersist();
    else if (!solved && !readOnly && timerStarted) startTimer();
  });
  window.addEventListener('pagehide', () => {
    void pauseAndPersist();
  });

  await switchLanguage(picked, true);
}

init().catch((err) => {
  console.error(err);
  setLoading(`Error: ${err.message}`);
});
