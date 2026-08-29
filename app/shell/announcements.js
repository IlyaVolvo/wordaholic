/**
 * Site-wide handwritten upgrade notes. One per commit; last-seen commit in localStorage.
 */
import { getLocalManifest } from '../updates/manifest.js';

const CURSOR_KEY = 'wordaholic.lastAnnouncementCommit';
const CATALOG_URL = '/app/announcements.json';

/**
 * @param {unknown} raw
 * @returns {{ commit: string, body: string }[]}
 */
export function parseCatalog(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {{ commit: string, body: string }[]} */
  const notes = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const body = typeof entry.body === 'string' ? entry.body.trim() : '';
    if (!body) continue;
    const commit = String(entry.commit || 'HEAD').trim() || 'HEAD';
    notes.push({ commit, body });
  }
  return notes;
}

/**
 * @param {string} noteCommit
 * @param {string} currentCommit
 */
function freezeCommit(noteCommit, currentCommit) {
  if (noteCommit === 'HEAD') return currentCommit || 'HEAD';
  return noteCommit;
}

/**
 * @param {{ commit: string, body: string }} note
 * @param {string} cursor
 * @param {string} currentCommit
 */
function noteMatchesCursor(note, cursor, currentCommit) {
  if (note.commit === cursor) return true;
  // Unstamped catalog still says HEAD; dismiss stores the deploy SHA.
  return note.commit === 'HEAD' && cursor === freezeCommit('HEAD', currentCommit);
}

/**
 * @param {{ commit: string, body: string }[]} notes
 * @param {string} cursor
 * @param {string} currentCommit
 * @returns {{ queue: { commit: string, body: string }[], stamp: string | null }}
 */
export function planAnnouncements(notes, cursor, currentCommit) {
  if (!notes.length) return { queue: [], stamp: null };
  const isThisDeploy = (note) =>
    note.commit === currentCommit || note.commit === 'HEAD';
  if (!cursor) {
    const queue = notes.filter(isThisDeploy);
    if (!queue.length) {
      return {
        queue: [],
        stamp: freezeCommit(notes[notes.length - 1].commit, currentCommit),
      };
    }
    return { queue, stamp: null };
  }
  const index = notes.findIndex((note) => noteMatchesCursor(note, cursor, currentCommit));
  if (index === -1) {
    const queue = notes.filter(isThisDeploy);
    if (!queue.length) {
      return {
        queue: [],
        stamp: freezeCommit(notes[notes.length - 1].commit, currentCommit),
      };
    }
    return { queue, stamp: null };
  }
  return { queue: notes.slice(index + 1), stamp: null };
}

function getCursor() {
  try {
    return localStorage.getItem(CURSOR_KEY) || '';
  } catch {
    return '';
  }
}

function setCursor(commit) {
  if (!commit) return;
  try {
    localStorage.setItem(CURSOR_KEY, commit);
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {{ commit: string, body: string }} note
 * @param {() => void} onSeen
 */
function showOne(note, onSeen) {
  document.querySelector('[data-upgrade-announcement]')?.remove();
  const host = document.createElement('div');
  host.className = 'update-dialog';
  host.dataset.upgradeAnnouncement = '';
  host.innerHTML = `
    <div class="update-dialog-backdrop" data-seen></div>
    <div class="update-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="upgrade-announcement-title">
      <h2 id="upgrade-announcement-title">What’s new</h2>
      <p class="update-lead update-announcement-body"></p>
      <div class="update-actions">
        <button type="button" class="btn primary" data-seen>Got it</button>
      </div>
    </div>
  `;
  const bodyEl = host.querySelector('.update-announcement-body');
  if (bodyEl) bodyEl.textContent = note.body;
  const seen = () => {
    host.remove();
    onSeen();
  };
  host.querySelectorAll('[data-seen]').forEach((el) => {
    el.addEventListener('click', seen);
  });
  document.body.appendChild(host);
}

/**
 * Home only. Call after the silent update check so a reload is not racing the dialog.
 */
export async function showUpgradeAnnouncements() {
  if (location.pathname.startsWith('/games/')) return;
  let notes = [];
  try {
    const res = await fetch(CATALOG_URL);
    if (res.ok) notes = parseCatalog(await res.json());
  } catch {
    return;
  }
  const currentCommit = getLocalManifest()?.commit || '';
  const { queue, stamp } = planAnnouncements(notes, getCursor(), currentCommit);
  if (stamp) setCursor(stamp);
  if (!queue.length) return;

  await new Promise((resolve) => {
    const next = (i) => {
      if (i >= queue.length) {
        resolve();
        return;
      }
      const note = queue[i];
      showOne(note, () => {
        setCursor(freezeCommit(note.commit, currentCommit));
        next(i + 1);
      });
    };
    next(0);
  });
}
