import { HELP_TOPICS } from './topics.js';

const DIALOG_ID = 'wh-help-dialog';
const STYLE_ID = 'wh-help-css';

/** @type {string | null} */
let currentTopicId = null;
let stepIndex = 0;
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

function currentTopic() {
  return currentTopicId ? HELP_TOPICS[currentTopicId] : null;
}

function stepsOf(topic) {
  return Array.isArray(topic?.steps) ? topic.steps : [];
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
      <div class="help-dialog-header">
        <h2 id="help-dialog-title"></h2>
        <button type="button" class="help-dialog-close" data-help-close aria-label="Close">×</button>
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
      <figure class="help-dialog-shot" id="help-dialog-shot" hidden>
        <img id="help-dialog-shot-img" alt="" />
      </figure>
      <p id="help-dialog-body" class="help-dialog-intro"></p>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function bindDialog(root) {
  if (dialogBound) return;
  dialogBound = true;
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-help-close]')) closeHelp();
  });
  root.querySelector('#help-dialog-prev')?.addEventListener('click', () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      renderHelp();
    }
  });
  root.querySelector('#help-dialog-next')?.addEventListener('click', () => {
    const steps = stepsOf(currentTopic());
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      renderHelp();
    }
  });
}

function renderHelp() {
  const topic = currentTopic();
  const root = document.getElementById(DIALOG_ID);
  if (!topic || !root) return;

  const steps = stepsOf(topic);
  const stepped = steps.length > 0;
  const step = stepped ? steps[stepIndex] : null;
  const title = root.querySelector('#help-dialog-title');
  const body = root.querySelector('#help-dialog-body');
  const progress = root.querySelector('#help-dialog-progress');
  const navrow = root.querySelector('.help-dialog-navrow');
  const shot = root.querySelector('#help-dialog-shot');
  const shotImg = /** @type {HTMLImageElement | null} */ (root.querySelector('#help-dialog-shot-img'));
  const prev = /** @type {HTMLButtonElement | null} */ (root.querySelector('#help-dialog-prev'));
  const next = /** @type {HTMLButtonElement | null} */ (root.querySelector('#help-dialog-next'));

  if (title) title.textContent = step?.title || topic.title;
  if (body) body.textContent = step?.body || topic.intro;

  const screenshot = step?.screenshot;
  if (shot && shotImg && screenshot) {
    shotImg.src = screenshot;
    shotImg.alt = step?.title || '';
    shot.hidden = false;
  } else if (shot && shotImg) {
    shotImg.removeAttribute('src');
    shot.hidden = true;
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
          return `<span class="help-progress-dot ${cls}"></span>`;
        })
        .join('');
    }
  }

  const last = stepped && stepIndex >= steps.length - 1;
  if (prev) {
    prev.disabled = !stepped || stepIndex === 0;
  }
  if (next) {
    next.disabled = !stepped || last;
  }
}

/** @param {string} topicId */
export function openHelp(topicId) {
  const topic = HELP_TOPICS[topicId];
  if (!topic) return;
  currentTopicId = topicId;
  stepIndex = 0;
  const root = ensureDialog();
  bindDialog(root);
  renderHelp();
  root.hidden = false;
}

export function closeHelp() {
  const root = document.getElementById(DIALOG_ID);
  if (root) root.hidden = true;
}

export function isHelpOpen() {
  const root = document.getElementById(DIALOG_ID);
  return Boolean(root && !root.hidden);
}

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
      const steps = stepsOf(currentTopic());
      if (stepIndex < steps.length - 1) {
        e.preventDefault();
        stepIndex += 1;
        renderHelp();
      }
    } else if (e.key === 'ArrowLeft') {
      if (stepIndex > 0) {
        e.preventDefault();
        stepIndex -= 1;
        renderHelp();
      }
    }
  },
  true
);
