import { combineTotals } from './stats-combine.js';
import { STATS_GAMES } from './stats-games.js';
import languageCatalog from '../word-data/languages.json' with { type: 'json' };

const LANGUAGE_MENU = new Map(languageCatalog.map((row) => [row.code, row.menu]));

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

  const gameCells = (counts) =>
    STATS_GAMES.map((g) => `  <td class="n">${esc(counts[g.id] ?? 0)}</td>`).join('\n');

  const bodyRows = rows
    .map((r, i) => {
      const langCodes = r.languageCodes || [];
      const langTip = langCodes.map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
      return `<tr>
  <td>${tipCell(r.ip, r.perms || 'No game permutations', `perm-${i}`)}</td>
  <td>${esc(r.location)}</td>
  <td class="n">${esc(r.addrs)}</td>
  <td class="n">${tipCell(String(r.languages), langTip, `lang-${i}`)}</td>
  <td class="n">${esc(r.games)}</td>
${gameCells(r.byGame || {})}
  <td class="n">${esc(r.homeHits)}</td>
</tr>`;
    })
    .join('\n');

  const totalLangTip = (totals.languageCodes || []).map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
  const totalRow = rows.length
    ? `<tr class="total">
  <td>(${rows.length} networks)</td>
  <td></td>
  <td class="n">${esc(totals.addrs)}</td>
  <td class="n">${tipCell(String(totals.languages), totalLangTip, 'lang-total')}</td>
  <td class="n">${esc(totals.games)}</td>
${gameCells(totals.byGame || {})}
  <td class="n">${esc(totals.homeHits)}</td>
</tr>`
    : '';

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
    body { font: 14px/1.4 system-ui, sans-serif; margin: 1rem; }
    h1 { font-size: 1.15rem; margin: 0 0 0.75rem; }
    form { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: end; margin-bottom: 1rem; }
    label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent); vertical-align: top; }
    th { font-size: 12px; }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
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
  <h1>Stats</h1>
  <form method="get" action="/stats">
    <label>From (UTC)<input type="date" name="from" value="${esc(from)}"/></label>
    <label>To (UTC)<input type="date" name="to" value="${esc(to)}"/></label>
    <button type="submit">Apply</button>
    <a href="/stats">All time</a>
  </form>
  <p class="note">Hours are UTC. Location is country · city, region (and ISP). Languages is how many distinct language codes appear in games from that IP. Hover or tap an IP for permutation keys, or a language count for those codes. GET /api/stats is the raw 24h JSON dump.</p>
  ${notice}
  <table>
    <thead>
      <tr>
        <th>IP</th>
        <th>location</th>
        <th class="n">addrs</th>
        <th class="n">languages</th>
        <th class="n">games</th>
${STATS_GAMES.map((g) => `        <th class="n">${esc(g.id)}</th>`).join('\n')}
        <th class="n">homeHits</th>
      </tr>
    </thead>
    <tbody>
${bodyRows || `<tr><td colspan="${6 + STATS_GAMES.length}">No rows in this range.</td></tr>`}
${totalRow}
    </tbody>
  </table>
</body>
</html>
`;
}
