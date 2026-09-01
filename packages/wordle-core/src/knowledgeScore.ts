import type { Guess } from './types';

function letterKey(letter: string): string {
  return letter.toLowerCase();
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
function knownCountByLetter(guesses: Guess[]): Map<string, number> {
  const known = new Map<string, number>();
  for (const guess of guesses) {
    const inGuess = new Map<string, number>();
    for (const ev of guess.evaluations || []) {
      if (ev?.state === 'correct' || ev.state === 'present') {
        const key = letterKey(ev.letter);
        inGuess.set(key, (inGuess.get(key) || 0) + 1);
      }
    }
    for (const [key, n] of inGuess) {
      known.set(key, Math.max(known.get(key) || 0, n));
    }
  }
  return known;
}

function knowledgeParts(
  guesses: Guess[],
  wordLength: number,
  targetWord?: string
): { greens: number; yellows: number } {
  const locked = lockedGreens(guesses, wordLength);
  const knownByLetter = knownCountByLetter(guesses);

  const greenByLetter = new Map<string, number>();
  let greenCount = 0;
  for (let i = 0; i < wordLength; i++) {
    const letter = locked[i];
    if (!letter) continue;
    greenCount += 1;
    const key = letterKey(letter);
    greenByLetter.set(key, (greenByLetter.get(key) || 0) + 1);
  }

  const instanceCount = new Map<string, number>();
  if (targetWord) {
    const target = targetWord.slice(0, wordLength);
    for (const ch of target) {
      const key = letterKey(ch);
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
  targetWord?: string
): { greens: number; yellows: number } {
  return knowledgeParts(guesses, wordLength, targetWord);
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
  targetWord?: string
): number {
  const { greens, yellows } = knowledgeParts(guesses, wordLength, targetWord);
  return greens * 1 + yellows * 0.7;
}

export function scoreboardYellowFactor(score: number, cap: number): number {
  if (score <= 0) return 0;
  const linear = Math.min(1, score / cap);
  return Math.pow(linear, 0.28);
}

/**
 * Locked greens by position. Yellows only for unplaced instances: a letter
 * already fully accounted for as green is not shown again unless a second
 * (or further) copy is known. Extra copies appear in columns where they
 * were evaluated present.
 */
export function boardSummaryKnowledge(
  guesses: Guess[],
  wordLength: number
): { greens: Array<string | null>; yellowsByColumn: string[][] } {
  const greens = lockedGreens(guesses, wordLength);
  const knownByLetter = knownCountByLetter(guesses);
  const greenByLetter = new Map<string, number>();
  for (const letter of greens) {
    if (!letter) continue;
    const key = letterKey(letter);
    greenByLetter.set(key, (greenByLetter.get(key) || 0) + 1);
  }

  const yellowsByColumn: string[][] = Array.from({ length: wordLength }, () => []);
  const seenAt = Array.from({ length: wordLength }, () => new Set<string>());
  for (const guess of guesses) {
    const evals = guess.evaluations || [];
    for (let i = 0; i < wordLength; i++) {
      const ev = evals[i];
      if (!ev || ev.state !== 'present') continue;
      const key = letterKey(ev.letter);
      if (greens[i] && letterKey(greens[i] as string) === key) continue;
      const greenCount = greenByLetter.get(key) || 0;
      const known = Math.max(knownByLetter.get(key) || 0, greenCount);
      if (known - greenCount <= 0) continue;
      if (seenAt[i].has(key)) continue;
      seenAt[i].add(key);
      yellowsByColumn[i].push(ev.letter);
    }
  }
  return { greens, yellowsByColumn };
}
