/**
 * Flags on a wordset's game-state.json.
 * curated: false is the only uncurated value.
 * blocked: true hides that wordset.
 * A missing file is curated and available.
 */

export const UNCURATED_WARNING = 'This word set is not curated, so unusual things can occur.';

/** @param {unknown} raw */
export function interpretGameState(raw) {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    curated: /** @type {{ curated?: unknown }} */ (obj).curated !== false,
    blocked: /** @type {{ blocked?: unknown }} */ (obj).blocked === true,
  };
}

/** @param {{ curated?: boolean } | null | undefined} state */
export function uncuratedWarningText(state) {
  if (!state || state.curated !== false) return '';
  return UNCURATED_WARNING;
}
