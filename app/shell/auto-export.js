import { storage } from '../storage/idb.js';
import { downloadSiteBackup, exportSiteBackup, needsTapToSave } from './site-backup.js';

export const AUTO_EXPORT_STATUS_EVENT = 'wordaholic:auto-export-status';

const SETTINGS_KEY = 'autoExport';
const HANDLE_KEY = 'autoExportDirectory';
const DEBOUNCE_MS = 500;
const FOLDER_ERROR = 'not saved — re-pick folder';

/**
 * @typedef {{
 *   enabled: boolean,
 *   browserId: string,
 *   browserFamily: string,
 *   directoryHandle: FileSystemDirectoryHandle | null,
 *   folderName: string,
 *   lastSavedAt: string | null,
 *   lastSnapshotFingerprint: string | null,
 *   lastPromptDate: string | null,
 *   lastError: string | null,
 * }} AutoExportState
 */

const DEFAULT_STATE = {
  enabled: false,
  browserId: '',
  browserFamily: '',
  directoryHandle: null,
  folderName: '',
  lastSavedAt: null,
  lastSnapshotFingerprint: null,
  lastPromptDate: null,
  lastError: null,
};

let debounceTimer = 0;
/** @type {Promise<void>} */
let writeChain = Promise.resolve();
let panelOpen = false;

export function canUseFolderWrite() {
  return typeof window.showDirectoryPicker === 'function' && !needsTapToSave();
}

export function detectBrowserFamily() {
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/CriOS\//.test(ua)) {
    return 'safari';
  }
  if (/Chrome\//.test(ua) || /Chromium\//.test(ua) || /CriOS\//.test(ua)) return 'chrome';
  return 'other';
}

function newBrowserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function shortId(browserId) {
  return String(browserId || '').replace(/-/g, '').slice(0, 8) || 'xxxxxxxx';
}

export function masterFileName(state) {
  const family = state.browserFamily || detectBrowserFamily();
  return `wordaholic-master-${family}-${shortId(state.browserId)}.json`;
}

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function snapshotFingerprint(payload) {
  const parts = [];
  for (const [gameId, tree] of Object.entries(payload?.games || {})) {
    for (const rec of tree?.records || []) {
      if (!rec || typeof rec !== 'object') continue;
      parts.push(
        [
          gameId,
          rec.language,
          rec.game_date || rec.gameDate,
          rec.word_length,
          rec.vocabLevel,
          rec.difficulty,
          rec.target_word,
          rec.end,
          rec.updated_at || rec.updatedAt,
          rec.completed_at,
          Array.isArray(rec.guesses) ? rec.guesses.length : Array.isArray(rec.path) ? rec.path.length : 0,
        ].join(':')
      );
    }
  }
  parts.sort();
  return `${parts.length}#${parts.join('|')}`;
}

function recordCountFromFingerprint(fingerprint) {
  const n = Number(String(fingerprint || '').split('#')[0]);
  return Number.isFinite(n) ? n : 0;
}

function isStale(state, fingerprint) {
  if (recordCountFromFingerprint(fingerprint) < 1) return false;
  return fingerprint !== state.lastSnapshotFingerprint;
}

function emitStatus() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTO_EXPORT_STATUS_EVENT));
}

/**
 * @returns {Promise<AutoExportState>}
 */
async function loadState() {
  const raw = await storage.getSetting(SETTINGS_KEY, null);
  const state = { ...DEFAULT_STATE, ...(raw && typeof raw === 'object' ? raw : {}) };
  try {
    const handle = await storage.getSetting(HANDLE_KEY, null);
    state.directoryHandle =
      handle && typeof handle.getFileHandle === 'function' ? handle : null;
  } catch {
    state.directoryHandle = null;
  }
  let dirty = false;
  if (!state.browserId) {
    state.browserId = newBrowserId();
    dirty = true;
  }
  if (!state.browserFamily) {
    state.browserFamily = detectBrowserFamily();
    dirty = true;
  }
  if (dirty) await saveState(state);
  return state;
}

/** @param {AutoExportState} state */
async function saveState(state) {
  const { directoryHandle, ...meta } = state;
  await storage.setSetting(SETTINGS_KEY, meta);
  try {
    await storage.setSetting(HANDLE_KEY, directoryHandle || null);
  } catch (err) {
    console.warn('Could not persist folder handle', err);
  }
  emitStatus();
}

export async function getBackupOrigin() {
  const state = await loadState();
  return { browserFamily: state.browserFamily, browserId: state.browserId };
}

/**
 * @returns {Promise<{
 *   enabled: boolean,
 *   attention: boolean,
 *   outOfSync: boolean,
 *   lastSavedAt: string | null,
 *   lastError: string | null,
 *   folderName: string,
 *   fileName: string,
 *   canUseFolder: boolean,
 * }>}
 */
