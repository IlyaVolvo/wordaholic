/**
 * Deterministic Daily puzzle helpers for TransWord.
 */
import { generatePuzzles } from './solver.js';

/**
 * Local calendar date YYYY-MM-DD.
 * @param {Date} [date]
 */
export function formatLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Stable uint32 seed from daily key parts.
 * @param {string} gameDate YYYY-MM-DD
 * @param {string} language
 * @param {number|string} vocabLevel
 * @param {number|string} difficulty
 */
export function dailySeed(gameDate, language, vocabLevel, difficulty) {
  const compact = String(gameDate).replace(/-/g, '');
  const raw = `${compact}|${language}|${vocabLevel}|${difficulty}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Difficulty select value → [minSteps, maxSteps].
 * @param {number} difficultyValue
 */
export function difficultyRangeFromValue(difficultyValue) {
  const v = Number(difficultyValue);
  if (v <= 3) return [2, 3];
  if (v <= 5) return [4, 5];
  return [6, 8];
}

/**
 * @param {import('./graph.js').WordGraph} graph
 * @param {{ gameDate: string, language: string, vocabLevel: number, difficulty: number }} key
 * @param {{ maxAttempts?: number, sampleSize?: number }} [opts]
 * @returns {{ start: string, end: string, dist: number, path: string[], seedUsed: number } | null}
 */
export function getDailyPuzzle(graph, key, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 64;
  const sampleSize = opts.sampleSize ?? 400;
  const [minSteps, maxSteps] = difficultyRangeFromValue(key.difficulty);
  const base = dailySeed(key.gameDate, key.language, key.vocabLevel, key.difficulty);

  for (let i = 0; i < maxAttempts; i++) {
    const seed = (base + i) >>> 0;
    const puzzles = generatePuzzles(graph, {
      minSteps,
      maxSteps,
      count: 1,
      sampleSize,
      seed,
    });
    if (puzzles.length) {
      const p = puzzles[0];
      return { start: p.start, end: p.end, dist: p.dist, path: p.path, seedUsed: seed };
    }
  }
  return null;
}

/**
 * Solved when both start and end appear in the path (normally start first, end last).
 * @param {string[]} path
 * @param {string} start
 * @param {string} end
 */
export function isPathSolved(path, start, end) {
  if (!Array.isArray(path) || !path.length) return false;
  return path.includes(start) && path.includes(end);
}
