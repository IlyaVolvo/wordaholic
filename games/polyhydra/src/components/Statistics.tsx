import React, { useEffect, useMemo, useState } from 'react';
import type { LanguageConfig } from '../types';
import { LanguageDropdown } from './LanguageDropdown';
import { listStoredGames, isHydraComplete, isHydraWon, type StoredHydra } from '../storage/platform';

const EXTRA_LOSS = 6;
const EXTRA_SCORES = [0, 1, 2, 3, 4, 5, 6] as const;
const RARE_SCORES = [0, 1, 2] as const;
const BAR_SCORES = [3, 4, 5, 6] as const;

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

function rareMention(counts: ExtraCounts): string | null {
  const parts = RARE_SCORES.filter((score) => (counts[score] || 0) > 0).map((score) => {
    const n = counts[score];
    return `+${score}: ${n} ${n === 1 ? 'time' : 'times'}`;
  });
  if (!parts.length) return null;
  return `Rare Achievements: ${parts.join(', ')}`;
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
              Extra guesses beyond board count: +3 to +5 are wins; +6 is a loss. Wins in N, N+1,
              or N+2 guesses are listed above the bar as Rare Achievements.
            </p>
            <div className="hydra-stats-legend" aria-label="Extra-guess colors">
              {BAR_SCORES.map((score) => (
                <span key={score} className={`hydra-stats-swatch extra-${score}`}>
                  +{score}
                </span>
              ))}
            </div>
            <div className="hydra-stats-example" aria-hidden="true">
              <div className="hydra-stats-example-caption">Example without Rare Achievements</div>
              <section className="hydra-stats-group">
                <h3>12 boards</h3>
                <div className="hydra-stats-row">
                  <div className="hydra-stats-row-main">
                    <div className="hydra-stats-row-label">5 letters</div>
                    <div className="hydra-stats-bar">
                      <div className="hydra-stats-seg extra-3" style={{ flexGrow: 5, flexBasis: 0 }}>
                        5
                      </div>
                      <div className="hydra-stats-seg extra-4" style={{ flexGrow: 8, flexBasis: 0 }}>
                        8
                      </div>
                      <div className="hydra-stats-seg extra-5" style={{ flexGrow: 4, flexBasis: 0 }}>
                        4
                      </div>
                      <div className="hydra-stats-seg extra-6" style={{ flexGrow: 3, flexBasis: 0 }}>
                        3
                      </div>
                    </div>
                    <div className="hydra-stats-total">20</div>
                  </div>
                </div>
              </section>
            </div>
            {groups.length === 0 ? (
              <p>No finished games for this language yet.</p>
            ) : (
              groups.map((group) => (
                <section key={group.boardCount} className="hydra-stats-group">
                  <h3>{group.boardCount} boards</h3>
                  {group.sizes.map((row) => {
                    const rare = rareMention(row.counts);
                    return (
                      <div key={row.wordLength} className="hydra-stats-row">
                        {rare ? <div className="hydra-stats-rare">{rare}</div> : null}
                        <div className="hydra-stats-row-main">
                          <div className="hydra-stats-row-label">{row.wordLength} letters</div>
                          <div
                            className="hydra-stats-bar"
                            role="img"
                            aria-label={[
                              rare,
                              ...BAR_SCORES.filter((s) => row.counts[s] > 0).map(
                                (s) =>
                                  `+${s}: ${row.counts[s]} (${Math.round((row.counts[s] / row.total) * 100)}%)`
                              ),
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          >
                            {BAR_SCORES.map((score) => {
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
                      </div>
                    );
                  })}
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
