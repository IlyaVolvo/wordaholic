import { WordGraph } from './graph.js';
import { generatePuzzles } from './solver.js';
import { storage } from '../../app/storage/idb.js';
import { setSessionActive } from '../../app/updates/manifest.js';
import { notifySessionEnded } from '../../app/shell/update-ui.js';
import {
  getPreferredLanguageCodes,
  pickActiveLanguage,
  setLastLanguage,
} from '../../app/i18n-prefs/preferred.js';

const GAME_ID = 'transword';
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

let corpusEntries = [];
let fullGraph = null;
let puzzleGraph = null;
let puzzle = null;
let chain = [];
let timerStart = null;
let timerHandle = null;
let solved = false;
let language = 'en'; // locale code e.g. en
let languageDir = 'English'; // original TransWord directory name
let languageConfig = {};
let languageOptions = [];

const LANG_BASE = '/games/transword/data/languages';

function normalizeForLanguage(word) {
  if (!languageConfig?.normalization) return word;
  let out = word;
  for (const [group, base] of Object.entries(languageConfig.normalization)) {
    for (const ch of group) out = out.split(ch).join(base);
  }
  return out;
}

function selectedLevel() {
  return parseInt($('#level-select').value, 10);
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
  const res = await fetch(`${LANG_BASE}/${dir}/language.json`);
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
  const urls = [`${LANG_BASE}/index.json`];
  let list = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      list = await res.json();
      break;
    } catch {
      /* try next */
    }
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

async function switchLanguage(code, startPuzzle = true) {
  const opt = languageOptions.find((l) => l.code === code) || languageOptions.find((l) => l.dir === code);
  if (!opt) throw new Error(`Unknown language ${code}`);
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
  hideLoading();
  if (startPuzzle) startNewPuzzle();
}

function difficultyRange() {
  const v = parseInt($('#difficulty').value, 10);
  if (v <= 3) return [2, 3];
  if (v <= 5) return [4, 5];
  return [6, 8];
}

function startNewPuzzle() {
  const [min, max] = difficultyRange();
  const puzzles = generatePuzzles(puzzleGraph, { minSteps: min, maxSteps: max, count: 5, sampleSize: 400 });
  if (!puzzles.length) {
    alert('Could not find a puzzle for this difficulty / level.');
    return;
  }
  puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
  chain = [puzzle.start];
  solved = false;
  setSessionActive(GAME_ID, true);
  $('#target-word').textContent = puzzle.end;
  $('#optimal-count').textContent = puzzle.dist;
  $('#step-count').textContent = '0';
  $('#win-overlay').classList.add('hidden');
  startTimer();
  renderChain();
}

function startTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerStart = Date.now();
  updateTimerDisplay();
  timerHandle = setInterval(updateTimerDisplay, 250);
}
function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}
function elapsedStr() {
  const s = Math.floor((Date.now() - timerStart) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function updateTimerDisplay() {
  $('#timer').textContent = elapsedStr();
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
    container.appendChild(makeWordNode(chain[i], i === 0, chain[i] === puzzle.end, !solved && i === chain.length - 1 && i > 0, i > 0 ? chain[i - 1] : null));
  }
  if (!solved) {
    container.appendChild(makeConnector(null, null));
    container.appendChild(makeInputNode());
  }
  $('#step-count').textContent = String(chain.length - 1);
  const c = $('#chain-container');
  requestAnimationFrame(() => {
    c.scrollTop = c.scrollHeight;
  });
}

function makeWordNode(word, isStart, isEnd, canUndo, prevWord) {
  const node = document.createElement('div');
  node.className = 'node';
  const wrap = document.createElement('div');
  wrap.className = 'word-slot-wrap';
  const slot = document.createElement('div');
  slot.className = 'word-slot';
  if (isStart) slot.classList.add('start-word');
  if (isEnd) slot.classList.add('end-word');
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
    x.addEventListener('click', () => {
      if (chain.length > 1 && !solved) {
        chain.pop();
        renderChain();
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

function makeInputNode() {
  const node = document.createElement('div');
  node.className = 'node';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input-slot';
  input.placeholder = 'type a word…';
  input.id = 'word-input';
  input.autocomplete = 'off';
  const hint = document.createElement('div');
  hint.className = 'error-hint';
  hint.id = 'error-hint';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitWord(input.value.trim().toLowerCase());
    }
  });
  node.appendChild(input);
  node.appendChild(hint);
  requestAnimationFrame(() => input.focus());
  return node;
}

function submitWord(word) {
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
  if (normalizedWord === puzzle.end) {
    solved = true;
    stopTimer();
    setSessionActive(GAME_ID, false);
    notifySessionEnded();
    renderChain();
    showWin();
    return;
  }
  renderChain();
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
  const enterCfg = { label: actions?.enter?.label || 'ENTER', position: actions?.enter?.position || 'start', row: Number.isInteger(actions?.enter?.row) ? actions.enter.row : lastRow };
  const backCfg = { label: actions?.backspace?.label || '⌫', position: actions?.backspace?.position || 'end', row: Number.isInteger(actions?.backspace?.row) ? actions.backspace.row : lastRow };

  for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard-row';
    const addAction = (cfg, type) => {
      if (cfg.row !== rowIndex || cfg.position === 'none') return;
      if (cfg.position === 'start' || cfg.position === 'end') {
        /* added below in order */
      }
    };
    void addAction;
    const maybe = (cfg, type, pos) => {
      if (cfg.row !== rowIndex || cfg.position !== pos) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key key-action';
      btn.textContent = cfg.label;
      btn.addEventListener('click', () => {
        const input = $('#word-input');
        if (!input || solved) return;
        if (type === 'enter') submitWord(input.value.trim().toLowerCase());
        else input.value = rtl ? input.value.slice(1) : input.value.slice(0, -1);
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
        if (!input || solved) return;
        input.value = (rtl ? `${key}${input.value}` : `${input.value}${key}`).toLowerCase();
        input.focus();
      });
      rowEl.appendChild(btn);
    }
    maybe(enterCfg, 'enter', 'end');
    maybe(backCfg, 'backspace', 'end');
    root.appendChild(rowEl);
  }
}

async function showWin() {
  const steps = chain.length - 1;
  $('#win-steps').textContent = steps;
  $('#win-optimal').textContent = puzzle.dist;
  $('#win-time').textContent = elapsedStr();
  $('#win-path').innerHTML = chain
    .map((w, i) => {
      if (i === 0) return `<strong>${w}</strong>`;
      const op = fullGraph.classifyOp(chain[i - 1], w);
      const badge = op ? `<span class="op-inline ${op}">${OP_LABELS[op]}</span>` : '';
      return ` → ${badge} <strong>${w}</strong>`;
    })
    .join('');
  $('#win-overlay').classList.remove('hidden');
  await storage.putResult(GAME_ID, language, {
    storageSchema: 1,
    start: puzzle.start,
    end: puzzle.end,
    steps,
    optimal: puzzle.dist,
    path: [...chain],
    elapsedMs: Date.now() - timerStart,
  });
  const stats = (await storage.getStatistics(GAME_ID)) || { solved: 0, totalSteps: 0 };
  stats.solved += 1;
  stats.totalSteps += steps;
  await storage.setStatistics(GAME_ID, stats);
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

export const plugin = {
  id: GAME_ID,
  name: 'TransWord',
  storageSchema: 1,
  languages: [],
  async initialize() {},
  start() { startNewPuzzle(); },
  saveState() { return { language, chain, puzzle, solved }; },
  restoreState() {},
  getStatistics() { return storage.getStatistics(GAME_ID); },
  isSessionActive() { return !solved && chain.length > 1; },
};

async function init() {
  await storage.open();
  showLoading('Loading languages…');
  languageOptions = await loadLanguagesCatalog();
  const sel = $('#language-select');
  sel.innerHTML = languageOptions
    .map((l) => `<option value="${l.code}">${l.flag || ''} ${l.menu}</option>`)
    .join('');
  const preferred = getPreferredLanguageCodes();
  const picked = pickActiveLanguage(
    preferred,
    languageOptions.map((l) => l.code)
  );
  if (!picked) throw new Error('No TransWord languages available');
  sel.value = picked;
  $('#game').classList.remove('hidden');
  $('#new-btn').addEventListener('click', () => startNewPuzzle());
  $('#win-new-btn').addEventListener('click', () => {
    $('#win-overlay').classList.add('hidden');
    startNewPuzzle();
  });
  $('#level-select').addEventListener('change', () => {
    showLoading('Rebuilding graph…');
    requestAnimationFrame(() => {
      buildGraphs(corpusEntries);
      hideLoading();
      startNewPuzzle();
    });
  });
  sel.addEventListener('change', (e) => switchLanguage(e.target.value, true));
  $('#btn-export')?.addEventListener('click', async () => {
    const payload = await storage.exportGame(GAME_ID);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wordaholic-${GAME_ID}-backup.json`;
    a.click();
  });
  $('#import-file')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await storage.importGame(JSON.parse(await f.text()));
    alert('Import complete');
  });
  await switchLanguage(picked, true);
}

init().catch((err) => {
  console.error(err);
  setLoading(`Error: ${err.message}`);
});
