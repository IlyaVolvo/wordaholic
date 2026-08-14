import { WordGraph } from './graph.js';
import { bfs, generatePuzzles, shortestPath } from './solver.js';
import {
  formatLocalDate,
  getDailyPuzzle,
  difficultyRangeFromValue,
  isPathSolved,
} from './dailyPuzzle.js';
import { getDaily, upsertDaily, listDailies, computeDailyStats } from './daily-store.js';
import { storage } from '../../app/storage/idb.js';
import { setSessionActive } from '../../app/updates/manifest.js';
import { notifySessionEnded } from '../../app/shell/update-ui.js';
import {
  getPreferredLanguageCodes,
  pickActiveLanguage,
  setLastLanguage,
} from '../../app/i18n-prefs/preferred.js';
import { languageDirForTranswordDir } from '../../app/shell/locales.js';
import { normalizeWithMappings } from '../../app/i18n/normalize.js';

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

/** @type {{ showTime: boolean, showOptimal: boolean, mode?: 'daily'|'practice' }} */
let displayPrefs = { ...DEFAULT_DISPLAY_PREFS };

function normalizeDisplayPrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DISPLAY_PREFS };
  return {
    showTime: raw.showTime !== false,
    showOptimal: raw.showOptimal !== false,
    mode: raw.mode === 'practice' ? 'practice' : 'daily',
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
  playMode = displayPrefs.mode || 'daily';
}

function applyDisplayPrefs() {
  const timeOn = displayPrefs.showTime;
  const optOn = displayPrefs.showOptimal;
  $('#stat-time')?.classList.toggle('stat--hidden', !timeOn);
  $('#stat-optimal')?.classList.toggle('stat--hidden', !optOn);
  $('#win-stat-time')?.classList.toggle('stat--hidden', !timeOn);
  $('#win-stat-optimal')?.classList.toggle('stat--hidden', !optOn);
  const timeCb = /** @type {HTMLInputElement | null} */ ($('#pref-show-time'));
  const optCb = /** @type {HTMLInputElement | null} */ ($('#pref-show-optimal'));
  if (timeCb) timeCb.checked = timeOn;
  if (optCb) optCb.checked = optOn;
}

