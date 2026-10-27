import { PARAMS, speedFactor } from './params.ts';

/** A bonus that stays on one letter until a word containing it is taken. */
export type LetterBonus = { drop: number };

/** 1 at the floor. 2 when the drop spans the bucket, from the loss line to the floor. */
export function dropFactor(rowsTravelled: number, bucketRows: number): number {
  if (rowsTravelled <= 0 || bucketRows <= 0) return 1;
  return 1 + rowsTravelled / bucketRows;
}

/**
 * Word points from each letter's base value.
 * Speed and a stored drop each scale that base. Longer words then pay more per letter.
 * The result is not added to the score until the word is taken.
 */
export function scoredWord(
  text: string,
  bonuses: LetterBonus[],
  values: Record<string, number>,
  speedPercent: number,
  cword = PARAMS.Cword,
): number {
  const letters = Array.from(text);
  const mult = 1 + (letters.length - 3) * cword;
  const speed = speedFactor(speedPercent);
  let sum = 0;
  for (let i = 0; i < letters.length; i++) {
    const drop = bonuses[i]?.drop ?? 1;
    sum += (values[letters[i]] ?? 1) * speed * (drop > 0 ? drop : 1) * mult;
  }
  return Math.round(sum);
}

/** Nearest integer word value. A 3-letter word uses each letter's base value. */
export function wordValue(text: string, values: Record<string, number>, cword = PARAMS.Cword): number {
  return scoredWord(text, Array.from(text, () => ({ drop: 1 })), values, 0, cword);
}

/** Small bonus for confirming Keep or Skip before the countdown ends. */
export function earlyBonus(points: number, cearly = PARAMS.Cearly): number {
  if (points <= 0) return 0;
  return Math.max(1, Math.round(points * cearly));
}