export async function getAutoExportStatus() {
  const state = await loadState();
  const canUseFolder = canUseFolderWrite();
  const base = {
    enabled: state.enabled,
    lastSavedAt: state.lastSavedAt,
    lastError: state.lastError,
    folderName: state.folderName,
    fileName: masterFileName(state),
    canUseFolder,
  };
  if (!state.enabled) {
    return { ...base, attention: false, outOfSync: false };
  }
  let stale = false;
  try {
    const payload = await exportSiteBackup({ origin: originFrom(state) });
    stale = isStale(state, snapshotFingerprint(payload));
  } catch {
    stale = false;
  }
  const missingFolder = canUseFolder && !state.directoryHandle;
  const outOfSync = Boolean(state.lastError || missingFolder || stale);
  return {
    ...base,
    attention: outOfSync,
    outOfSync,
  };
}

function originFrom(state) {
  return { browserFamily: state.browserFamily, browserId: state.browserId };
}

async function ensureDirectoryPermission(handle, interactive) {
  if (!handle) return 'denied';
  const opts = { mode: 'readwrite' };
  try {
    const query = await handle.queryPermission(opts);
    if (query === 'granted') return 'granted';
    if (!interactive) return query || 'prompt';
    const next = await handle.requestPermission(opts);
    return next || 'denied';
  } catch {
    return 'denied';
  }
}

async function writeToDirectory(handle, name, text) {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function markSaved(state, fingerprint) {
  state.lastSavedAt = new Date().toISOString();
  state.lastSnapshotFingerprint = fingerprint;
  state.lastPromptDate = localDateKey();
  state.lastError = null;
  await saveState(state);
}

async function markError(state, message) {
  state.lastError = message;
  await saveState(state);
}

async function writeFolderNow(state, payload, fingerprint, interactive) {
  const handle = state.directoryHandle;
  if (!handle) {
    await markError(state, FOLDER_ERROR);
    return false;
  }
  const perm = await ensureDirectoryPermission(handle, interactive);
  if (perm !== 'granted') {
    await markError(state, FOLDER_ERROR);
    return false;
  }
  const text = JSON.stringify(payload, null, 2);
  await writeToDirectory(handle, masterFileName(state), text);
  await markSaved(state, fingerprint);
  return true;
}

async function buildPayload(state) {
  return exportSiteBackup({ origin: originFrom(state) });
}

/**
 * Silent overwrite for Chromium after a completed Daily (or a failed-write retry).
 * Prompted browsers stay quiet here.
 */
export function scheduleAutoExport() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    writeChain = writeChain.then(() => runScheduledWrite(), () => runScheduledWrite());
  }, DEBOUNCE_MS);
}

async function runScheduledWrite() {
  const state = await loadState();
  if (!state.enabled) return;
  if (!canUseFolderWrite()) return;
  try {
    const payload = await buildPayload(state);
    const fingerprint = snapshotFingerprint(payload);
    if (!isStale(state, fingerprint) && !state.lastError) return;
    await writeFolderNow(state, payload, fingerprint, false);
  } catch (err) {
    console.warn('Auto export failed', err);
    const latest = await loadState();
    await markError(latest, FOLDER_ERROR);
  }
}

/**
 * Home map: Chromium retries a failed/stale folder write; others prompt if stale
 * and they have not been asked yet today.
 */
export async function runHomeAutoExport() {
  const state = await loadState();
  if (!state.enabled) return;
  const payload = await buildPayload(state);
  const fingerprint = snapshotFingerprint(payload);

  if (canUseFolderWrite()) {
    if (!state.lastError && !isStale(state, fingerprint)) return;
    try {
      await writeFolderNow(state, payload, fingerprint, false);
    } catch (err) {
      console.warn('Auto export retry failed', err);
      const latest = await loadState();
      await markError(latest, FOLDER_ERROR);
    }
    return;
  }

  if (!isStale(state, fingerprint)) return;
  if (state.lastPromptDate === localDateKey()) return;
  if (document.querySelector('[data-backup-save]')) return;

  state.lastPromptDate = localDateKey();
  await saveState(state);

  await downloadSiteBackup(payload, {
    filename: masterFileName(state),
    title: 'Save master file',
    onSaved: () => {
      void loadState().then((latest) => markSaved(latest, fingerprint));
    },
    onDismissed: () => {
      emitStatus();
    },
  });
}

