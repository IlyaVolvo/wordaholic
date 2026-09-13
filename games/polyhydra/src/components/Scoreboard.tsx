import React, { useLayoutEffect, useRef } from 'react';

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

const TOP_FONT_MAX = 12;
const TOP_FONT_MIN = 3.5;
const CELL_PAD_X = 2;

export const Scoreboard: React.FC<ScoreboardProps> = ({
  cells,
  onSelect,
  inView = [],
  revealed = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = new Set(inView);
  const labeled = cells.some((cell) => (cell.solved || revealed) && cell.answer);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let fitting = false;
    const fit = () => {
      if (fitting) return;
      fitting = true;
      try {
        const buttons = root.querySelectorAll<HTMLElement>('.hydra-scoreboard-cell');
        let px = TOP_FONT_MAX;
        for (let step = 0; step < 8; step++) {
          root.style.setProperty('--hydra-top-size', `${px}px`);
          let worst = 1;
          buttons.forEach((cell) => {
            const top = cell.querySelector<HTMLElement>('.hydra-scoreboard-top');
            if (!top) return;
            const id = top.querySelector<HTMLElement>('.hydra-scoreboard-id');
            const right = top.querySelector<HTMLElement>(
              '.hydra-scoreboard-nm, .hydra-scoreboard-attempt'
            );
            const gap = right ? 1 : 0;
            const need =
              (id?.getBoundingClientRect().width || 0) +
              (right?.getBoundingClientRect().width || 0) +
              gap;
            const avail = cell.clientWidth - CELL_PAD_X;
            if (avail > 0 && need > 0) worst = Math.min(worst, (avail - 0.5) / need);
          });
          if (worst >= 0.995) break;
          const next = Math.max(TOP_FONT_MIN, Math.round(px * worst * 10) / 10);
          if (next >= px) break;
          px = next;
        }
        root.style.setProperty('--hydra-top-size', `${px}px`);
      } finally {
        fitting = false;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, [cells, revealed]);

  return (
    <div
      ref={rootRef}
      className={`hydra-scoreboard${revealed ? ' revealed' : ''}${labeled ? ' is-labeled' : ''}`}
      style={{ ['--hydra-n' as string]: cells.length }}
      aria-label="Board progress"
    >
      {cells.map((cell, i) => {
        const showWord = Boolean((cell.solved || revealed) && cell.answer);
        const attempt = cell.solved && cell.solvedAt != null ? cell.solvedAt : null;
        const showNm = !showWord;
        const nm = showNm ? `${cell.greens}/${cell.yellows}` : '';
        const locked = cell.solved && !revealed;
        const style = {
          ...(cell.solved
            ? { background: 'var(--correct)', color: '#fff' }
            : revealed
              ? { background: '#c62828', color: '#fff' }
              : mixKnowledgeStyle(cell.greens, cell.yellows)),
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
            }${showWord ? `, ${cell.answer}${attempt != null ? `, guess ${attempt}` : ''}` : ''}${
              locked ? ', solved' : ''
            }`}
            disabled={locked}
            onClick={() => {
              if (locked) return;
              onSelect(i);
            }}
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
