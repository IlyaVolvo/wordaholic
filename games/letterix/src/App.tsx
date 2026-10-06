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
};

type CatalogLanguage = {
  code?: string;
  menu?: string;
  flag?: string;
  games?: string[];
  letterixDir?: string;
};

const ENGLISH: LetterixLanguage = { code: 'en', name: 'English', flag: '🇺🇸', dir: 'English/en' };

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
    }));
  return playable.length ? playable : [ENGLISH];
}

async function loadLexicon(dir: string): Promise<Lexicon> {
  const [wordsRes, langRes] = await Promise.all([
    fetch(`/games/letterix/dict/${dir}/words.txt`),
    fetch(`/word-data/${dir}/language.json`),
  ]);
  if (!wordsRes.ok) throw new Error('Word list is missing');
  const text = await wordsRes.text();
  const lang = langRes.ok ? await langRes.json() : {};
  const mappings = lang.normalization && typeof lang.normalization === 'object' ? lang.normalization : {};
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
        const inFavorites = playable.filter((lang) => preferred.includes(lang.code));
        const choices = inFavorites.length ? inFavorites : playable;
        const active = pickActiveLanguage(preferred, choices.map((lang) => lang.code));
        const chosen = choices.find((lang) => lang.code === active) || choices[0];
        const urlLangs = new URLSearchParams(window.location.search).get('langs');
        const favoriteCodes = urlLangs
          ? urlLangs.split(',').map((code) => code.trim()).filter(Boolean)
          : preferred;
        const built = await loadLexicon(chosen.dir);
        const prefs = await loadPrefs();
        const open = openingSize();
        const W = Math.min(PARAMS.Wmax, Math.max(PARAMS.Wmin, prefs?.W || open.W));
        const H = Math.min(PARAMS.Hmax, Math.max(PARAMS.Hmin, prefs?.H || open.H));
        if (cancel) return;
        publishLanguageUrl(chosen.code, favoriteCodes);
        setLanguages(choices);
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
      const built = await loadLexicon(next.dir);
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
