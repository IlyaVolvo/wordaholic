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
  invalidRow?: boolean;
  rtl?: boolean;
  frozen?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  guesses,
  currentGuess,
  wordLength,
  maxGuesses,
  targetWord,
  isComplete,
  isWon,
  invalidRow = false,
  rtl = false,
  frozen = false,
}) => {
  const showCurrent = !frozen && !isComplete;

  const getCellState = (row: number, col: number): LetterEvaluation | null => {
    if (row < guesses.length) {
      const evals = guesses[row].evaluations;
      const idx = rtl ? wordLength - 1 - col : col;
      return evals[idx] || null;
    }

    if (isComplete && !isWon && targetWord && row === guesses.length) {
      const idx = rtl ? wordLength - 1 - col : col;
      if (idx >= 0 && idx < targetWord.length) {
        return { letter: targetWord[idx], state: 'absent' };
      }
      return null;
    }

    if (showCurrent && row === guesses.length && currentGuess.length > 0) {
      if (rtl) {
        const startCol = wordLength - currentGuess.length;
        if (col >= startCol && col < wordLength) {
          const idx = col - startCol;
          return { letter: currentGuess[idx], state: invalidRow ? 'typing' : 'typing' };
        }
      } else if (col < currentGuess.length) {
        return { letter: currentGuess[col], state: 'typing' };
      }
    }

    return null;
  };

  const getCellClass = (state: LetterEvaluation | null, isActive: boolean, rowInvalid: boolean): string => {
    if (!state) return `cell empty${isActive ? ' cell-active' : ''}${rowInvalid ? ' invalid' : ''}`;
    return `cell ${state.state}${isActive ? ' cell-active' : ''}${rowInvalid ? ' invalid' : ''}`;
  };

  const getActiveCol = (): number => {
    return rtl ? wordLength - 1 - currentGuess.length : currentGuess.length;
  };

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < maxGuesses; row++) {
    const cells: React.ReactNode[] = [];
    const activeCol = showCurrent && row === guesses.length ? getActiveCol() : -1;
    const missedReveal = Boolean(isComplete && !isWon && targetWord && row === guesses.length);
    const rowInvalid = Boolean(invalidRow && showCurrent && row === guesses.length && currentGuess.length > 0);
    for (let col = 0; col < wordLength; col++) {
      const cellState = getCellState(row, col);
      const isActive = col === activeCol;
      cells.push(
        <div
          key={col}
          className={`${getCellClass(cellState, isActive, rowInvalid)}${missedReveal ? ' missed-reveal' : ''}`}
        >
          {cellState?.letter.toUpperCase() || ''}
          {isActive && <span className="cell-cursor" aria-hidden="true" />}
        </div>
      );
    }
    rows.push(
      <div key={row} className={`row${rowInvalid ? ' invalid' : ''}`}>
        {cells}
      </div>
    );
  }

  return (
    <div
      className="game-board"
      style={
        {
          '--board-cols': wordLength,
          '--board-rows': maxGuesses,
        } as React.CSSProperties
      }
    >
      {rows}
    </div>
  );
};
