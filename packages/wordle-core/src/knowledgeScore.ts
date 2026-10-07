import type { Guess, LetterEvaluation } from './types';
import { normalizeForLanguage } from './characterNormalization';
import { getInputPlugins } from './languageLoader';
import { letterWithFinalForm } from './inputPlugins';

function letterKey(letter: string, language: string): string {
  return normalizeForLanguage(letter.toLowerCase(), language);
}

function lockedGreens(guesses: Guess[], wordLength: number): Array<string | null> {
  const locked: Array<string | null> = Array(wordLength).fill(null);
  for (const guess of guesses) {
    const evals = guess.evaluations || [];
    for (let i = 0; i < wordLength; i++) {
      const ev = evals[i];
      if (ev?.state === 'correct') locked[i] = ev.letter;
    }
  }
  return locked;
}

/**
 * Known multiplicity of each letter: the highest (correct + present) count
 * seen in any single guess. Appearances across later guesses are not added.
 */
function knownCountByLetter(guesses: Guess[], language: string): Map<string, number> {
  const known = new Map<string, number>();
  for (const guess of guesses) {
    const inGuess = new Map<string, number>();
    for (const ev of guess.evaluations || []) {
      if (ev?.state === 'correct' || ev.state === 'present') {
        const key = letterKey(ev.letter, language);
        inGuess.set(key, (inGuess.get(key) || 0) + 1);
      }
    }
    for (const [key, n] of inGuess) {
      known.set(key, Math.max(known.get(key) || 0, n));
    }
  }
  return known;
}

/**
 * Exact multiplicity when a guess used the letter more times than it scored
 * green/yellow (leftover tiles were gray). "At least n" is not enough.
 */
function exactCountByLetter(guesses: Guess[], language: string): Map<string, number> {
  const exact = new Map<string, number>();
  for (const guess of guesses) {
    const scored = new Map<string, number>();
    const total = new Map<string, number>();
    for (const ev of guess.evaluations || []) {
      if (!ev) continue;
      const key = letterKey(ev.letter, language);
      total.set(key, (total.get(key) || 0) + 1);
      if (ev.state === 'correct' || ev.state === 'present') {
        scored.set(key, (scored.get(key) || 0) + 1);
      }
    }
    for (const [key, n] of total) {
      const hit = scored.get(key) || 0;
      if (n <= hit) continue;
      const prev = exact.get(key);
      exact.set(key, prev == null ? hit : Math.min(prev, hit));
    }
  }
  return exact;
}

function knowledgeParts(
  guesses: Guess[],
  wordLength: number,
  language: string,
  targetWord?: string
): { greens: number; yellows: number } {
  const locked = lockedGreens(guesses, wordLength);
  const knownByLetter = knownCountByLetter(guesses, language);

  const greenByLetter = new Map<string, number>();
  let greenCount = 0;
  for (let i = 0; i < wordLength; i++) {
    const letter = locked[i];
    if (!letter) continue;
    greenCount += 1;
    const key = letterKey(letter, language);
    greenByLetter.set(key, (greenByLetter.get(key) || 0) + 1);
  }

  const instanceCount = new Map<string, number>();
  if (targetWord) {
    const target = targetWord.slice(0, wordLength);
    for (const ch of target) {
      const key = letterKey(ch, language);
      instanceCount.set(key, (instanceCount.get(key) || 0) + 1);
    }
  } else {
    for (const [key, n] of knownByLetter) instanceCount.set(key, n);
    for (const [key, n] of greenByLetter) {
      instanceCount.set(key, Math.max(instanceCount.get(key) || 0, n));
    }
  }

  let unplaced = 0;
  for (const [key, inWord] of instanceCount) {
    const greens = greenByLetter.get(key) || 0;
    const known = Math.min(inWord, Math.max(knownByLetter.get(key) || 0, greens));
    unplaced += Math.max(0, known - greens);
  }

  return { greens: greenCount, yellows: unplaced };
}

/** Locked greens and known-unplaced (yellow) letters on one board. */
export function boardKnowledgeTally(
  guesses: Guess[],
  wordLength: number,
  targetWord?: string,
  language: string = 'en'
): { greens: number; yellows: number } {
  return knowledgeParts(guesses, wordLength, language, targetWord);
}

/**
 * Scoreboard knowledge for one board.
 * Each instance of a letter in the word is counted once, no matter how many
 * guesses showed it. A green instance is 1.0 and is not also counted as 0.7.
 * Extra known instances of the same letter (duplicates in the word) are 0.7 each.
 */
export function boardKnowledgeScore(
  guesses: Guess[],
  wordLength: number,
  targetWord?: string,
  language: string = 'en'
): number {
  const { greens, yellows } = knowledgeParts(guesses, wordLength, language, targetWord);
  return greens * 1 + yellows * 0.7;
}

