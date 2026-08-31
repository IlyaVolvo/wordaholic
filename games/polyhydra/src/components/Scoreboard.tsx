import React from 'react';

export type ScoreboardCell = {
  solved: boolean;
  greens: number;
  yellows: number;
  answer?: string;
  solvedAt?: number;
};

interface ScoreboardProps {
  cells: ScoreboardCell[];
  onSelect: (index: number) => void;
  inView?: number[];
  revealed?: boolean;
}

const INTENSITY_CAP = 5;

function mixKnowledgeStyle(greens: number, yellows: number): React.CSSProperties {
  const g = Math.min(INTENSITY_CAP, Math.max(0, greens)) / INTENSITY_CAP;
  const y = Math.min(INTENSITY_CAP, Math.max(0, yellows)) / INTENSITY_CAP;
  const sum = g + y;
  if (sum <= 0) {
    return { background: '#ffffff', color: '#111' };
  }
  const yellowShare = Math.round((y / sum) * 100);
  const intensity = Math.round(Math.min(1, sum) * 100);
  const background = `color-mix(in oklch, color-mix(in oklch, var(--present) ${yellowShare}%, var(--correct)) ${intensity}%, #ffffff)`;
  const darkText = intensity < 48 || yellowShare > 55;
  return { background, color: darkText ? '#111' : '#fff' };
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  cells,
  onSelect,
  inView = [],
  revealed = false,
}) => {
  const visible = new Set(inView);
  const labeled = cells.some((cell) => (cell.solved || revealed) && cell.answer);

  return (
    <div
      className={`hydra-scoreboard${revealed ? ' revealed' : ''}${labeled ? ' is-labeled' : ''}`}
      style={{ ['--hydra-n' as string]: cells.length }}
      aria-label="Board progress"
    >
      {cells.map((cell, i) => {
        const showWord = Boolean((cell.solved || revealed) && cell.answer);
        const attempt = cell.solved && cell.solvedAt != null ? cell.solvedAt : null;
        const showNm = !showWord;
        const nm = showNm ? `${cell.greens}/${cell.yellows}` : '';
        const rightChars = showNm ? nm.length : attempt != null ? String(attempt).length : 0;
        const fitChars = String(i + 1).length + (rightChars ? 1 + rightChars : 0);
        const style = {
          ...(cell.solved
            ? { background: 'var(--correct)', color: '#fff' }
            : revealed
              ? { background: '#c62828', color: '#fff' }
              : mixKnowledgeStyle(cell.greens, cell.yellows)),
          ['--hydra-fit-chars' as string]: fitChars,
          ...(showWord ? { ['--hydra-word-len' as string]: cell.answer!.length } : {}),
        } as React.CSSProperties;
        return (
          <button
            key={i}
            type="button"
            className={`hydra-scoreboard-cell${visible.has(i) ? ' in-view' : ''}${
              cell.solved ? ' guessed' : ''
            }${revealed && !cell.solved ? ' missed' : ''}${showWord ? ' has-word' : ''}`}
            style={style}
            aria-label={`Board ${i + 1}${
              showNm ? `, ${cell.greens} green, ${cell.yellows} yellow` : ''
            }${showWord ? `, ${cell.answer}${attempt != null ? `, guess ${attempt}` : ''}` : ''}`}
            onClick={() => onSelect(i)}
          >
            {showWord ? (
              <span className="hydra-scoreboard-answer">{cell.answer!.toUpperCase()}</span>
            ) : null}
            <span className="hydra-scoreboard-top">
              <span className="hydra-scoreboard-id">{i + 1}</span>
              {showNm ? <span className="hydra-scoreboard-nm">{nm}</span> : null}
              {attempt != null ? <span className="hydra-scoreboard-attempt">{attempt}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
};
