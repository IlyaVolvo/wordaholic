import React, { useEffect, useState } from 'react';
import { normalizeWithMappings } from '@wordaholic/normalize';
import { getPreferredLanguageCodes, pickActiveLanguage, setLastLanguage } from '@wordaholic/i18n-prefs';
import { initFavorites } from '../../../app/i18n-prefs/favorites.js';
import { Game } from './Game';
import { buildLexicon, type Lexicon } from './lexicon.ts';
import { openingSize, PARAMS } from './params.ts';
import { loadPrefs } from './storage.ts';

export type LetterixLanguage = {
  code: string;
  name: string;
  flag: string;
  dir: string;
  wordDir: string;
};

type CatalogLanguage = {
  code?: string;
  menu?: string;
  flag?: string;
  games?: string[];
  letterixDir?: string;
  wordDir?: string;
};

const ENGLISH: LetterixLanguage = {
  code: 'en',
  name: 'English',
  flag: '🇺🇸',
  dir: 'English',
  wordDir: 'English/en',
};

function publishLanguageUrl(lang: string, langs: string[]) {
  const params = new URLSearchParams(window.location.search);
  params.set('lang', lang);
  params.set('langs', langs.join(','));
  const next = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, '', next);
  }
}

async function loadPlayableLanguages(): Promise<LetterixLanguage[]> {
  const res = await fetch('/data/languages.json');
  if (!res.ok) return [ENGLISH];
  const catalog = (await res.json()) as CatalogLanguage[];
  const playable = catalog
    .filter((lang) => lang.code && lang.letterixDir && (lang.games || []).includes('letterix'))
    .map((lang) => ({
      code: String(lang.code),
      name: lang.menu || String(lang.code),
      flag: lang.flag || '',
      dir: String(lang.letterixDir),
      wordDir: String(lang.wordDir || ''),
    }));
  return playable.length ? playable : [ENGLISH];
}

async function loadLexicon(lang: Pick<LetterixLanguage, 'dir' | 'wordDir'>): Promise<Lexicon> {
  const [wordsRes, langRes] = await Promise.all([
    fetch(`/games/letterix/data/languages/${lang.dir}/corpus.txt`),
    fetch(`/word-data/${lang.wordDir}/language.json`),
  ]);
  if (!wordsRes.ok) throw new Error('Word list is missing');
  const text = await wordsRes.text();
  const config = langRes.ok ? await langRes.json() : {};
  const mappings = config.normalization && typeof config.normalization === 'object' ? config.normalization : {};
  const words = text
    .split(/\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);
  return buildLexicon(words, (word) => normalizeWithMappings(word, mappings));
}

export const App: React.FC = () => {
  const [lex, setLex] = useState<Lexicon | null>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [languages, setLanguages] = useState<LetterixLanguage[]>([ENGLISH]);
  const [favorites, setFavorites] = useState<string[]>(['en']);
  const [language, setLanguage] = useState('en');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        await initFavorites();
        const playable = await loadPlayableLanguages();
        const preferred = getPreferredLanguageCodes();
        const active = pickActiveLanguage(preferred, playable.map((lang) => lang.code));
        const chosen = playable.find((lang) => lang.code === active) || playable[0];
        const favoriteCodes = preferred;
        const favoriteSet = new Set(favoriteCodes);
        const menu = playable.filter((lang) => favoriteSet.has(lang.code));
        const shown = menu.some((lang) => lang.code === chosen.code)
          ? menu
          : [chosen, ...menu];
        const built = await loadLexicon(chosen);
        const prefs = await loadPrefs();
        const open = openingSize();
        const W = Math.min(PARAMS.Wmax, Math.max(PARAMS.Wmin, prefs?.W || open.W));
        const H = Math.min(PARAMS.Hmax, Math.max(PARAMS.Hmin, prefs?.H || open.H));
        if (cancel) return;
        publishLanguageUrl(chosen.code, favoriteCodes);
        setLanguages(shown.length ? shown : [chosen]);
        setFavorites(favoriteCodes);
        setLanguage(chosen.code);
        setLex(built);
        setSize({ W, H });
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not start Letterix');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function changeLanguage(code: string) {
    const next = languages.find((lang) => lang.code === code);
    if (!next || next.code === language) return;
    setError('');
    try {
      const built = await loadLexicon(next);
      void setLastLanguage(next.code);
      publishLanguageUrl(next.code, favorites);
      setLanguage(next.code);
      setLex(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that language');
    }
  }

  if (error && !lex) return <p className="boot-error">{error}</p>;
  if (!lex || !size) return <p className="boot-error">Loading Letterix…</p>;
  return (
    <Game
      lex={lex}
      language={language}
      languages={languages}
      onLanguageChange={(code) => { void changeLanguage(code); }}
      initialW={size.W}
      initialH={size.H}
    />
  );
};
