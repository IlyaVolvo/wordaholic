import { storage } from '../storage/idb.js';

const LS_FAVORITES_KEY = 'wordaholic.favoriteLanguages';
const LS_LAST_KEY = 'wordaholic.lastLanguage';
const IDB_FAVORITES_KEY = 'favoriteLanguages';
const IDB_LAST_KEY = 'lastLanguage';
const DEFAULT_FAVORITES = ['en'];

/** @type {string[]|null} */
let favoritesCache = null;
/** @type {string|null} */
let lastLanguageCache = null;
let ready = false;
/** Bumped on every user-facing prefs write so boot cannot clobber live edits. */
let prefsEpoch = 0;

function normalizeFavorites(codes) {
  if (!Array.isArray(codes)) return [...DEFAULT_FAVORITES];
  const unique = [...new Set(codes.filter((x) => typeof x === 'string' && x))];
  return unique.length ? unique : [...DEFAULT_FAVORITES];
}

function readLocalFavorites() {
  try {
    const raw = localStorage.getItem(LS_FAVORITES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistLocal() {
  if (favoritesCache) {
    localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(favoritesCache));
  }
  if (lastLanguageCache) {
    localStorage.setItem(LS_LAST_KEY, lastLanguageCache);
  }
}

function persistIdb() {
  const fav = favoritesCache;
  const last = lastLanguageCache;
  void (async () => {
    try {
      if (fav) await storage.setSetting(IDB_FAVORITES_KEY, fav);
      if (last) await storage.setSetting(IDB_LAST_KEY, last);
    } catch (err) {
      console.warn('IndexedDB prefs sync failed', err);
    }
  })();
}

/**
 * Hydrate favorites for the UI from localStorage (immediate), then sync IndexedDB
 * without overwriting edits the user already made this session.
 */
export async function initFavorites() {
  const epochAtStart = prefsEpoch;
  const fromLs = readLocalFavorites();
  favoritesCache = normalizeFavorites(fromLs);
  lastLanguageCache = localStorage.getItem(LS_LAST_KEY) || favoritesCache[0] || 'en';
  ready = true;
  persistLocal();

  try {
    await storage.open();
  } catch (err) {
    console.warn('IndexedDB unavailable; using localStorage favorites', err);
    return favoritesCache;
  }

  if (prefsEpoch !== epochAtStart) {
    persistIdb();
    return favoritesCache;
  }

  if (fromLs) {
    persistIdb();
    return favoritesCache;
  }

  let favorites = await storage.getSetting(IDB_FAVORITES_KEY, null);
  let last = await storage.getSetting(IDB_LAST_KEY, null);
  if (prefsEpoch !== epochAtStart) {
    persistIdb();
    return favoritesCache;
  }

  if (Array.isArray(favorites) && favorites.length) {
    favoritesCache = normalizeFavorites(favorites);
  }
  if (typeof last === 'string' && last) {
    lastLanguageCache = last;
  }
  persistLocal();
  persistIdb();
  return favoritesCache;
}

export function getFavoriteLanguages() {
  if (favoritesCache) return [...favoritesCache];
  try {
    const raw = localStorage.getItem(LS_FAVORITES_KEY);
    if (!raw) return [...DEFAULT_FAVORITES];
    return normalizeFavorites(JSON.parse(raw));
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

/** @param {string[]} codes */
export async function setFavoriteLanguages(codes) {
  prefsEpoch += 1;
  const next = normalizeFavorites(codes);
  favoritesCache = next;
  persistLocal();
  persistIdb();
  return [...next];
}

export function getLastLanguage() {
  if (lastLanguageCache) return lastLanguageCache;
  return localStorage.getItem(LS_LAST_KEY) || getFavoriteLanguages()[0] || 'en';
}

/** @param {string} code */
export async function setLastLanguage(code) {
  if (!code) return;
  prefsEpoch += 1;
  lastLanguageCache = code;
  persistLocal();
  persistIdb();
}

export function favoritesReady() {
  return ready;
}
