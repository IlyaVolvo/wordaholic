/**
 * Shared locale → Language/locale folder map (word-data + PolyWordlot dict trees).
 * Paths: word-data/<language>/<locale>/language.json
 */
export const LOCALE_PATHS = {
  en: { language: 'English', locale: 'en' },
  ru: { language: 'Russian', locale: 'ru' },
  fr: { language: 'French', locale: 'fr' },
  es: { language: 'Spanish', locale: 'es' },
  de: { language: 'German', locale: 'de' },
  he: { language: 'Hebrew', locale: 'he' },
  hy: { language: 'Armenian', locale: 'hy' },
};

/** @param {string} code */
export function languageDirForCode(code) {
  const info = LOCALE_PATHS[code];
  if (!info) return null;
  return `${info.language}/${info.locale}`;
}

/** Absolute URL for shared language definition. */
export function languageJsonUrl(codeOrDir) {
  if (codeOrDir.includes('/')) return `/word-data/${codeOrDir}/language.json`;
  const dir = languageDirForCode(codeOrDir);
  if (!dir) return null;
  return `/word-data/${dir}/language.json`;
}

/** Map TransWord language folder name (e.g. English) → word-data dir. */
export function languageDirForTranswordDir(dirName) {
  for (const [code, info] of Object.entries(LOCALE_PATHS)) {
    if (info.language === dirName) return `${info.language}/${info.locale}`;
  }
  return null;
}
