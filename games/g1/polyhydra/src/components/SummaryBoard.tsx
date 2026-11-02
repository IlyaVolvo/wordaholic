import React from 'react';
import { MissingReportButton } from '../../../shared/MissingReportButton';
import { layoutSummaryKnown, summaryKnownRows } from '@wordaholic/wordle-core';
import type { Guess, LetterEvaluation } from '../types';

interface SummaryBoardProps {
  guesses: Guess[];
  currentGuess: string;
  wordLength: number;
  language?: string;
  invalidRow?: boolean;
  duplicateRow?: boolean;
  rtl?: boolean;
  frozen?: boolean;
  /** Solved board is still on screen: keep the winning word in the entry row. */
  holdGuess?: boolean;
  onExpand: () => void;
  onReportMissing?: () => void;
}

function displayGuessCells(
  guess: Guess | undefined,
  wordLength: number,
  rtl: boolean
): Array<LetterEvaluation | null> {
  const cells: Array<LetterEvaluation | null> = Array(wordLength).fill(null);
  if (!guess) return cells;
  const evals = guess.evaluations || [];
  for (let col = 0; col < wordLength; col++) {
    const idx = rtl ? wordLength - 1 - col : col;
    cells[col] = evals[idx] || null;
  }
  return cells;
}

function rowWarnClass(invalid: boolean, duplicate: boolean): string {
  if (duplicate) return ' duplicate';
  if (invalid) return ' invalid';
  return '';
}

function cellClass(
  state: LetterEvaluation | null,
  isActive: boolean,
  warn: string
): string {
  if (!state) return `cell empty${isActive ? ' cell-active' : ''}${warn}`;
  return `cell ${state.state}${isActive ? ' cell-active' : ''}${warn}`;
}

export const SummaryBoard: React.FC<SummaryBoardProps> = ({
  guesses,
  currentGuess,
  wordLength,
  language = 'en',
  invalidRow = false,
  duplicateRow = false,
  rtl = false,
  frozen = false,
  holdGuess = false,
  onExpand,
  onReportMissing,
}) => {
  const knownRowCount = summaryKnownRows(wordLength);
  const settledGuesses = holdGuess ? guesses.slice(0, -1) : guesses;
  const knownRows = layoutSummaryKnown(settledGuesses, wordLength, language, rtl);
  const showEntry = holdGuess || !frozen;
  const activeCol = showEntry && !holdGuess
    ? rtl
      ? wordLength - 1 - currentGuess.length
      : currentGuess.length
    : -1;
  const entryWarn =
    showEntry && currentGuess.length > 0 ? rowWarnClass(invalidRow, duplicateRow) : '';

  const logical = (col: number) => (rtl ? wordLength - 1 - col : col);

  const heldGuess = holdGuess ? guesses[guesses.length - 1] : undefined;
  const lastGuess = holdGuess ? guesses[guesses.length - 2] : guesses[guesses.length - 1];
  const previousCells = displayGuessCells(lastGuess, wordLength, rtl);
  const heldCells = displayGuessCells(heldGuess, wordLength, rtl);

  const entryCells: Array<LetterEvaluation | null> = Array(wordLength).fill(null);
  if (holdGuess) {
    for (let col = 0; col < wordLength; col++) entryCells[col] = heldCells[col];
  } else if (showEntry && currentGuess.length > 0) {
    if (rtl) {
      const startCol = wordLength - currentGuess.length;
      for (let col = startCol; col < wordLength; col++) {
        entryCells[col] = { letter: currentGuess[col - startCol], state: 'typing' };
      }
    } else {
      for (let col = 0; col < currentGuess.length; col++) {
        entryCells[col] = { letter: currentGuess[col], state: 'typing' };
      }
    }
  }

  return (
    <div className="hydra-summary">
      <div
        className="game-board hydra-summary-known"
        style={
          {
            '--board-cols': wordLength,
            '--board-rows': knownRowCount,
          } as React.CSSProperties
        }
      >
        {knownRows.map((row, rowIdx) => (
          <div key={rowIdx} className="row">
            {row.map((_, col) => {
              const state = row[logical(col)];
              return (
                <div key={col} className={cellClass(state, false, '')}>
                  {state?.letter.toUpperCase() || ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="hydra-board-mode hydra-board-mode--down"
        aria-label="Show full board"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onExpand}
      >
        ↓
      </button>
      <div
        className="game-board hydra-summary-previous"
        aria-label="Previous guess"
        style={
          {
            '--board-cols': wordLength,
            '--board-rows': 1,
          } as React.CSSProperties
        }
      >
        <div className="row">
          {previousCells.map((state, col) => (
            <div key={col} className={cellClass(state, false, '')}>
              {state?.letter.toUpperCase() || ''}
            </div>
          ))}
        </div>
      </div>
      {showEntry ? (
        <div
          className="game-board hydra-summary-entry"
          style={
            {
              '--board-cols': wordLength,
              '--board-rows': 1,
            } as React.CSSProperties
          }
        >
          <div className={`row${entryWarn}`}>
            {entryCells.map((_, col) => {
              const state = entryCells[col];
              const isActive = col === activeCol;
              return (
                <div key={col} className={cellClass(state, isActive, entryWarn)}>
                  {state?.letter.toUpperCase() || ''}
                  {isActive ? <span className="cell-cursor" aria-hidden="true" /> : null}
                </div>
              );
            })}
            {invalidRow && onReportMissing ? (
              <MissingReportButton onClick={onReportMissing} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
