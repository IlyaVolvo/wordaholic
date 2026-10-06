import React, { useEffect, useMemo, useRef, useState } from 'react';
import { calendarMonthForSelection } from '../../../app/daily/variantVisit.js';
import { openHelp } from '@wordaholic/help';
import { reportStats } from '@wordaholic/stats';
import { setSessionActive } from '@wordaholic/updates';
import type { Lexicon } from './lexicon.ts';
import { fitCell, localCalendarDate, maxHeight, maxWidth, PARAMS } from './params.ts';
import { Calendar } from './Calendar.tsx';
import { drawField, pointerToCell } from './render.ts';
import {
  abort,
  confirmChoice,
  hardDrop,
  moveToColumn,
  offerPoints,
  pieceAt,
  selectChoice,
  selectPiece,
  selectTop,
  selectedPiece,
  setCellSize,
  setPaused,
  setSpeedPercent,
  start,
  tick,
  tryMove,
  type Sim,
} from './sim.ts';
import {
  freshSim,
  GAME_ID,
  listVariantScores,
  loadRun,
  playCount,
  loadScores,
  savePrefs,
  saveRun,
  saveScores,
  type ScoreRecord,
} from './storage.ts';

type Hud = {
  phase: Sim['phase'];
  paused: boolean;
  score: number;
  points: number;
  seconds: number;
  column: number | null;
  letter: string;
  aborted: boolean;
  choice: Sim['choice'];
  speedPct: number;
};

function readHud(sim: Sim): Hud {
  const piece = selectedPiece(sim);
  const heldLetter = sim.held ? sim.grid[sim.held.row]?.[sim.held.col] : null;
  return {
    phase: sim.phase,
    paused: sim.paused,
    score: sim.score,
    points: offerPoints(sim),
    seconds: Math.max(0, Math.ceil(sim.decideMsLeft / 100) / 10),
    column: piece ? piece.col + 1 : sim.held && heldLetter ? sim.held.col + 1 : null,
    letter: piece?.letter || heldLetter || '',
    aborted: sim.aborted,
    choice: sim.choice,
    speedPct: sim.speedPct,
  };
}

