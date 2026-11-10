/**
 * Home-map popup: missing or questionable word report.
 * Sends game, language, action, words, and an optional name. No account is attached.
 * A blank name is sent as anonymous.
 */

const WORD_RE = /^(?=.*\p{L})[\p{L}\p{M}'’ʼ-]+$/u;
const NAME_INPUT = `<input type="text" name="name" maxlength="80" autocomplete="name" dir="auto" value="anonymous" placeholder="anonymous" />`;

/**
 * @param {string} name
 */
function sentAnonymously(name) {
  const value = String(name || '').trim();
  return !value || value.toLowerCase() === 'anonymous';
}

/**
 * Selecting the default name lets a reporter type over it, or leave it.
 * @param {HTMLInputElement | null} input
 */
function bindNameField(input) {
  input?.addEventListener('focus', () => {
    if (input.value.trim().toLowerCase() === 'anonymous') input.select();
  });
}

/**
 * Visible box the icon must stay inside. Overflow on an ancestor clips it.
 * @param {HTMLElement} element
 */
function clipBox(element) {
  let left = 0;
  let right = window.innerWidth;
  let node = element.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const overflow = style.overflowX;
    if (overflow === 'hidden' || overflow === 'clip' || overflow === 'auto' || overflow === 'scroll') {
      const rect = node.getBoundingClientRect();
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
    node = node.parentElement;
  }
  return { left, right };
}

/**
 * Keep the icon on the right of the word. Move it above when that side is clipped.
 * @param {HTMLElement} button
 */
function coversAnotherBoard(button, box) {
  const own = button.closest('.game-board');
  for (const board of document.querySelectorAll('.game-board')) {
    if (board === own) continue;
    const rect = board.getBoundingClientRect();
    const overlaps = box.right > rect.left + 2
      && box.left < rect.right - 2
      && box.bottom > rect.top + 2
      && box.top < rect.bottom - 2;
    if (overlaps) return true;
  }
  return false;
}

export function placeMissingReport(button) {
  if (!(button instanceof HTMLElement) || button.hidden) return;
  button.classList.remove('is-above');
  const box = button.getBoundingClientRect();
  if (box.width < 1) return;
  const limit = clipBox(button);
  const clipped = box.right > limit.right - 2 || box.left < limit.left + 2;
  if (clipped || coversAnotherBoard(button, box)) button.classList.add('is-above');
}

/**
 * @param {HTMLElement} button
 * @returns {() => void}
 */
export function bindMissingReport(button) {
  const place = () => placeMissingReport(button);
  place();
  const observer = new ResizeObserver(place);
  let node = button.parentElement;
  while (node) {
    observer.observe(node);
    node = node.parentElement;
  }
  window.addEventListener('resize', place);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', place);
  };
}

/**
 * @param {string} raw
 * @returns {string[] | null}
 */
function parseWords(raw) {
  const words = String(raw || '').trim().split(/[,\s]+/).filter(Boolean);
  if (!words.length || words.length > 40) return null;
  if (words.some((word) => word.length > 64 || !WORD_RE.test(word))) return null;
  return words;
}

/**
 * @param {{ code: string, menu: string, flag?: string }[]} languages
 * @param {{ id: string, name: string }[]} games
 */