export function scoreboardYellowFactor(score: number, cap: number): number {
  if (score <= 0) return 0;
  const linear = Math.min(1, score / cap);
  return Math.pow(linear, 0.28);
}

/**
 * Columns in visual-left order. `cols` are logical indices.
 * @param {number[]} cols
 * @param {number} wordLength
 * @param {boolean} rtl
 */
function columnsByDisplayLeft(cols, wordLength, rtl) {
  return [...cols].sort((a, b) => {
    const da = rtl ? wordLength - 1 - a : a;
    const db = rtl ? wordLength - 1 - b : b;
    return da - db;
  });
}

/**
 * Columns that get a glyph: greens first (visual left), then yellows.
 * Count is the max yellow+green hits for this letter in any one guess.
 * @param {Array<'correct' | 'present' | null>} states
 * @param {number} wordLength
 * @param {boolean} rtl
 * @param {number} maxGlyphs
 */
function glyphColumns(states, wordLength, rtl, maxGlyphs) {
  /** @type {number[]} */
  const greens = [];
  /** @type {number[]} */
  const yellows = [];
  for (let col = 0; col < wordLength; col++) {
    const st = states[col];
    if (st === 'correct') greens.push(col);
    else if (st === 'present') yellows.push(col);
  }
  const ordered = [
    ...columnsByDisplayLeft(greens, wordLength, rtl),
    ...columnsByDisplayLeft(yellows, wordLength, rtl),
  ];
  const n = Math.max(0, Math.min(maxGlyphs, ordered.length));
  return new Set(ordered.slice(0, n));
}

/**
 * Summary known grid: one row per discovered letter (yellow or green on the
 * board), in discovery order, up to word length. Each row colors every column
 * where that letter was present or correct. The letter is written as many
 * times as it lit up in a single guess (greens first, then leftmost yellows).
 * A later gray of that letter still marks the column yellow (tried, not there).
 * If a gray also proves every copy is already green, leftover columns are absent.
 * A final-form pair (Hebrew מ/ם and the rest) stays on that one row: the glyph
 * in the last column is the final form, and every other glyph is the regular form.
 */
export function layoutSummaryKnown(
  guesses: Guess[],
  wordLength: number,
  language: string = 'en',
  rtl: boolean = false
): Array<Array<LetterEvaluation | null>> {
  const knownRowCount = Math.max(1, wordLength);
  const rows: Array<Array<LetterEvaluation | null>> = Array.from(
    { length: knownRowCount },
    () => Array(wordLength).fill(null)
  );
  const knownByLetter = knownCountByLetter(guesses, language);
  const exactByLetter = exactCountByLetter(guesses, language);
  const inputPlugins = getInputPlugins(language);

  type LetterTrack = {
    letter: string;
    states: Array<'correct' | 'present' | 'absent' | null>;
  };
  const order: string[] = [];
  const byKey = new Map<string, LetterTrack>();

  for (const guess of guesses) {
    const evals = guess.evaluations || [];
    for (let col = 0; col < wordLength; col++) {
      const ev = evals[col];
      if (!ev || (ev.state !== 'correct' && ev.state !== 'present')) continue;
      const key = letterKey(ev.letter, language);
      let track = byKey.get(key);
      if (!track) {
        track = {
          letter: ev.letter,
          states: Array(wordLength).fill(null),
        };
        byKey.set(key, track);
        order.push(key);
      }
      if (track.states[col] !== 'correct') track.states[col] = ev.state;
    }
  }
  for (const guess of guesses) {
    const evals = guess.evaluations || [];
    for (let col = 0; col < wordLength; col++) {
      const ev = evals[col];
      if (!ev || ev.state !== 'absent') continue;
      const track = byKey.get(letterKey(ev.letter, language));
      if (!track || track.states[col]) continue;
      track.states[col] = 'present';
    }
  }

  for (const [key, track] of byKey) {
    const greens = track.states.filter((st) => st === 'correct').length;
    const exact = exactByLetter.get(key);
    if (exact == null || exact !== greens) continue;
    for (let col = 0; col < wordLength; col++) {
      if (!track.states[col]) track.states[col] = 'absent';
    }
  }

  for (let i = 0; i < order.length && i < knownRowCount; i++) {
    const key = order[i];
    const track = byKey.get(key);
    if (!track) continue;
    const glyphCols = glyphColumns(track.states, wordLength, rtl, knownByLetter.get(key) || 1);
    for (let col = 0; col < wordLength; col++) {
      const state = track.states[col];
      if (!state) continue;
      rows[i][col] = {
        letter: glyphCols.has(col)
          ? letterWithFinalForm(track.letter, col === wordLength - 1, inputPlugins)
          : '',
        state,
      };
    }
  }
  return rows;
}
