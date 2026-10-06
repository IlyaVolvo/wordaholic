/** Named Letterix parameters. Only W, H, and the date are chosen by the player. */

export const PARAMS = {
  E: 4,
  Amin: 28,
  Wmin: 6,
  Wmax: 12,
  Hmin: 10,
  Hmax: 20,
  Nmin: 3,
  Vmax: 10,
  Cword: 0.5,
  Cdrop: 0.15,
  Cearly: 0.15,
  Trow: 1493,
  N: 2,
  preferW: 8,
  preferH: 12,
} as const;

export function fallingCap(W: number, H: number, E = PARAMS.E): number {
  return Math.max(2, Math.min(Math.floor(W / 2), Math.floor((H + E) / 4)));
}

/** 0% is base speed. 100% is twice as fast. */
export function speedFactor(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 1;
  return 1 + percent / 100;
}

export function pixelInterval(A: number, speedPercent = 0): number {
  const raw = PARAMS.Trow / speedFactor(speedPercent) / Math.max(1, A);
  if (!(speedPercent > 0)) return Math.max(8, Math.round(raw));
  return Math.max(0.05, raw);
}

export function wallThickness(A: number): number {
  return Math.max(4, Math.round(A * 0.16));
}

export function fieldPixels(W: number, H: number, A: number, E = PARAMS.E): { width: number; height: number; wall: number } {
  const wall = wallThickness(A);
  return {
    wall,
    width: W * A + wall * 2,
    height: (H + E) * A + wall,
  };
}

/** Largest square cell that fits the play area, including the walls and floor. */
export function fitCell(availW: number, availH: number, W: number, H: number, E = PARAMS.E): number {
  if (availW <= 0 || availH <= 0 || W <= 0 || H <= 0) return 1;
  let lo = 1;
  let hi = Math.max(1, Math.ceil(Math.max(availW, availH)));
  let best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const size = fieldPixels(W, H, mid, E);
    if (size.width <= availW && size.height <= availH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function maxWidth(availW: number, availH: number, H: number): number {
  let w = PARAMS.Wmin;
  for (let n = PARAMS.Wmin + 1; n <= PARAMS.Wmax; n++) {
    if (fitCell(availW, availH, n, H) >= PARAMS.Amin) w = n;
    else break;
  }
  return w;
}

export function maxHeight(availW: number, availH: number, W: number): number {
  let h = PARAMS.Hmin;
  for (let n = PARAMS.Hmin + 1; n <= PARAMS.Hmax; n++) {
    if (fitCell(availW, availH, W, n) >= PARAMS.Amin) h = n;
    else break;
  }
  return h;
}

/** Opening board, before a saved width and height. */
export function openingSize(): { W: number; H: number } {
  return { W: PARAMS.preferW, H: PARAMS.preferH };
}

export function localCalendarDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dailySeed(date: string, W: number, H: number): string {
  return `${date}|${W}|${H}`;
}
