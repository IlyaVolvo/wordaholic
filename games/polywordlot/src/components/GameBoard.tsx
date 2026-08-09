import React from 'react';
import type { Guess, LetterEvaluation } from '../types';

interface GameBoardProps {
  guesses: Guess[];
  currentGuess: string;
  wordLength: number;
  maxGuesses: number;
  targetWord?: string;
  isComplete?: boolean;
  isWon?: boolean;
  shakeRowIndex?: number | null;
  /** When true, current guess is shown right-to-left (first letter in rightmost cell) */
  rtl?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  guesses,
  currentGuess,
  wordLength,
  maxGuesses,
  targetWord,
  isComplete,
  isWon,
  shakeRowIndex,
  rtl = false,
}) => {
  const getCellState = (row: number, col: number): LetterEvaluation | null => {
    // Show completed guesses (same RTL order as typing: first letter rightmost)
    if (row < guesses.length) {
      const evals = guesses[row].evaluations;
      const idx = rtl ? wordLength - 1 - col : col;
      return evals[idx] || null;
    }

    // If game is complete and lost, show target word in the row immediately after the last guess
    if (isComplete && !isWon && targetWord && row === guesses.length) {
      const idx = rtl ? wordLength - 1 - col : col;
      if (idx >= 0 && idx < targetWord.length) {
        return { letter: targetWord[idx], state: 'correct' };
      }
      return null;
    }

    // Show current guess being typed (only if game is not complete)
    // Letters stay white until Enter; use 'typing' state for uncolored display
    if (!isComplete && row === guesses.length && currentGuess.length > 0) {
      if (rtl) {
        // RTL: first letter (index 0) in rightmost cell; letters fill to the left
        const startCol = wordLength - currentGuess.length;
        if (col >= startCol && col < wordLength) {
          const idx = col - startCol;
          return { letter: currentGuess[idx], state: 'typing' };
        }
      } else {
        if (col < currentGuess.length) {
          return { letter: currentGuess[col], state: 'typing' };
        }
      }
    }

    return null;
  };

  const getCellClass = (state: LetterEvaluation | null, isActive: boolean): string => {
    if (!state) return `cell empty${isActive ? ' cell-active' : ''}`;
    return `cell ${state.state}${isActive ? ' cell-active' : ''}`;
  };

  const getActiveCol = (): number => {
    return rtl ? wordLength - 1 - currentGuess.length : currentGuess.length;
  };

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < maxGuesses; row++) {
    const cells: React.ReactNode[] = [];
    const activeCol = !isComplete && row === guesses.length ? getActiveCol() : -1;
    for (let col = 0; col < wordLength; col++) {
      const cellState = getCellState(row, col);
      const isActive = col === activeCol;
      cells.push(
        <div key={col} className={getCellClass(cellState, isActive)}>
          {cellState?.letter.toUpperCase() || ''}
          {isActive && <span className="cell-cursor" aria-hidden="true" />}
        </div>
      );
    }
    const isShaking = shakeRowIndex !== null && row === shakeRowIndex;
    rows.push(
      <div key={row} className={`row ${isShaking ? 'shake' : ''}`}>
        {cells}
      </div>
    );
  }

  return <div className="game-board">{rows}</div>;
};

