/**
 * TransWord Daily records in IndexedDB (via platform storage).
 */
import { storage } from '../../app/storage/idb.js';

const GAME_ID = 'transword';

/**
 * @param {{ language: string, vocabLevel: number|string, difficulty: number|string, gameDate: string }} key
 */
export function dailyRecordId(key) {
  return `${GAME_ID}:${key.language}:${key.vocabLevel}:${key.difficulty}:${key.gameDate}`;
}

/**
 * @typedef {object} TranswordDaily
 * @property {string} id
 * @property {string} gameId
 * @property {string} language
 * @property {number} vocabLevel
 * @property {number} difficulty
 * @property {string} gameDate
 * @property {string} start
 * @property {string} end
 * @property {number} optimal
 * @property {string[]} path
 * @property {number} elapsedMs
 * @property {number} deadendCount
 * @property {number} helpCount
 * @property {boolean} isComplete
 * @property {string} updatedAt
 */

/**
 * @param {Omit<TranswordDaily, 'id'|'gameId'|'updatedAt'> & { id?: string, updatedAt?: string }} record
 * @returns {Promise<TranswordDaily>}
 */
export async function upsertDaily(record) {
  const id = record.id || dailyRecordId(record);
  /** @type {TranswordDaily} */
  const row = {
    id,
    gameId: GAME_ID,
    language: record.language,
    vocabLevel: Number(record.vocabLevel),
    difficulty: Number(record.difficulty),
    gameDate: record.gameDate,
    start: record.start,
    end: record.end,
    optimal: Number(record.optimal),
    path: Array.isArray(record.path) ? [...record.path] : [],
    elapsedMs: Math.max(0, Number(record.elapsedMs) || 0),
    deadendCount: Math.max(0, Number(record.deadendCount) || 0),
    helpCount: Math.max(0, Number(record.helpCount) || 0),
    isComplete: !!record.isComplete,
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
  await storage.putDaily(row);
  return row;
}

/**
 * @param {{ language: string, vocabLevel: number|string, difficulty: number|string, gameDate: string }} key
 * @returns {Promise<TranswordDaily|null>}
 */
export async function getDaily(key) {
  return storage.getDaily(dailyRecordId(key));
}

/**
 * @param {{ language?: string, vocabLevel?: number|string|null, difficulty?: number|string|null }} [filters]
 * @returns {Promise<TranswordDaily[]>}
 */
export async function listDailies(filters = {}) {
  const all = await storage.listDailies(GAME_ID);
  return all.filter((row) => {
    if (filters.language != null && filters.language !== '' && filters.language !== 'all') {
      if (row.language !== filters.language) return false;
    }
    if (filters.vocabLevel != null && filters.vocabLevel !== '' && filters.vocabLevel !== 'all') {
      if (Number(row.vocabLevel) !== Number(filters.vocabLevel)) return false;
    }
    if (filters.difficulty != null && filters.difficulty !== '' && filters.difficulty !== 'all') {
      if (Number(row.difficulty) !== Number(filters.difficulty)) return false;
    }
    return true;
  });
}

/**
 * Stats for completed dailies matching filters.
 * Streak only when language+vocab+difficulty are all concrete.
 */
export function computeDailyStats(rows, filters) {
  const completed = rows.filter((r) => r.isComplete);
  const played = completed.length;
  let totalSteps = 0;
  let totalElapsed = 0;
  let totalDeadends = 0;
  let totalHelps = 0;
  let cleanSolves = 0;
  let optimalSolves = 0;
  let bestElapsedMs = null;
  for (const r of completed) {
    const steps = Math.max(0, (r.path?.length || 1) - 1);
    const optimal = Number(r.optimal) || 0;
    const elapsed = Number(r.elapsedMs) || 0;
    const deadends = Math.max(0, Number(r.deadendCount) || 0);
    const helps = Math.max(0, Number(r.helpCount) || 0);
    totalSteps += steps;
    totalElapsed += elapsed;
    totalDeadends += deadends;
    totalHelps += helps;
    if (deadends === 0 && helps === 0) cleanSolves += 1;
    if (optimal > 0 && steps === optimal) optimalSolves += 1;
    if (elapsed > 0 && (bestElapsedMs == null || elapsed < bestElapsedMs)) {
      bestElapsedMs = elapsed;
    }
  }

  const concrete =
    filters.language &&
    filters.language !== 'all' &&
    filters.vocabLevel != null &&
    filters.vocabLevel !== '' &&
    filters.vocabLevel !== 'all' &&
    filters.difficulty != null &&
    filters.difficulty !== '' &&
    filters.difficulty !== 'all';

  let streak = null;
  if (concrete) {
    streak = computeStreak(
      completed.filter(
        (r) =>
          r.language === filters.language &&
          Number(r.vocabLevel) === Number(filters.vocabLevel) &&
          Number(r.difficulty) === Number(filters.difficulty)
      )
    );
  }

  return {
    played,
    streak,
    avgElapsedMs: played ? totalElapsed / played : 0,
    bestElapsedMs,
    deadendRate: totalSteps ? totalDeadends / totalSteps : 0,
    helpRate: totalSteps ? totalHelps / totalSteps : 0,
    cleanRate: played ? cleanSolves / played : 0,
    optimalRate: played ? optimalSolves / played : 0,
  };
}

/** @param {TranswordDaily[]} completedForCombo */
function computeStreak(completedForCombo) {
  const dates = new Set(completedForCombo.map((r) => r.gameDate));
  let streak = 0;
  const cursor = new Date();
  // If today not complete, start from yesterday
  const today = formatDate(cursor);
  if (!dates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(formatDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
