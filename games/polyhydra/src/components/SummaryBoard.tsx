import React from 'react';
import {
  boardSummaryKnowledge,
  summaryKnownRows,
  summaryYellowRows,
} from '@wordaholic/wordle-core';
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
  const { greens, yellowsByColumn } = boardSummaryKnowledge(guesses, wordLength);
  const knownRowCount = summaryKnownRows(wordLength);
  const yellowRowCount = summaryYellowRows(wordLength);
  const showEntry = !frozen;
  const activeCol = showEntry
    ? rtl
      ? wordLength - 1 - currentGuess.length
      : currentGuess.length
    : -1;
  const rowInvalid = Boolean(invalidRow && showEntry && currentGuess.length > 0);

  const logical = (col: number) => (rtl ? wordLength - 1 - col : col);

  const knownRows: Array<Array<LetterEvaluation | null>> = Array.from(
    { length: knownRowCount },
    () => Array(wordLength).fill(null)
  );
  for (let col = 0; col < wordLength; col++) {
    const letter = greens[col];
    if (letter) knownRows[0][col] = { letter, state: 'correct' };
    const yellows = yellowsByColumn[col] || [];
    for (let y = 0; y < yellows.length && y < yellowRowCount; y++) {
      knownRows[1 + y][col] = { letter: yellows[y], state: 'present' };
    }
  }

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
        onClick={onExpand}
      >
        ↓
      </button>
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
