const STORAGE_KEY = 'wordaholic.favoriteLanguages';
const DEFAULT_FAVORITES = ['en'];

export function getFavoriteLanguages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_FAVORITES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_FAVORITES];
    return parsed.filter((x) => typeof x === 'string');
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

/** @param {string[]} codes */
export function setFavoriteLanguages(codes) {
  const unique = [...new Set(codes.filter(Boolean))];
  const next = unique.length ? unique : [...DEFAULT_FAVORITES];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getLastLanguage() {
  return localStorage.getItem('wordaholic.lastLanguage') || getFavoriteLanguages()[0] || 'en';
}

/** @param {string} code */
export function setLastLanguage(code) {
  localStorage.setItem('wordaholic.lastLanguage', code);
}
