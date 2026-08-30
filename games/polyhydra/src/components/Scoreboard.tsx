import React from 'react';
import { SCOREBOARD_YELLOW_CAP, scoreboardYellowFactor } from '@wordaholic/wordle-core';

export type ScoreboardCell = {
  solved: boolean;
  score: number;
  answer?: string;
};

interface ScoreboardProps {
  cells: ScoreboardCell[];
  onSelect: (index: number) => void;
  windowStart?: number;
  visibleCount?: number;
  revealed?: boolean;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  cells,
  onSelect,
  windowStart = 0,
  visibleCount = 1,
  revealed = false,
}) => {
  const pageEnd = windowStart + visibleCount;

  return (
    <div
      className={`hydra-scoreboard${revealed ? ' revealed' : ''}`}
      style={{ ['--hydra-n' as string]: cells.length }}
      aria-label="Board progress"
    >
      {cells.map((cell, i) => {
        const label = revealed && cell.answer ? cell.answer.toUpperCase() : String(i + 1);
        return (
          <button
            key={`n-${i}`}
            type="button"
            className={`hydra-scoreboard-num${i >= windowStart && i < pageEnd ? ' in-view' : ''}${
              revealed ? (cell.solved ? ' guessed' : ' missed') : ''
            }`}
            aria-label={`Board ${i + 1}${revealed && cell.answer ? `, ${cell.answer}` : ''}`}
            onClick={() => onSelect(i)}
          >
            {label}
          </button>
        );
      })}
      {cells.map((cell, i) => {
        const factor = scoreboardYellowFactor(cell.score, SCOREBOARD_YELLOW_CAP);
        const pct = Math.round(factor * 100);
        const style = cell.solved
          ? { background: 'var(--correct)', color: '#fff' }
          : revealed
            ? { background: '#c62828', color: '#fff' }
            : {
                background:
                  pct >= 99
                    ? 'var(--present)'
                    : `color-mix(in oklch, var(--present) ${pct}%, #ffffff)`,
                color: '#111',
              };
        return (
          <button
            key={`d-${i}`}
            type="button"
            className={`hydra-scoreboard-mark${cell.solved ? ' solved' : ''}${revealed && !cell.solved ? ' missed' : ''}${i >= windowStart && i < pageEnd ? ' in-view' : ''}`}
            style={style}
            aria-label={`Board ${i + 1} status${cell.solved ? ', solved' : revealed ? ', missed' : ''}`}
            onClick={() => onSelect(i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
};
