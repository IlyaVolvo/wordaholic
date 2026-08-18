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
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 88" width="220" height="88">
  <rect width="220" height="88" rx="12" fill="#e8f1f4"/>
  <rect x="28" y="14" width="36" height="36" rx="8" fill="#fff" stroke="rgba(20,35,43,0.16)"/>
  <g transform="translate(38 24) scale(0.67)" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </g>
  <text x="46" y="70" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">Export</text>
  <rect x="156" y="14" width="36" height="36" rx="8" fill="#fff" stroke="rgba(20,35,43,0.16)"/>
  <g transform="translate(166 24) scale(0.67)" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </g>
  <text x="174" y="70" text-anchor="middle" font-size="11" font-weight="700" font-family="Source Sans 3, system-ui, sans-serif" fill="#14232b">Import</text>
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

console.log('Wrote help screenshots to public/help/');
