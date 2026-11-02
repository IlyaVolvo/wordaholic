/**
 * Site-wide handwritten upgrade notes. One per commit; last-seen commit in localStorage.
 */
import { getLocalManifest } from '../updates/manifest.js';

const CURSOR_KEY = 'wordaholic.lastAnnouncementCommit';
const CATALOG_URL = '/app/announcements.json';

/**
 * A string is shown as written. An array is one editor line per screen line.
 * An empty item is a blank line between paragraphs.
 * @param {unknown} body
 */
function announcementBody(body) {
  if (typeof body === 'string') return body.trim();
  if (!Array.isArray(body)) return '';
  return body
    .filter((line) => typeof line === 'string')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

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
    const body = announcementBody(entry.body);
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
function freezeCommit(noteCommit, currentCommit, notes = []) {
  if (noteCommit !== 'HEAD') return noteCommit;
  const taken = new Set(notes.filter((note) => note.commit !== 'HEAD').map((note) => note.commit));
  // Do not collapse HEAD onto an earlier catalog SHA — that re-queues the note forever.
  if (currentCommit && !taken.has(currentCommit)) return currentCommit;
  return 'HEAD';
}

/**
 * @param {{ commit: string, body: string }} note
 * @param {string} cursor
 * @param {string} currentCommit
 * @param {{ commit: string, body: string }[]} notes
 */
function noteMatchesCursor(note, cursor, currentCommit, notes) {
  if (note.commit === cursor) return true;
  // Unstamped catalog still says HEAD; dismiss stores the deploy SHA.
  return note.commit === 'HEAD' && cursor === freezeCommit('HEAD', currentCommit, notes);
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
        stamp: freezeCommit(notes[notes.length - 1].commit, currentCommit, notes),
      };
    }
    return { queue, stamp: null };
  }
  const index = notes.findIndex((note) => noteMatchesCursor(note, cursor, currentCommit, notes));
  if (index === -1) {
    const queue = notes.filter(isThisDeploy);
    if (!queue.length) {
      return {
        queue: [],
        stamp: freezeCommit(notes[notes.length - 1].commit, currentCommit, notes),
      };
    }
    return { queue, stamp: null };
  }
  return { queue: notes.slice(index + 1), stamp: null };
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|(?:https?:\/\/|www\.)[^\s<]+)/gi;

/** Drop sentence punctuation that was captured after a URL. */
function trimUrl(raw) {
  let end = raw.length;
  while (end > 0 && /[.,;:!?)]/.test(raw[end - 1])) {
    if (raw[end - 1] === ')') {
      const head = raw.slice(0, end);
      const open = (head.match(/\(/g) || []).length;
      const close = (head.match(/\)/g) || []).length;
      if (close <= open) break;
    }
    end -= 1;
  }
  return { url: raw.slice(0, end), trail: raw.slice(end) };
}

/**
 * `**words**` become bold. URLs become links. Everything else stays text.
 * @param {string} text
 */
function appendLinkedText(parent, text) {
  const pattern = new RegExp(INLINE_PATTERN.source, 'gi');
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    if (index > last) parent.append(document.createTextNode(text.slice(last, index)));
    if (raw.startsWith('**') && raw.endsWith('**')) {
      const strong = document.createElement('strong');
      appendLinkedText(strong, raw.slice(2, -2));
      parent.append(strong);
    } else {
      const { url, trail } = trimUrl(raw);
      if (url) {
        const link = document.createElement('a');
        link.href = /^www\./i.test(url) ? `https://${url}` : url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.addEventListener('click', (event) => event.stopPropagation());
        parent.append(link);
      }
      if (trail) parent.append(document.createTextNode(trail));
    }
    last = index + raw.length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
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
  if (bodyEl) {
    bodyEl.replaceChildren();
    appendLinkedText(bodyEl, note.body);
  }
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
        setCursor(freezeCommit(note.commit, currentCommit, notes));
        next(i + 1);
      });
    };
    next(0);
  });
}