export const Game: React.FC<{ lex: Lexicon; language: string; initialW: number; initialH: number }> = ({
  lex,
  language,
  initialW,
  initialH,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const scoresRef = useRef<ScoreRecord | null>(null);
  const liveRef = useRef(false);
  const savedRev = useRef(-1);
  const [W, setW] = useState(initialW);
  const [H, setH] = useState(initialH);
  const [date, setDate] = useState(localCalendarDate);
  const [hud, setHud] = useState<Hud | null>(null);
  const [scores, setScores] = useState<ScoreRecord | null>(null);
  const [limits, setLimits] = useState({ maxW: 30, maxH: 40 });
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => calendarMonthForSelection(localCalendarDate()));
  const [showStats, setShowStats] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [history, setHistory] = useState<ScoreRecord[]>([]);

  useEffect(() => {
    let cancel = false;
    simRef.current = null;
    setHud(null);
    void (async () => {
      const [saved, record] = await Promise.all([
        loadRun(language, W, H, date, lex),
        loadScores(language, W, H, date),
      ]);
      if (cancel) return;
      const sim =
        saved ||
        freshSim({
          W,
          H,
          language,
          date,
          lex,
          A: PARAMS.Amin,
        });
      const slot = slotRef.current;
      if (slot && slot.clientWidth > 8 && slot.clientHeight > 8) {
        setCellSize(sim, fitCell(slot.clientWidth, slot.clientHeight, sim.W, sim.H));
      }
      simRef.current = sim;
      liveRef.current = sim.phase !== 'ready' && sim.phase !== 'over';
      savedRev.current = sim.phase === 'ready' ? -1 : sim.revision;
      scoresRef.current = record;
      setScores(record);
      setHud(readHud(sim));
      void savePrefs(W, H);
    })();
    return () => {
      cancel = true;
    };
  }, [W, H, date, language, lex]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const apply = () => {
      const sim = simRef.current;
      if (!sim || slot.clientWidth < 8 || slot.clientHeight < 8) return;
      setCellSize(sim, fitCell(slot.clientWidth, slot.clientHeight, sim.W, sim.H));
      setLimits({
        maxW: maxWidth(slot.clientWidth, slot.clientHeight, sim.H),
        maxH: maxHeight(slot.clientWidth, slot.clientHeight, sim.W),
      });
    };
    const observer = new ResizeObserver(apply);
    observer.observe(slot);
    apply();
    return () => observer.disconnect();
  }, [W, H]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastSig = '';
    const loop = (now: number) => {
      const sim = simRef.current;
      const canvas = canvasRef.current;
      if (sim && canvas) {
        tick(sim, now - last);
        last = now;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const slot = slotRef.current;
          if (slot && slot.clientWidth > 8 && slot.clientHeight > 8) {
            setCellSize(sim, fitCell(slot.clientWidth, slot.clientHeight, sim.W, sim.H));
          }
          const width = canvasFieldWidth(sim);
          const height = canvasFieldHeight(sim);
          const bw = Math.max(1, Math.round(width * dpr));
          const bh = Math.max(1, Math.round(height * dpr));
          if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
          }
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawField(ctx, sim, now);
        }
        const next = readHud(sim);
        const sig = `${next.phase}|${next.paused}|${next.score}|${next.points}|${next.seconds}|${next.column}|${next.letter}|${next.aborted}|${next.choice}|${next.speedPct}`;
        if (sig !== lastSig) {
          lastSig = sig;
          setHud(next);
        }
        if (sim.phase !== 'ready' && sim.revision !== savedRev.current) {
          savedRev.current = sim.revision;
          void saveRun(sim);
        }
        if (sim.phase === 'over' && liveRef.current) {
          liveRef.current = false;
          const finished = sim;
          void loadScores(finished.language, finished.W, finished.H, finished.date).then(async (existing) => {
            const record = await saveScores(finished, existing);
            scoresRef.current = record;
            setScores(record);
            reportStats({ games: { [GAME_ID]: { [`${finished.language},${finished.W},${finished.H}`]: 1 } } });
          });
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setSessionActive(GAME_ID, Boolean(hud && hud.phase !== 'ready' && hud.phase !== 'over'));
    return () => setSessionActive(GAME_ID, false);
  }, [hud]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const sim = simRef.current;
      if (!sim) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (sim.phase === 'decide' && !sim.paused) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          selectChoice(sim, 'use');
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          selectChoice(sim, 'skip');
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          confirmChoice(sim, true);
          return;
        }
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        tryMove(sim, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        tryMove(sim, 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (sim.phase !== 'ready') hardDrop(sim);
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        setPaused(sim, !sim.paused);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const speedLabel = 'Falling speed increase';
    const allowSpeedEdit = (target: EventTarget | null) => {
      const sim = simRef.current;
      return Boolean(
        sim?.paused &&
        target instanceof HTMLInputElement &&
        target.getAttribute('aria-label') === speedLabel,
      );
    };
    const hideKeyboard = () => {
      const vk = (navigator as Navigator & { virtualKeyboard?: { hide: () => void } }).virtualKeyboard;
      vk?.hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (allowSpeedEdit(event.target)) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      target.blur();
      hideKeyboard();
    };
    const onTouchStart = (event: TouchEvent) => {
      if (allowSpeedEdit(event.target)) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      event.preventDefault();
      target.blur();
    };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('touchstart', onTouchStart, true);
    };
  }, []);

  const locked = hud?.phase === 'fall' || hud?.phase === 'decide' || hud?.phase === 'settle';
  const showBest = playedAgain(scores, hud?.phase);
  const dayResults = useMemo(() => {
    const map = new Map<string, { plays: number; best: number }>();
    for (const row of history) {
      const plays = playCount(row);
      const best = row.best_score ?? row.first_score;
      if (plays > 0 && best != null) map.set(row.game_date, { plays, best: Number(best) });
    }
    return map;
  }, [history]);

  useEffect(() => {
    if (!showCalendar && !showStats) return;
    let cancel = false;
    void listVariantScores(language, W, H).then((rows) => {
      if (!cancel) setHistory(rows);
    });
    return () => {
      cancel = true;
    };
  }, [showCalendar, showStats, language, W, H, scores]);

  function nudge(dir: -1 | 1) {
    const sim = simRef.current;
    if (sim) tryMove(sim, dir);
  }

  function dropOrStart() {
    const sim = simRef.current;
    if (!sim || sim.paused) return;
    if (sim.phase === 'decide') confirmChoice(sim, true);
    else if (sim.phase !== 'ready') hardDrop(sim);
  }

  function pickDate(next: string) {
    if (!next || next > localCalendarDate()) return;
    const sim = simRef.current;
    if (sim && sim.date !== next && sim.phase !== 'ready') void saveRun(sim);
    setDate(next);
    setShowCalendar(false);
  }

  function begin(sim: Sim) {
    start(sim);
    liveRef.current = true;
    setHud(readHud(sim));
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || sim.paused) return;
    const hit = pointerToCell(sim, canvas, event.clientX, event.clientY);
    const piece = pieceAt(sim, hit.col, hit.yFromFloor);
    const grabbed = piece ? (selectPiece(sim, piece.id), true) : selectTop(sim, hit.row, hit.col);
    if (grabbed) {
      canvas.setPointerCapture(event.pointerId);
      canvas.dataset.drag = '1';
    }
  }

  function onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || sim.paused || sim.phase !== 'fall') return;
    const hit = pointerToCell(sim, canvas, event.clientX, event.clientY);
    const piece = pieceAt(sim, hit.col, hit.yFromFloor);
    if (piece) selectPiece(sim, piece.id);
    else if (!(sim.held && sim.held.row === hit.row && sim.held.col === hit.col) && !selectTop(sim, hit.row, hit.col)) return;
    hardDrop(sim);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || canvas.dataset.drag !== '1') return;
    const hit = pointerToCell(sim, canvas, event.clientX, event.clientY);
    moveToColumn(sim, hit.col);
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || canvas.dataset.drag !== '1') return;
    canvas.dataset.drag = '';
  }

  const widths = sizeOptions(PARAMS.Wmin, limits.maxW, W);
  const heights = sizeOptions(PARAMS.Hmin, limits.maxH, H);
  const canMove = hud?.phase === 'fall' && !hud.paused;
  const canDrop = !hud?.paused && (hud?.phase === 'decide' || (hud?.phase === 'fall' && Boolean(hud.letter)));

  return (
    <div className="letterix" data-phase={hud?.phase || 'ready'}>
      <header className="header-section">
        <div className="game-header-bar">
          <div className="header-cluster">
            <Tip label="Wordaholic home">
              <a href="/" className="header-brand-home" aria-label="Wordaholic home">
                <img className="header-brand-home-svg" src="/brand/wordaholic-mark.svg" width={34} height={34} alt="" />
              </a>
            </Tip>
            <Tip label="Letterix">
              <span className="header-game-name">Letterix</span>
            </Tip>
            <Tip label="Manual">
              <button type="button" className="help-trigger help-trigger--game" aria-label="Manual" onClick={() => openHelp('letterix')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </button>
            </Tip>
          </div>
          <Tip label="Current score" className="letterix-score-tip">
            <div className="letterix-score">
              <strong data-score>{hud?.score ?? 0}</strong>
            </div>
          </Tip>
          <div className="header-right">
            {showBest && (
              <Tip label="Best score">
                <strong className="best-score" data-best>{scores?.best_score ?? 0}</strong>
              </Tip>
            )}
            <Tip label="Statistics">
              <button type="button" className="header-icon-button" aria-label="Statistics" onClick={() => setShowStats(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </button>
            </Tip>
          </div>
        </div>
      </header>
      <div className="stage" ref={slotRef}>
        <div className={hud?.paused ? 'field is-paused' : 'field'}>
          <canvas
            ref={canvasRef}
            data-falling={hud?.letter || ''}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          />
        </div>
        {(!hud || hud.phase === 'ready') && (
          <button type="button" className="letterix-start" onClick={() => { const sim = simRef.current; if (sim) begin(sim); }}>
            Start
          </button>
        )}
      </div>
      <div className="settings">
        <div className="toolbar-picks">
          <Tip label="Language">
            <div className="language-dropdown">
              <button
                type="button"
                className="language-dropdown-trigger"
                aria-label="Language: English"
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                disabled={locked}
                onClick={() => setLangOpen((open) => !open)}
              >
                <span className="language-dropdown-flag" aria-hidden="true">🇺🇸</span>
                <span className="language-dropdown-chevron" aria-hidden="true">{langOpen ? '▲' : '▼'}</span>
              </button>
              {langOpen && !locked && (
                <ul className="language-dropdown-list" role="listbox" aria-label="Select language">
                  <li className="language-dropdown-option selected" role="option" aria-selected="true" onClick={() => setLangOpen(false)}>
                    <span className="language-dropdown-flag" aria-hidden="true">🇺🇸</span>
                    <span>English</span>
                  </li>
                </ul>
              )}
            </div>
          </Tip>
          <Tip label="Width">
            <select aria-label="Width" value={W} disabled={locked} onChange={(event) => setSize('W', Number(event.target.value))}>
              {widths.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Tip>
          <Tip label="Height">
            <select aria-label="Height" value={H} disabled={locked} onChange={(event) => setSize('H', Number(event.target.value))}>
              {heights.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Tip>
        </div>
        <div className="toolbar-mode">
          <Tip label="Calendar">
            <button
              type="button"
              className="date-picker-btn"
              aria-label="Choose daily date"
              onClick={() => {
                setCalendarMonth(calendarMonthForSelection(date));
                setShowCalendar(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5" />
                <line x1="13" y1="4" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="date-display">{formatDateDisplay(date)}</span>
            </button>
          </Tip>
        </div>
      </div>
      <div className="letterix-keys">
        <div className="keys-speed">
          <Tip label="Falling speed increase. 100% is twice as fast, and word scores rise by the same amount. Change it while paused.">
            <label>
              <input
                type="text"
                inputMode={hud?.paused ? 'numeric' : 'none'}
                enterKeyHint="done"
                autoComplete="off"
                readOnly={!hud?.paused}
                tabIndex={hud?.paused ? 0 : -1}
                aria-label="Falling speed increase"
                value={hud?.speedPct ?? 0}
                disabled={!hud?.paused}
                onFocus={(event) => {
                  if (!simRef.current?.paused) event.currentTarget.blur();
                }}
                onChange={(event) => {
                  const sim = simRef.current;
                  if (!sim) return;
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setSpeedPercent(sim, next);
                  setHud(readHud(sim));
                }}
              />
              <span>%</span>
            </label>
          </Tip>
        </div>
        <div className="keys-center">
        <Tip label="Move left">
          <button type="button" aria-label="Move left" disabled={!canMove} onClick={() => nudge(-1)}>←</button>
        </Tip>
        <Tip label={hud?.phase === 'decide' ? 'Confirm the flashing choice' : 'Drop'}>
          <button type="button" className="space" data-action="drop" aria-label="Drop" disabled={!canDrop} onClick={dropOrStart}>
            Space
          </button>
        </Tip>
        <Tip label="Move right">
          <button type="button" aria-label="Move right" disabled={!canMove} onClick={() => nudge(1)}>→</button>
        </Tip>
        {hud?.phase === 'decide' && (
          <>
            <Tip label="Remove the word and take the points">
              <button
                type="button"
                data-action="use"
                className={hud.choice === 'use' ? 'is-selected' : ''}
                disabled={hud.paused}
                onClick={() => { const sim = simRef.current; if (sim) selectChoice(sim, 'use'); }}
              >
                Use
              </button>
            </Tip>
            <Tip label="Leave the word and keep playing">
              <button
                type="button"
                data-action="skip"
                className={hud.choice === 'skip' ? 'is-selected' : ''}
                disabled={hud.paused}
                onClick={() => { const sim = simRef.current; if (sim) selectChoice(sim, 'skip'); }}
              >
                Skip
              </button>
            </Tip>
          </>
        )}
        {hud?.phase === 'over' && (
          <Tip label="Play again">
            <button type="button" data-action="replay" onClick={() => replay()}>Replay</button>
          </Tip>
        )}
        </div>
        <div className="keys-corner">
          {hud?.paused && (
            <Tip label="Stop and keep the points already scored">
              <button type="button" className="text-btn" data-action="abort" onClick={() => { const sim = simRef.current; if (sim) abort(sim); }}>
                Abort
              </button>
            </Tip>
          )}
          <Tip label={hud?.paused ? 'Resume' : 'Pause'}>
            <button
              type="button"
              className="text-btn"
              data-action="pause"
              disabled={!hud || hud.phase === 'ready' || hud.phase === 'over'}
              onClick={() => { const sim = simRef.current; if (sim) setPaused(sim, !sim.paused); }}
            >
              {hud?.paused ? 'Resume' : 'Pause'}
            </button>
          </Tip>
        </div>
      </div>
      {showCalendar && (
        <div className="game-modal-overlay" onClick={() => setShowCalendar(false)} role="presentation">
          <div className="game-modal-card calendar-modal-card" role="dialog" aria-modal="true" aria-label="Daily games" onClick={(event) => event.stopPropagation()}>
            <div className="game-modal-header">
              <h2>Daily games</h2>
              <div className="game-modal-header-actions">
                <button type="button" className="calendar-today-button" onClick={() => pickDate(localCalendarDate())}>Today</button>
                <button type="button" className="game-modal-close" aria-label="Close calendar" onClick={() => setShowCalendar(false)}>×</button>
              </div>
            </div>
            <Calendar results={dayResults} selected={date} month={calendarMonth} onMonthChange={setCalendarMonth} onDateClick={pickDate} />
          </div>
        </div>
      )}
      {showStats && (
        <div className="game-modal-overlay" onClick={() => setShowStats(false)} role="presentation">
          <div className="game-modal-card" role="dialog" aria-modal="true" aria-label="Statistics" onClick={(event) => event.stopPropagation()}>
            <div className="game-modal-header">
              <h2>Statistics</h2>
              <button type="button" className="game-modal-close" aria-label="Close statistics" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="stats-summary">
              <span>First <strong data-first>{scores?.first_score ?? '—'}</strong></span>
              <span>Best <strong>{scores?.best_score ?? '—'}</strong></span>
            </div>
            <ul className="stats-list">
              {history.map((row) => (
                <li key={row.id}>
                  <span>{row.game_date}</span>
                  <span>{row.best_score ?? '—'}</span>
                </li>
              ))}
              {history.length === 0 && <li><span>No finished games for this size.</span></li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );

  function setSize(axis: 'W' | 'H', value: number) {
    if (!Number.isFinite(value)) return;
    const slot = slotRef.current;
    const availW = slot?.clientWidth || 800;
    const availH = slot?.clientHeight || 700;
    if (axis === 'W') {
      const cap = maxWidth(availW, availH, H);
      setW(Math.max(PARAMS.Wmin, Math.min(cap, Math.round(value))));
    } else {
      const cap = maxHeight(availW, availH, W);
      setH(Math.max(PARAMS.Hmin, Math.min(cap, Math.round(value))));
    }
  }

  function replay() {
    const sim = freshSim({
      W,
      H,
      language,
      date,
      lex,
      A: simRef.current?.A || PARAMS.Amin,
    });
    simRef.current = sim;
    liveRef.current = true;
    savedRev.current = -1;
    start(sim);
    setHud(readHud(sim));
  }
};

function Tip({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={className ? `tip ${className}` : 'tip'}>
      {children}
      <span className="tip-label" role="tooltip">{label}</span>
    </span>
  );
}

function playedAgain(scores: ScoreRecord | null, phase: Hud['phase'] | undefined): boolean {
  if (scores?.first_score == null) return false;
  if (scores.updated_at && scores.completed_at && scores.updated_at !== scores.completed_at) return true;
  return phase != null && phase !== 'ready' && phase !== 'over';
}

function sizeOptions(min: number, max: number, current: number): number[] {
  const lo = Math.min(min, current);
  const hi = Math.max(min, max, current);
  const values: number[] = [];
  for (let n = lo; n <= hi; n++) values.push(n);
  return values;
}

function formatDateDisplay(selectedDate: string): string {
  const today = localCalendarDate();
  if (!selectedDate || selectedDate === today) return 'today';
  const [yearStr, monthStr, dayStr] = selectedDate.split('-');
  const selected = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  const [ty, tm, td] = today.split('-');
  const todayDate = new Date(Number(ty), Number(tm) - 1, Number(td));
  const diffDays = Math.round((todayDate.getTime() - selected.getTime()) / 86400000);
  if (diffDays === 1) return 'yesterday';
  const startOfWeek = new Date(todayDate);
  startOfWeek.setDate(todayDate.getDate() - todayDate.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  if (selected >= startOfWeek && selected <= endOfWeek) return selected.toLocaleDateString('en-US', { weekday: 'long' });
  const month = selected.toLocaleDateString('en-US', { month: 'short' });
  const day = selected.getDate();
  if (selected.getFullYear() === todayDate.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${selected.getFullYear()}`;
}

function canvasFieldWidth(sim: Sim): number {
  return sim.W * sim.A + Math.max(4, Math.round(sim.A * 0.16)) * 2;
}

function canvasFieldHeight(sim: Sim): number {
  return (sim.H + sim.E) * sim.A + Math.max(4, Math.round(sim.A * 0.16));
}

function offerCell(sim: Sim, row: number, col: number): boolean {
  return sim.offer.some((match) => match.cells.some((cell) => cell.r === row && cell.c === col));
}
