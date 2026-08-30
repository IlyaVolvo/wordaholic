export const BOARD_COUNT_MIN = 2;
export const BOARD_COUNT_MAX = 20;
export const DEFAULT_BOARD_COUNT = 16;

/** Extra guesses beyond board count. Map so a later per-count table does not require a redesign. */
export const EXTRA_ATTEMPTS_BY_BOARD_COUNT: Record<number, number> = Object.fromEntries(
  Array.from({ length: BOARD_COUNT_MAX - BOARD_COUNT_MIN + 1 }, (_, i) => [i + BOARD_COUNT_MIN, 5])
);

export function clampBoardCount(n: number): number {
  const rounded = Math.round(Number(n));
  if (!Number.isFinite(rounded)) return DEFAULT_BOARD_COUNT;
  return Math.min(BOARD_COUNT_MAX, Math.max(BOARD_COUNT_MIN, rounded));
}

export function extraAttemptsForBoardCount(boardCount: number): number {
  return EXTRA_ATTEMPTS_BY_BOARD_COUNT[clampBoardCount(boardCount)] ?? 5;
}

export function maxGuessesForBoardCount(boardCount: number): number {
  const n = clampBoardCount(boardCount);
  return n + extraAttemptsForBoardCount(n);
}

export const SCOREBOARD_YELLOW_CAP = 4.4;
