/** @typedef {{ code: string, menu: string, flag: string, lat: number, lon: number, games: string[] }} LanguageInfo */

/** @type {LanguageInfo[]|null} */
let cache = null;

export async function loadLanguages() {
  if (cache) return cache;
  const res = await fetch('/data/languages.json');
  if (!res.ok) throw new Error('Failed to load languages catalog');
  cache = await res.json();
  return cache;
}

/** @param {string} code */
export async function getLanguage(code) {
  const all = await loadLanguages();
  return all.find((l) => l.code === code) || null;
}
