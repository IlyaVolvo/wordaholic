import React from 'react';
import { layoutSummaryKnown, summaryKnownRows } from '@wordaholic/wordle-core';
import type { Guess, LetterEvaluation } from '../types';

interface SummaryBoardProps {
  guesses: Guess[];
  currentGuess: string;
  wordLength: number;
  invalidRow?: boolean;
  rtl?: boolean;
  frozen?: boolean;
  onExpand: () => void;
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

function cellClass(
  state: LetterEvaluation | null,
  isActive: boolean,
  rowInvalid: boolean
): string {
  if (!state) return `cell empty${isActive ? ' cell-active' : ''}${rowInvalid ? ' invalid' : ''}`;
  return `cell ${state.state}${isActive ? ' cell-active' : ''}${rowInvalid ? ' invalid' : ''}`;
}

export const SummaryBoard: React.FC<SummaryBoardProps> = ({
  guesses,
  currentGuess,
  wordLength,
  invalidRow = false,
  rtl = false,
  frozen = false,
  onExpand,
}) => {
  const knownRowCount = summaryKnownRows(wordLength);
  const knownRows = layoutSummaryKnown(guesses, wordLength);
  const showEntry = !frozen;
  const activeCol = showEntry
    ? rtl
      ? wordLength - 1 - currentGuess.length
      : currentGuess.length
    : -1;
  const rowInvalid = Boolean(invalidRow && showEntry && currentGuess.length > 0);

  const logical = (col: number) => (rtl ? wordLength - 1 - col : col);

  const lastGuess = guesses[guesses.length - 1];
  const previousCells = displayGuessCells(lastGuess, wordLength, rtl);

  const entryCells: Array<LetterEvaluation | null> = Array(wordLength).fill(null);
  if (showEntry && currentGuess.length > 0) {
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
                <div key={col} className={cellClass(state, false, false)}>
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
            <div key={col} className={cellClass(state, false, false)}>
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
          <div className={`row${rowInvalid ? ' invalid' : ''}`}>
            {entryCells.map((_, col) => {
              const state = entryCells[col];
              const isActive = col === activeCol;
              return (
                <div key={col} className={cellClass(state, isActive, rowInvalid)}>
                  {state?.letter.toUpperCase() || ''}
                  {isActive ? <span className="cell-cursor" aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
