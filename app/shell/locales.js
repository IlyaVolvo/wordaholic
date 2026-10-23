/**
 * Shared locale code → Language folder map (word-data + game data/languages trees).
 * Paths: word-data/<language>/language.json
 */
export const LOCALE_PATHS = {
  en: { language: 'English' },
  ru: { language: 'Russian' },
  fr: { language: 'French' },
  es: { language: 'Spanish' },
  de: { language: 'German' },
  he: { language: 'Hebrew' },
  hy: { language: 'Armenian' },
};

/** @param {string} code */
export function languageDirForCode(code) {
  return LOCALE_PATHS[code]?.language || null;
}

/** Absolute URL for shared language definition (accepts a code or a Language folder). */
export function languageJsonUrl(codeOrDir) {
  const dir = languageDirForCode(codeOrDir) || languageDirForTranswordDir(codeOrDir);
  if (!dir) return null;
  return `/word-data/${dir}/language.json`;
}

/** Map TransWord language folder name (e.g. English) → word-data dir. */
export function languageDirForTranswordDir(dirName) {
  return codeForLanguageName(dirName) ? dirName : null;
}

/** Reverse map: Language folder → locale code (en, es, …). */
export function codeForLanguageName(dirName) {
  for (const [code, info] of Object.entries(LOCALE_PATHS)) {
    if (info.language === dirName) return code;
  }
  return null;
}
