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

function normalizeFavorites(codes) {
  if (!Array.isArray(codes)) return [...DEFAULT_FAVORITES];
  const unique = [...new Set(codes.filter((x) => typeof x === 'string' && x))];
  return unique.length ? unique : [...DEFAULT_FAVORITES];
}

/**
 * Load favorites from IndexedDB (migrate once from localStorage).
 * Call once during boot before using sync getters.
 */
export async function initFavorites() {
  await storage.open();

  let favorites = await storage.getSetting(IDB_FAVORITES_KEY, null);
  if (!Array.isArray(favorites) || favorites.length === 0) {
    try {
      const raw = localStorage.getItem(LS_FAVORITES_KEY);
      if (raw) favorites = JSON.parse(raw);
    } catch {
      favorites = null;
    }
  }
  favoritesCache = normalizeFavorites(favorites);
  await storage.setSetting(IDB_FAVORITES_KEY, favoritesCache);

  let last = await storage.getSetting(IDB_LAST_KEY, null);
  if (typeof last !== 'string' || !last) {
    last = localStorage.getItem(LS_LAST_KEY) || favoritesCache[0] || 'en';
  }
  lastLanguageCache = last;
  await storage.setSetting(IDB_LAST_KEY, lastLanguageCache);

  // Keep a localStorage mirror for very early/offline reads; IDB is source of truth.
  localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(favoritesCache));
  localStorage.setItem(LS_LAST_KEY, lastLanguageCache);

  ready = true;
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
  const next = normalizeFavorites(codes);
  favoritesCache = next;
  await storage.setSetting(IDB_FAVORITES_KEY, next);
  localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(next));
  return [...next];
}

export function getLastLanguage() {
  if (lastLanguageCache) return lastLanguageCache;
  return localStorage.getItem(LS_LAST_KEY) || getFavoriteLanguages()[0] || 'en';
}

/** @param {string} code */
export async function setLastLanguage(code) {
  if (!code) return;
  lastLanguageCache = code;
  await storage.setSetting(IDB_LAST_KEY, code);
  localStorage.setItem(LS_LAST_KEY, code);
}

export function favoritesReady() {
  return ready;
}
