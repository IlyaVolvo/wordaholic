/**
 * Site-wide handwritten upgrade notes. One per commit; last-seen commit in localStorage.
 */
import { getLocalManifest } from '../updates/manifest.js';

const CURSOR_KEY = 'wordaholic.lastAnnouncementCommit';
const GAMES_KEY = 'wordaholic.announcementGames';
const CATALOG_URL = '/app/announcements.json';
const PLACES = new Set(['top', 'bottom', 'left', 'right']);

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
 * @returns {string[]}
 */
function pointTargets(raw) {
  const values = [];
  if (Array.isArray(raw)) values.push(...raw);
  else if (raw) values.push(raw);
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {{ targets: string[], fallback: string, fallbackText: string, place: string, text: string }[]}
 */
function parsePoints(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {{ targets: string[], fallback: string, fallbackText: string, place: string, text: string }[]} */
  const points = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const text = announcementBody(item.text ?? item.body);
    if (!text) continue;
    const place = PLACES.has(item.place) ? item.place : 'bottom';
    const targets = pointTargets(item.targets);
    const single = String(item.target || '').trim();
    if (single) targets.push(single);
    points.push({
      targets,
      fallback: String(item.fallback || '').trim(),
      fallbackText: announcementBody(item.fallbackText || ''),
      place,
      text,
    });
  }
  return points;
}

/**
 * @param {unknown} raw
 * @returns {{ commit: string, body: string, permanent: boolean, points: { targets: string[], fallback: string, fallbackText: string, place: string, text: string }[] }[]}
 */
export function parseCatalog(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {{ commit: string, body: string, permanent: boolean, points: { targets: string[], fallback: string, fallbackText: string, place: string, text: string }[] }[]} */
  const notes = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const body = announcementBody(entry.body);
    const points = parsePoints(entry.points);
    if (!body && !points.length) continue;
    const commit = String(entry.commit || 'HEAD').trim() || 'HEAD';
    notes.push({ commit, body, permanent: entry.permanent === true, points });
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

function seenGames() {
  try {
    const raw = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string' && id) : []);
  } catch {
    return new Set();
  }
}

function markGameSeen(gameId) {
  if (!gameId) return;
  const ids = seenGames();
  ids.add(gameId);
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

/** @returns {string} game id when this page is a game, otherwise '' */
export function currentGameId() {
  const match = location.pathname.match(/\/games\/[^/]+\/([^/]+)/);
  return match ? match[1] : '';
}

/**
 * Release notes still unread, plus permanent notes on the first opening of this game.
 * @param {{ commit: string, permanent?: boolean }[]} notes
 * @param {string} cursor
 * @param {string} currentCommit
 * @param {string} gameId
 * @param {Set<string>} seen
 */
export function queueAnnouncements(notes, cursor, currentCommit, gameId, seen) {
  const { queue, stamp } = planAnnouncements(notes, cursor, currentCommit);
  const firstGame = Boolean(gameId) && !seen.has(gameId);
  if (!firstGame) return { queue, stamp, gameId };
  const included = new Set(queue.map((note) => note.commit));
  const extra = notes.filter((note) => note.permanent && !included.has(note.commit));
  return { queue: queue.concat(extra), stamp, gameId };
}

/**
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function findVisible(selector) {
  if (!selector) return null;
  let list;
  try {
    list = document.querySelectorAll(selector);
  } catch {
    return null;
  }
  for (const el of list) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.hidden || el.closest('[hidden]')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    return el;
  }
  return null;
}

/**
 * @param {{ body: string, points: { targets: string[], fallback: string, fallbackText: string, place: string, text: string }[] }} note
 * @returns {{ els: HTMLElement[], text: string, place: string }[]}
 */
function stepsFor(note) {
  if (note.points?.length) {
    /** @type {{ els: HTMLElement[], text: string, place: string }[]} */
    const steps = [];
    for (const point of note.points) {
      const els = point.targets.map((selector) => findVisible(selector)).filter((el) => el instanceof HTMLElement);
      if (els.length) {
        steps.push({ els, text: point.text, place: point.place || 'bottom' });
        continue;
      }
      const fallback = findVisible(point.fallback);
      if (!fallback) continue;
      steps.push({
        els: [fallback],
        text: point.fallbackText || point.text,
        place: point.place || 'bottom',
      });
    }
    return steps;
  }
  if (note.body) return [{ els: [], text: note.body, place: 'bottom' }];
  return [];
}

/**
 * One explanation. A step with several controls draws a circle on each of them.
 * @param {{ els: HTMLElement[], text: string, place: string }} step
 */
function showStep(step) {
  document.querySelector('[data-upgrade-announcement]')?.remove();
  const host = document.createElement('div');
  host.className = 'announce-layer';
  host.dataset.upgradeAnnouncement = '';
  host.innerHTML = `<div class="help-callout" role="dialog" aria-modal="true"></div>`;
  const bubble = /** @type {HTMLElement} */ (host.querySelector('.help-callout'));
  appendLinkedText(bubble, step.text);
  document.body.appendChild(host);

  /** @type {HTMLElement[]} */
  const rings = [];
  /** @type {{ x: number, y: number, r: number }[]} */
  let anchors = [];

  const place = () => {
    const live = step.els.filter((el) => isStillVisible(el));
    while (rings.length < live.length) {
      const ring = document.createElement('span');
      ring.className = 'help-click-circle';
      host.insertBefore(ring, bubble);
      rings.push(ring);
    }
    while (rings.length > live.length) rings.pop()?.remove();
    if (!live.length) {
      anchors = [];
      bubble.classList.add('help-callout--solo');
      bubble.removeAttribute('data-place');
      bubble.style.left = '';
      bubble.style.top = '';
      return;
    }
    const rects = live.map((el) => el.getBoundingClientRect());
    anchors = rects.map((rect, index) => {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const size = Math.max(44, Math.min(rect.width, rect.height) + 18);
      const ring = rings[index];
      ring.hidden = false;
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      ring.style.width = `${size}px`;
      return { x, y, r: size / 2 };
    });
    const placeName = step.place || 'bottom';
    const tip = tipOnIcon(rects, placeName);
    bubble.classList.remove('help-callout--solo');
    bubble.dataset.place = placeName;
    bubble.style.left = `${tip.x}px`;
    bubble.style.top = `${tip.y}px`;
    fitBubble(bubble);
    aimCallout(bubble, placeName, tip);
  };

  place();
  for (const ring of rings) {
    ring.style.animation = 'none';
    void ring.offsetWidth;
    ring.style.animation = '';
  }

  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      resolve();
    };
    const onKey = (event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      done();
    };
    host.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      done();
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', onKey, true);
  });
}

