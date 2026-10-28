/**
 * Home-page dialog for a nickname, and the question asked while importing a backup.
 */
import {
  flushPendingNickname,
  getNickname,
  importMemory,
  queueJoin,
  randomNickname,
  setImportMemory,
  submitNickname,
} from './player.js';

function field(label, control) {
  return `<label class="player-field"><span>${label}</span>${control}</label>`;
}

/**
 * @param {{ onChange?: () => void }} [opts]
 */
export function openPlayerDialog(opts = {}) {
  document.querySelector('[data-player-dialog]')?.remove();
  const current = getNickname();
  const host = document.createElement('div');
  host.className = 'player-dialog';
  host.dataset.playerDialog = '';
  host.innerHTML = `
    <div class="player-dialog-backdrop" data-close></div>
    <div class="player-dialog-card" role="dialog" aria-modal="true" aria-labelledby="player-title">
      <h2 id="player-title">Scoreboard name</h2>
      <p class="player-lead">${
        current
          ? `You appear on scoreboards as <strong>${escapeHtml(current)}</strong>.`
          : 'A name puts your finished games on the scoreboard. Without one, you can still look.'
      }</p>
      ${field('Name', '<input id="player-name" maxlength="16" autocomplete="off" value="">')}
      <p id="player-error" class="player-error" role="alert"></p>
      <div id="player-suggestions" class="player-suggestions"></div>
      <div class="player-actions">
        <button type="button" class="btn primary" data-save>${current ? 'Change name' : 'Start'}</button>
        <button type="button" class="btn" data-random>Suggest a name</button>
        ${current ? '<button type="button" class="btn" data-stop>Stop</button>' : ''}
        ${importMemory() ? '<button type="button" class="btn" data-forget>Ask again on import</button>' : ''}
        <button type="button" class="btn" data-close>Close</button>
      </div>
    </div>
  `;
  const error = host.querySelector('#player-error');
  const input = /** @type {HTMLInputElement | null} */ (host.querySelector('#player-name'));
  const suggestions = host.querySelector('#player-suggestions');
  const showError = (text) => {
    if (error) error.textContent = text;
  };
  const close = () => host.remove();
  host.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  host.querySelector('[data-random]')?.addEventListener('click', () => {
    if (input) input.value = randomNickname();
    showError('');
  });
  host.querySelector('[data-forget]')?.addEventListener('click', () => {
    setImportMemory('');
    host.querySelector('[data-forget]')?.remove();
  });
  const paintSuggestions = (names) => {
    if (!suggestions) return;
    suggestions.innerHTML = names
      .map((name) => `<button type="button" class="btn" data-suggest="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
      .join('');
    suggestions.querySelectorAll('[data-suggest]').forEach((button) => {
      button.addEventListener('click', () => {
        if (input) input.value = button.getAttribute('data-suggest') || '';
      });
    });
  };
  host.querySelector('[data-save]')?.addEventListener('click', async () => {
    const name = input?.value.trim() || '';
    showError('');
    const result = await submitNickname('set', name);
    if (result.offline) {
      showError('A name can be saved when this device is online.');
      return;
    }
    if (result.taken) {
      showError('That name is taken.');
      paintSuggestions(result.suggestions || []);
      return;
    }
    if (!result.ok) {
      showError('Use 3 to 16 letters or digits.');
      return;
    }
    close();
    opts.onChange?.();
  });
  host.querySelector('[data-stop]')?.addEventListener('click', async () => {
    const result = await submitNickname('clear');
    if (result.offline) {
      showError('Stopping waits until this device is online.');
      return;
    }
    if (!result.ok) {
      showError('The name could not be cleared.');
      return;
    }
    close();
    opts.onChange?.();
  });
  document.body.appendChild(host);
  input?.focus();
}

/**
 * @param {string} nickname
 * @returns {Promise<'take' | 'keep' | 'same' | 'empty' | 'pending'>}
 */
export function settleImportedNickname(nickname) {
  const imported = String(nickname || '').trim();
  if (!imported) return Promise.resolve('empty');
  const current = getNickname();
  if (current && current.toLowerCase() === imported.toLowerCase()) return Promise.resolve('same');
  const memory = importMemory();
  if (memory === 'keep') return Promise.resolve('keep');
  if (memory === 'take') {
    queueJoin(imported);
    return Promise.resolve('pending');
  }
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'player-dialog';
    host.dataset.playerDialog = '';
    host.innerHTML = `
      <div class="player-dialog-backdrop"></div>
      <div class="player-dialog-card" role="dialog" aria-modal="true" aria-labelledby="import-name-title">
        <h2 id="import-name-title">Backup name</h2>
        <p class="player-lead">This backup is for <strong>${escapeHtml(imported)}</strong>. ${
          current ? `This device is ${escapeHtml(current)}.` : 'This device has no scoreboard name.'
        }</p>
        <label class="player-field player-remember"><input type="checkbox" id="import-name-remember"> Remember this choice</label>
        <div class="player-actions">
          <button type="button" class="btn primary" data-take>Use ${escapeHtml(imported)}</button>
          <button type="button" class="btn" data-keep>Keep this device</button>
        </div>
      </div>
    `;
    const remember = () => /** @type {HTMLInputElement | null} */ (host.querySelector('#import-name-remember'))?.checked;
    host.querySelector('[data-take]')?.addEventListener('click', () => {
      if (remember()) setImportMemory('take');
      queueJoin(imported);
      void flushPendingNickname();
      host.remove();
      resolve('pending');
    });
    host.querySelector('[data-keep]')?.addEventListener('click', () => {
      if (remember()) setImportMemory('keep');
      host.remove();
      resolve('keep');
    });
    document.body.appendChild(host);
  });
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