export function openWordReport(languages, games) {
  document.querySelector('[data-word-report]')?.remove();
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.wordReport = '';
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-close></div>
    <div class="update-dialog-card" role="dialog" aria-modal="true" aria-labelledby="word-report-title">
      <h2 id="word-report-title">Report a word</h2>
      <p class="update-lead">Pick a game and a language, say whether the words are missing or questionable, then send.</p>
      <form data-word-report-form>
        <label class="word-report-field">
          Name
          ${NAME_INPUT}
        </label>
        <label class="word-report-field">
          Game
          <select name="game" required>
            <option value="" selected disabled>Select a game</option>
          </select>
        </label>
        <label class="word-report-field">
          Language
          <select name="language" required>
            <option value="" selected disabled>Select a language</option>
          </select>
        </label>
        <fieldset class="word-report-field">
          <legend>Missing or questionable</legend>
          <div class="word-report-choices">
            <label><input type="radio" name="action" value="missing" required /> Missing</label>
            <label><input type="radio" name="action" value="questionable" /> Questionable</label>
          </div>
        </fieldset>
        <label class="word-report-field">
          Words
          <input type="text" name="words" required maxlength="800" autocomplete="off" dir="auto" placeholder="Separate with spaces or commas" />
        </label>
        <p class="word-report-error" data-word-report-error hidden></p>
        <div class="update-actions">
          <button type="submit" class="btn primary" data-word-report-send>Send report</button>
          <button type="button" class="btn" data-close>Cancel</button>
        </div>
      </form>
    </div>
  `;

  const gameSelect = /** @type {HTMLSelectElement | null} */ (host.querySelector('select[name="game"]'));
  for (const game of games) {
    if (!game?.id) continue;
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    gameSelect?.appendChild(option);
  }

  const select = /** @type {HTMLSelectElement | null} */ (host.querySelector('select[name="language"]'));
  for (const lang of languages) {
    if (!lang?.code) continue;
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.flag ? `${lang.flag} ${lang.menu}` : lang.menu;
    select?.appendChild(option);
  }

  const close = () => {
    document.removeEventListener('keydown', onKey);
    host.remove();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  host.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-close]')) close();
  });
  host.querySelector('[data-word-report-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendReport(host);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(host);
  const homeName = /** @type {HTMLInputElement | null} */ (host.querySelector('input[name="name"]'));
  bindNameField(homeName);
  homeName?.focus();
}

/**
 * @param {HTMLElement} host
 */
async function sendReport(host) {
  const form = /** @type {HTMLFormElement | null} */ (host.querySelector('[data-word-report-form]'));
  const errorEl = host.querySelector('[data-word-report-error]');
  const sendBtn = /** @type {HTMLButtonElement | null} */ (host.querySelector('[data-word-report-send]'));
  if (!form || !errorEl) return;
  const data = new FormData(form);
  const game = String(data.get('game') || '');
  const language = String(data.get('language') || '');
  const action = String(data.get('action') || '');
  const words = String(data.get('words') || '').trim();
  const name = String(data.get('name') || '').trim().replace(/\s+/g, ' ');
  const showError = (message) => {
    errorEl.hidden = false;
    errorEl.textContent = message;
  };
  if (!game) {
    showError('Choose a game');
    return;
  }
  if (!language) {
    showError('Choose a language');
    return;
  }
  if (action !== 'missing' && action !== 'questionable') {
    showError('Choose missing or questionable');
    return;
  }
  if (!parseWords(words)) {
    showError('Enter one or more words, separated by spaces or commas');
    return;
  }
  if (name.length > 80) {
    showError('Name is too long');
    return;
  }
  errorEl.hidden = true;
  if (sendBtn) sendBtn.disabled = true;
  try {
    const res = await fetch('/api/word-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, language, action, words, name }),
    });
    /** @type {{ ok?: boolean, error?: string }} */
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok || !body.ok) {
      showError(body.error || 'Could not send the report');
      if (sendBtn) sendBtn.disabled = false;
      return;
    }
  } catch {
    showError('You need to be online to send a report');
    if (sendBtn) sendBtn.disabled = false;
    return;
  }
  const card = host.querySelector('.update-dialog-card');
  if (!card) return;
  card.innerHTML = `
    <h2 id="word-report-title">Report sent</h2>
    <p class="update-lead">Thanks. The report was sent${sentAnonymously(name) ? ' anonymously' : ''}.</p>
    <div class="update-actions">
      <button type="button" class="btn primary" data-close>Close</button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureReportStyles() {
  if (document.getElementById('word-report-inline-style')) return;
  const style = document.createElement('style');
  style.id = 'word-report-inline-style';
  style.textContent = `
    [data-word-report].update-dialog {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: grid;
      place-items: center;
      padding: 1rem;
      font-family: "DM Sans", system-ui, sans-serif;
      color: #14232b;
    }
    [data-word-report] .update-dialog-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(20, 35, 43, 0.45);
    }
    [data-word-report] .update-dialog-card {
      position: relative;
      z-index: 1;
      width: min(400px, 100%);
      max-height: min(80dvh, 560px);
      overflow: auto;
      background: #fff;
      border-radius: 16px;
      padding: 1.25rem 1.35rem;
      box-shadow: 0 20px 50px rgba(20, 35, 43, 0.28);
    }
    [data-word-report] .update-dialog-card h2 {
      margin: 0 0 0.7rem;
      font-size: 1.35rem;
    }
    [data-word-report] .word-report-word {
      margin: 0 0 0.85rem;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    [data-word-report] .word-report-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin: 0 0 0.85rem;
      font-weight: 600;
      font-size: 0.92rem;
    }
    [data-word-report] .word-report-field input {
      font: inherit;
      font-weight: 400;
      border: 1px solid #c4c7ca;
      border-radius: 10px;
      padding: 0.5rem 0.65rem;
    }
    [data-word-report] .word-report-error {
      margin: 0 0 0.35rem;
      color: #b42318;
      font-size: 0.9rem;
    }
    [data-word-report] .update-actions,
    [data-word-report] .word-report-send-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.85rem;
    }
    [data-word-report] .btn {
      font: inherit;
      border: 1px solid #c4c7ca;
      background: #fff;
      color: #14232b;
      border-radius: 10px;
      padding: 0.55rem 0.9rem;
      cursor: pointer;
    }
    [data-word-report] .btn.primary {
      background: #c45c26;
      border-color: transparent;
      color: #fff;
    }
    [data-word-report] .btn:disabled {
      background: #d5d8dc;
      color: #6b7280;
      cursor: default;
    }
    [data-word-report] .word-report-list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 16rem;
      overflow: auto;
    }
    [data-word-report] .word-report-list label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.28rem 0;
      font-weight: 600;
    }
    [data-word-report] .word-report-list label.is-marked {
      color: #b42318;
    }
    [data-word-report] .word-report-send-row input {
      flex: 1;
      min-width: 8rem;
      font: inherit;
      font-weight: 400;
      border: 1px solid #c4c7ca;
      border-radius: 10px;
      padding: 0.5rem 0.65rem;
    }
  `;
  document.head.appendChild(style);
}

/**
 * @param {HTMLElement} host
 * @param {{ game: string, language: string, action: string, words: string, name: string }} payload
 * @param {HTMLButtonElement | null} sendBtn
 * @param {Element | null} errorEl
 */
async function postReport(host, payload, sendBtn, errorEl) {
  const showError = (message) => {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = message;
  };
  if (sendBtn) sendBtn.disabled = true;
  try {
    const res = await fetch('/api/word-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    /** @type {{ ok?: boolean, error?: string }} */
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok || !body.ok) {
      showError(body.error || 'Could not send the report');
      if (sendBtn) sendBtn.disabled = false;
      return;
    }
  } catch {
    showError('You need to be online to send a report');
    if (sendBtn) sendBtn.disabled = false;
    return;
  }
  const card = host.querySelector('.update-dialog-card');
  if (!card) return;
  card.innerHTML = `
    <h2 id="word-report-title">Report sent</h2>
    <p class="update-lead">Thanks. The report was sent${sentAnonymously(payload.name) ? ' anonymously' : ''}.</p>
    <div class="update-actions">
      <button type="button" class="btn primary" data-close>Close</button>
    </div>
  `;
}

/**
 * @param {{ game: string, language: string, word: string }} report
 */
export function openMissingWordReport(report) {
  ensureReportStyles();
  document.querySelector('[data-word-report]')?.remove();
  const word = String(report.word || '').trim();
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.wordReport = '';
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-close></div>
    <div class="update-dialog-card" role="dialog" aria-modal="true" aria-labelledby="word-report-title">
      <h2 id="word-report-title">Report a missing word</h2>
      <p class="word-report-word" dir="auto">${escapeHtml(word)}</p>
      <label class="word-report-field">
        Name
        ${NAME_INPUT}
      </label>
      <p class="word-report-error" data-word-report-error hidden></p>
      <div class="update-actions">
        <button type="button" class="btn primary" data-word-report-send>Send report</button>
        <button type="button" class="btn" data-close>Cancel</button>
      </div>
    </div>
  `;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    host.remove();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  host.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-close]')) close();
  });
  const nameInput = /** @type {HTMLInputElement | null} */ (host.querySelector('input[name="name"]'));
  const sendBtn = /** @type {HTMLButtonElement | null} */ (host.querySelector('[data-word-report-send]'));
  const errorEl = host.querySelector('[data-word-report-error]');
  bindNameField(nameInput);
  let confirmed = false;
  const refresh = () => {
    confirmed = false;
    if (sendBtn) sendBtn.textContent = 'Send report';
  };
  nameInput?.addEventListener('input', refresh);
  sendBtn?.addEventListener('click', () => {
    const name = nameInput?.value.trim().replace(/\s+/g, ' ') || '';
    if (name.length > 80) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = 'Name is too long';
      }
      return;
    }
    if (!confirmed) {
      confirmed = true;
      if (sendBtn) sendBtn.textContent = 'Send this word?';
      if (errorEl) errorEl.hidden = true;
      return;
    }
    void postReport(host, {
      game: report.game,
      language: report.language,
      action: 'missing',
      words: word,
      name,
    }, sendBtn, errorEl);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(host);
  nameInput?.focus();
}

/**
 * @param {{ game: string, language: string, words: string[] }} report
 */
export function openQuestionableWordReport(report) {
  ensureReportStyles();
  document.querySelector('[data-word-report]')?.remove();
  const seen = new Set();
  const words = [];
  for (const raw of report.words || []) {
    const word = String(raw || '').trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.wordReport = '';
  const items = words.map((word) => `
    <li>
      <label>
        <input type="checkbox" value="${escapeHtml(word)}" />
        <span dir="auto">${escapeHtml(word)}</span>
      </label>
    </li>
  `).join('');
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-close></div>
    <div class="update-dialog-card" role="dialog" aria-modal="true" aria-labelledby="word-report-title">
      <h2 id="word-report-title">Mark Questionable Words</h2>
      <ul class="word-report-list">${items || '<li>No words in this game.</li>'}</ul>
      <p class="word-report-error" data-word-report-error hidden></p>
      <div class="word-report-send-row">
        ${NAME_INPUT}
        <button type="button" class="btn primary" data-word-report-send disabled>Send</button>
      </div>
    </div>
  `;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    host.remove();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  host.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-close]')) close();
  });
  const sendBtn = /** @type {HTMLButtonElement | null} */ (host.querySelector('[data-word-report-send]'));
  const errorEl = host.querySelector('[data-word-report-error]');
  const nameInput = /** @type {HTMLInputElement | null} */ (host.querySelector('input[name="name"]'));
  bindNameField(nameInput);
  const refresh = () => {
    let any = false;
    host.querySelectorAll('.word-report-list label').forEach((label) => {
      const box = label.querySelector('input');
      const marked = box instanceof HTMLInputElement && box.checked;
      label.classList.toggle('is-marked', marked);
      if (marked) any = true;
    });
    if (sendBtn) sendBtn.disabled = !any;
  };
  host.querySelector('.word-report-list')?.addEventListener('change', refresh);
  sendBtn?.addEventListener('click', () => {
    const picked = [];
    host.querySelectorAll('.word-report-list input:checked').forEach((box) => {
      if (box instanceof HTMLInputElement && box.value) picked.push(box.value);
    });
    if (!picked.length) return;
    const name = nameInput?.value.trim().replace(/\s+/g, ' ') || '';
    void postReport(host, {
      game: report.game,
      language: report.language,
      action: 'questionable',
      words: picked.join(', '),
      name,
    }, sendBtn, errorEl);
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(host);
}
