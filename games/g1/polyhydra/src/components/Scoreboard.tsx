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
const TOP_FONT_MIN = 7;
const READABLE_MIN = 9;
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

function contentRatio(root: HTMLElement): number {
  let worst = 1;
  root.querySelectorAll<HTMLElement>('.hydra-scoreboard-cell').forEach((cell) => {
    const top = cell.querySelector<HTMLElement>('.hydra-scoreboard-top');
    if (!top) return;
    const id = top.querySelector<HTMLElement>('.hydra-scoreboard-id');
    const right = top.querySelector<HTMLElement>('.hydra-scoreboard-nm, .hydra-scoreboard-attempt');
    const gap = right ? parseFloat(getComputedStyle(top).columnGap) || 0 : 0;
    const need = (id?.getBoundingClientRect().width || 0) + (right?.scrollWidth || 0) + gap;
    const avail = top.clientWidth;
    if (avail > 1 && need > 0) worst = Math.min(worst, (avail - 1) / need);
  });
  return worst;
}

function fittedTopSize(root: HTMLElement): number {
  let px = TOP_FONT_MAX;
  root.style.setProperty('--hydra-top-size', `${px}px`);
  for (let step = 0; step < 6; step++) {
    const worst = contentRatio(root);
    if (worst >= 0.99) return px;
    const next = Math.max(TOP_FONT_MIN, Math.round(px * worst * 10) / 10);
    if (next >= px - 0.05) return next;
    px = next;
    root.style.setProperty('--hydra-top-size', `${px}px`);
  }
  return px;
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
  const phone = usePhoneLayout();
  const [split, setSplit] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const visible = new Set(inView);
  const labeled = !phone && revealed && cells.some((cell) => cell.answer);
  const openCell = phone && open != null ? cells[open] : undefined;
  const openWord = revealed && openCell?.answer ? openCell.answer.toUpperCase() : '';
  const selectedIndex = inView[0];
  const phoneCols = cells.length > 8 ? Math.ceil(cells.length / 2) : Math.max(1, cells.length);

  useEffect(() => {
    setOpen(null);
  }, [cells.length]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (phone) {
      let fitting = false;
      const fitPhone = () => {
        if (fitting) return;
        fitting = true;
        try {
          root.style.setProperty('--hydra-top-size', `${fittedTopSize(root)}px`);
        } finally {
          fitting = false;
        }
      };
      fitPhone();
      const ro = new ResizeObserver(fitPhone);
      ro.observe(root);
      return () => ro.disconnect();
    }
    let fitting = false;
    const fit = () => {
      if (fitting) return;
      fitting = true;
      try {
        const cols = Math.max(1, Math.ceil(cells.length / 2));
        root.style.setProperty('--hydra-cols', String(cols));
        if (split && cells.length > 2) {
          root.classList.remove('is-split');
          const oneRow = fittedTopSize(root);
          if (oneRow >= READABLE_MIN) {
            root.style.setProperty('--hydra-top-size', `${oneRow}px`);
            setSplit(false);
            return;
          }
          root.classList.add('is-split');
          root.style.setProperty('--hydra-top-size', `${fittedTopSize(root)}px`);
          return;
        }
        const oneRow = fittedTopSize(root);
        if (oneRow < READABLE_MIN && cells.length > 2) {
          setSplit(true);
          return;
        }
        root.style.setProperty('--hydra-top-size', `${oneRow}px`);
      } finally {
        fitting = false;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, [cells, revealed, phone, split]);

  return (
    <div className={`hydra-scoreboard-block${phone ? ' is-phone' : ''}`}>
      {phone ? (
        showSummarySwitch ? (
          <button
            type="button"
            className="hydra-board-mode hydra-board-mode--up hydra-phone-summary"
            aria-label="Show summary"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onShowSummary}
          >
            ↑
          </button>
        ) : (
          <span className="hydra-board-mode hydra-board-mode--spacer hydra-phone-summary" aria-hidden="true" />
        )
      ) : null}
      <div
        ref={rootRef}
        className={`hydra-scoreboard${phone ? ' is-phone' : ''}${!phone && split ? ' is-split' : ''}${revealed ? ' revealed' : ''}${labeled ? ' is-labeled' : ''}`}
        style={
          {
            ['--hydra-n' as string]: cells.length,
            ['--hydra-phone-cols' as string]: phoneCols,
            ['--hydra-cols' as string]: Math.max(1, Math.ceil(cells.length / 2)),
          } as React.CSSProperties
        }
        aria-label="Board progress"
      >
        {cells.map((cell, i) => {
          const detail = phone && open === i;
          const showWord = !phone && revealed && Boolean(cell.answer);
          const showCheck = cell.solved && !showWord;
          const attempt =
            phone || showCheck || !cell.solved || cell.solvedAt == null ? null : cell.solvedAt;
          const tracked = phone && selectedIndex === i;
          const showNm = !phone && !showWord && !showCheck;
          const nm = showNm ? `${cell.greens}/${cell.yellows}` : '';
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
                detail && revealed && cell.answer ? `, ${cell.answer}` : ''
              }${showWord ? `, ${cell.answer}${attempt != null ? `, guess ${attempt}` : ''}` : ''}`}
              aria-expanded={phone ? detail : undefined}
              onClick={() => onSelect(i)}
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
      {!phone && openWord ? <div className="hydra-scoreboard-word">{openWord}</div> : null}
    </div>
  );
};
