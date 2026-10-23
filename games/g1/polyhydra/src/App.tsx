import React, { useEffect, useState } from 'react';
import { Game } from './components/Game';
import { Statistics } from './components/Statistics';
import { getLanguageConfigs } from '@wordaholic/wordle-core';
import { clampBoardCount, DEFAULT_BOARD_COUNT } from '@wordaholic/wordle-core';
import { initPreferences, loadPreferences, savePreferences } from './utils/preferences';
import type { LanguageConfig } from './types';

function readPreferredFromUrl(): { lang: string | null; langs: string[] } {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  const langsRaw = params.get('langs') || '';
  const langs = langsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  return { lang, langs };
}

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'game' | 'statistics'>('game');
  const [availableLanguages, setAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [language, setLanguage] = useState('en');
  const [wordLength, setWordLength] = useState(5);
  const [boardCount, setBoardCount] = useState(DEFAULT_BOARD_COUNT);

  useEffect(() => {
    const boot = async () => {
      try {
        const prefs = await initPreferences();
        const { lang: urlLang, langs: urlLangs } = readPreferredFromUrl();
        const allConfigs = await getLanguageConfigs();
        let filtered = allConfigs;
        if (urlLangs.length > 0) {
          const urlSet = new Set(urlLangs);
          const fromUrl = allConfigs.filter((c) => urlSet.has(c.code));
          if (fromUrl.length > 0) filtered = fromUrl;
        }
        const startLang =
          (urlLang && filtered.find((c) => c.code === urlLang)?.code) ||
          (prefs.language && filtered.find((c) => c.code === prefs.language)?.code) ||
          filtered[0]?.code ||
          'en';
        let startLength = prefs.wordLength || 5;
        const langConfig = filtered.find((c) => c.code === startLang);
        if (langConfig && !langConfig.supportedLengths.includes(startLength)) {
          startLength = langConfig.supportedLengths[0] || 5;
        }
        const startBoards = clampBoardCount(prefs.boardCount || DEFAULT_BOARD_COUNT);
        setAvailableLanguages(filtered);
        setLanguage(startLang);
        setWordLength(startLength);
        setBoardCount(startBoards);
        savePreferences({
          ...prefs,
          language: startLang,
          wordLength: startLength,
          boardCount: startBoards,
        });
      } catch (err) {
        console.error('Failed to load language configs:', err);
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    const prefs = loadPreferences();
    const updated = { ...prefs, language: newLanguage };
    const langConfig = availableLanguages.find((l) => l.code === newLanguage);
    if (langConfig && !langConfig.supportedLengths.includes(wordLength)) {
      const validLength = langConfig.supportedLengths[0] || 5;
      setWordLength(validLength);
      updated.wordLength = validLength;
    }
    savePreferences(updated);
  };

  const handleWordLengthChange = (len: number) => {
    setWordLength(len);
    savePreferences({ ...loadPreferences(), wordLength: len });
  };

  const handleBoardCountChange = (count: number) => {
    const next = clampBoardCount(count);
    setBoardCount(next);
    savePreferences({ ...loadPreferences(), boardCount: next });
  };

  return (
    <div className="app-container">
      {view === 'statistics' ? (
        <Statistics
          language={language}
          wordLength={wordLength}
          boardCount={boardCount}
          availableLanguages={availableLanguages}
          onViewChange={setView}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          onBoardCountChange={handleBoardCountChange}
        />
      ) : (
        <Game
          view={view}
          onViewChange={setView}
          language={language}
          wordLength={wordLength}
          boardCount={boardCount}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          onBoardCountChange={handleBoardCountChange}
          availableLanguages={availableLanguages}
        />
      )}
    </div>
  );
};
