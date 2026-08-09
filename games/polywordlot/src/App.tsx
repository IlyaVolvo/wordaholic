import React, { useEffect, useRef, useState } from 'react';
import { Game } from './components/Game';
import { Statistics } from './components/Statistics';
import { getLanguageConfigs } from './data/languageLoader';
import { loadPreferences, savePreferences } from './utils/preferences';
import type { LanguageConfig } from './types';

const LOCAL_USER = { id: 1, email: 'local@wordaholic' };

function readPreferredFromUrl(): { lang: string | null; langs: string[] } {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  const langsRaw = params.get('langs') || '';
  const langs = langsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { lang, langs };
}

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'game' | 'statistics'>('game');
  const [initialStatisticType, setInitialStatisticType] = useState<string | undefined>();
  const [allAvailableLanguages, setAllAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [historicalDate, setHistoricalDate] = useState<string | null>(null);
  const [language, setLanguage] = useState('en');
  const [wordLength, setWordLength] = useState(5);
  const allConfigsRef = useRef<LanguageConfig[]>([]);

  useEffect(() => {
    const prefs = loadPreferences();
    const { lang: urlLang, langs: urlLangs } = readPreferredFromUrl();

    const boot = async () => {
      try {
        const allConfigs = await getLanguageConfigs();
        allConfigsRef.current = allConfigs;
        setAllAvailableLanguages(allConfigs);

        let selectedCodes =
          prefs.selectedLanguages && prefs.selectedLanguages.length > 0
            ? prefs.selectedLanguages
            : allConfigs.map((c) => c.code);

        if (urlLangs.length > 0) {
          const urlSet = new Set(urlLangs);
          const fromUrl = allConfigs.filter((c) => urlSet.has(c.code)).map((c) => c.code);
          if (fromUrl.length > 0) selectedCodes = fromUrl;
        }

        const selectedSet = new Set(selectedCodes);
        let filtered = allConfigs.filter((c) => selectedSet.has(c.code));
        if (filtered.length === 0) filtered = allConfigs;

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

        setAvailableLanguages(filtered);
        setLanguage(startLang);
        setWordLength(startLength);
        savePreferences({
          ...prefs,
          language: startLang,
          wordLength: startLength,
          selectedLanguages:
            selectedCodes.length === allConfigs.length ? undefined : selectedCodes,
        });
      } catch (err) {
        console.error('Failed to load language configs:', err);
      } finally {
        setLoading(false);
      }
    };

    void boot();
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const handleViewChange = (newView: 'game' | 'statistics' | null, statType?: string) => {
    if (newView === null) {
      setView('game');
    } else {
      setView(newView);
    }
    if (newView === 'statistics') {
      setHistoricalDate(null);
      setInitialStatisticType(statType);
    } else {
      setInitialStatisticType(undefined);
    }
  };

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

  const handleWordLengthChange = (newLength: number) => {
    setWordLength(newLength);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, wordLength: newLength });
  };

  const handleLanguageSelectionChange = (selectedCodes: string[]) => {
    const allConfigs = allAvailableLanguages;
    const selectedSet = new Set(selectedCodes);
    const filtered = allConfigs.filter((lang) => selectedSet.has(lang.code));
    setAvailableLanguages(filtered.length > 0 ? filtered : allConfigs);

    const prefs = loadPreferences();
    prefs.selectedLanguages =
      selectedCodes.length === allConfigs.length ? undefined : selectedCodes;
    if (!filtered.find((l) => l.code === language) && filtered[0]) {
      setLanguage(filtered[0].code);
      prefs.language = filtered[0].code;
    }
    savePreferences(prefs);
  };

  return (
    <div className="app-container">
      {view === 'statistics' ? (
        <Statistics
          userId={LOCAL_USER.id}
          language={language}
          wordLength={wordLength}
          availableLanguages={availableLanguages}
          onViewChange={(v) => handleViewChange(v)}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          onViewHistoricalGame={(date) => {
            setHistoricalDate(date);
            setView('game');
          }}
          initialStatisticType={initialStatisticType}
        />
      ) : (
        <Game
          userId={LOCAL_USER.id}
          userEmail={LOCAL_USER.email}
          view={view}
          onViewChange={handleViewChange}
          historicalDate={historicalDate}
          onHistoricalDateCleared={() => setHistoricalDate(null)}
          onViewHistoricalGame={(date) => setHistoricalDate(date)}
          language={language}
          wordLength={wordLength}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          availableLanguages={availableLanguages}
          allAvailableLanguages={allAvailableLanguages}
          onLanguageSelectionChange={handleLanguageSelectionChange}
        />
      )}
    </div>
  );
};
