import { WordGraph } from './graph.js';
import { analyseGraph, generatePuzzles, shortestPath } from './solver.js';
import { verifyAdminPassword } from './admin-password.js';

const $ = (sel) => document.querySelector(sel);
const LANG_BASE = '/games/transword/data/languages';

let graph = null;
let languageDir = 'English';

function log(msg) {
  const el = $('#log');
  if (!el) return;
  const line = document.createElement('div');
  line.textContent = msg;
  el.prepend(line);
}

async function loadCorpus(dir) {
  const res = await fetch(`${LANG_BASE}/${dir}/corpus.txt`);
  if (!res.ok) throw new Error(`Failed to load corpus for ${dir}`);
  const text = await res.text();
  const words = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    words.push(trimmed.split('\t')[0].toLowerCase());
  }
  return words;
}

async function loadGraph(dir) {
  languageDir = dir;
  log(`Loading ${dir}…`);
  const words = await loadCorpus(dir);
  graph = new WordGraph(words);
  const info = graph.build();
  log(`Graph ready: ${info.words} words, ${info.edges} edges (${info.ms}ms)`);
}

async function unlock() {
  const ok = await verifyAdminPassword($('#pw').value);
  if (!ok) {
    $('#gate-err').textContent = 'Incorrect password';
    return;
  }
  sessionStorage.setItem('wordaholic.twAdmin', '1');
  $('#gate').classList.add('hidden');
  $('#controls').classList.remove('hidden');
  await bootAdmin();
}

async function bootAdmin() {
  const res = await fetch(`${LANG_BASE}/index.json`);
  const list = await res.json();
  const langs = list.filter((l) => Number(l.words || 0) > 0);
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
  await loadGraph(sel.value);
}

$('#unlock-btn').addEventListener('click', unlock);
$('#pw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlock();
});

if (sessionStorage.getItem('wordaholic.twAdmin') === '1') {
  $('#gate').classList.add('hidden');
  $('#controls').classList.remove('hidden');
  bootAdmin();
}
