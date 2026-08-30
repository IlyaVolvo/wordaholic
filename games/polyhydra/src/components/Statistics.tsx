import React, { useEffect, useMemo, useState } from 'react';
import type { LanguageConfig } from '../types';
import { LanguageDropdown } from './LanguageDropdown';
import { hydraMaxGuesses, listStoredGames, type StoredHydra } from '../storage/platform';
import { isHydraComplete, isHydraWon } from '../storage/platform';
import { BOARD_COUNT_MAX, BOARD_COUNT_MIN, clampBoardCount } from '@wordaholic/wordle-core';

interface StatisticsProps {
  language: string;
  wordLength: number;
  boardCount: number;
  availableLanguages: LanguageConfig[];
  onViewChange: (view: 'game' | 'statistics') => void;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (wordLength: number) => void;
  onBoardCountChange: (boardCount: number) => void;
}

export const Statistics: React.FC<StatisticsProps> = ({
  language,
  wordLength,
  boardCount,
  availableLanguages,
  onViewChange,
  onLanguageChange,
  onWordLengthChange,
  onBoardCountChange,
}) => {
  const [games, setGames] = useState<StoredHydra[]>([]);
  const [loading, setLoading] = useState(true);
  const max = hydraMaxGuesses(boardCount);
  const lossBucket = max + 1;
  const boardOptions = Array.from(
    { length: BOARD_COUNT_MAX - BOARD_COUNT_MIN + 1 },
    (_, i) => i + BOARD_COUNT_MIN
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const all = await listStoredGames();
      setGames(
        all.filter(
          (g) =>
            g.language === language &&
            g.word_length === wordLength &&
            g.board_count === boardCount &&
            isHydraComplete(g)
        )
      );
      setLoading(false);
    };
    void load();
  }, [language, wordLength, boardCount]);

  const distribution = useMemo(() => {
    const dist: Record<number, number> = {};
    for (let i = 1; i <= lossBucket; i++) dist[i] = 0;
    for (const game of games) {
      const used = Math.max(0, ...game.board_guesses.map((g) => g.length));
      const bucket = isHydraWon(game) ? used : lossBucket;
      dist[bucket] = (dist[bucket] || 0) + 1;
    }
    return dist;
  }, [games, lossBucket]);

  const wins = games.filter((g) => isHydraWon(g)).length;
  const played = games.length;
  const currentLang = availableLanguages.find((l) => l.code === language);

  return (
    <div className="game-container">
      <div className="header-section">
        <div className="game-header-bar">
          <div className="game-header-side game-header-left">
            <a href="/" className="header-brand-home" title="Wordaholic home" aria-label="Wordaholic home">
              <img className="header-brand-home-svg" src="/brand/wordaholic-mark.svg" width={34} height={34} alt="" />
            </a>
            <span className="header-game-name">PolyHydra</span>
          </div>
          <div className="game-header-side game-header-right">
            <button type="button" className="header-icon-button" onClick={() => onViewChange('game')} aria-label="Back to game">
              ×
            </button>
          </div>
        </div>
      </div>
      <div className="statistics-view" style={{ padding: '12px 16px', overflow: 'auto' }}>
        <h2>Statistics</h2>
        <div className="toolbar-picks" style={{ margin: '12px 0' }}>
          <LanguageDropdown
            availableLanguages={availableLanguages}
            value={language}
            onChange={onLanguageChange}
            showNameInTrigger
          />
          <select value={wordLength} onChange={(e) => onWordLengthChange(Number(e.target.value))} aria-label="Word length">
            {(currentLang?.supportedLengths || [wordLength]).map((len) => (
              <option key={len} value={len}>{len}</option>
            ))}
          </select>
          <select
            value={boardCount}
            onChange={(e) => onBoardCountChange(clampBoardCount(Number(e.target.value)))}
            aria-label="Boards"
          >
            {boardOptions.map((n) => (
              <option key={n} value={n}>{n} boards</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <p>Played: {played} · Wins: {wins} · Win rate: {played ? Math.round((wins / played) * 100) : 0}%</p>
            <p>Attempts (win 1–{max}, loss {lossBucket})</p>
            <ul>
              {Object.entries(distribution).map(([bucket, count]) => (
                <li key={bucket}>
                  {bucket === String(lossBucket) ? 'Loss' : bucket}: {count}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
