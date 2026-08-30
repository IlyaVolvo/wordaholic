import React from 'react';
import { SCOREBOARD_YELLOW_CAP, scoreboardYellowFactor } from '@wordaholic/wordle-core';

export type ScoreboardCell = {
  solved: boolean;
  score: number;
  answer?: string;
  solvedAt?: number;
};

interface ScoreboardProps {
  cells: ScoreboardCell[];
  onSelect: (index: number) => void;
  inView?: number[];
  revealed?: boolean;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  cells,
  onSelect,
  inView = [],
  revealed = false,
}) => {
  const visible = new Set(inView);

  return (
    <div
      className={`hydra-scoreboard${revealed ? ' revealed' : ''}`}
      style={{ ['--hydra-n' as string]: cells.length }}
      aria-label="Board progress"
    >
      {cells.map((cell, i) => {
        const showWord = Boolean((cell.solved || revealed) && cell.answer);
        const word = showWord ? cell.answer!.toUpperCase() : String(i + 1);
        const attempt = cell.solved && cell.solvedAt != null ? cell.solvedAt : null;
        return (
          <button
            key={`n-${i}`}
            type="button"
            className={`hydra-scoreboard-num${visible.has(i) ? ' in-view' : ''}${
              showWord ? (cell.solved ? ' guessed has-word' : ' missed has-word') : ''
            }`}
            aria-label={`Board ${i + 1}${
              showWord
                ? `, ${cell.answer}${attempt != null ? `, guess ${attempt}` : ''}`
                : ''
            }`}
            onClick={() => onSelect(i)}
          >
            {word}
            {attempt != null ? (
              <span className="hydra-scoreboard-attempt">{attempt}</span>
            ) : null}
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
            className={`hydra-scoreboard-mark${cell.solved ? ' solved' : ''}${revealed && !cell.solved ? ' missed' : ''}${visible.has(i) ? ' in-view' : ''}`}
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
