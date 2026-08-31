import { combineTotals } from './stats-combine.js';
import { STATS_GAMES } from './stats-games.js';
import languageCatalog from '../word-data/languages.json' with { type: 'json' };

const LANGUAGE_MENU = new Map(languageCatalog.map((row) => [row.code, row.menu]));

/** @typedef {{ key: string, label: string, type: 'text' | 'num' }} StatsColumn */

/** @type {StatsColumn[]} */
const COLUMNS = [
  { key: 'ip', label: 'IP', type: 'text' },
  { key: 'location', label: 'location', type: 'text' },
  { key: 'addrs', label: 'addrs', type: 'num' },
  { key: 'languages', label: 'languages', type: 'num' },
  { key: 'games', label: 'games', type: 'num' },
  ...STATS_GAMES.map((g) => ({ key: g.id, label: g.id, type: /** @type {'num'} */ ('num') })),
  { key: 'homeHits', label: 'homeHits', type: 'num' },
];

/**
 * @param {string} value
 */
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} visible
 * @param {string} tipText
 * @param {string} tipId
 */
function tipCell(visible, tipText, tipId) {
  if (!tipText) return esc(visible);
  return `<span class="tip-cell"><button type="button" class="tip-trigger" aria-describedby="${tipId}" title="${esc(
    tipText
  )}">${esc(visible)}</button><span id="${tipId}" class="tip" role="tooltip">${esc(tipText)}</span></span>`;
}

/**
 * @param {StatsColumn} col
 * @param {import('./stats-combine.js').StatsRow} row
 */
function columnSortValue(col, row) {
  if (col.key === 'ip') return row.ip;
  if (col.key === 'location') return row.location || '';
  if (col.key === 'addrs') return row.addrs;
  if (col.key === 'languages') return row.languages;
  if (col.key === 'games') return row.games;
  if (col.key === 'homeHits') return row.homeHits;
  return row.byGame?.[col.key] ?? 0;
}

/**
 * @param {StatsColumn} col
 * @param {import('./stats-combine.js').StatsRow} row
 * @param {number} index
 */
function columnDisplay(col, row, index) {
  const langCodes = row.languageCodes || [];
  const langTip = langCodes.map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
  if (col.key === 'ip') return tipCell(row.ip, row.perms || 'No game permutations', `perm-${index}`);
  if (col.key === 'location') return esc(row.location);
  if (col.key === 'languages') return tipCell(String(row.languages), langTip, `lang-${index}`);
  if (col.key === 'addrs') return esc(row.addrs);
  if (col.key === 'games') return esc(row.games);
  if (col.key === 'homeHits') return esc(row.homeHits);
  return esc(row.byGame?.[col.key] ?? 0);
}

/**
 * @param {StatsColumn} col
 * @param {ReturnType<typeof combineTotals>} totals
 * @param {number} networkCount
 */
function totalDisplay(col, totals, networkCount) {
  const totalLangTip = (totals.languageCodes || []).map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
  if (col.key === 'ip') return esc(`(${networkCount} networks)`);
  if (col.key === 'location') return '';
  if (col.key === 'languages') return tipCell(String(totals.languages), totalLangTip, 'lang-total');
  if (col.key === 'addrs') return esc(totals.addrs);
  if (col.key === 'games') return esc(totals.games);
  if (col.key === 'homeHits') return esc(totals.homeHits);
  return esc(totals.byGame?.[col.key] ?? 0);
}

/**
 * @param {StatsColumn} col
 * @param {string} inner
 * @param {string | number} sortValue
 */
function dataCell(col, inner, sortValue) {
  const cls = col.type === 'num' ? ' class="n"' : '';
  return `<td${cls} data-sort="${esc(sortValue)}">${inner}</td>`;
}

const SORT_SCRIPT = `(function () {
  var table = document.getElementById('stats-table');
  if (!table || !table.tHead || !table.tBodies[0]) return;
  var tbody = table.tBodies[0];
  var headers = table.tHead.querySelectorAll('th[data-type]');
  var currentCol = 0;
  var currentDir = 1;

  function cellKey(row, index, type) {
    var cell = row.cells[index];
    var raw = cell ? cell.getAttribute('data-sort') : '';
    if (raw == null) raw = '';
    if (type === 'num') {
      var n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    return raw;
  }

  function sortBy(index, type, dir) {
    var rows = Array.prototype.slice.call(tbody.rows).filter(function (row) {
      return row.getAttribute('data-empty') !== '1';
    });
    if (!rows.length) return;
    rows.sort(function (a, b) {
      var av = cellKey(a, index, type);
      var bv = cellKey(b, index, type);
      var cmp;
      if (type === 'num') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp === 0) cmp = cellKey(a, 0, 'text').localeCompare(cellKey(b, 0, 'text'), undefined, { numeric: true });
      return cmp * dir;
    });
    for (var i = 0; i < rows.length; i++) tbody.appendChild(rows[i]);
  }

  Array.prototype.forEach.call(headers, function (th, index) {
    var type = th.getAttribute('data-type') || 'text';
    var btn = th.querySelector('button.sort');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var firstDir = type === 'num' ? -1 : 1;
      var dir = currentCol === index ? -currentDir : firstDir;
      currentCol = index;
      currentDir = dir;
      sortBy(index, type, dir);
      Array.prototype.forEach.call(headers, function (h) { h.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
    });
  });
})();`;

