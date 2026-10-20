import { listGames, KNOWN_GAME_IDS, getGame } from '../games-contract.js';
import { GAME_ICONS } from '../shell/game-icons.js';

const DIALOG_ID = 'wh-help-dialog';
const STYLE_ID = 'wh-help-css';

/** @type {object | null} */
let currentTopic = null;
let stepIndex = 0;
/** @type {{ topic: object, stepIndex: number }[]} */
let topicStack = [];
let dialogBound = false;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/app/help/help.css';
  document.head.appendChild(link);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureStyles);
  } else {
    ensureStyles();
  }
}

function stepsOf(topic) {
  return Array.isArray(topic?.steps) ? topic.steps : [];
}

function asTopic(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value.steps)) return value;
  if (value.default && Array.isArray(value.default.steps)) return value.default;
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

function linkifyHtml(text) {
  return escapeHtml(text).replace(
    /https:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

function menuEntries(step) {
  if (Array.isArray(step?.menu) && step.menu.length) return step.menu;
  if (!step?.menu) return [];
  const games = listGames();
  if (games.length) {
    return games.map((g) => ({
      id: g.id,
      name: g.name,
      src: `/games/${g.id}/help/topic.js`,
    }));
  }
  return KNOWN_GAME_IDS.map((id) => ({
    id,
    name: getGame(id)?.name || id,
    src: `/games/${id}/help/topic.js`,
  }));
}

function ensureDialog() {
  ensureStyles();
  let root = document.getElementById(DIALOG_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = DIALOG_ID;
  root.className = 'help-dialog';
  root.hidden = true;
  root.innerHTML = `
    <div class="help-dialog-backdrop" data-help-close></div>
    <div class="help-dialog-card" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
      <h2 id="help-dialog-title" class="help-dialog-sr"></h2>
      <button type="button" class="help-dialog-close" data-help-close aria-label="Close">×</button>
      <div class="help-dialog-stage">
        <figure class="help-dialog-shot" id="help-dialog-shot" hidden>
          <img id="help-dialog-shot-img" alt="" />
          <div class="help-dialog-overlays" id="help-dialog-overlays"></div>
          <div class="help-dialog-callouts" id="help-dialog-callouts"></div>
          <span class="help-click-circle" id="help-click-circle" hidden></span>
        </figure>
        <div class="help-dialog-text" id="help-dialog-text" hidden></div>
        <div class="help-dialog-menu" id="help-dialog-menu" hidden></div>
      </div>
      <div class="help-dialog-navrow">
        <button type="button" class="help-dialog-arrow" id="help-dialog-prev" aria-label="Previous">
          <svg viewBox="0 0 24 24" aria-hidden="true"><polygon fill="currentColor" points="16 4 6 12 16 20"></polygon></svg>
        </button>
        <div class="help-dialog-progress" id="help-dialog-progress" hidden></div>
        <button type="button" class="help-dialog-arrow" id="help-dialog-next" aria-label="Next">
          <svg viewBox="0 0 24 24" aria-hidden="true"><polygon fill="currentColor" points="8 4 18 12 8 20"></polygon></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function goPrev() {
  if (stepIndex > 0) {
    stepIndex -= 1;
    renderHelp();
    return;
  }
  if (topicStack.length) {
    const prev = topicStack.pop();
    currentTopic = prev.topic;
    stepIndex = prev.stepIndex;
    renderHelp();
  }
}

function clickTargetOf(step) {
  const c = step?.click;
  if (!c) return null;
  const x = Number(c.x);
  const y = Number(c.y);
  const r = Number(c.r);
  if (![x, y, r].every(Number.isFinite) || r <= 0) return null;
  return { x, y, r };
}

/** @param {number} index */
function goToStep(index) {
  const steps = stepsOf(currentTopic);
  if (!Number.isInteger(index) || index < 0 || index >= steps.length || index === stepIndex) return;
  stepIndex = index;
  renderHelp();
}

function goNext() {
  const steps = stepsOf(currentTopic);
  if (stepIndex < steps.length - 1) {
    stepIndex += 1;
    renderHelp();
  }
}

function nudgeCircle() {
  const ring = document.getElementById('help-click-circle');
  if (!ring || ring.hidden) return;
  ring.classList.remove('nudge');
  void ring.offsetWidth;
  ring.classList.add('nudge');
}

function onShotPointer(e) {
  const step = stepsOf(currentTopic)[stepIndex];
  const target = clickTargetOf(step);
  if (!target) return;
  const shot = e.currentTarget;
  if (!(shot instanceof HTMLElement)) return;
  const rect = shot.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const cx = (target.x / 100) * rect.width;
  const cy = (target.y / 100) * rect.height;
  const radius = (target.r / 100) * rect.width;
  const dist = Math.hypot(px - cx, py - cy);
  if (dist <= radius) goNext();
  else nudgeCircle();
}

function bindDialog(root) {
  if (dialogBound) return;
  dialogBound = true;
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-help-close]')) closeHelp();
    const item = t.closest('[data-help-menu-src]');
    if (item) {
      const src = item.getAttribute('data-help-menu-src');
      if (src) void openMenuTopic(src);
    }
    const dot = t.closest('[data-help-step]');
    if (dot) goToStep(Number(dot.getAttribute('data-help-step')));
  });
  root.querySelector('#help-dialog-shot')?.addEventListener('click', onShotPointer);
  root.querySelector('#help-dialog-prev')?.addEventListener('click', goPrev);
  root.querySelector('#help-dialog-next')?.addEventListener('click', goNext);
}

async function openMenuTopic(src) {
  try {
    const url = new URL(src, window.location.origin).href;
    const mod = await import(url);
    const topic = asTopic(mod) || asTopic(mod.default);
    if (!topic || !currentTopic) return;
    topicStack.push({ topic: currentTopic, stepIndex });
    currentTopic = topic;
    stepIndex = 0;
    renderHelp();
  } catch (err) {
    console.warn('Help topic failed to load', src, err);
  }
}

function renderHelp() {
  const topic = currentTopic;
  const root = document.getElementById(DIALOG_ID);
  if (!topic || !root) return;

  const steps = stepsOf(topic);
  const stepped = steps.length > 0;
  const step = stepped ? steps[stepIndex] : null;
  const title = root.querySelector('#help-dialog-title');
  const textEl = root.querySelector('#help-dialog-text');
  const menuEl = root.querySelector('#help-dialog-menu');
  const progress = root.querySelector('#help-dialog-progress');
  const navrow = root.querySelector('.help-dialog-navrow');
  const shot = root.querySelector('#help-dialog-shot');
  const overlaysEl = root.querySelector('#help-dialog-overlays');
  const callouts = root.querySelector('#help-dialog-callouts');
  const ring = root.querySelector('#help-click-circle');
  const shotImg = /** @type {HTMLImageElement | null} */ (root.querySelector('#help-dialog-shot-img'));
  const prev = /** @type {HTMLButtonElement | null} */ (root.querySelector('#help-dialog-prev'));
  const next = /** @type {HTMLButtonElement | null} */ (root.querySelector('#help-dialog-next'));

  const image = step?.image || step?.screenshot;
  const items = menuEntries(step);
  const isMenu = Boolean(step?.menu);
  const bodyText = step?.text || '';

  if (title) title.textContent = topic.tooltip || topic.title || 'Help';

  if (shot && shotImg && callouts) {
    if (image && !isMenu) {
      shotImg.src = image;
      shotImg.alt = '';
      shot.hidden = false;
      shot.classList.toggle('help-dialog-shot--clickable', Boolean(clickTargetOf(step)));
      const layers = Array.isArray(step?.overlays) ? step.overlays : [];
      if (overlaysEl) {
        overlaysEl.innerHTML = layers
          .map((layer) => {
            const x = Number(layer.x);
            const y = Number(layer.y);
            const w = Number(layer.w);
            const src = escapeHtml(layer.src || '');
            const size = Number.isFinite(w) && w > 0 ? `width:${w}%;` : '';
            return `<img class="help-dialog-overlay" alt="" src="${src}" style="left:${x}%;top:${y}%;${size}">`;
          })
          .join('');
      }
      const bubbles = Array.isArray(step?.callouts) ? step.callouts.slice(0, 1) : [];
      callouts.innerHTML = bubbles
        .map((c) => {
          const x = Number(c.x);
          const y = Number(c.y);
          const place = c.place || 'top';
          return `<div class="help-callout" data-place="${escapeHtml(place)}" style="left:${x}%;top:${y}%">${escapeHtml(c.text || '')}</div>`;
        })
        .join('');
      const hit = clickTargetOf(step);
      if (ring instanceof HTMLElement) {
        if (hit) {
          ring.hidden = false;
          ring.classList.remove('nudge');
          ring.style.left = `${hit.x}%`;
          ring.style.top = `${hit.y}%`;
          ring.style.width = `${hit.r * 2}%`;
          ring.style.animation = 'none';
          void ring.offsetWidth;
          ring.style.animation = '';
        } else {
          ring.hidden = true;
          ring.classList.remove('nudge');
        }
      }
    } else {
      shotImg.removeAttribute('src');
      if (overlaysEl) overlaysEl.innerHTML = '';
      callouts.innerHTML = '';
      shot.hidden = true;
      shot.classList.remove('help-dialog-shot--clickable');
      if (ring instanceof HTMLElement) {
        ring.hidden = true;
        ring.classList.remove('nudge');
      }
    }
  }

  if (textEl) {
    if (bodyText && !isMenu) {
      textEl.innerHTML = linkifyHtml(bodyText);
      textEl.hidden = false;
    } else {
      textEl.textContent = '';
      textEl.hidden = true;
    }
  }

  if (menuEl) {
    if (isMenu) {
      menuEl.hidden = false;
      menuEl.innerHTML =
        `<p class="help-dialog-menu-kicker">Game manuals</p>` +
        items
          .map(
            (item) => {
              const icon = GAME_ICONS[item.id] || '';
              const iconHtml = icon ? `<span class="help-dialog-menu-icon" aria-hidden="true">${icon}</span>` : '';
              return `<button type="button" class="help-dialog-menu-item" data-help-menu-src="${escapeHtml(item.src)}">${iconHtml}<span class="help-dialog-menu-name">${escapeHtml(item.name)}</span></button>`;
            }
          )
          .join('');
    } else {
      menuEl.hidden = true;
      menuEl.innerHTML = '';
    }
  }

  if (navrow) navrow.hidden = !stepped;
  if (progress) {
    if (!stepped) {
      progress.hidden = true;
      progress.innerHTML = '';
    } else {
      progress.hidden = false;
      progress.innerHTML = steps
        .map((_, i) => {
          const cls = i === stepIndex ? 'active' : i < stepIndex ? 'completed' : '';
          const current = i === stepIndex ? ' aria-current="step"' : '';
          return `<button type="button" class="help-progress-dot ${cls}" data-help-step="${i}" aria-label="Step ${i + 1}"${current}></button>`;
        })
        .join('');
    }
  }

  const last = stepped && stepIndex >= steps.length - 1;
  const canPop = topicStack.length > 0 && stepIndex === 0;
  if (prev) prev.disabled = !stepped || (stepIndex === 0 && !canPop);
  if (next) next.disabled = !stepped || last;
}

/** @param {object} topic */
export function openHelp(topic) {
  const resolved = asTopic(topic);
  if (!resolved) return;
  currentTopic = resolved;
  topicStack = [];
  stepIndex = 0;
  const root = ensureDialog();
  bindDialog(root);
  renderHelp();
  root.hidden = false;
}

export function closeHelp() {
  const root = document.getElementById(DIALOG_ID);
  if (root) root.hidden = true;
  topicStack = [];
}

export function isHelpOpen() {
  const root = document.getElementById(DIALOG_ID);
  return Boolean(root && !root.hidden);
}

export const HELP_ICON_SVG = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;

document.addEventListener(
  'keydown',
  (e) => {
    if (!isHelpOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      const steps = stepsOf(currentTopic);
      if (stepIndex < steps.length - 1 && (e.key === 'ArrowRight' || !clickTargetOf(steps[stepIndex]))) {
        e.preventDefault();
        goNext();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
  },
  true
);
