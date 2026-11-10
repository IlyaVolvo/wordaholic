/**
 * Site-wide handwritten notes, one per commit.
 * Each note plays at most once. Non-permanent notes play when the running
 * revision is at or past theirs and newer than the revision already
 * acknowledged. Permanent notes do that too, and also play on the first
 * visit in this browser.
 */
import { getLocalManifest } from '../updates/manifest.js';

const CURSOR_KEY = 'wordaholic.lastAnnouncementCommit';
const SEEN_KEY = 'wordaholic.announcementSeen';
const ACK_KEY = 'wordaholic.announcementAck';
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
 * @param {{ commit: string }} note
 * @param {string} currentCommit
 * @param {{ commit: string }[]} notes
 */
function announcementId(note, currentCommit, notes) {
  return freezeCommit(note.commit, currentCommit, notes);
}

/**
 * Last catalog entry this running revision includes.
 * A listed commit equal to the running revision counts, and so does every
 * entry before it. A revision with no note of its own still includes the
 * whole catalog shipped with it.
 * @param {{ commit: string }[]} notes
 * @param {string} currentCommit
 */
function reachedIndex(notes, currentCommit) {
  if (!notes.length) return -1;
  let matched = -1;
  for (let i = 0; i < notes.length; i += 1) {
    if (notes[i].commit === currentCommit || notes[i].commit === 'HEAD') matched = i;
  }
  return matched === -1 ? notes.length - 1 : matched;
}

/**
 * @param {{ commit: string }[]} notes
 * @param {string} cursor
 * @param {string} currentCommit
 */
function watermarkIndex(notes, cursor, currentCommit) {
  if (!cursor) return -1;
  const index = notes.findIndex((note) => noteMatchesCursor(note, cursor, currentCommit, notes));
  return index === -1 ? notes.length - 1 : index;
}

/**
 * @param {{ commit: string }[]} notes
 * @param {string} cursor
 * @param {string} currentCommit
 * @param {number} reached
 */
function acknowledgedThroughCursor(notes, cursor, currentCommit, reached) {
  const ids = new Set();
  if (!cursor) return ids;
  const end = Math.min(watermarkIndex(notes, cursor, currentCommit), reached);
  for (let i = 0; i <= end; i += 1) {
    ids.add(notes[i].commit);
    ids.add(announcementId(notes[i], currentCommit, notes));
  }
  return ids;
}

/**
 * Non-permanent notes are queued only when this revision newly reaches them.
 * Permanent notes are queued for that upgrade and for the first visit.
 * An id already in `seen` is left out, whichever path would have played it.
 * On the first visit, `acknowledge` records every reached note so those
 * non-permanent notes are not treated as a later upgrade.
 * @param {{ commit: string, permanent?: boolean }[]} notes
 * @param {string} cursor
 * @param {string} currentCommit
 * @param {Set<string>} [seen]
 * @param {Set<string>} [ack]
 * @returns {{ queue: { commit: string, permanent?: boolean }[], stamp: string | null, acknowledge: string[] }}
 */
export function planAnnouncements(notes, cursor, currentCommit, seen = new Set(), ack = new Set()) {
  const reached = reachedIndex(notes, currentCommit);
  if (reached < 0) return { queue: [], stamp: null, acknowledge: [] };
  const known = new Set(ack);
  const firstVisit = !cursor && known.size === 0;
  let seeded = [];
  if (!firstVisit && known.size === 0 && cursor) {
    const baseline = acknowledgedThroughCursor(notes, cursor, currentCommit, reached);
    for (const id of baseline) known.add(id);
    seeded = [...baseline];
  }
  /** @type {{ commit: string, permanent?: boolean }[]} */
  const queue = [];
  const queued = new Set();
  for (let i = 0; i <= reached; i += 1) {
    const note = notes[i];
    const id = announcementId(note, currentCommit, notes);
    if (seen.has(id) || seen.has(note.commit) || queued.has(id)) continue;
    const isNew = !known.has(id) && !known.has(note.commit);
    if (!note.permanent && (firstVisit || !isNew)) continue;
    queued.add(id);
    queue.push(note);
  }
  /** @type {string[]} */
  const acknowledge = seeded;
  if (firstVisit) {
    for (let i = 0; i <= reached; i += 1) {
      acknowledge.push(notes[i].commit, announcementId(notes[i], currentCommit, notes));
    }
  }
  const stamp = firstVisit ? announcementId(notes[reached], currentCommit, notes) : null;
  return { queue, stamp, acknowledge };
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
 * @param {string} key
 */
function loadIdSet(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string' && id) : []);
  } catch {
    return new Set();
  }
}

/**
 * @param {string} key
 * @param {Iterable<string>} ids
 */
function storeIdSet(key, ids) {
  const next = new Set();
  for (const id of ids) if (id) next.add(id);
  if (next.size === 0) return;
  try {
    localStorage.setItem(key, JSON.stringify([...next]));
  } catch {
    /* ignore quota */
  }
}

function seenAnnouncements() {
  return loadIdSet(SEEN_KEY);
}

function ackAnnouncements() {
  return loadIdSet(ACK_KEY);
}

function markAnnouncementSeen(ids) {
  storeIdSet(SEEN_KEY, new Set([...seenAnnouncements(), ...ids]));
}

function markAcknowledged(ids) {
  storeIdSet(ACK_KEY, new Set([...ackAnnouncements(), ...ids]));
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
 * Notes the running revision has reached and this browser has not played yet.
 * Call after the page chrome has been laid out.
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
  const cursor = getCursor();
  const seen = seenAnnouncements();
  const { queue, stamp, acknowledge } = planAnnouncements(
    notes,
    cursor,
    currentCommit,
    seen,
    ackAnnouncements(),
  );
  if (stamp) setCursor(stamp);
  if (acknowledge.length) markAcknowledged(acknowledge);
  for (const note of queue) {
    const outcome = await showNote(note);
    if (outcome !== 'shown') continue;
    const ids = [note.commit, announcementId(note, currentCommit, notes)];
    markAnnouncementSeen(ids);
    markAcknowledged(ids);
  }
}
