import React, { useEffect, useMemo, useRef, useState } from 'react';
import { calendarMonthForSelection } from '../../../../app/daily/variantVisit.js';
import { mountHeaderChrome } from '../../../../app/play/header-chrome.js';
import { openHelp } from '@wordaholic/help';
import helpTopic from '../help/topic.js';
import { reportStats } from '@wordaholic/stats';
import { setSessionActive } from '@wordaholic/updates';
import type { Lexicon } from './lexicon.ts';
import { fitCell, localCalendarDate, PARAMS } from './params.ts';
import { Calendar } from './Calendar.tsx';
import { drawField, pointerToCell } from './render.ts';
import {
  confirmChoice,
  dropBlocked,
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
  listLanguageScores,
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
  dropBlocked: boolean;
  choice: Sim['choice'];
  speedPct: number;
};

function notPlaying(sim: Pick<Sim, 'paused' | 'phase'>): boolean {
  return sim.paused || sim.phase === 'ready' || sim.phase === 'over';
}

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
    dropBlocked: dropBlocked(sim),
    choice: sim.choice,
    speedPct: sim.speedPct,
  };
}

export const Game: React.FC<{
  lex: Lexicon;
  language: string;
  languages: { code: string; name: string; flag: string }[];
  onLanguageChange: (code: string) => void;
  initialW: number;
  initialH: number;
}> = ({
  lex,
  language,
  languages,
  onLanguageChange,
  initialW,
  initialH,
}) => {
  const headerBarRef = useRef<HTMLDivElement>(null);
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => calendarMonthForSelection(localCalendarDate()));
  const [showStats, setShowStats] = useState(false);
  const [openMenu, setOpenMenu] = useState<'language' | 'width' | 'height' | null>(null);
  const [speedTipOff, setSpeedTipOff] = useState(false);
  const speedPrefRef = useRef(0);
  const [speedPref, setSpeedPref] = useState(0);
  const [history, setHistory] = useState<ScoreRecord[]>([]);
  const [statsLanguage, setStatsLanguage] = useState(language);
  const [statsRows, setStatsRows] = useState<ScoreRecord[]>([]);

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
      if (!saved) setSpeedPercent(sim, speedPrefRef.current);
      else if (sim.phase !== 'over') chooseSpeed(sim.speedPct);
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
        const sig = `${next.phase}|${next.paused}|${next.score}|${next.points}|${next.seconds}|${next.column}|${next.letter}|${next.dropBlocked}|${next.choice}|${next.speedPct}`;
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
    const bar = headerBarRef.current;
    return bar ? mountHeaderChrome(bar) : undefined;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const sim = simRef.current;
      if (!sim) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type === 'range') {
        if (notPlaying(sim) && event.key !== 'p' && event.key !== 'P') return;
      } else if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
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
    const allowSpeedEdit = (target: EventTarget | null) =>
      Boolean(simRef.current && notPlaying(simRef.current)) &&
      target instanceof HTMLInputElement &&
      target.getAttribute('aria-label') === speedLabel;
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
  const dayResults = useMemo(() => {
    const map = new Map<string, { score: number }>();
    for (const row of history) {
      const score = row.best_score ?? row.first_score;
      if (playCount(row) > 0 && score != null) map.set(row.game_date, { score: Number(score) });
    }
    return map;
  }, [history]);
  const statTable = useMemo(() => buildStatTable(statsRows, localCalendarDate()), [statsRows]);
  const statWidths = useMemo(() => axisValues(PARAMS.Wmin, PARAMS.Wmax), []);
  const statHeights = useMemo(() => axisValues(PARAMS.Hmin, PARAMS.Hmax), []);

  useEffect(() => {
    if (!showCalendar) return;
    let cancel = false;
    void listVariantScores(language, W, H).then((rows) => {
      if (!cancel) setHistory(rows);
    });
    return () => {
      cancel = true;
    };
  }, [showCalendar, language, W, H, scores]);

  useEffect(() => {
    if (!showStats) return;
    let cancel = false;
    void listLanguageScores(statsLanguage).then((rows) => {
      if (!cancel) setStatsRows(rows);
    });
    return () => {
      cancel = true;
    };
  }, [showStats, statsLanguage]);

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
    if (locked) return;
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

  const widths = sizeOptions(PARAMS.Wmin, PARAMS.Wmax, W);
  const heights = sizeOptions(PARAMS.Hmin, PARAMS.Hmax, H);
  const canMove = hud?.phase === 'fall' && !hud.paused;
  const canDrop = !hud?.paused && (hud?.phase === 'decide' || (hud?.phase === 'fall' && Boolean(hud.letter) && !hud.dropBlocked));
  const setup = !hud || notPlaying(hud);
  const speedShown = hud?.phase === 'over' ? speedPref : hud?.speedPct ?? speedPref;
  const isToday = !date || date === localCalendarDate();

  return (
    <div className="letterix" data-phase={hud?.phase || 'ready'}>
      <header className="header-section">
        <div className="game-header-bar" ref={headerBarRef} data-header-react="">
          <div className="header-cluster" data-header-fit>
            <Tip label="Wordaholic home">
              <a href="/" className="header-brand-home" aria-label="Wordaholic home">
                <img className="header-brand-home-svg" src="/brand/wordaholic-mark.svg" width={34} height={34} alt="" />
              </a>
            </Tip>
            <Tip label="Letterix">
              <span className="header-game-name" title="Letterix">
                <span data-header-name="full">Letterix</span>
                <span data-header-name="short">L..</span>
              </span>
            </Tip>
            <div className="header-icon-cluster" data-header-chrome="icons">
              <Tip label="Manual">
                <button type="button" className="help-trigger help-trigger--game" aria-label="Manual" onClick={() => openHelp(helpTopic)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </button>
              </Tip>
              <Tip label="Statistics">
                <button type="button" className="header-icon-button" aria-label="Statistics" onClick={() => { setStatsLanguage(language); setShowStats(true); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </button>
              </Tip>
            </div>
            <div className="header-more" data-header-chrome="more">
              <button type="button" className="header-icon-button" title="Game menu" aria-label="Game menu" aria-haspopup="menu" aria-expanded="false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2"></circle>
                  <circle cx="12" cy="12" r="2"></circle>
                  <circle cx="12" cy="19" r="2"></circle>
                </svg>
              </button>
              <ul className="header-more-menu hidden" role="menu" aria-label="Game menu">
                <li role="none">
                  <button type="button" role="menuitem" onClick={() => openHelp(helpTopic)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                    <span>Manual</span>
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" onClick={() => { setStatsLanguage(language); setShowStats(true); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <span>Statistics</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <Tip label="Current score" className="letterix-score-tip">
            <div className="letterix-score" data-header-fit>
              <span className="letterix-score-word">Score</span>
              <strong data-score>{hud?.score ?? 0}</strong>
            </div>
          </Tip>
          <div className="header-right" data-header-fit>
            <div className="settings header-def">
              <div className="header-def-inline">
                <div data-header-def="other" className="toolbar-picks">
                  <Tip label="Width">
                    <PickMenu
                      label="Width"
                      open={openMenu === 'width'}
                      disabled={locked}
                      onToggle={() => setOpenMenu((menu) => (menu === 'width' ? null : 'width'))}
                      trigger={<span>{W}</span>}
                      options={widths.map((n) => ({ value: String(n), selected: n === W, label: <span>{n}</span> }))}
                      onPick={(value) => setSize('W', Number(value))}
                    />
                  </Tip>
                  <Tip label="Height">
                    <PickMenu
                      label="Height"
                      open={openMenu === 'height'}
                      disabled={locked}
                      onToggle={() => setOpenMenu((menu) => (menu === 'height' ? null : 'height'))}
                      trigger={<span>{H}</span>}
                      options={heights.map((n) => ({ value: String(n), selected: n === H, label: <span>{n}</span> }))}
                      onPick={(value) => setSize('H', Number(value))}
                    />
                  </Tip>
                </div>
                <div data-header-def="more">
                  <button
                    type="button"
                    className="header-icon-button header-def-trigger"
                    data-header-def-trigger=""
                    title="Game settings"
                    aria-label="Game settings"
                    aria-haspopup="menu"
                    aria-expanded="false"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <line x1="4" y1="8" x2="20" y2="8" />
                      <line x1="4" y1="16" x2="20" y2="16" />
                      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
                      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
                    </svg>
                  </button>
                  <div className="header-def-menu" data-header-def-menu="">
                    <div data-header-def="date">
                      <span className="header-def-heading">Date</span>
                      <button
                        type="button"
                        className={`date-picker-btn${isToday ? ' is-today' : ''}`}
                        aria-label="Choose daily date"
                        disabled={locked}
                        onClick={() => {
                          if (locked) return;
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
                    </div>
                    <div data-header-def="language">
                      <span className="header-def-heading">Language</span>
                      <PickMenu
                        label={`Language: ${languages.find((lang) => lang.code === language)?.name || language}`}
                        open={openMenu === 'language'}
                        disabled={locked}
                        onToggle={() => setOpenMenu((menu) => (menu === 'language' ? null : 'language'))}
                        trigger={<span className="language-dropdown-flag" aria-hidden="true">{languages.find((lang) => lang.code === language)?.flag || '🇺🇸'}</span>}
                        options={languages.map((lang) => ({
                          value: lang.code,
                          selected: lang.code === language,
                          label: (
                            <>
                              <span className="language-dropdown-flag" aria-hidden="true">{lang.flag}</span>
                              <span>{lang.name}</span>
                            </>
                          ),
                        }))}
                        onPick={(code) => {
                          if (code === language) return;
                          const sim = simRef.current;
                          if (sim && sim.phase !== 'ready') void saveRun(sim);
                          onLanguageChange(code);
                        }}
                      />
                    </div>
                    <div data-header-def="other">
                      <span className="header-def-heading">Size</span>
                      <div className="toolbar-picks">
                        <PickMenu
                          label="Width"
                          open={openMenu === 'width'}
                          disabled={locked}
                          onToggle={() => setOpenMenu((menu) => (menu === 'width' ? null : 'width'))}
                          trigger={<span>{W}</span>}
                          options={widths.map((n) => ({ value: String(n), selected: n === W, label: <span>{n}</span> }))}
                          onPick={(value) => setSize('W', Number(value))}
                        />
                        <PickMenu
                          label="Height"
                          open={openMenu === 'height'}
                          disabled={locked}
                          onToggle={() => setOpenMenu((menu) => (menu === 'height' ? null : 'height'))}
                          trigger={<span>{H}</span>}
                          options={heights.map((n) => ({ value: String(n), selected: n === H, label: <span>{n}</span> }))}
                          onPick={(value) => setSize('H', Number(value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div data-header-def="language" className="toolbar-picks">
                  <Tip label="Language">
                    <PickMenu
                      label={`Language: ${languages.find((lang) => lang.code === language)?.name || language}`}
                      open={openMenu === 'language'}
                      disabled={locked}
                      onToggle={() => setOpenMenu((menu) => (menu === 'language' ? null : 'language'))}
                      trigger={<span className="language-dropdown-flag" aria-hidden="true">{languages.find((lang) => lang.code === language)?.flag || '🇺🇸'}</span>}
                      options={languages.map((lang) => ({
                        value: lang.code,
                        selected: lang.code === language,
                        label: (
                          <>
                            <span className="language-dropdown-flag" aria-hidden="true">{lang.flag}</span>
                            <span>{lang.name}</span>
                          </>
                        ),
                      }))}
                      onPick={(code) => {
                        if (code === language) return;
                        const sim = simRef.current;
                        if (sim && sim.phase !== 'ready') void saveRun(sim);
                        onLanguageChange(code);
                      }}
                    />
                  </Tip>
                </div>
                <div data-header-def="date" className="toolbar-mode">
                  <Tip label="Calendar">
                    <button
                      type="button"
                      className={`date-picker-btn${isToday ? ' is-today' : ''}`}
                      aria-label="Choose daily date"
                      disabled={locked}
                      onClick={() => {
                        if (locked) return;
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
            </div>
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
        {hud?.phase === 'over' && (
          <div className="letterix-end" role="status">
            <span>Game over</span>
            <strong>{hud.score}</strong>
          </div>
        )}
      </div>
      <div className={`letterix-keys${setup ? ' letterix-keys--setup' : ''}`}>
        <div
          className={`keys-speed${setup ? '' : ' keys-speed--off'}${!setup && speedShown > 0 ? ' keys-speed--readout' : ''}${speedTipOff ? ' keys-speed--tip-off' : ''}`}
          aria-hidden={!setup && speedShown === 0}
        >
          <Tip label="Falling speed increase. 100% is twice as fast, and word scores rise by the same amount.">
            <label>
              <input
                type="range"
                min={0}
                max={PARAMS.speedMax}
                step={PARAMS.speedStep}
                aria-label="Falling speed increase"
                aria-valuetext={`${speedShown}%`}
                value={speedShown}
                disabled={!setup || !hud}
                tabIndex={setup ? 0 : -1}
                onBlur={() => setSpeedTipOff(false)}
                onChange={(event) => {
                  const sim = simRef.current;
                  if (!sim) return;
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setSpeedTipOff(true);
                  chooseSpeed(Math.min(PARAMS.speedMax, Math.max(0, next)));
                  if (sim.phase === 'over') return;
                  setSpeedPercent(sim, next);
                  setHud(readHud(sim));
                }}
              />
              <span className="keys-speed-value">
                {!setup && <span className="keys-speed-word">Speedup: </span>}
                {speedShown}%
              </span>
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
        </div>
        <div className="keys-corner">
          <button
            type="button"
            className="text-btn"
            data-action="pause"
            disabled={!hud || hud.phase === 'ready' || hud.phase === 'over'}
            onClick={() => { const sim = simRef.current; if (sim) setPaused(sim, !sim.paused); }}
          >
            {hud?.paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
      {showCalendar && (
        <div className="game-modal-overlay" onClick={() => setShowCalendar(false)} role="presentation">
          <div className="game-modal-card calendar-modal-card" role="dialog" aria-modal="true" aria-label="Daily games" onClick={(event) => event.stopPropagation()}>
            <div className="game-modal-header">
              <div className="calendar-heading">
                <h2>Daily games</h2>
                <p className="calendar-config">
                  {languages.find((lang) => lang.code === language)?.flag || ''}{' '}
                  {languages.find((lang) => lang.code === language)?.name || language}
                  {' · '}
                  {W} × {H}
                </p>
              </div>
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
          <div className="game-modal-card stats-modal-card" role="dialog" aria-modal="true" aria-label="Statistics" onClick={(event) => event.stopPropagation()}>
            <div className="game-modal-header">
              <h2>Statistics</h2>
              <button type="button" className="game-modal-close" aria-label="Close statistics" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="stats-lang">
              <select
                aria-label="Statistics language"
                value={statsLanguage}
                onChange={(event) => setStatsLanguage(event.target.value)}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
                ))}
              </select>
            </div>
            <p className="stats-legend">Each cell, top to bottom: 2 weeks, 4 weeks, life</p>
            <div className="stats-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th rowSpan={2} scope="col">Height</th>
                  <th colSpan={statWidths.length} scope="colgroup">Width</th>
                </tr>
                <tr>
                  {statWidths.map((width) => (
                    <th key={width} scope="col">{width}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statHeights.map((height) => (
                  <tr key={height}>
                    <th scope="row">{height}</th>
                    {statWidths.map((width) => {
                      const cell = statTable.find((row) => row.W === width && row.H === height);
                      const values = [cell?.twoWeeks, cell?.fourWeeks, cell?.forever];
                      return (
                        <td key={width} aria-label={`Width ${width}, height ${height}`}>
                          <span className="stats-cell">
                            {values.map((value, index) => (
                              <span key={index}>{value ?? ''}</span>
                            ))}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function setSize(axis: 'W' | 'H', value: number) {
    if (!Number.isFinite(value)) return;
    if (axis === 'W') {
      setW(Math.max(PARAMS.Wmin, Math.min(PARAMS.Wmax, Math.round(value))));
    } else {
      setH(Math.max(PARAMS.Hmin, Math.min(PARAMS.Hmax, Math.round(value))));
    }
  }

  function chooseSpeed(pct: number) {
    speedPrefRef.current = pct;
    setSpeedPref(pct);
  }

};

function PickMenu({
  label,
  open,
  disabled,
  trigger,
  options,
  onToggle,
  onPick,
}: {
  label: string;
  open: boolean;
  disabled?: boolean;
  trigger: React.ReactNode;
  options: { value: string; selected: boolean; label: React.ReactNode }[];
  onToggle: () => void;
  onPick: (value: string) => void;
}) {
  return (
    <div className="language-dropdown">
      <button
        type="button"
        className="language-dropdown-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        {trigger}
        <span className="language-dropdown-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && !disabled && (
        <ul className="language-dropdown-list" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li
              key={option.value}
              className={`language-dropdown-option${option.selected ? ' selected' : ''}`}
              role="option"
              aria-selected={option.selected}
              onClick={() => {
                onToggle();
                if (!option.selected) onPick(option.value);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tip({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={className ? `tip ${className}` : 'tip'}>
      {children}
      <span className="tip-label" role="tooltip">{label}</span>
    </span>
  );
}

type StatAverages = { W: number; H: number; twoWeeks: number | null; fourWeeks: number | null; forever: number | null };

function dayScore(row: ScoreRecord): number | null {
  const score = row.best_score ?? row.first_score;
  return score == null ? null : Number(score);
}

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

function axisValues(min: number, max: number): number[] {
  const values: number[] = [];
  for (let n = min; n <= max; n++) values.push(n);
  return values;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildStatTable(rows: ScoreRecord[], today: string): StatAverages[] {
  const twoWeeks = shiftIsoDate(today, -13);
  const fourWeeks = shiftIsoDate(today, -27);
  const table: StatAverages[] = [];
  for (let W = PARAMS.Wmin; W <= PARAMS.Wmax; W++) {
    for (let H = PARAMS.Hmin; H <= PARAMS.Hmax; H++) {
      const scores = rows
        .filter((row) => Number(row.W) === W && Number(row.H) === H)
        .map((row) => ({ date: String(row.game_date), score: dayScore(row) }))
        .filter((row): row is { date: string; score: number } => row.score != null && row.date <= today);
      const windowMean = (from: string) => mean(scores.filter((row) => row.date >= from).map((row) => row.score));
      table.push({
        W,
        H,
        twoWeeks: windowMean(twoWeeks),
        fourWeeks: windowMean(fourWeeks),
        forever: mean(scores.map((row) => row.score)),
      });
    }
  }
  return table;
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
