import { storage } from '../storage/idb.js';

const VISIT_KEY = 'variantVisits';
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @type {Map<string, Record<string, { selectedDate: string, openedOn: string, chosen?: true }>>} */
const visitCache = new Map();
/** @type {Map<string, Promise<void>>} */
const visitQueue = new Map();

/**
 * Local calendar day YYYY-MM-DD.
 * @param {Date} [now]
 */
export function localCalendarDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Stable id for one puzzle variant (language, length, boards, difficulty, …).
 * @param {Array<string|number>} parts
 */
export function variantVisitKey(parts) {
  return parts.map((part) => String(part ?? '')).join('\u001f');
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function asDate(value) {
  const match = DATE_RE.exec(String(value || '').trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * First open of a variant on a calendar day plays today.
 * A later open that same day keeps a date the player explicitly picked.
 * Visits recorded without that pick (including a bad same-day record) play today.
 * @param {{ selectedDate?: string|null, openedOn?: string|null, chosen?: boolean }|null|undefined} visit
 * @param {string} [today]
 * @returns {{ date: string, firstToday: boolean, visit: { selectedDate: string, openedOn: string, chosen?: true } }}
 */
export function resolveVariantPlayDate(visit, today = localCalendarDate()) {
  const selected = asDate(visit?.selectedDate);
  const openedOn = asDate(visit?.openedOn);
  const chosenToday = openedOn === today && visit?.chosen === true && Boolean(selected) && selected <= today;
  const date = chosenToday ? selected : today;
  return {
    date,
    firstToday: !chosenToday,
    visit: chosenToday
      ? { selectedDate: selected, openedOn: today, chosen: true }
      : { selectedDate: date, openedOn: today },
  };
}

/**
 * Remember a puzzle date the player chose, for the rest of this calendar day.
 * @param {string} date
 * @param {string} [today]
 * @returns {{ selectedDate: string, openedOn: string, chosen: true }}
 */
export function rememberSelectedDate(date, today = localCalendarDate()) {
  const selected = asDate(date);
  const clipped = selected && selected <= today ? selected : today;
  return { selectedDate: clipped, openedOn: today, chosen: true };
}

/**
 * First day of the month that contains the selected puzzle date.
 * @param {string} selectedDate
 * @param {Date} [now]
 * @returns {Date}
 */
export function calendarMonthForSelection(selectedDate, now = new Date()) {
  const match = DATE_RE.exec(String(selectedDate || '').trim());
  if (!match) return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

/**
 * @param {string} gameId
 * @param {() => Promise<string>} task
 */
function enqueue(gameId, task) {
  const prev = visitQueue.get(gameId) || Promise.resolve();
  const run = prev.then(task, task);
  visitQueue.set(
    gameId,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

/**
 * @param {string} gameId
 */
async function readVisits(gameId) {
  const cached = visitCache.get(gameId);
  if (cached) return cached;
  const stored = await storage.getGameState(gameId, VISIT_KEY);
  const visits = stored && typeof stored === 'object' ? { ...stored } : {};
  visitCache.set(gameId, visits);
  return visits;
}

/**
 * @param {string} gameId
 * @param {Record<string, { selectedDate: string, openedOn: string, chosen?: true }>} visits
 */
async function writeVisits(gameId, visits) {
  visitCache.set(gameId, visits);
  await storage.setGameState(gameId, VISIT_KEY, { ...visits });
}

/**
 * Open a variant for today. Returns the puzzle date to show.
 * @param {string} gameId
 * @param {Array<string|number>} parts
 * @param {string} [today]
 */
export function openVariant(gameId, parts, today = localCalendarDate()) {
  const key = variantVisitKey(parts);
  return enqueue(gameId, async () => {
    const visits = await readVisits(gameId);
    const resolved = resolveVariantPlayDate(visits[key], today);
    const current = visits[key];
    if (
      !current ||
      current.selectedDate !== resolved.visit.selectedDate ||
      current.openedOn !== resolved.visit.openedOn ||
      current.chosen !== resolved.visit.chosen
    ) {
      visits[key] = resolved.visit;
      await writeVisits(gameId, visits);
    }
    return resolved.date;
  });
}

/**
 * Store a puzzle date the player picked for this variant.
 * @param {string} gameId
 * @param {Array<string|number>} parts
 * @param {string} date
 * @param {string} [today]
 */
export function selectVariantDate(gameId, parts, date, today = localCalendarDate()) {
  const key = variantVisitKey(parts);
  return enqueue(gameId, async () => {
    const visits = await readVisits(gameId);
    const next = rememberSelectedDate(date, today);
    visits[key] = next;
    await writeVisits(gameId, visits);
    return next.selectedDate;
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('wordaholic:storage-imported', (event) => {
    const gameId = /** @type {CustomEvent} */ (event).detail?.gameId;
    if (gameId) visitCache.delete(gameId);
    else visitCache.clear();
  });
}
