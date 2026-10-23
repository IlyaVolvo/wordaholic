import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';

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
  showSummarySwitch?: boolean;
  onShowSummary?: () => void;
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
const PHONE_QUERY = '(max-width: 720px)';

function usePhoneLayout() {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  );
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return phone;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  cells,
  onSelect,
  inView = [],
  revealed = false,
  showSummarySwitch = false,
  onShowSummary,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const phone = usePhoneLayout();
  const [open, setOpen] = useState<number | null>(null);
  const [countLeft, setCountLeft] = useState(0);
  const [arrowEnd, setArrowEnd] = useState(false);
  const visible = new Set(inView);
  const labeled = !phone && cells.some((cell) => (cell.solved || revealed) && cell.answer);
  const openCell = phone && open != null ? cells[open] : undefined;
  const openWord = openCell?.solved && openCell.answer ? openCell.answer.toUpperCase() : '';
  const selectedIndex = inView[0];
  const selectedCell = selectedIndex != null ? cells[selectedIndex] : undefined;

  useEffect(() => {
    setOpen(null);
  }, [cells.length]);

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
    if (phone) return;
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, [cells, revealed, phone]);

  useLayoutEffect(() => {
    if (!phone) return;
    const bar = barRef.current;
    const count = countRef.current;
    const root = rootRef.current;
    const index = inView[0];
    if (!bar || !count || !root || index == null) return;
    const cell = root.querySelectorAll<HTMLElement>('.hydra-scoreboard-cell')[index];
    if (!cell) return;
    const barBox = bar.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const countW = count.offsetWidth;
    const arrowW = showSummarySwitch ? 28 : 0;
    const gap = 6;
    let left = cellBox.left + cellBox.width / 2 - barBox.left - countW / 2;
    left = Math.max(2, Math.min(left, barBox.width - countW - 2));
    const overlapsLeft = arrowW > 0 && left < arrowW + gap;
    const overlapsRight = arrowW > 0 && left + countW > barBox.width - arrowW - gap;
    const end =
      overlapsLeft && !overlapsRight
        ? true
        : overlapsLeft && overlapsRight
          ? cellBox.left + cellBox.width / 2 < barBox.left + barBox.width / 2
          : false;
    const nextLeft = Math.round(left);
    setCountLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setArrowEnd((prev) => (prev === end ? prev : end));
  }, [phone, inView, cells, showSummarySwitch]);

  return (
    <div className="hydra-scoreboard-block">
      <div
        ref={rootRef}
        className={`hydra-scoreboard${phone ? ' is-phone' : ''}${revealed ? ' revealed' : ''}${labeled ? ' is-labeled' : ''}`}
        style={{ ['--hydra-n' as string]: cells.length }}
        aria-label="Board progress"
      >
        {cells.map((cell, i) => {
          const detail = phone && open === i;
          const showWord = !phone && Boolean((cell.solved || revealed) && cell.answer);
          const attempt =
            phone || !cell.solved || cell.solvedAt == null ? null : cell.solvedAt;
          const showCheck = phone && cell.solved;
          const tracked = phone && selectedIndex === i;
          const showNm = phone ? false : !showWord;
          const nm = showNm ? `${cell.greens}/${cell.yellows}` : '';
          const locked = !phone && cell.solved && !revealed;
          const style = {
            ...(cell.solved
              ? { background: phone ? '#14532d' : 'var(--correct)', color: '#fff' }
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
              }${revealed && !cell.solved ? ' missed' : ''}${showWord ? ' has-word' : ''}${
                detail ? ' is-open' : ''
              }`}
              style={style}
              aria-label={`Board ${i + 1}${
                showCheck ? ', solved' : ''
              }${showNm || tracked ? `, ${cell.greens} green, ${cell.yellows} yellow` : ''}${
                detail && cell.solved && cell.answer ? `, ${cell.answer}` : ''
              }${showWord ? `, ${cell.answer}${attempt != null ? `, guess ${attempt}` : ''}` : ''}${
                locked ? ', solved' : ''
              }`}
              aria-expanded={phone ? detail : undefined}
              disabled={locked}
              onClick={() => {
                if (phone) {
                  onSelect(i);
                  return;
                }
                if (locked) return;
                onSelect(i);
              }}
            >
              {showWord ? (
                <span className="hydra-scoreboard-answer">{cell.answer!.toUpperCase()}</span>
              ) : null}
              {showCheck ? (
                <span className="hydra-scoreboard-check" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : (
                <span className="hydra-scoreboard-top">
                  <span className="hydra-scoreboard-id">{i + 1}</span>
                  {showNm ? <span className="hydra-scoreboard-nm">{nm}</span> : null}
                  {attempt != null ? <span className="hydra-scoreboard-attempt">{attempt}</span> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {phone && selectedCell ? (
        <div className="hydra-phone-bar" ref={barRef}>
          {showSummarySwitch ? (
            <button
              type="button"
              className={`hydra-board-mode hydra-board-mode--up${arrowEnd ? ' is-end' : ''}`}
              aria-label="Show summary"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onShowSummary}
            >
              ↑
            </button>
          ) : null}
          <span className="hydra-phone-bar-count" ref={countRef} style={{ left: countLeft }}>
            {selectedCell.solved && selectedCell.answer ? (
              <span className="hydra-phone-bar-word">{selectedCell.answer.toUpperCase()}</span>
            ) : (
              <>
                <span className="hydra-scoreboard-pop-g">{selectedCell.greens}</span>
                <span aria-hidden="true">/</span>
                <span className="hydra-scoreboard-pop-y">{selectedCell.yellows}</span>
              </>
            )}
          </span>
        </div>
      ) : null}
      {!phone && openWord ? <div className="hydra-scoreboard-word">{openWord}</div> : null}
    </div>
  );
};
