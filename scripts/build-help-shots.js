/**
 * Generate small SVG screenshots used by help steps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/help');

function write(rel, svg) {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, svg.trim() + '\n');
}

const CORRECT = '#2d7a36';
const PRESENT = '#f0c400';

const CELL = {
  empty: { fill: '#fff', stroke: '#c4c7ca', text: '#333' },
  correct: { fill: CORRECT, stroke: CORRECT, text: '#fff' },
  present: { fill: PRESENT, stroke: PRESENT, text: '#000' },
  absent: { fill: '#787c7e', stroke: '#787c7e', text: '#fff' },
};

function pwBoard(shown, highlight) {
  const size = 22;
  const gap = 3;
  const cols = 5;
  const rows = 6;
  const pad = 8;
  const w = pad * 2 + cols * size + (cols - 1) * gap;
  const h = pad * 2 + rows * size + (rows - 1) * gap;
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (size + gap);
      const y = pad + r * (size + gap);
      const ev = shown[r]?.[c];
      const st = ev ? CELL[ev.state] : CELL.empty;
      const letter = ev?.letter || '';
      const hi = highlight === r;
      cells += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${st.fill}" stroke="${hi ? '#c45c26' : st.stroke}" stroke-width="${hi ? 2 : 1.4}"/>`;
      if (letter) {
        cells += `<text x="${x + size / 2}" y="${y + size / 2 + 5}" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="12" font-weight="700" fill="${st.text}">${letter}</text>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${cells}</svg>`;
}

const STARE = [
  { letter: 'S', state: 'absent' },
  { letter: 'T', state: 'absent' },
  { letter: 'A', state: 'present' },
  { letter: 'R', state: 'present' },
  { letter: 'E', state: 'correct' },
];
const BRAIN = [
  { letter: 'B', state: 'absent' },
  { letter: 'R', state: 'present' },
  { letter: 'A', state: 'present' },
  { letter: 'I', state: 'absent' },
  { letter: 'N', state: 'present' },
];
const NEARS = [
  { letter: 'N', state: 'present' },
  { letter: 'E', state: 'present' },
  { letter: 'A', state: 'present' },
  { letter: 'R', state: 'present' },
  { letter: 'S', state: 'absent' },
];
const CRANE = [
  { letter: 'C', state: 'correct' },
  { letter: 'R', state: 'correct' },
  { letter: 'A', state: 'correct' },
  { letter: 'N', state: 'correct' },
  { letter: 'E', state: 'correct' },
];

write('polywordlot/welcome.svg', pwBoard([]));
write('polywordlot/stare.svg', pwBoard([STARE], 0));
write('polywordlot/brain.svg', pwBoard([STARE, BRAIN], 1));
write('polywordlot/nears.svg', pwBoard([STARE, BRAIN, NEARS], 2));
write('polywordlot/crane.svg', pwBoard([STARE, BRAIN, NEARS, CRANE], 3));
write('polywordlot/ready.svg', pwBoard([STARE, BRAIN, NEARS, CRANE]));

write(
  'polywordlot/daily.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" width="260" height="56">
  <rect width="260" height="56" rx="10" fill="#161923"/>
  <rect x="10" y="12" width="78" height="32" rx="8" fill="#1e2230" stroke="#6c8cff" stroke-width="1.5"/>
  <text x="49" y="33" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="13" font-weight="600" fill="#e2e4ec">Daily ▾</text>
  <rect x="98" y="12" width="88" height="32" rx="8" fill="#1e2230" stroke="#2a2e3e"/>
  <text x="142" y="33" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="12" fill="#7a7e94">Practice</text>
  <rect x="196" y="12" width="54" height="32" rx="8" fill="#1e2230" stroke="#2a2e3e"/>
  <text x="223" y="33" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="12" fill="#e2e4ec">today</text>
</svg>`
);

write(
  'polywordlot/calendar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 168" width="200" height="168">
  <rect width="200" height="168" rx="12" fill="#fff"/>
  <text x="100" y="22" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="12" font-weight="700" fill="#1a2330">August 2026</text>
  ${['S','M','T','W','T','F','S'].map((d,i) => `<text x="${22+i*25}" y="42" text-anchor="middle" font-size="9" fill="#7a7e94" font-family="DM Sans, system-ui, sans-serif">${d}</text>`).join('')}
  ${Array.from({length: 31}, (_,i) => {
    const col = (i + 6) % 7;
    const row = Math.floor((i + 6) / 7);
    const x = 10 + col * 25;
    const y = 50 + row * 22;
    const n = i + 1;
    let fill = '#f4f6f8';
    let stroke = '#e2e6ea';
    let color = '#1a2330';
    if (n === 12) { fill = CORRECT; color = '#fff'; stroke = CORRECT; }
    if (n === 15) { fill = PRESENT; color = '#000'; stroke = PRESENT; }
    if (n === 18) { fill = '#fff'; stroke = '#6c8cff'; }
    return `<rect x="${x}" y="${y}" width="20" height="18" rx="4" fill="${fill}" stroke="${stroke}"/><text x="${x+10}" y="${y+13}" text-anchor="middle" font-size="9" font-family="DM Sans, system-ui, sans-serif" fill="${color}">${n}</text>`;
  }).join('')}
</svg>`
);

write(
  'polywordlot/stats.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90" width="220" height="90">
  <rect width="220" height="90" rx="12" fill="#fff"/>
  <rect x="14" y="18" width="28" height="28" rx="8" fill="none" stroke="#6c8cff" stroke-width="2"/>
  <path d="M21 40v-8M28 40v-14M35 40v-5" fill="none" stroke="#6c8cff" stroke-width="2" stroke-linecap="round"/>
  <rect x="56" y="58" width="18" height="18" rx="3" fill="${CORRECT}"/>
  <rect x="80" y="46" width="18" height="30" rx="3" fill="${CORRECT}"/>
  <rect x="104" y="28" width="18" height="48" rx="3" fill="${CORRECT}"/>
  <rect x="128" y="40" width="18" height="36" rx="3" fill="${CORRECT}"/>
  <rect x="152" y="52" width="18" height="24" rx="3" fill="${CORRECT}"/>
  <rect x="176" y="64" width="18" height="12" rx="3" fill="#787c7e"/>
</svg>`
);

write(
  'polywordlot/cross.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90" width="220" height="90">
  <rect width="220" height="90" rx="12" fill="#fff"/>
  <rect x="14" y="18" width="28" height="28" rx="8" fill="none" stroke="#6c8cff" stroke-width="2"/>
  <rect x="18" y="22" width="8" height="8" rx="1.5" fill="none" stroke="#6c8cff" stroke-width="1.6"/>
  <rect x="30" y="22" width="8" height="8" rx="1.5" fill="none" stroke="#6c8cff" stroke-width="1.6"/>
  <rect x="18" y="34" width="8" height="8" rx="1.5" fill="none" stroke="#6c8cff" stroke-width="1.6"/>
  <rect x="30" y="34" width="8" height="8" rx="1.5" fill="none" stroke="#6c8cff" stroke-width="1.6"/>
  <rect x="58" y="28" width="70" height="10" rx="3" fill="#6c8cff"/>
  <rect x="58" y="44" width="52" height="10" rx="3" fill="#8aa0ff"/>
  <rect x="58" y="60" width="88" height="10" rx="3" fill="#6c8cff"/>
  <text x="136" y="37" font-size="9" font-family="DM Sans, system-ui, sans-serif" fill="#4a5568">EN 5</text>
  <text x="118" y="53" font-size="9" font-family="DM Sans, system-ui, sans-serif" fill="#4a5568">RU 5</text>
  <text x="154" y="69" font-size="9" font-family="DM Sans, system-ui, sans-serif" fill="#4a5568">HE 5</text>
</svg>`
);

write(
  'site/map.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 150" width="280" height="150">
  <rect width="280" height="150" rx="12" fill="#6fa8c9"/>
  <path d="M20 90c20-28 48-40 80-38 22 2 30 18 52 16 24-2 38-22 70-20 18 1 32 12 48 8" fill="none" stroke="#3d7a9a" stroke-width="18" stroke-linecap="round"/>
  <path d="M36 70c18-8 28 6 46 4 16-2 22-16 40-12" fill="#8fbfa3" stroke="#5a8a6a" stroke-width="1"/>
  <path d="M150 58c22-4 36 10 58 6 14-2 24-10 40-6" fill="#8fbfa3" stroke="#5a8a6a" stroke-width="1"/>
  <circle cx="168" cy="72" r="7" fill="#c45c26" stroke="#fff" stroke-width="2"/>
  <rect x="176" y="18" width="92" height="64" rx="8" fill="#fff" stroke="rgba(20,35,43,0.14)"/>
  <text x="222" y="36" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">France</text>
  <rect x="186" y="46" width="72" height="22" rx="11" fill="#e8f1f4" stroke="#c45c26"/>
  <text x="222" y="61" text-anchor="middle" font-size="11" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">Français</text>
</svg>`
);

write(
  'site/select.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="240" height="120">
  <rect width="240" height="120" rx="12" fill="#fff"/>
  <text x="16" y="22" font-size="12" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#4a6570">CANADA</text>
  <rect x="16" y="34" width="72" height="26" rx="13" fill="#e8f0d8" stroke="#9eb87a"/>
  <text x="52" y="51" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#1a3a4a">English</text>
  <rect x="96" y="34" width="78" height="26" rx="13" fill="#e8f0d8" stroke="#9eb87a" stroke-width="2"/>
  <text x="135" y="51" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#1a3a4a">Français</text>
  <rect x="16" y="68" width="70" height="22" rx="11" fill="#eef0f2" stroke="#d7dce0"/>
  <text x="51" y="83" text-anchor="middle" font-size="10" fill="#9aa3a8" font-family="Source Sans 3, system-ui, sans-serif">Inuktitut</text>
  <text x="16" y="108" font-size="10" fill="#4a6570" font-family="Source Sans 3, system-ui, sans-serif">Click Français to add French</text>
</svg>`
);

write(
  'site/deselect.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="240" height="120">
  <rect width="240" height="120" rx="12" fill="#fff"/>
  <text x="16" y="22" font-size="12" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#4a6570">CANADA</text>
  <rect x="16" y="34" width="72" height="26" rx="13" fill="#e8f0d8" stroke="#9eb87a"/>
  <text x="52" y="51" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#1a3a4a">English</text>
  <rect x="96" y="34" width="78" height="26" rx="13" fill="#3f5c24" stroke="#3f5c24"/>
  <text x="135" y="51" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#fff">Français</text>
  <rect x="16" y="68" width="70" height="22" rx="11" fill="#eef0f2" stroke="#d7dce0"/>
  <text x="51" y="83" text-anchor="middle" font-size="10" fill="#9aa3a8" font-family="Source Sans 3, system-ui, sans-serif">Inuktitut</text>
  <text x="16" y="108" font-size="10" fill="#4a6570" font-family="Source Sans 3, system-ui, sans-serif">Click Français again to remove it</text>
</svg>`
);

write(
  'site/games.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 150" width="160" height="150">
  <rect width="160" height="150" rx="12" fill="#e8f1f4"/>
  <rect x="36" y="10" width="88" height="62" rx="14" fill="#fff" stroke="rgba(20,35,43,0.14)"/>
  <circle cx="80" cy="32" r="14" fill="#fff" stroke="rgba(20,35,43,0.12)"/>
  <g fill="none" stroke="#1a3a4a" stroke-width="1.4">
    <rect x="73" y="25" width="5" height="5" rx="0.8"/>
    <rect x="79" y="25" width="5" height="5" rx="0.8"/>
    <rect x="85" y="25" width="5" height="5" rx="0.8"/>
    <rect x="73" y="31" width="5" height="5" rx="0.8"/>
    <rect x="79" y="31" width="5" height="5" rx="0.8"/>
    <rect x="85" y="31" width="5" height="5" rx="0.8"/>
  </g>
  <text x="80" y="60" text-anchor="middle" font-size="10" font-weight="600" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">PolyWordlot</text>
  <rect x="36" y="80" width="88" height="62" rx="14" fill="#fff" stroke="rgba(20,35,43,0.14)"/>
  <circle cx="80" cy="102" r="14" fill="#fff" stroke="rgba(20,35,43,0.12)"/>
  <path d="M72 102h10M79 96l7 6-7 6" fill="none" stroke="#1a3a4a" stroke-width="1.6" stroke-linecap="round"/>
  <text x="80" y="130" text-anchor="middle" font-size="10" font-weight="600" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">TransWord</text>
</svg>`
);

write(
  'site/export-import.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141 54" width="141" height="54">
  <rect width="141" height="54" fill="#6fa8c9"/>
  <rect x="16" y="11" width="32" height="32" rx="8" fill="#fff" stroke="rgba(20,35,43,0.16)"/>
  <text x="32" y="33" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="16" font-weight="800" fill="#111">A</text>
  <rect x="54" y="11" width="32" height="32" rx="8" fill="#fff" stroke="rgba(20,35,43,0.16)"/>
  <g transform="translate(62 19) scale(0.67)" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </g>
  <rect x="92" y="11" width="32" height="32" rx="8" fill="#fff" stroke="rgba(20,35,43,0.16)"/>
  <g transform="translate(100 19) scale(0.67)" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </g>
</svg>`
);

write(
  'site/atlas.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 140" width="280" height="140">
  <rect width="280" height="140" rx="12" fill="#6fa8c9"/>
  <path d="M30 78c30-24 70-32 120-22 40 8 70-10 100-4" fill="none" stroke="#3d7a9a" stroke-width="16" stroke-linecap="round"/>
  <path d="M50 64c40-18 90-8 140 4" fill="#8fbfa3" opacity="0.9"/>
  <rect x="40" y="18" width="84" height="44" rx="8" fill="#fff"/>
  <text x="82" y="36" text-anchor="middle" font-size="10" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">Switzerland</text>
  <text x="82" y="52" text-anchor="middle" font-size="9" font-family="Source Sans 3, system-ui, sans-serif" fill="#4a6570">DE · FR · IT · RM</text>
  <rect x="168" y="70" width="84" height="44" rx="8" fill="#fff"/>
  <text x="210" y="88" text-anchor="middle" font-size="10" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">Belgium</text>
  <text x="210" y="104" text-anchor="middle" font-size="9" font-family="Source Sans 3, system-ui, sans-serif" fill="#4a6570">NL · FR · DE</text>
</svg>`
);

write(
  'transword/rules.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 150" width="220" height="150">
  <rect width="220" height="150" rx="12" fill="#0c0e14"/>
  <rect x="50" y="10" width="120" height="28" rx="6" fill="#161923" stroke="#3ddba0" stroke-width="1.5"/>
  <text x="110" y="29" text-anchor="middle" font-size="13" font-weight="700" font-family="DM Mono, monospace" fill="#e2e4ec">COLD</text>
  <path d="M110 42v10" stroke="#2a2e3e" stroke-width="2"/>
  <rect x="158" y="46" width="52" height="16" rx="8" fill="#f0a050"/>
  <text x="184" y="57" text-anchor="middle" font-size="8" font-weight="600" font-family="DM Sans, system-ui, sans-serif" fill="#000">replaced</text>
  <rect x="50" y="54" width="120" height="28" rx="6" fill="#161923" stroke="#2a2e3e"/>
  <text x="110" y="73" text-anchor="middle" font-size="13" font-weight="700" font-family="DM Mono, monospace" fill="#e2e4ec">CORD</text>
  <path d="M110 86v10" stroke="#2a2e3e" stroke-width="2"/>
  <rect x="50" y="98" width="120" height="28" rx="6" fill="#161923" stroke="#6c8cff" stroke-width="1.5"/>
  <text x="110" y="117" text-anchor="middle" font-size="13" font-family="DM Mono, monospace" fill="#7a7e94">type a word…</text>
  <circle cx="178" cy="112" r="9" fill="none" stroke="#6c8cff"/>
  <text x="178" y="116" text-anchor="middle" font-size="12" fill="#6c8cff" font-family="DM Sans, system-ui, sans-serif">?</text>
  <text x="110" y="142" text-anchor="middle" font-size="10" fill="#7a7e94" font-family="DM Sans, system-ui, sans-serif">Target: WARM</text>
</svg>`
);

write(
  'transword/words.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110" width="220" height="110">
  <rect width="220" height="110" rx="12" fill="#161923"/>
  <text x="16" y="24" font-size="11" font-family="DM Mono, monospace" fill="#7a7e94">cold    3</text>
  <text x="16" y="42" font-size="11" font-family="DM Mono, monospace" fill="#e2e4ec">cord    2</text>
  <text x="16" y="60" font-size="11" font-family="DM Mono, monospace" fill="#7a7e94">word    1</text>
  <text x="16" y="78" font-size="11" font-family="DM Mono, monospace" fill="#7a7e94">warm    3</text>
  <text x="16" y="98" font-size="10" font-family="DM Sans, system-ui, sans-serif" fill="#f0a050">frequency ranks — unverified</text>
</svg>`
);

write(
  'transword/difficulty.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" width="260" height="56">
  <rect width="260" height="56" rx="10" fill="#161923"/>
  <rect x="10" y="12" width="118" height="32" rx="8" fill="#1e2230" stroke="#6c8cff"/>
  <text x="69" y="33" text-anchor="middle" font-size="12" font-weight="600" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">Medium (4–5) ▾</text>
  <rect x="138" y="12" width="112" height="32" rx="8" fill="#1e2230" stroke="#2a2e3e"/>
  <text x="194" y="33" text-anchor="middle" font-size="12" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">Standard ▾</text>
</svg>`
);

write(
  'transword/help-undo.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90" width="240" height="90">
  <rect width="240" height="90" rx="12" fill="#0c0e14"/>
  <rect x="28" y="16" width="130" height="32" rx="6" fill="#161923" stroke="#f06068"/>
  <text x="93" y="37" text-anchor="middle" font-size="13" font-weight="700" font-family="DM Mono, monospace" fill="#e2e4ec">CORK</text>
  <circle cx="172" cy="32" r="11" fill="none" stroke="#6c8cff" stroke-width="1.6"/>
  <text x="172" y="36" text-anchor="middle" font-size="14" fill="#6c8cff" font-family="DM Sans, system-ui, sans-serif">↑</text>
  <rect x="28" y="56" width="184" height="22" rx="6" fill="#3a1c22"/>
  <text x="120" y="71" text-anchor="middle" font-size="10" font-family="DM Sans, system-ui, sans-serif" fill="#f06068">Dead end — undo to continue</text>
</svg>`
);

write(
  'transword/calendar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70" width="240" height="70">
  <rect width="240" height="70" rx="10" fill="#161923"/>
  <rect x="12" y="19" width="78" height="32" rx="8" fill="#1e2230" stroke="#6c8cff"/>
  <text x="51" y="40" text-anchor="middle" font-size="12" font-weight="600" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">Daily ▾</text>
  <rect x="100" y="19" width="128" height="32" rx="8" fill="#1e2230" stroke="#2a2e3e"/>
  <text x="164" y="40" text-anchor="middle" font-size="12" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">📅 today</text>
</svg>`
);

write(
  'transword/settings.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 56" width="240" height="56">
  <rect width="240" height="56" rx="10" fill="#161923"/>
  <rect x="16" y="16" width="18" height="18" rx="4" fill="#6c8cff"/>
  <path d="M20 25l4 4 8-9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  <text x="42" y="30" font-size="13" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">Time</text>
  <rect x="118" y="16" width="18" height="18" rx="4" fill="#1e2230" stroke="#2a2e3e"/>
  <text x="144" y="30" font-size="13" font-family="DM Sans, system-ui, sans-serif" fill="#7a7e94">Optimal</text>
</svg>`
);

write('polyhydra/boards.svg', pwBoard([STARE, BRAIN], 1));

write(
  'polyhydra/scoreboard.svg',
  (() => {
    const w = 260;
    const h = 78;
    const cells = [
      { id: 1, solved: true, word: 'CRANE', attempt: 4 },
      { id: 2, solved: true, word: 'STARE', attempt: 6 },
      { id: 3, g: 2, y: 3 },
      { id: 4, g: 0, y: 0 },
      { id: 5, g: 0, y: 2, inView: true },
    ];
    const gap = 4;
    const pad = 10;
    const cellW = (w - pad * 2 - gap * (cells.length - 1)) / cells.length;
    const cellH = 30;
    const cy = 30;
    const mix = (g, y) => {
      if (g + y <= 0) return { fill: '#fff', text: '#111' };
      if (g > 0 && y === 0) return { fill: g >= 3 ? '#4a9a52' : '#8fbf8f', text: g >= 3 ? '#fff' : '#111' };
      if (y > 0 && g === 0) return { fill: y >= 3 ? PRESENT : '#fff3a3', text: '#111' };
      return { fill: '#d4c44a', text: '#111' };
    };
    let out = '';
    cells.forEach((cell, i) => {
      const x = pad + i * (cellW + gap);
      const solved = Boolean(cell.solved);
      const fill = solved ? CORRECT : mix(cell.g, cell.y).fill;
      const text = solved ? '#fff' : mix(cell.g, cell.y).text;
      out += `<rect x="${x}" y="${cy}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" stroke="${cell.inView ? '#fff' : 'rgba(0,0,0,0.12)'}" stroke-width="${cell.inView ? 2 : 1}"/>`;
      if (solved) {
        out += `<text x="${x + cellW / 2}" y="${cy - 6}" text-anchor="middle" font-size="10" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#fff" letter-spacing="-0.3">${cell.word}</text>`;
      }
      const idX = x + 4;
      const idY = cy + 8;
      out += `<rect x="${idX}" y="${idY}" width="12" height="13" rx="2" fill="none" stroke="${text}"/>`;
      out += `<text x="${idX + 6}" y="${idY + 10.5}" text-anchor="middle" font-size="9" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="${text}">${cell.id}</text>`;
      if (solved) {
        const cx = x + cellW - 11;
        const rcy = cy + cellH / 2;
        out += `<circle cx="${cx}" cy="${rcy}" r="7.5" fill="none" stroke="#fff"/>`;
        out += `<text x="${cx}" y="${rcy + 3.5}" text-anchor="middle" font-size="9" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#fff">${cell.attempt}</text>`;
      } else {
        out += `<text x="${x + cellW - 5}" y="${cy + 20}" text-anchor="end" font-size="11" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="${text}">${cell.g}/${cell.y}</text>`;
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" rx="10" fill="#0c0e14"/>
  ${out}
</svg>`;
  })()
);

function hydraScoreStrip(count, cell, gap, ox, oy) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const fill = i === 6 ? PRESENT : i === 7 ? CORRECT : i % 5 === 0 ? '#fff8c8' : '#fff';
    const x = ox + i * (cell + gap);
    out += `<rect x="${x}" y="${oy}" width="${cell}" height="${cell}" rx="2" fill="${fill}" stroke="#c4c7ca"/>`;
    out += `<text x="${x + cell / 2}" y="${oy + cell / 2 + 2.4}" text-anchor="middle" font-size="5" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#111">${i + 1}</text>`;
  }
  return out;
}

function hydraCell(x, y, size, fill, stroke, letter, textFill) {
  let out = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="2.5" fill="${fill}" stroke="${stroke}"/>`;
  if (letter) {
    const fs = Math.max(8, Math.round(size * 0.52));
    out += `<text x="${x + size / 2}" y="${y + size / 2 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="${textFill}">${letter}</text>`;
  }
  return out;
}

write(
  'polyhydra/welcome.svg',
  (() => {
    const w = 200;
    const h = 348;
    const hdr = 30;
    let out = '';
    out += `<rect width="${w}" height="${h}" rx="10" fill="#6fa8c9"/>`;
    out += `<rect width="${w}" height="${hdr}" fill="#0c0e14"/>`;
    out += `<circle cx="14" cy="15" r="8" fill="#fff"/><text x="14" y="18.5" text-anchor="middle" font-size="9" font-weight="800" font-family="Fraunces, Georgia, serif" fill="#111">W</text>`;
    out += `<text x="26" y="19" font-size="9" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#6c8cff">Hydra</text>`;
    out += `<text x="100" y="20" text-anchor="middle" font-size="12" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">16/21</text>`;
    const sbY = hdr + 3;
    const sbPad = 4;
    const sbGap = 1;
    const sbW = (w - sbPad * 2 - sbGap * 15) / 16;
    const sbH = 11;
    for (let i = 0; i < 16; i++) {
      const x = sbPad + i * (sbW + sbGap);
      out += `<rect x="${x}" y="${sbY}" width="${sbW}" height="${sbH}" rx="1.5" fill="#fff"/>`;
      out += `<text x="${x + sbW / 2}" y="${sbY + 8.2}" text-anchor="middle" font-size="5.5" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#111">${i + 1}</text>`;
    }
    out += `<text x="${w / 2}" y="58" text-anchor="middle" font-size="9" fill="#14232b">↑</text>`;
    out += `<text x="${w / 2}" y="70" text-anchor="middle" font-size="10" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#14232b">1</text>`;
    const cols = 5;
    const rows = 8;
    const size = 16;
    const gap = 2.5;
    const ox = (w - (cols * size + (cols - 1) * gap)) / 2;
    const oy = 76;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out += hydraCell(ox + c * (size + gap), oy + r * (size + gap), size, '#fff', '#c4c7ca', '', '#111');
      }
    }
    out += `<text x="10" y="150" font-size="16" fill="#14232b">‹</text>`;
    out += `<text x="${w - 10}" y="150" text-anchor="end" font-size="16" fill="#14232b">›</text>`;
    const dockY = 230;
    out += `<rect y="${dockY}" width="${w}" height="${h - dockY}" fill="#0c0e14"/>`;
    const picks = [
      { x: 6, w: 52, t: 'English' },
      { x: 62, w: 28, t: '5' },
      { x: 94, w: 32, t: '16' },
      { x: 148, w: 46, t: 'today' },
    ];
    picks.forEach((p) => {
      out += `<rect x="${p.x}" y="${dockY + 6}" width="${p.w}" height="16" rx="8" fill="#1e2230"/>`;
      out += `<text x="${p.x + p.w / 2}" y="${dockY + 17}" text-anchor="middle" font-size="8" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">${p.t}</text>`;
    });
    const keys = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    keys.forEach((row, ri) => {
      const kw = 16;
      const kg = 1.5;
      const rowW = row.length * kw + (row.length - 1) * kg;
      const kx = (w - rowW) / 2;
      const ky = dockY + 30 + ri * 20;
      [...row].forEach((k, i) => {
        out += `<rect x="${kx + i * (kw + kg)}" y="${ky}" width="${kw}" height="17" rx="3" fill="#d3d6da"/>`;
        out += `<text x="${kx + i * (kw + kg) + kw / 2}" y="${ky + 12}" text-anchor="middle" font-size="7" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#111">${k}</text>`;
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out}</svg>`;
  })()
);

const STD_ROWS = [
  [
    { letter: 'S', state: 'absent' },
    { letter: 'T', state: 'absent' },
    { letter: 'A', state: 'present' },
    { letter: 'R', state: 'present' },
    { letter: 'E', state: 'correct' },
  ],
  [
    { letter: 'B', state: 'absent' },
    { letter: 'R', state: 'present' },
    { letter: 'A', state: 'present' },
    { letter: 'I', state: 'absent' },
    { letter: 'N', state: 'present' },
  ],
  [
    { letter: 'C', state: 'absent' },
    { letter: 'R', state: 'absent' },
    { letter: 'A', state: 'present' },
    { letter: 'S', state: 'absent' },
    { letter: 'S', state: 'absent' },
  ],
];

write(
  'polyhydra/standard.svg',
  (() => {
    const w = 260;
    const h = 148;
    const size = 22;
    const gap = 3;
    const cols = 5;
    const visible = 6;
    const ox = (w - (cols * size + (cols - 1) * gap)) / 2;
    const oy = 8;
    let cells = '';
    for (let r = 0; r < visible; r++) {
      for (let c = 0; c < cols; c++) {
        const ev = STD_ROWS[r]?.[c];
        const st = ev ? CELL[ev.state] : CELL.empty;
        cells += hydraCell(ox + c * (size + gap), oy + r * (size + gap), size, st.fill, st.stroke, ev?.letter || '', st.text);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" rx="12" fill="#6fa8c9"/>
  ${cells}
  <text x="28" y="78" font-size="18" fill="#14232b">‹</text>
  <text x="232" y="78" font-size="18" fill="#14232b">›</text>
  <defs><linearGradient id="stdFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fa8c9" stop-opacity="0"/><stop offset="1" stop-color="#6fa8c9" stop-opacity="0.95"/></linearGradient></defs>
  <rect x="0" y="118" width="${w}" height="30" fill="url(#stdFade)"/>
</svg>`;
  })()
);

write(
  'polyhydra/summary.svg',
  (() => {
    const w = 260;
    const h = 148;
    const size = 16;
    const gap = 2.5;
    const cols = 5;
    const ox = (w - (cols * size + (cols - 1) * gap)) / 2;
    const known = [
      [
        { letter: '', state: 'empty' },
        { letter: 'A', state: 'present' },
        { letter: '', state: 'present' },
        { letter: '', state: 'present' },
        { letter: '', state: 'empty' },
      ],
      [
        { letter: '', state: 'empty' },
        { letter: 'R', state: 'present' },
        { letter: '', state: 'empty' },
        { letter: '', state: 'empty' },
        { letter: '', state: 'empty' },
      ],
      Array(5).fill(null),
      Array(5).fill(null),
      Array(5).fill(null),
    ];
    const prev = [
      { letter: 'C', state: 'absent' },
      { letter: 'R', state: 'present' },
      { letter: 'A', state: 'present' },
      { letter: 'S', state: 'absent' },
      { letter: 'S', state: 'absent' },
    ];
    let cells = '';
    known.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        const ev = row[c];
        const st = ev && ev.state !== 'empty' ? CELL[ev.state] : CELL.empty;
        cells += hydraCell(ox + c * (size + gap), 4 + r * (size + gap), size, st.fill, st.stroke, ev?.letter || '', st.text);
      }
    });
    const prevY = 4 + 5 * (size + gap) + 10;
    prev.forEach((ev, c) => {
      const st = CELL[ev.state];
      cells += hydraCell(ox + c * (size + gap), prevY, size, st.fill, st.stroke, ev.letter, st.text);
    });
    const entryY = prevY + size + 6;
    for (let c = 0; c < cols; c++) {
      cells += hydraCell(ox + c * (size + gap), entryY, size, '#fff', '#c4c7ca', '', '#111');
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" rx="12" fill="#6fa8c9"/>
  ${cells}
  <text x="130" y="${prevY - 1}" text-anchor="middle" font-size="12" fill="#14232b">↓</text>
</svg>`;
  })()
);

write(
  'polyhydra/keyboard.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 70" width="260" height="70">
  <rect width="260" height="70" rx="10" fill="#161923"/>
  ${'QWERTYUIOP'.split('').map((k, i) => {
    const used = 'STARE'.includes(k);
    return `<rect x="${8 + i * 25}" y="18" width="22" height="34" rx="5" fill="${used ? '#9aa0a6' : '#d3d6da'}"/><text x="${19 + i * 25}" y="40" text-anchor="middle" font-size="11" font-weight="700" font-family="DM Sans, system-ui, sans-serif">${k}</text>`;
  }).join('')}
</svg>`
);

write(
  'polyhydra/invalid.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 44" width="160" height="44">
  <rect width="260" height="44" rx="8" fill="#6fa8c9"/>
  ${'ZZZZZ'.split('').map((k, i) => `<rect x="${10 + i * 28}" y="8" width="24" height="28" rx="4" fill="#c62828"/><text x="${22 + i * 28}" y="27" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="DM Sans, system-ui, sans-serif">${k}</text>`).join('')}
</svg>`
);

write(
  'polyhydra/attempts.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 48" width="260" height="48">
  <rect width="260" height="48" rx="10" fill="#0c0e14"/>
  <circle cx="22" cy="24" r="11" fill="#fff"/>
  <text x="22" y="28" text-anchor="middle" font-size="12" font-weight="800" font-family="Fraunces, Georgia, serif" fill="#111">W</text>
  <text x="40" y="28" font-size="11" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#6c8cff">Hydra</text>
  <text x="130" y="30" text-anchor="middle" font-size="16" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec" letter-spacing="0.6">16/21</text>
  <g fill="none" stroke="#e2e4ec" stroke-width="1.8" stroke-linecap="round">
    <line x1="232" y1="32" x2="232" y2="20"/>
    <line x1="240" y1="32" x2="240" y2="16"/>
    <line x1="248" y1="32" x2="248" y2="24"/>
  </g>
</svg>`
);

write(
  'polyhydra/calendar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 56" width="200" height="56">
  <rect width="200" height="56" rx="10" fill="#161923"/>
  <rect x="16" y="12" width="168" height="32" rx="8" fill="#1e2230" stroke="#6c8cff"/>
  <text x="100" y="33" text-anchor="middle" font-size="13" font-family="DM Sans, system-ui, sans-serif" fill="#e2e4ec">📅 today</text>
</svg>`
);

write(
  'polyhydra/stats.svg',
  (() => {
    const w = 260;
    const h = 148;
    const WIN = '#2d7a36';
    const LOST = '#c62828';
    const PLUS3 = '#1b5e20';
    const PLUS4 = '#66bb6a';
    const PLUS5 = '#fdd835';
    const barX = 72;
    const barW = 154;
    const barH = 18;
    const totalX = 248;
    const swatch = (x, y, fill, label, tw, dark) =>
      `<rect x="${x}" y="${y}" width="${tw}" height="12" rx="2" fill="${fill}"/>` +
      `<text x="${x + tw / 2}" y="${y + 9.2}" text-anchor="middle" font-size="7" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="${dark ? '#123318' : '#fff'}">${label}</text>`;
    const hbar = (y, segs) => {
      const sum = segs.reduce((s, seg) => s + seg.n, 0);
      let x = barX;
      let out = `<rect x="${barX}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="rgba(0,0,0,0.08)"/>`;
      segs.forEach((seg) => {
        const ww = (seg.n / sum) * barW;
        out += `<rect x="${x}" y="${y}" width="${ww}" height="${barH}" fill="${seg.fill}"/>`;
        if (ww >= 18) {
          out += `<text x="${x + ww / 2}" y="${y + 13}" text-anchor="middle" font-size="8" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="${seg.dark ? '#4a3c00' : '#fff'}">${seg.label}</text>`;
        }
        x += ww;
      });
      return out;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" rx="12" fill="#6fa8c9"/>
  <text x="10" y="16" font-size="12" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#1a2330">Statistics</text>
  ${swatch(92, 6, WIN, 'Win', 22, false)}
  ${swatch(116, 6, LOST, 'Lost', 26, false)}
  ${swatch(144, 6, PLUS3, '+3', 18, false)}
  ${swatch(164, 6, PLUS4, '+4', 18, true)}
  ${swatch(184, 6, PLUS5, '+5', 18, true)}
  ${swatch(204, 6, LOST, 'loss', 26, false)}
  <text x="10" y="40" font-size="9" font-weight="600" font-family="DM Sans, system-ui, sans-serif" fill="#1a2330">All games</text>
  ${hbar(28, [
    { n: 8, fill: WIN, label: '67%', dark: false },
    { n: 4, fill: LOST, label: '33%', dark: false },
  ])}
  <text x="${totalX}" y="41" text-anchor="end" font-size="11" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#1a2330">12</text>
  <rect x="10" y="54" width="62" height="16" rx="3" fill="#000"/>
  <text x="41" y="65.5" text-anchor="middle" font-size="9" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#fff">16 boards</text>
  <rect x="${barX}" y="76" width="130" height="16" rx="3" fill="#1a4d8f"/>
  <text x="${barX + 6}" y="87.5" font-size="8" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#fff">Rare Achievements: +0: 1 time</text>
  <text x="10" y="114" font-size="9" font-weight="600" font-family="DM Sans, system-ui, sans-serif" fill="#1a2330">5 letters</text>
  ${hbar(102, [
    { n: 2, fill: PLUS3, label: '2', dark: false },
    { n: 3, fill: PLUS4, label: '3', dark: true },
    { n: 2, fill: PLUS5, label: '2', dark: true },
    { n: 1, fill: LOST, label: '1', dark: false },
  ])}
  <text x="${totalX}" y="115" text-anchor="end" font-size="11" font-weight="700" font-family="DM Sans, system-ui, sans-serif" fill="#1a2330">8</text>
</svg>`;
  })()
);

console.log('Wrote help screenshots to public/help/');