function wireDisplayPrefs() {
  $('#pref-show-time')?.addEventListener('change', (e) => {
    displayPrefs.showTime = /** @type {HTMLInputElement} */ (e.target).checked;
    saveDisplayPrefs();
    applyDisplayPrefs();
    if (displayPrefs.showTime) updateTimerDisplay();
  });
  $('#pref-show-optimal')?.addEventListener('change', (e) => {
    displayPrefs.showOptimal = /** @type {HTMLInputElement} */ (e.target).checked;
    saveDisplayPrefs();
    applyDisplayPrefs();
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
let solved = false;
let readOnly = false;
let playMode = 'daily';
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

const LANG_BASE = '/games/transword/data/languages';
const WORD_DATA_BASE = '/word-data';

function normalizeForLanguage(word) {
  return normalizeWithMappings(word, languageConfig?.normalization);
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

function practiceStateKey(combo) {
  return `practice:${combo.language}:${combo.vocabLevel}:${combo.difficulty}`;
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
  };
}

function buildGraphs(entries) {
  const lvl = selectedLevel();
  const allWords = [];
  const puzzleWords = [];
  for (const { word, level } of entries) {
    allWords.push(word);
    if (level <= lvl) puzzleWords.push(word);
  }
  fullGraph = new WordGraph(allWords);
  fullGraph.build();
  puzzleGraph = new WordGraph(puzzleWords);
  puzzleGraph.build();
}

async function loadCorpus(dir) {
  const res = await fetch(`${LANG_BASE}/${dir}/corpus.txt`);
  if (!res.ok) throw new Error(`Failed to load corpus for ${dir}`);
  const text = await res.text();
  const entries = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    const word = (parts[0] || '').toLowerCase();
    const level = parseInt(parts[1], 10) || 1;
    if (word) entries.push({ word, level });
  }
  return entries;
}

async function loadLanguageConfig(dir) {
  const wordDir = languageDirForTranswordDir(dir) || `${dir}/${(dir || '').slice(0, 2).toLowerCase()}`;
  const res = await fetch(`${WORD_DATA_BASE}/${wordDir}/language.json`);
  if (!res.ok) throw new Error(`Failed to load language config for ${dir}`);
  return res.json();
}

function isBlockedInGame(cfg) {
  const raw = cfg?.blocked;
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'yes' || v === 'true';
}

async function loadLanguagesCatalog() {
  const preferred = new Set(getPreferredLanguageCodes());
  let list = [];
  try {
    const res = await fetch(`${LANG_BASE}/index.json`);
    if (res.ok) list = await res.json();
  } catch {
    /* empty */
  }
  const playable = [];
  for (const entry of list) {
    if (!entry?.dir || !(Number(entry.words || 0) > 0)) continue;
    try {
      const cfg = await loadLanguageConfig(entry.dir);
      if (isBlockedInGame(cfg)) continue;
      const corpusRes = await fetch(`${LANG_BASE}/${entry.dir}/corpus.txt`);
      if (!corpusRes.ok) continue;
      const text = await corpusRes.text();
      if (!text.trim()) continue;
      playable.push({
        dir: entry.dir,
        code: entry.code || cfg.code || entry.dir.slice(0, 2).toLowerCase(),
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
  const daily = playMode === 'daily';
  const modeSel = /** @type {HTMLSelectElement | null} */ ($('#mode-select'));
  if (modeSel) modeSel.value = playMode;
  $('#btn-calendar')?.classList.toggle('hidden', !daily);
  $('#btn-new-practice')?.classList.toggle('hidden', daily);
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
  el.textContent = formatDateDisplay(selectedGameDate, formatLocalDate());
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

async function setPlayMode(mode) {
  if (mode !== 'daily' && mode !== 'practice') return;
  await persistLeavingGame();
  playMode = mode;
  displayPrefs.mode = mode;
  saveDisplayPrefs();
  applyModeChrome();
  if (mode === 'daily') {
    selectedGameDate = formatLocalDate();
    await loadDailyForSelection();
  } else {
    await loadPracticeForSelection();
  }
}

async function switchLanguage(code, startPuzzle = true, { fresh = false } = {}) {
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
    await beginForCurrentSettings({ fresh });
  }
}

function startPracticePuzzle() {
  readOnly = false;
  solved = false;
  elapsedMsStored = 0;
  const [min, max] = difficultyRangeFromValue(selectedDifficulty());
  const puzzles = generatePuzzles(puzzleGraph, { minSteps: min, maxSteps: max, count: 5, sampleSize: 400 });
  if (!puzzles.length) {
    alert('Could not find a puzzle for this difficulty / level.');
    return;
  }
  const pick = puzzles[Math.floor(Math.random() * puzzles.length)];
  puzzle = {
    start: pick.start,
    end: pick.end,
    dist: optimalStepCount(pick.start, pick.end, pick.path.length - 1),
  };
  chain = [puzzle.start];
  resetAssist();
  rememberActiveCombo();
  setSessionActive(GAME_ID, true);
  $('#target-word').textContent = puzzle.end;
  $('#optimal-count').textContent = String(puzzle.dist);
  $('#win-overlay').classList.add('hidden');
  startTimer();
  renderChain();
  void persistLeavingGame();
}

async function loadDailyForSelection({ fresh = false } = {}) {
  readOnly = false;
  solved = false;
  updateDateDisplay();
  const combo = currentCombo();
  let record = await getDaily(combo);
  if (fresh && record && !record.isComplete) record = null;

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
    resetAssist();
    rememberActiveCombo();
    record = await upsertDaily({
      ...dailyFields({ elapsedMs: 0, isComplete: false }),
    });
  } else {
    puzzle = {
      start: record.start,
      end: record.end,
      dist: optimalStepCount(record.start, record.end, record.optimal),
    };
    chain = Array.isArray(record.path) && record.path.length ? [...record.path] : [record.start];
    elapsedMsStored = Number(record.elapsedMs) || 0;
    resetAssist(record);
    rememberActiveCombo();
    if (record.isComplete || isPathSolved(chain, record.start, record.end)) {
      solved = true;
      readOnly = true;
      stopTimer();
      setSessionActive(GAME_ID, false);
      $('#target-word').textContent = puzzle.end;
      $('#optimal-count').textContent = String(puzzle.dist);
      renderChain();
      return;
    }
  }

  setSessionActive(GAME_ID, true);
  $('#target-word').textContent = puzzle.end;
  $('#optimal-count').textContent = String(puzzle.dist);
  $('#win-overlay').classList.add('hidden');
  startTimer();
  renderChain();
}

function currentElapsedMs() {
  let total = elapsedMsStored;
  if (timerSegmentStart != null) total += Date.now() - timerSegmentStart;
  return Math.max(0, total);
}

function startTimer() {
  stopTimer(false);
  if (solved || readOnly) {
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
  stopTimer(true);
  const combo = activeCombo;
  if (!puzzle || !combo) return;
  if (playMode === 'daily') {
    if (solved && readOnly) return;
    await upsertDaily(dailyFields({ combo, elapsedMs: elapsedMsStored }));
    return;
  }
  const key = practiceStateKey(combo);
  if (solved) {
    await storage.setGameState(GAME_ID, key, null);
    return;
  }
  await storage.setGameState(GAME_ID, key, {
    start: puzzle.start,
    end: puzzle.end,
    dist: puzzle.dist,
    path: [...chain],
    elapsedMs: elapsedMsStored,
    deadendCount,
    helpCount,
  });
}

async function loadPracticeForSelection() {
  rememberActiveCombo();
  const saved = await storage.getGameState(GAME_ID, practiceStateKey(activeCombo));
  if (saved?.start && saved?.end && Array.isArray(saved.path) && saved.path.length) {
    readOnly = false;
    solved = false;
    puzzle = {
      start: saved.start,
      end: saved.end,
      dist: optimalStepCount(saved.start, saved.end, saved.dist),
    };
    chain = [...saved.path];
    elapsedMsStored = Number(saved.elapsedMs) || 0;
    resetAssist(saved);
    setSessionActive(GAME_ID, true);
    $('#target-word').textContent = puzzle.end;
    $('#optimal-count').textContent = String(puzzle.dist);
    $('#win-overlay').classList.add('hidden');
    startTimer();
    renderChain();
    return;
  }
  startPracticePuzzle();
}

async function pauseAndPersist() {
  await persistLeavingGame();
}

async function beginForCurrentSettings({ fresh = false } = {}) {
  if (playMode === 'daily') {
    await loadDailyForSelection({ fresh });
    return;
  }
  if (fresh) startPracticePuzzle();
  else await loadPracticeForSelection();
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
  if (isStart) slot.classList.add('start-word');
  if (isEnd) slot.classList.add('end-word');
  if (isDeadend) slot.classList.add('deadend-word');
  if (prevWord) {
    const op = fullGraph.classifyOp(prevWord, word);
    for (const { char, cls } of diffLetters(prevWord, word, op)) {
      const span = document.createElement('span');
      span.textContent = char;
      if (cls) span.className = cls;
      slot.appendChild(span);
    }
  } else slot.textContent = word;
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
  const rtl = !!languageConfig?.rtl;
  if (key === 'Enter') {
    void submitWord(input.value.trim().toLowerCase());
    return;
  }
  if (key === 'Backspace') {
    input.value = rtl ? input.value.slice(1) : input.value.slice(0, -1);
    return;
  }
  if (key.length === 1) {
    input.value = (rtl ? `${key}${input.value}` : `${input.value}${key}`).toLowerCase();
  }
}

function configureWordInput(input) {
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
  if (playMode !== 'daily' || !puzzle) return;
  await upsertDaily(dailyFields());
}

async function submitWord(word, opts = {}) {
  if (readOnly || solved) return;
  const input = $('#word-input');
  const hint = $('#error-hint');
  if (!word) return;
  const normalizedWord = normalizeForLanguage(word);
  const prev = chain[chain.length - 1];
  if (normalizedWord === prev) return flashError(input, hint, 'Same as previous word');
  if (!fullGraph.has(normalizedWord)) return flashError(input, hint, 'Not in dictionary');
  const op = fullGraph.classifyOp(prev, normalizedWord);
  if (!op) return flashError(input, hint, 'Not a valid single-step transform');
  chain.push(normalizedWord);
  if (opts.fromHelp) helpCount += 1;
  if (normalizedWord === puzzle.end || isPathSolved(chain, puzzle.start, puzzle.end)) {
    solved = true;
    inDeadend = false;
    stopTimer(true);
    setSessionActive(GAME_ID, false);
    notifySessionEnded();
    updateAssistChrome();
    renderChain();
    if (playMode === 'daily') {
      readOnly = true;
      await upsertDaily(dailyFields({ elapsedMs: elapsedMsStored, isComplete: true }));
    }
    showWin(true);
    return;
  }
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
  const rtl = !!languageConfig?.rtl;
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

  const winNew = $('#win-new-btn');
  if (playMode === 'practice') {
    winNew?.classList.remove('hidden');
  } else {
    winNew?.classList.add('hidden');
  }
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
  if (selectedGameDate) {
    const [y, m] = selectedGameDate.split('-').map(Number);
    calendarMonth = new Date(y, m - 1, 1);
  }
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
        selectedGameDate = dateStr;
        playMode = 'daily';
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
  await beginForCurrentSettings({ fresh: true });
}

async function init() {
  await storage.open();
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

  $('#mode-select')?.addEventListener('change', (e) => {
    void setPlayMode(/** @type {HTMLSelectElement} */ (e.target).value);
  });
  $('#btn-calendar')?.addEventListener('click', () => openHistory());
  $('#btn-new-practice')?.addEventListener('click', () => startPracticePuzzle());
  $('#btn-stats')?.addEventListener('click', () => openStats());
  $('#language-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const list = $('#language-list');
    setLanguageMenuOpen(!!list?.classList.contains('hidden'));
  });
  $('#language-list')?.addEventListener('click', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-code]');
    if (!item) return;
    setLanguageMenuOpen(false);
    void switchLanguage(item.getAttribute('data-code'), true, { fresh: true });
  });
  document.addEventListener('click', (e) => {
    const dd = $('#language-dropdown');
    if (dd && !dd.contains(/** @type {Node} */ (e.target))) setLanguageMenuOpen(false);
  });
  $('#win-new-btn')?.addEventListener('click', () => {
    $('#win-overlay').classList.add('hidden');
    startPracticePuzzle();
  });
  $('#win-close-btn')?.addEventListener('click', () => {
    $('#win-overlay').classList.add('hidden');
  });
  document.querySelectorAll('[data-history-close]').forEach((el) => el.addEventListener('click', closeHistory));
  document.querySelectorAll('[data-stats-close]').forEach((el) => el.addEventListener('click', closeStats));
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
    else if (playMode === 'daily' && !solved && !readOnly) startTimer();
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
