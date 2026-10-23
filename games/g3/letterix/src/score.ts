import { PARAMS, speedFactor } from './params.ts';

/** Word points at the current speed. 100% faster doubles them. */
export function scaledWordPoints(points: number, speedPercent: number): number {
  if (points <= 0) return 0;
  return Math.round(points * speedFactor(speedPercent));
}

/** Nearest integer word value. A 3-letter word uses each letter's base value. */
export function wordValue(text: string, values: Record<string, number>, cword = PARAMS.Cword): number {
  const letters = Array.from(text);
  const mult = 1 + (letters.length - 3) * cword;
  let sum = 0;
  for (const ch of letters) sum += (values[ch] ?? 1) * mult;
  return Math.round(sum);
}

/** Small bonus for confirming Keep or Skip before the countdown ends. */
export function earlyBonus(points: number, cearly = PARAMS.Cearly): number {
  if (points <= 0) return 0;
  return Math.max(1, Math.round(points * cearly));
}

/** Hard-drop bonus. Zero when the letter does not skip a full row. */
export function dropBonus(vl: number, rowsSkipped: number, cdrop = PARAMS.Cdrop): number {
  if (rowsSkipped <= 0) return 0;
  return Math.round(vl * rowsSkipped * cdrop);
}
