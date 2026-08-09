import { getFavoriteLanguages, getLastLanguage, setLastLanguage } from './favorites.js';

/**
 * Resolve preferred language codes for a game launch.
 * URL `langs=en,ru` wins; otherwise shell favorites from localStorage.
 * @returns {string[]}
 */
export function getPreferredLanguageCodes() {
  const u = new URL(location.href);
  const fromQuery = (u.searchParams.get('langs') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromQuery.length) return [...new Set(fromQuery)];
  return getFavoriteLanguages();
}

/**
 * Pick active language among preferred + available.
 * @param {string[]} preferred
 * @param {string[]} available codes the game can actually play
 */
export function pickActiveLanguage(preferred, available) {
  const avail = new Set(available);
  const fromUrl = new URL(location.href).searchParams.get('lang');
  if (fromUrl && avail.has(fromUrl)) {
    setLastLanguage(fromUrl);
    return fromUrl;
  }
  const last = getLastLanguage();
  if (preferred.includes(last) && avail.has(last)) return last;
  for (const code of preferred) {
    if (avail.has(code)) {
      setLastLanguage(code);
      return code;
    }
  }
  const first = available[0] || 'en';
  setLastLanguage(first);
  return first;
}

export { setLastLanguage, getLastLanguage };
