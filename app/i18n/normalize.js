/**
 * Apply language.json `normalization` maps to a word.
 * Supports single-char keys, grouped keys ("àáâä" → "a"), and multi-char bases ("ß" → "ss").
 *
 * @param {string} word
 * @param {Record<string, string> | null | undefined} mappings
 * @returns {string}
 */
export function normalizeWithMappings(word, mappings) {
  if (!word || !mappings || typeof mappings !== 'object') return word;
  const entries = Object.entries(mappings);
  if (!entries.length) return word;

  /** @type {[string, string][]} */
  const singleCharReplacements = [];
  /** @type {[string, string][]} */
  const multiCharReplacements = [];

  for (const [variant, base] of entries) {
    if (typeof variant !== 'string' || typeof base !== 'string') continue;
    if (base.length > 1) {
      multiCharReplacements.push([variant, base]);
    } else {
      for (const singleVariant of Array.from(variant)) {
        singleCharReplacements.push([singleVariant, base]);
      }
    }
  }

  let normalized = word;
  for (const [variant, base] of multiCharReplacements) {
    normalized = normalized.split(variant).join(base);
  }
  for (const [variant, base] of singleCharReplacements) {
    if (!variant) continue;
    normalized = normalized.split(variant).join(base);
  }
  return normalized;
}
