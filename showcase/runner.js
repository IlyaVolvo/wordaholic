import { scenes, sceneById } from './registry.js';
import { showcaseDetail, showcaseSceneId } from '/app/storage/showcase-mode.js';
import { SHOWCASE_DATE } from '/app/daily/showcase-date.js';
import { getDailyWord } from '/app/daily/daily-word.js';
import { getHydraDailyWords } from '/app/daily/hydra-words.js';

const SESSION = 'wordaholic.showcaseRun';
const RANK = { glance: 0, tour: 1, deep: 2 };
const DB_NAME = 'wordaholic-showcase';

export { scenes };

function readRun() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION) || 'null');
  } catch {
    return null;
  }
}

function writeRun(run) {
  sessionStorage.setItem(SESSION, JSON.stringify(run));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(el) {
  if (!(el instanceof Element)) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function find(selector) {
  return [...document.querySelectorAll(selector)].find(isVisible) || null;
}

async function waitFor(label, test, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = test();
    if (found) return found;
    await sleep(50);
  }
  throw new Error(`Showcase timed out waiting for ${label}`);
}

function pointOn(el) {
  const rect = el.getBoundingClientRect();
  for (let r = 1; r <= 6; r += 1) {
    for (let c = 1; c <= 6; c += 1) {
      const x = rect.left + (rect.width * c) / 7;
      const y = rect.top + (rect.height * r) / 7;
      const hit = document.elementsFromPoint(x, y).some((node) => node === el || el.contains(node));
      if (hit) return { x, y };
    }
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function clickElement(el) {
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
    const { x, y } = pointOn(el);
    const common = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', common));
    el.dispatchEvent(new MouseEvent('mousedown', common));
    el.dispatchEvent(new PointerEvent('pointerup', common));
    el.dispatchEvent(new MouseEvent('mouseup', common));
    el.dispatchEvent(new MouseEvent('click', common));
    return;
  }
  el.click();
}

function pressKey(key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
}

async function settleOverlay() {
  const overlay = document.querySelector('#prep-overlay');
  if (!(overlay instanceof HTMLElement)) return;
  const start = Date.now();
  while (!overlay.hidden && Date.now() - start < 20000) await sleep(80);
  await sleep(150);
}

function ensureLayer() {
  let layer = document.querySelector('.showcase-layer');
  if (layer) return layer;
  const style = document.createElement('style');
  style.textContent = `
    .showcase-layer { position: fixed; inset: 0; z-index: 4000; pointer-events: none; }
    .showcase-layer .help-callout { position: fixed; z-index: 4001; max-width: 16rem; }
  `;
  document.head.appendChild(style);
  layer = document.createElement('div');
  layer.className = 'showcase-layer';
  document.body.appendChild(layer);
  return layer;
}

function showCallout(callout) {
  const layer = ensureLayer();
  layer.replaceChildren();
  if (!callout?.text) return;
  const target = callout.selector ? find(callout.selector) : null;
  const bubble = document.createElement('div');
  bubble.className = 'help-callout';
  bubble.dataset.place = callout.place || 'bottom';
  bubble.textContent = callout.text;
  layer.appendChild(bubble);
  if (!target) {
    bubble.style.left = '50%';
    bubble.style.top = '12%';
    bubble.style.transform = 'translateX(-50%)';
    return;
  }
  const rect = target.getBoundingClientRect();
  const place = bubble.dataset.place;
  const gap = 10;
  if (place === 'top') {
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.top - gap}px`;
    bubble.style.transform = 'translate(-50%, -100%)';
  } else if (place === 'left') {
    bubble.style.left = `${rect.left - gap}px`;
    bubble.style.top = `${rect.top + rect.height / 2}px`;
    bubble.style.transform = 'translate(-100%, -50%)';
  } else if (place === 'right') {
    bubble.style.left = `${rect.right + gap}px`;
    bubble.style.top = `${rect.top + rect.height / 2}px`;
    bubble.style.transform = 'translate(0, -50%)';
  } else {
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.top = `${rect.bottom + gap}px`;
    bubble.style.transform = 'translate(-50%, 0)';
  }
}

function clearCallout() {
  document.querySelector('.showcase-layer')?.replaceChildren();
}

async function answerDictionary(length) {
  const response = await fetch(`/games/g1/data/languages/English/answers-${length}.txt`);
  if (!response.ok) throw new Error(`Could not load English answers-${length}`);
  const words = (await response.text())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[0].toLowerCase())
    .filter(Boolean)
    .sort();
  return { language: 'en', wordLength: length, answerWords: words };
}

async function expandKey(key) {
  if (key === '{daily}') {
    const dictionary = await answerDictionary(5);
    return getDailyWord(dictionary, SHOWCASE_DATE).toLowerCase().split('');
  }
  if (key === '{hydra}') {
    const dictionary = await answerDictionary(5);
    const boards = document.querySelector('select[aria-label="Number of boards"]');
    const count = boards instanceof HTMLSelectElement ? Number(boards.value) || 16 : 16;
    const word = getHydraDailyWords(dictionary, SHOWCASE_DATE, count)[0] || '';
    return word.toLowerCase().split('');
  }
  return [key];
}

async function pressKeys(keys) {
  for (const key of keys) {
    const expanded = await expandKey(key);
    for (const part of expanded) {
      pressKey(part);
      await sleep(200);
    }
  }
  await sleep(250);
}

function keepShowcaseOnLinks() {
  if (document.documentElement.dataset.showcaseGuard) return;
  document.documentElement.dataset.showcaseGuard = '1';
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href]');
      if (!link) return;
      let url;
      try {
        url = new URL(link.getAttribute('href') || '', location.origin);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (link.hasAttribute('download')) return;
      if (url.origin !== location.origin) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (url.searchParams.get('showcase') === '1') return;
      event.preventDefault();
      event.stopPropagation();
      const current = new URLSearchParams(location.search);
      url.searchParams.set('showcase', '1');
      if (current.get('scene')) url.searchParams.set('scene', current.get('scene'));
      if (current.get('detail')) url.searchParams.set('detail', current.get('detail'));
      location.assign(`${url.pathname}${url.search}${url.hash}`);
    },
    true
  );
}

async function resetDemo() {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  localStorage.setItem('showcase.wordaholic.favoriteLanguages', JSON.stringify(['en']));
  localStorage.setItem('showcase.wordaholic.lastLanguage', 'en');
}

export async function prepareShowcaseRun() {
  keepShowcaseOnLinks();
  const scene = showcaseSceneId();
  const detail = showcaseDetail();
  const saved = readRun();
  if (saved && saved.scene === scene && saved.detail === detail && saved.step > 0) return;
  await resetDemo();
  writeRun({ scene, detail, step: 0, backup: null });
}

async function stashExport() {
  const { exportSiteBackup } = await import('/app/shell/site-backup.js');
  const payload = await exportSiteBackup();
  const run = readRun();
  run.backup = JSON.stringify(payload);
  writeRun(run);
  const button = await waitFor('export', () => find('[data-transfer="export"]'));
  clickElement(button);
}

async function importStash() {
  const run = readRun();
  if (!run?.backup) throw new Error('Import has no backup from the export step');
  const input = await waitFor('import file', () => document.querySelector('[data-transfer-file]'));
  const file = new File([run.backup], 'wordaholic-backup.json', { type: 'application/json' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function solveTransword() {
  for (let i = 0; i < 8; i += 1) {
    const win = document.querySelector('#win-overlay');
    if (win && !win.classList.contains('hidden')) return;
    const help = find('#btn-help');
    if (!help) break;
    clickElement(help);
    await sleep(700);
  }
}

/**
 * @param {import('./registry.js').Action | undefined} action
 */
async function runAction(action) {
  const step = action || { type: 'wait' };
  if (step.type === 'wait') {
    if (step.selector) {
      await waitFor(step.selector, () => {
        const el = find(step.selector);
        if (!el) return null;
        if (step.text && !el.textContent?.includes(step.text)) return null;
        return el;
      });
    }
    if (step.ms) await sleep(step.ms);
    return false;
  }
  if (step.type === 'click' || step.type === 'hover') {
    const el = await waitFor(step.selector, () => find(step.selector));
    if (step.type === 'hover') {
      const { x, y } = pointOn(el);
      const move = { bubbles: true, clientX: x, clientY: y, view: window };
      el.dispatchEvent(new PointerEvent('pointermove', move));
      el.dispatchEvent(new MouseEvent('mouseover', move));
      return false;
    }
    const navigates = el.matches('[data-game]');
    clickElement(el);
    await settleOverlay();
    return navigates;
  }
  if (step.type === 'type') {
    const el = await waitFor(step.selector, () => find(step.selector));
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      throw new Error(`Cannot type into ${step.selector}`);
    }
    el.focus();
    el.value = step.text || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return false;
  }
  if (step.type === 'select') {
    const el = await waitFor(step.selector, () => find(step.selector));
    if (!(el instanceof HTMLSelectElement)) throw new Error(`Cannot select ${step.selector}`);
    el.value = step.value || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return false;
  }
  if (step.type === 'press') {
    await pressKeys(step.keys || []);
    return false;
  }
  if (step.type === 'export') {
    await stashExport();
    return false;
  }
  if (step.type === 'import') {
    await importStash();
    await sleep(600);
    return false;
  }
  if (step.type === 'solve-transword') {
    await solveTransword();
    return false;
  }
  if (step.type === 'goto') {
    const url = new URL(step.path || '/', location.origin);
    const current = new URLSearchParams(location.search);
    url.searchParams.set('showcase', '1');
    if (current.get('scene')) url.searchParams.set('scene', current.get('scene'));
    if (current.get('detail')) url.searchParams.set('detail', current.get('detail'));
    location.assign(`${url.pathname}${url.search}${url.hash}`);
    return true;
  }
  throw new Error(`Unknown showcase action ${step.type}`);
}

function fail(error) {
  console.error(error);
  document.documentElement.dataset.showcase = 'error';
  window.__showcaseError = error instanceof Error ? error.message : String(error);
  window.__showcaseDone = true;
}

export async function startShowcaseRun() {
  if (window.__showcaseStarted) return;
  window.__showcaseStarted = true;
  try {
    const run = readRun();
    const scene = sceneById(run?.scene || showcaseSceneId());
    if (!scene) throw new Error('Unknown showcase scene');
    const detail = run?.detail || showcaseDetail();
    const steps = scene.steps.filter((step) => RANK[step.detail] <= RANK[detail]);
    let index = run?.step || 0;
    while (index < steps.length) {
      const step = steps[index];
      const next = { ...readRun(), step: index + 1 };
      writeRun(next);
      if (!step.reveal && step.callout) {
        if (step.callout.selector) {
          await waitFor(step.callout.selector, () => find(step.callout.selector));
        }
        showCallout(step.callout);
        await sleep(step.read || 1500);
      }
      const left = await runAction(step.do);
      if (left) return;
      if (step.reveal && step.callout?.selector) {
        await waitFor(step.callout.selector, () => find(step.callout.selector), 25000);
        showCallout(step.callout);
        await sleep(step.read || 1800);
      }
      await settleOverlay();
      await sleep(step.after || 800);
      index += 1;
    }
    clearCallout();
    await sleep(600);
    document.documentElement.dataset.showcase = 'done';
    window.__showcaseDone = true;
  } catch (error) {
    fail(error);
  }
}
