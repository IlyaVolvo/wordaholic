import React, { useEffect, useMemo, useState } from 'react';
import type { LanguageConfig } from '../types';
import { LanguageDropdown } from './LanguageDropdown';
import { listStoredGames, isHydraComplete, isHydraWon, type StoredHydra } from '../storage/platform';

const EXTRA_LOSS = 6;
const EXTRA_SCORES = [0, 1, 2, 3, 4, 5, 6] as const;

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

type ExtraCounts = Record<number, number>;

type SizeRow = {
  wordLength: number;
  counts: ExtraCounts;
  total: number;
};

type BoardGroup = {
  boardCount: number;
  sizes: SizeRow[];
};

function usedGuesses(game: StoredHydra): number {
  return Math.max(0, ...game.board_guesses.map((g) => g.length));
}

/** Extra guesses beyond board count: 0…5 win, 6 loss. Wins in fewer than N map to 0. */
function extraScore(game: StoredHydra): number {
  if (!isHydraWon(game)) return EXTRA_LOSS;
  return Math.min(5, Math.max(0, usedGuesses(game) - game.board_count));
}

function emptyCounts(): ExtraCounts {
  return Object.fromEntries(EXTRA_SCORES.map((s) => [s, 0]));
}

export const Statistics: React.FC<StatisticsProps> = ({
  language,
  availableLanguages,
  onViewChange,
  onLanguageChange,
}) => {
  const [games, setGames] = useState<StoredHydra[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const all = await listStoredGames();
      setGames(all.filter((g) => g.language === language && isHydraComplete(g)));
      setLoading(false);
    };
    void load();
  }, [language]);

  const groups = useMemo(() => {
    const byKey = new Map<string, ExtraCounts>();
    for (const game of games) {
      const key = `${game.board_count}|${game.word_length}`;
      const counts = byKey.get(key) || emptyCounts();
      const score = extraScore(game);
      counts[score] = (counts[score] || 0) + 1;
      byKey.set(key, counts);
    }
    const byBoard = new Map<number, SizeRow[]>();
    for (const [key, counts] of byKey) {
      const [boardCount, wordLength] = key.split('|').map(Number);
      const total = EXTRA_SCORES.reduce((sum, s) => sum + (counts[s] || 0), 0);
      if (total <= 0) continue;
      const rows = byBoard.get(boardCount) || [];
      rows.push({ wordLength, counts, total });
      byBoard.set(boardCount, rows);
    }
    const result: BoardGroup[] = [...byBoard.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([boardCount, sizes]) => ({
        boardCount,
        sizes: sizes.sort((a, b) => a.wordLength - b.wordLength),
      }));
    return result;
  }, [games]);

  const wins = games.filter((g) => isHydraWon(g)).length;
  const played = games.length;

  return (
    <div className="game-container hydra-stats">
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
      <div className="hydra-stats-body">
        <h2>Statistics</h2>
        <div className="toolbar-picks hydra-stats-filters">
          <LanguageDropdown
            availableLanguages={availableLanguages}
            value={language}
            onChange={onLanguageChange}
            showNameInTrigger
          />
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <p className="hydra-stats-summary">
              Played: {played} · Wins: {wins} · Win rate: {played ? Math.round((wins / played) * 100) : 0}%
            </p>
            <p className="hydra-stats-legend-caption">
              Extra guesses beyond board count: +0 is a win in N guesses or fewer; +6 is a loss.
            </p>
            <div className="hydra-stats-legend" aria-label="Extra-guess colors">
              {EXTRA_SCORES.map((score) => (
                <span key={score} className={`hydra-stats-swatch extra-${score}`}>
                  +{score}
                </span>
              ))}
            </div>
            {groups.length === 0 ? (
              <p>No finished games for this language yet.</p>
            ) : (
              groups.map((group) => (
                <section key={group.boardCount} className="hydra-stats-group">
                  <h3>{group.boardCount} boards</h3>
                  {group.sizes.map((row) => (
                    <div key={row.wordLength} className="hydra-stats-row">
                      <div className="hydra-stats-row-label">{row.wordLength} letters</div>
                      <div
                        className="hydra-stats-bar"
                        role="img"
                        aria-label={EXTRA_SCORES.filter((s) => row.counts[s] > 0)
                          .map((s) => `+${s}: ${row.counts[s]} (${Math.round((row.counts[s] / row.total) * 100)}%)`)
                          .join(', ')}
                      >
                        {EXTRA_SCORES.map((score) => {
                          const count = row.counts[score] || 0;
                          if (count <= 0) return null;
                          const pct = (count / row.total) * 100;
                          return (
                            <div
                              key={score}
                              className={`hydra-stats-seg extra-${score}`}
                              style={{ flexGrow: count, flexBasis: 0 }}
                              title={`+${score}: ${count} (${pct.toFixed(1)}%)`}
                            >
                              {count}
                            </div>
                          );
                        })}
                      </div>
                      <div className="hydra-stats-total">{row.total}</div>
                    </div>
                  ))}
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
