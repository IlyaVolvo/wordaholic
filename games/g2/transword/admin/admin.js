import { WordGraph } from '../graph.js';
import { analyseGraph, generatePuzzles, shortestPath } from '../solver.js';
import { loadCorpus, loadLanguageIndex } from '../../shared/wordset.js';
import { languageJsonUrl } from '../../../../app/shell/locales.js';
import { normalizeWithMappings } from '../../../../app/i18n/normalize.js';
import { getGame } from '../../../../app/games-contract.js';
import '../registration.js';

const $ = (sel) => document.querySelector(sel);

let graph = null;
let dictionary = new Set();
let languageDir = 'English';
let languagesByDir = new Map();
let languageRtl = false;
let languageNormalization = null;

function log(msg) {
  const el = $('#log');
  if (!el) return;
  const line = document.createElement('div');
  line.textContent = msg;
  el.prepend(line);
}

function wordDir() {
  return languageRtl ? 'rtl' : 'ltr';
}

function applyWordDir(el) {
  if (el) el.dir = wordDir();
}

function applyAdminWordDir() {
  for (const id of ['#start-word', '#end-word', '#pairs-out', '#solve-out', '#investigate-start', '#investigate-target']) {
    applyWordDir($(id));
  }
}

function adminWord(raw) {
  return normalizeWithMappings(String(raw || '').trim().toLowerCase(), languageNormalization);
}

async function loadLanguageRtl(dir) {
  languageRtl = false;
  languageNormalization = null;
  const url = languageJsonUrl(dir);
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const cfg = await res.json();
        languageRtl = cfg.rtl === true;
        languageNormalization = cfg.normalization || null;
      }
    } catch {
      /* stay ltr */
    }
  }
  applyAdminWordDir();
}

function investigateError(msg) {
  const el = $('#investigate-err');
  if (el) el.textContent = msg;
}

function playInvestigation() {
  investigateError('');
  if (!graph) {
    investigateError('Language graph is still loading.');
    return;
  }
  const start = adminWord($('#investigate-start').value);
  const target = adminWord($('#investigate-target').value);
  if (!start || !target) {
    investigateError('Enter a first word and a target.');
    return;
  }
  const registered = new Set(getGame('transword')?.languages || []);
  const entry = languagesByDir.get(languageDir);
  if (!entry?.code || !registered.has(entry.code)) {
    investigateError('TransWord cannot play this language.');
    return;
  }
  if (!dictionary.has(start)) {
    investigateError(`“${start}” is not in this dictionary.`);
    return;
  }
  if (!dictionary.has(target)) {
    investigateError(`“${target}” is not in this dictionary.`);
    return;
  }
  const q = new URLSearchParams({
    investigate: '1',
    dir: languageDir,
    start,
    target,
  });
  location.assign(`/games/g2/transword/?${q}`);
}

async function loadGraph(dir) {
  languageDir = dir;
  await loadLanguageRtl(dir);
  log(`Loading ${dir}…`);
  const words = (await loadCorpus(dir)).map((e) => e.word);
  dictionary = new Set(words.map((word) => adminWord(word)));
  graph = new WordGraph(words);
  const info = graph.build();
  log(`Graph ready: ${info.words} words, ${info.edges} edges (${info.ms}ms)`);
}

export async function bootAdmin() {
  const list = await loadLanguageIndex();
  const langs = list.filter((l) => Number(l.words || 0) > 0);
  languagesByDir = new Map(langs.map((l) => [l.dir, l]));
  const sel = $('#language-select');
  sel.innerHTML = langs.map((l) => `<option value="${l.dir}">${l.flag || ''} ${l.menu}</option>`).join('');
  sel.addEventListener('change', () => loadGraph(sel.value));
  $('#analyse-btn').addEventListener('click', () => {
    const sample = Number($('#sample-size').value) || 200;
    const report = analyseGraph(graph, sample);
    log(JSON.stringify(report, null, 2));
  });
  $('#generate-btn').addEventListener('click', () => {
    const puzzles = generatePuzzles(graph, {
      minSteps: Number($('#min-steps').value) || 3,
      maxSteps: Number($('#max-steps').value) || 6,
      count: Number($('#pair-count').value) || 10,
      sampleSize: 300,
    });
    $('#pairs-out').textContent = puzzles.map((p) => `${p.start} → ${p.end} (${p.dist})`).join('\n');
  });
  $('#solve-btn').addEventListener('click', () => {
    const start = $('#start-word').value.trim().toLowerCase();
    const end = $('#end-word').value.trim().toLowerCase();
    const result = shortestPath(graph, start, end);
    $('#solve-out').textContent = result ? `${result.dist}: ${result.path.join(' → ')}` : 'No path';
  });
  $('#investigate-btn').addEventListener('click', playInvestigation);
  for (const id of ['#investigate-start', '#investigate-target']) {
    $(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playInvestigation();
    });
  }
  await loadGraph(sel.value);
}
