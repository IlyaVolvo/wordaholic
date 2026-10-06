import React, { useEffect, useState } from 'react';
import { normalizeWithMappings } from '@wordaholic/normalize';
import { Game } from './Game';
import { buildLexicon, type Lexicon } from './lexicon.ts';
import { openingSize, PARAMS } from './params.ts';
import { loadPrefs } from './storage.ts';

export const App: React.FC = () => {
  const [lex, setLex] = useState<Lexicon | null>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [wordsRes, langRes] = await Promise.all([
          fetch('/games/letterix/dict/English/en/words.txt'),
          fetch('/word-data/English/en/language.json'),
        ]);
        if (!wordsRes.ok) throw new Error('English word list is missing');
        const text = await wordsRes.text();
        const lang = langRes.ok ? await langRes.json() : {};
        const mappings = lang.normalization && typeof lang.normalization === 'object' ? lang.normalization : {};
        const words = text
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const built = buildLexicon(words, (word) => normalizeWithMappings(word, mappings));
        const prefs = await loadPrefs();
        const open = openingSize();
        const W = Math.max(PARAMS.Wmin, prefs?.W || open.W);
        const H = Math.max(PARAMS.Hmin, prefs?.H || open.H);
        if (!cancel) {
          setLex(built);
          setSize({ W, H });
        }
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : 'Could not start Letterix');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (error) return <p className="boot-error">{error}</p>;
  if (!lex || !size) return <p className="boot-error">Loading Letterix…</p>;
  return <Game lex={lex} language="en" initialW={size.W} initialH={size.H} />;
};
