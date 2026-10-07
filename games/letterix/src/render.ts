import { offerPoints, type Sim } from './sim.ts';
import { PARAMS } from './params.ts';
import { fieldPixels } from './params.ts';

export function drawField(ctx: CanvasRenderingContext2D, sim: Sim, now: number) {
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

  const wordOn = sim.phase === 'decide' && Math.floor(now / 280) % 2 === 0;
  const words = new Set<string>();
  if (sim.phase === 'decide') {
    for (const match of sim.offer) {
      for (const cell of match.cells) words.add(`${cell.r},${cell.c}`);
    }
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
      const word = wordOn && words.has(`${r},${c}`);
      paintTile(ctx, wall + c * sim.A, floor - (r + 1) * sim.A, sim.A, letter, selected, word);
    }
  }

  for (const piece of sim.falling) {
    paintTile(ctx, wall + piece.col * sim.A, floor - (piece.yPx + sim.A), sim.A, piece.letter, piece.selected, false);
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

function paintTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  A: number,
  letter: string,
  selected: boolean,
  word: boolean,
) {
  const pad = Math.max(1, Math.round(A * 0.06));
  ctx.fillStyle = word ? '#f0c400' : selected ? '#1a5f86' : '#f4f0e6';
  roundRect(ctx, x + pad, y + pad, A - pad * 2, A - pad * 2, Math.max(3, A * 0.12));
  ctx.fill();
  if (selected || word) {
    ctx.strokeStyle = word ? '#8a6a00' : '#134864';
    ctx.lineWidth = Math.max(2, A * 0.08);
    ctx.stroke();
  }
  ctx.fillStyle = word || !selected ? '#1a1d27' : '#fff';
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
  const col = Math.floor((px - wall) / sim.A);
  const yFromFloor = height - wall - py;
  const row = Math.floor(yFromFloor / sim.A);
  return { col, row, yFromFloor, py };
}