/**
 * @param {{
 *   rows: import('./stats-combine.js').StatsRow[],
 *   from?: string,
 *   to?: string,
 *   backfillRemaining?: number,
 * }} opts
 */
export function renderStatsHtml(opts) {
  const rows = opts.rows || [];
  const totals = combineTotals(rows);
  const from = opts.from || '';
  const to = opts.to || '';
  const remaining = opts.backfillRemaining || 0;

  const bodyRows = rows
    .map((r, i) => {
      const cells = COLUMNS.map((col) => dataCell(col, columnDisplay(col, r, i), columnSortValue(col, r))).join(
        '\n'
      );
      return `<tr>\n${cells}\n</tr>`;
    })
    .join('\n');

  const totalRow = rows.length
    ? `<tr class="total">
${COLUMNS.map((col) => dataCell(col, totalDisplay(col, totals, rows.length), '')).join('\n')}
</tr>`
    : '';

  const headerRow = COLUMNS.map((col, i) => {
    const cls = col.type === 'num' ? ' class="n"' : '';
    const aria = i === 0 ? ' aria-sort="ascending"' : '';
    return `        <th${cls} data-type="${col.type}"${aria}><button type="button" class="sort">${esc(col.label)}</button></th>`;
  }).join('\n');

  const notice = remaining
    ? `<p class="note">Still loading ${remaining} archived hour${remaining === 1 ? '' : 's'} from storage. Refresh shortly.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Wordaholic stats</title>
  <style>
    :root { color-scheme: light dark; }
    html, body { height: 100%; }
    body {
      font: 14px/1.4 system-ui, sans-serif;
      margin: 0;
      padding: 1rem;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .stats-chrome { flex: 0 0 auto; }
    .stats-table-wrap { flex: 1; min-height: 0; overflow: auto; }
    h1 { font-size: 1.15rem; margin: 0 0 0.75rem; }
    form { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: end; margin-bottom: 1rem; }
    label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 12px; }
    table { border-collapse: separate; border-spacing: 0; width: 100%; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent); vertical-align: top; }
    th { font-size: 12px; }
    thead th {
      position: sticky;
      top: 0;
      z-index: 3;
      background: Canvas;
      box-shadow: inset 0 -1px 0 color-mix(in srgb, currentColor 18%, transparent);
    }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
    th button.sort {
      background: none; border: 0; padding: 0; font: inherit; color: inherit;
      cursor: pointer; text-align: inherit; width: 100%;
    }
    th.n button.sort { text-align: right; }
    th[aria-sort="ascending"] button.sort::after { content: " \\25B2"; font-size: 0.7em; }
    th[aria-sort="descending"] button.sort::after { content: " \\25BC"; font-size: 0.7em; }
    tr.total { font-weight: 600; }
    tbody tr:hover, tbody tr:focus-within { position: relative; z-index: 5; }
    .note { color: color-mix(in srgb, currentColor 70%, transparent); font-size: 13px; }
    .tip-cell { position: relative; display: inline-block; }
    .tip-trigger { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: help; text-decoration: underline dotted; text-underline-offset: 0.2em; }
    .tip {
      display: none;
      position: absolute;
      left: 0;
      bottom: calc(100% + 0.25rem);
      z-index: 6;
      max-width: min(24rem, 80vw);
      width: max-content;
      padding: 0.4rem 0.55rem;
      background: Canvas;
      color: CanvasText;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      box-shadow: 0 4px 16px color-mix(in srgb, currentColor 18%, transparent);
      white-space: pre;
      font-size: 12px;
      font-weight: 400;
      pointer-events: none;
    }
    td.n .tip { left: auto; right: 0; }
    .tip-cell:hover .tip, .tip-cell:focus-within .tip { display: block; }
  </style>
</head>
<body>
  <div class="stats-chrome">
    <h1>Stats</h1>
    <form method="get" action="/stats">
      <label>From (UTC)<input type="date" name="from" value="${esc(from)}"/></label>
      <label>To (UTC)<input type="date" name="to" value="${esc(to)}"/></label>
      <button type="submit">Apply</button>
      <a href="/stats">All time</a>
    </form>
    <p class="note">Hours are UTC. Location is country · city, region (and ISP). Languages is how many distinct language codes appear in games from that IP. Hover or tap an IP for permutation keys, or a language count for those codes. Click a column header to sort (numeric columns start high-to-low). GET /api/stats is the raw 24h JSON dump.</p>
    ${notice}
  </div>
  <div class="stats-table-wrap">
  <table id="stats-table">
    <thead>
      <tr>
${headerRow}
      </tr>
    </thead>
    <tbody>
${bodyRows || `<tr data-empty="1"><td colspan="${COLUMNS.length}">No rows in this range.</td></tr>`}
    </tbody>
    ${totalRow ? `<tfoot>\n${totalRow}\n    </tfoot>` : ''}
  </table>
  </div>
  <script>${SORT_SCRIPT}</script>
</body>
</html>
`;
}