/**
 * @param {HTMLElement} el
 */
function isStillVisible(el) {
  if (!el.isConnected || el.hidden || el.closest('[hidden]')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 2 && rect.height >= 2;
}

/**
 * Point on the illustrated icon where the callout tail starts.
 * @param {DOMRect[]} rects
 * @param {string} placeName
 */
function tipOnIcon(rects, placeName) {
  const midX = (Math.min(...rects.map((rect) => rect.left)) + Math.max(...rects.map((rect) => rect.right))) / 2;
  const midY = (Math.min(...rects.map((rect) => rect.top)) + Math.max(...rects.map((rect) => rect.bottom))) / 2;
  let best = rects[0];
  let bestD = Infinity;
  for (const rect of rects) {
    const d = (rect.left + rect.width / 2 - midX) ** 2 + (rect.top + rect.height / 2 - midY) ** 2;
    if (d < bestD) {
      best = rect;
      bestD = d;
    }
  }
  const x = best.left + best.width / 2;
  const y = best.top + best.height / 2;
  if (placeName === 'top') return { x, y: best.top };
  if (placeName === 'bottom') return { x, y: best.bottom };
  if (placeName === 'left') return { x: best.left, y };
  return { x: best.right, y };
}

/**
 * Keep the tail on the icon after the bubble is shifted to stay on screen.
 * @param {HTMLElement} bubble
 * @param {string} placeName
 * @param {{ x: number, y: number }} tip
 */
function aimCallout(bubble, placeName, tip) {
  const box = bubble.getBoundingClientRect();
  const alongX = placeName === 'top' || placeName === 'bottom';
  const span = alongX ? box.width : box.height;
  const raw = alongX ? tip.x - box.left : tip.y - box.top;
  const inset = Math.min(14, Math.max(8, span / 2));
  const at = Math.min(Math.max(raw, inset), Math.max(inset, span - inset));
  bubble.style.setProperty(alongX ? '--callout-tip-x' : '--callout-tip-y', `${at}px`);
}

/**
 * @param {HTMLElement} bubble
 */
function fitBubble(bubble) {
  const pad = 8;
  const box = bubble.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (box.right > window.innerWidth - pad) dx -= box.right - (window.innerWidth - pad);
  if (box.left + dx < pad) dx += pad - (box.left + dx);
  if (box.bottom > window.innerHeight - pad) dy -= box.bottom - (window.innerHeight - pad);
  if (box.top + dy < pad) dy += pad - (box.top + dy);
  if (!dx && !dy) return;
  const left = parseFloat(bubble.style.left) || 0;
  const top = parseFloat(bubble.style.top) || 0;
  bubble.style.left = `${left + dx}px`;
  bubble.style.top = `${top + dy}px`;
}

/**
 * `absent` means the note points at controls that are not on this page, so it stays unread.
 * @param {{ body: string, points: { targets: string[] }[] }} note
 * @returns {Promise<'shown' | 'skip' | 'absent'>}
 */
async function showNote(note) {
  const steps = stepsFor(note);
  if (!steps.length) return note.points?.length ? 'absent' : 'skip';
  for (const step of steps) await showStep(step);
  return 'shown';
}

/** @type {Promise<void> | null} */
let running = null;

/**
 * Unread release notes, anywhere. Permanent notes also play the first time
 * each game is opened on this device. Call after the header has been laid out.
 */
export async function showUpgradeAnnouncements() {
  if (running) return running;
  running = runAnnouncements().finally(() => {
    running = null;
  });
  return running;
}

async function runAnnouncements() {
  let notes = [];
  try {
    const res = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (res.ok) notes = parseCatalog(await res.json());
  } catch {
    return;
  }
  const currentCommit = getLocalManifest()?.commit || '';
  const gameId = currentGameId();
  const seen = seenGames();
  const cursor = getCursor();
  const { queue, stamp } = queueAnnouncements(notes, cursor, currentCommit, gameId, seen);
  if (stamp) setCursor(stamp);
  if (!queue.length) return;

  const release = new Set(planAnnouncements(notes, cursor, currentCommit).queue.map((note) => note.commit));
  let permanentShown = false;
  let permanentMissed = false;
  for (const note of queue) {
    const outcome = await showNote(note);
    if (outcome === 'absent') continue;
    if (release.has(note.commit)) setCursor(freezeCommit(note.commit, currentCommit, notes));
    if (!note.permanent) continue;
    if (outcome === 'shown') permanentShown = true;
    else permanentMissed = true;
  }
  if (gameId && permanentShown && !permanentMissed) markGameSeen(gameId);
}
