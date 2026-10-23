import type { GameState } from '../types';
import { formatDate } from './dailyWord';

const STORAGE_KEY = 'wordle-multi-game-state';

/**
 * Saves game state to localStorage
 */
export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save game state:', error);
  }
}

/**
 * Loads game state from localStorage
 */
export function loadGameState(): GameState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const state: GameState = JSON.parse(stored);
    const today = formatDate();
    
    // For random mode, always return the state (word changes each game)
    if (state.isRandomMode) {
      return state;
    }
    
    // For daily mode, only return if it's for today
    if (state.date === today) {
      return state;
    }
    
    // Otherwise, clear old state and return null
    clearGameState();
    return null;
  } catch (error) {
    console.error('Failed to load game state:', error);
    return null;
  }
}

/**
 * Clears game state from localStorage
 */
export function clearGameState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear game state:', error);
  }
}

/**
 * Loads completed game state for a specific language/length/date combination
 */
export function loadCompletedGame(language: string, wordLength: number, date: string, isRandomMode: boolean, wordSeed?: number): GameState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const state: GameState = JSON.parse(stored);
    
    // Check if it matches the criteria
    if (state.language === language &&
        state.wordLength === wordLength &&
        state.date === date &&
        (state.isRandomMode ?? false) === isRandomMode &&
        state.isComplete) {
      // For random mode, also check wordSeed
      if (isRandomMode && wordSeed !== undefined && state.wordSeed !== wordSeed) {
        return null;
      }
      return state;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to load completed game:', error);
    return null;
  }
}

