import { WordGraph } from '../graph.js';
import { analyseGraph, generatePuzzles, shortestPath } from '../solver.js';
import { loadCorpus, loadLanguageIndex } from '../../shared/wordset.js';
import { languageJsonUrl } from '../../../../app/shell/locales.js';

const $ = (sel) => document.querySelector(sel);

let graph = null;
let languageDir = 'English';
let languageRtl = false;

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
  for (const id of ['#start-word', '#end-word', '#pairs-out', '#solve-out']) {
    applyWordDir($(id));
  }
}

async function loadLanguageRtl(dir) {
  languageRtl = false;
  const url = languageJsonUrl(dir);
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const cfg = await res.json();
        languageRtl = cfg.rtl === true;
      }
    } catch {
      /* stay ltr */
    }
  }
  applyAdminWordDir();
}

async function loadGraph(dir) {
  languageDir = dir;
  await loadLanguageRtl(dir);
  log(`Loading ${dir}…`);
  const words = (await loadCorpus(dir)).map((e) => e.word);
  graph = new WordGraph(words);
  const info = graph.build();
  log(`Graph ready: ${info.words} words, ${info.edges} edges (${info.ms}ms)`);
}

export async function bootAdmin() {
  const list = await loadLanguageIndex();
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
