import { dropBlocked, offerPoints, type Sim } from './sim.ts';
import { PARAMS } from './params.ts';
import { fieldPixels } from './params.ts';

export type RevealedLine = { axis: 'row' | 'col'; index: number };

export function drawField(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  now: number,
  tapped: { r: number; c: number } | null = null,
  reveal: RevealedLine | null = null,
) {
  if (sim.paused && reveal) {
    ctx.save();
    ctx.filter = 'blur(22px)';
    paintField(ctx, sim, now, null);
    ctx.restore();
    paintRevealedLine(ctx, sim, reveal, tapped);
    return;
  }
  paintField(ctx, sim, now, tapped);
}

function paintField(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  now: number,
  tapped: { r: number; c: number } | null,
) {
  const { width, height, wall } = fieldPixels(sim.W, sim.H, sim.A, sim.E);
  ctx.clearRect(0, 0, width, height);

  const floor = height - wall;
  const bucketTop = floor - sim.H * sim.A;

  ctx.fillStyle = '#243044';
  ctx.fillRect(0, 0, width, bucketTop);
  ctx.fillStyle = '#121826';
  ctx.fillRect(wall, bucketTop, sim.W * sim.A, floor - bucketTop);

  ctx.fillStyle = '#5c6b86';
  ctx.fillRect(0, 0, wall, floor);
  ctx.fillRect(width - wall, 0, wall, floor);
  ctx.fillRect(0, floor, width, wall);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wall, bucketTop);
  ctx.lineTo(width - wall, bucketTop);
  ctx.stroke();

  const wordOn = (sim.phase === 'decide' || sim.phase === 'flush') && Math.floor(now / 280) % 2 === 0;
  const words = new Map<string, string | null>();
  if (sim.phase === 'decide') {
    for (const match of sim.offer) {
      const spelled = match.display ? Array.from(match.display) : null;
      match.cells.forEach((cell, i) => {
        const key = `${cell.r},${cell.c}`;
        const letter = spelled?.[i] ?? null;
        if (!words.has(key) || letter) words.set(key, letter);
      });
    }
  } else if (sim.phase === 'flush' && sim.flushQueue.length > 0) {
    // Show the currently flushing word
    const currentMatch = sim.flushQueue[0];
    const spelled = currentMatch.display ? Array.from(currentMatch.display) : null;
    currentMatch.cells.forEach((cell, i) => {
      const key = `${cell.r},${cell.c}`;
      const letter = spelled?.[i] ?? null;
      if (!words.has(key) || letter) words.set(key, letter);
    });
  }

  ctx.strokeStyle = 'rgba(230, 232, 236, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < sim.W; c++) {
    const x = wall + c * sim.A + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, floor);
  }
  ctx.stroke();

  for (let r = 0; r < sim.H + sim.E; r++) {
    for (let c = 0; c < sim.W; c++) {
      const letter = sim.grid[r][c];
      if (!letter) continue;
      const selected = sim.held?.row === r && sim.held?.col === c;
      const key = `${r},${c}`;
      const word = wordOn && words.has(key);
      const shown = (words.has(key) && words.get(key)) || letter;
      const blocked = selected && dropBlocked(sim);
      const pink = Boolean(sim.bonus[r]?.[c]?.missing) || (tapped?.r === r && tapped?.c === c);
      paintTile(ctx, wall + c * sim.A, floor - (r + 1) * sim.A, sim.A, shown, selected, word, blocked, pink);
    }
  }

  if (!sim.paused) {
    for (const piece of sim.falling) {
      const blocked = piece.selected && dropBlocked(sim);
      paintTile(ctx, wall + piece.col * sim.A, floor - (piece.yPx + sim.A), sim.A, piece.letter, piece.selected, false, blocked, Boolean(piece.missing));
    }
  }

  if (sim.phase === 'decide') {
    const frac = Math.max(0, Math.min(1, sim.decideMsLeft / (PARAMS.N * 1000)));
    ctx.fillStyle = '#f0c400';
    ctx.fillRect(wall, 8, (width - wall * 2) * frac, 8);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(16, Math.round(sim.A * 0.7))}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${offerPoints(sim)}`, width / 2, 28 + sim.A * 0.35);
  }
}

function paintRevealedLine(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  reveal: RevealedLine,
  tapped: { r: number; c: number } | null,
) {
  const { height, wall } = fieldPixels(sim.W, sim.H, sim.A, sim.E);
  const floor = height - wall;
  const onLine = (row: number, col: number) =>
    reveal.axis === 'row' ? row === reveal.index : col === reveal.index;
  for (let r = 0; r < sim.H + sim.E; r++) {
    for (let c = 0; c < sim.W; c++) {
      if (!onLine(r, c)) continue;
      const letter = sim.grid[r][c];
      if (!letter) continue;
      const selected = sim.held?.row === r && sim.held?.col === c;
      const pink = Boolean(sim.bonus[r]?.[c]?.missing) || (tapped?.r === r && tapped?.c === c);
      paintTile(ctx, wall + c * sim.A, floor - (r + 1) * sim.A, sim.A, letter, selected, false, false, pink);
    }
  }
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  A: number,
  letter: string,
  selected: boolean,
  word: boolean,
  blocked: boolean,
  pink: boolean,
) {
  const pad = Math.max(1, Math.round(A * 0.06));
  ctx.fillStyle = word ? '#f0c400' : pink ? '#f7b0c8' : selected ? '#1a5f86' : '#f4f0e6';
  roundRect(ctx, x + pad, y + pad, A - pad * 2, A - pad * 2, Math.max(3, A * 0.12));
  ctx.fill();
  if (selected || word || pink) {
    ctx.strokeStyle = word ? '#8a6a00' : pink ? '#a8486a' : '#134864';
    ctx.lineWidth = Math.max(2, A * 0.08);
    ctx.stroke();
  }
  ctx.fillStyle = blocked ? '#f0c400' : word || !selected ? '#1a1d27' : '#fff';
  ctx.font = `700 ${Math.round(A * 0.58)}px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter.toUpperCase(), x + A / 2, y + A / 2 + 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function pointerToCell(sim: Sim, canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const { width, height, wall } = fieldPixels(sim.W, sim.H, sim.A, sim.E);
  const rect = canvas.getBoundingClientRect();
  const px = rect.width ? ((clientX - rect.left) / rect.width) * width : 0;
  const py = rect.height ? ((clientY - rect.top) / rect.height) * height : 0;
  const columnUnits = sim.A ? (px - wall) / sim.A : 0;
  const col = Math.min(sim.W - 1, Math.max(0, Math.floor(columnUnits)));
  const yFromFloor = height - wall - py;
  const row = Math.floor(yFromFloor / sim.A);
  return { col, row, yFromFloor, py, columnUnits };
}