export async function setAutoExportEnabled(enabled) {
  const state = await loadState();
  state.enabled = Boolean(enabled);
  if (!state.enabled) {
    state.lastError = null;
    await saveState(state);
    return getAutoExportStatus();
  }
  if (canUseFolderWrite() && !state.directoryHandle) {
    state.lastError = FOLDER_ERROR;
    await saveState(state);
    return getAutoExportStatus();
  }
  await saveState(state);
  if (canUseFolderWrite()) {
    try {
      const payload = await buildPayload(state);
      await writeFolderNow(state, payload, snapshotFingerprint(payload), true);
    } catch (err) {
      console.warn('Auto export write failed', err);
      const latest = await loadState();
      await markError(latest, FOLDER_ERROR);
    }
  } else {
    await runHomeAutoExport();
  }
  return getAutoExportStatus();
}

export async function pickAutoExportFolder() {
  if (!canUseFolderWrite()) {
    throw new Error('This browser cannot write to a folder');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const state = await loadState();
  state.directoryHandle = handle;
  state.folderName = handle.name || '';
  state.enabled = true;
  state.lastError = null;
  await saveState(state);
  const payload = await buildPayload(state);
  try {
    await writeFolderNow(state, payload, snapshotFingerprint(payload), true);
  } catch (err) {
    console.warn('Auto export write failed', err);
    const latest = await loadState();
    await markError(latest, FOLDER_ERROR);
  }
  return getAutoExportStatus();
}

/** Prompted browsers: user-gesture save of the current master file. */
export async function promptMasterSave() {
  const state = await loadState();
  const payload = await buildPayload(state);
  const fingerprint = snapshotFingerprint(payload);
  await downloadSiteBackup(payload, {
    filename: masterFileName(state),
    title: 'Save master file',
    onSaved: () => {
      void loadState().then((latest) => markSaved(latest, fingerprint));
    },
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSavedAt(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString();
}

async function paintPanel(host) {
  const status = await getAutoExportStatus();
  const enabled = status.enabled;
  let extras = '';
  let folderBtn = '';
  if (enabled) {
    const folderLabel = status.canUseFolder
      ? status.folderName
        ? `Folder: ${status.folderName}`
        : 'Folder: not chosen'
      : 'This browser cannot write to a folder. Home will ask you to save at most once a day when there is something new.';
    const error = status.lastError
      ? `<p class="auto-export-error">${escapeHtml(status.lastError)}</p>`
      : '';
    extras = `
    <p class="update-lead">${escapeHtml(folderLabel)}</p>
    <p class="auto-export-meta">File: ${escapeHtml(status.fileName)}</p>
    <p class="auto-export-meta">Last saved: ${escapeHtml(formatSavedAt(status.lastSavedAt))}</p>
    ${error}`;
    folderBtn = status.canUseFolder
      ? `<button type="button" class="btn" data-auto-folder>${
          status.folderName ? 'Change folder' : 'Choose folder'
        }</button>`
      : '<button type="button" class="btn primary" data-auto-save-now>Save now</button>';
  }
  const body = host.querySelector('[data-auto-body]');
  if (!body || !host.isConnected) return;
  body.innerHTML = `
    <label class="auto-export-toggle">
      <input type="checkbox" data-auto-enabled ${enabled ? 'checked' : ''} />
      Enable Auto export
    </label>
    ${extras}
    <div class="update-actions">
      ${folderBtn}
      <button type="button" class="btn" data-close>Close</button>
    </div>
  `;
}

export async function openAutoExportPanel() {
  document.querySelector('[data-auto-export-panel]')?.remove();
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.autoExportPanel = '';
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-close></div>
    <div class="update-dialog-card" role="dialog" aria-modal="true" aria-labelledby="auto-export-title">
      <h2 id="auto-export-title">Auto export</h2>
      <p class="update-lead">Keeps a master JSON of completed dailies on this device. Safari and Chrome use different filenames so they do not overwrite each other.</p>
      <div data-auto-body></div>
    </div>
  `;
  const close = () => {
    panelOpen = false;
    host.remove();
  };
  host.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('[data-close]')) close();
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches('[data-auto-enabled]')) return;
    void setAutoExportEnabled(t.checked).then(() => paintPanel(host));
  });
  host.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('[data-auto-folder]')) return;
    void pickAutoExportFolder()
      .then(() => paintPanel(host))
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        console.warn(err);
      });
  });
  host.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('[data-auto-save-now]')) return;
    void promptMasterSave().then(() => paintPanel(host));
  });
  document.body.appendChild(host);
  panelOpen = true;
  await paintPanel(host);
}

export function isAutoExportPanelOpen() {
  return panelOpen;
}

export function applyAutoExportBadge(button, status = {}) {
  if (!button) return;
  const enabled = Boolean(status.enabled);
  const outOfSync = Boolean(status.outOfSync);
  button.classList.toggle('map-zoom-btn--auto-off', !enabled);
  button.classList.toggle('map-zoom-btn--auto-stale', enabled && outOfSync);
  button.classList.toggle('map-zoom-btn--auto-idle', enabled && !outOfSync);
}
