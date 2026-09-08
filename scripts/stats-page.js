import {
  combineTotals,
  formatCountry,
  groupStatsRows,
  parseStatsGroup,
  parseStatsTab,
  parseTrendInterval,
  parseTrendsView,
  TREND_INTERVALS,
} from './stats-combine.js';
import { STATS_GAMES, STATS_GAME_IDS } from './stats-games.js';
import languageCatalog from '../word-data/languages.json' with { type: 'json' };

const LANGUAGE_MENU = new Map(languageCatalog.map((row) => [row.code, row.menu]));

const STATS_HELP =
  'Hours are UTC. Location is country · city, region (and ISP).\n' +
  'Languages is how many distinct language codes appear in games from that IP.\n' +
  'Hover or tap an IP for permutation keys, or a language count for those codes.\n' +
  'Click a column header to sort (numeric columns start high-to-low).\n' +
  'Numeric filters keep rows with a count greater than the value (default 0; use -1 to include zeros).\n' +
  'Homehits only keeps networks with home hits and no games, including polywordlot, transword, and polyhydra. Those count filters are disabled while it is checked. Unchecked, it has no effect. Country, place, and ISP still apply.\n' +
  'Place and ISP match any part of the name; multiple words all have to match. Filters apply as you change them.\n' +
  'Group on Totals rolls the same filtered networks up by country or city. City is country plus city; a missing city stays in that country as city unknown. Unknown geo is one Unknown row.\n' +
  'Grouped languages are the union of codes, not a sum of counts. Click a country or city to filter to it and return to Network.\n' +
  'City totals follow coarse IP geo (Starlink often Seattle, T-Mobile San Francisco).\n' +
  'Export CSV downloads the rows currently visible under those filters (not the totals row).\n' +
  'Clear filters also clears the From/To dates and reloads the range. Group is unchanged.\n' +
  'Use the arrow on the Totals/Trends row to hide or show the filter controls.\n' +
  'Trends shows activity by hour, day, week, or month for the From/To window (empty = all available).\n' +
  'Under Trends, Table is the numeric grid; Graph plots games total and each game as separate colored lines (hover for values).\n' +
  'GET /api/stats is the raw 24h JSON dump.';

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

const GT_KEYS = ['languages', 'games', ...STATS_GAMES.map((g) => g.id)];
const HOME_GT_OFF = ['games', ...STATS_GAMES.map((g) => g.id)];
const GT_MAX = 9999;
const GT_MIN = -1;
const GROUP_OPTIONS = [
  { id: 'network', label: 'Network' },
  { id: 'country', label: 'Country' },
  { id: 'city', label: 'City' },
];

/**
 * @param {'network' | 'country' | 'city'} group
 * @returns {StatsColumn[]}
 */
function totalsColumns(group) {
  if (group === 'network') return COLUMNS;
  return [
    { key: 'label', label: group === 'country' ? 'country' : 'city', type: 'text' },
    { key: 'networks', label: 'networks', type: 'num' },
    ...COLUMNS.slice(2),
  ];
}

/** @type {StatsColumn[]} */
const TREND_COLUMNS = [
  { key: 'bucket', label: 'interval', type: 'text' },
  { key: 'games', label: 'games', type: 'num' },
  ...STATS_GAMES.map((g) => ({ key: g.id, label: g.id, type: /** @type {'num'} */ ('num') })),
];

/** Line colors for Trends graph (total + each game). */
const TREND_SERIES_COLORS = {
  games: '#2563eb',
  polywordlot: '#0d9488',
  transword: '#c2410c',
  polyhydra: '#7c3aed',
};

/**
 * @param {number} n
 */
function trendCell(n) {
  const v = Number(n) || 0;
  return v > 0 ? esc(String(v)) : '';
}

/**
 * @param {string} value
 */
function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Partial, case-insensitive match. Space-separated tokens are ANDed.
 * Hyphens/punctuation are ignored so "t mobile" matches "T-Mobile".
 *
 * @param {string} haystack
 * @param {string} query
 */
export function smartMatch(haystack, query) {
  const q = foldText(query).trim();
  if (!q) return true;
  const hayFold = foldText(haystack);
  const hayComp = hayFold.replace(/[^a-z0-9]+/g, '');
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    const tokComp = tok.replace(/[^a-z0-9]+/g, '');
    if (hayFold.includes(tok)) continue;
    if (tokComp.length >= 2 && hayComp.includes(tokComp)) continue;
    return false;
  }
  return true;
}

/**
 * @param {URLSearchParams | { get?: Function, has?: Function } | null | undefined} params
 * @param {string} key
 * @param {number | null} whenMissing
 * @returns {number | null}
 */
function parseGt(params, key, whenMissing) {
  if (!params || typeof params.has !== 'function' || !params.has(key)) return whenMissing;
  const raw = String(params.get(key) ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return whenMissing;
  if (n > GT_MAX) return GT_MAX;
  if (n < GT_MIN) return GT_MIN;
  return n;
}

/**
 * @param {import('./stats-combine.js').StatsRow} row
 * @param {string} key
 */
function gtValue(row, key) {
  if (key === 'languages') return row.languages;
  if (key === 'games') return row.games;
  return row.byGame?.[key] ?? 0;
}

/**
 * @param {URLSearchParams | { get?: Function, has?: Function } | null | undefined} params
 */
export function parseStatsFilters(params) {
  /** @type {Record<string, number | null>} */
  const gt = {};
  for (const key of GT_KEYS) {
    const whenMissing = key === 'languages' || key === 'games' ? 0 : null;
    gt[key] = parseGt(params, `gt_${key}`, whenMissing);
  }
  return {
    country: String(params?.get?.('country') || '').trim().toUpperCase(),
    place: String(params?.get?.('place') || '').trim(),
    isp: String(params?.get?.('isp') || '').trim(),
    homeHitsOnly: Boolean(params?.get?.('homeHitsOnly')),
    gt,
  };
}

/**
 * @param {import('./stats-combine.js').StatsRow[]} rows
 */
export function countriesFromRows(rows) {
  /** @type {Map<string, string>} */
  const byCode = new Map();
  for (const row of rows || []) {
    const code = row.geo?.country;
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, formatCountry(code) || code);
  }
  return [...byCode.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

/**
 * @param {import('./stats-combine.js').StatsRow} row
 * @param {ReturnType<typeof parseStatsFilters>} filters
 */
function rowMatchesFilters(row, filters) {
  if (filters.country) {
    if ((row.geo?.country || '').toUpperCase() !== filters.country) return false;
  }
  if (filters.place) {
    const geo = row.geo;
    const placeHay = geo ? `${geo.city} ${geo.region}` : row.location || '';
    if (!smartMatch(placeHay, filters.place)) return false;
  }
  if (filters.isp) {
    const ispHay = row.geo?.asOrg || row.location || '';
    if (!smartMatch(ispHay, filters.isp)) return false;
  }
  if (filters.homeHitsOnly) {
    if (!(row.homeHits > 0 && row.games === 0)) return false;
    for (const game of STATS_GAMES) {
      if ((row.byGame?.[game.id] || 0) > 0) return false;
    }
    return true;
  }
  for (const key of GT_KEYS) {
    const min = filters.gt[key];
    if (min == null) continue;
    if (!(gtValue(row, key) > min)) return false;
  }
  return true;
}

/**
 * @param {import('./stats-combine.js').StatsRow[]} rows
 * @param {ReturnType<typeof parseStatsFilters>} filters
 */
export function applyStatsFilters(rows, filters) {
  return (rows || []).filter((row) => rowMatchesFilters(row, filters));
}

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
 * @param {'network' | 'country' | 'city'} [group]
 * @param {number} [groupCount]
 */
function totalDisplay(col, totals, networkCount, group = 'network', groupCount = 0) {
  const totalLangTip = (totals.languageCodes || []).map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
  if (col.key === 'ip') return esc(`(${networkCount} network${networkCount === 1 ? '' : 's'})`);
  if (col.key === 'label') {
    const unit = group === 'city' ? (groupCount === 1 ? 'city' : 'cities') : groupCount === 1 ? 'country' : 'countries';
    return esc(`(${groupCount} ${unit})`);
  }
  if (col.key === 'location') return '';
  if (col.key === 'networks') return esc(networkCount);
  if (col.key === 'languages') return tipCell(String(totals.languages), totalLangTip, 'lang-total');
  if (col.key === 'addrs') return esc(totals.addrs);
  if (col.key === 'games') return esc(totals.games);
  if (col.key === 'homeHits') return esc(totals.homeHits);
  return esc(totals.byGame?.[col.key] ?? 0);
}

/**
 * @param {StatsColumn} col
 * @param {import('./stats-combine.js').StatsGroupedRow} row
 * @param {number} index
 * @param {'country' | 'city'} group
 */
function groupedColumnSortValue(col, row) {
  if (col.key === 'label') return row.label;
  if (col.key === 'networks') return row.networks;
  if (col.key === 'addrs') return row.addrs;
  if (col.key === 'languages') return row.languages;
  if (col.key === 'games') return row.games;
  if (col.key === 'homeHits') return row.homeHits;
  return row.byGame?.[col.key] ?? 0;
}

/**
 * @param {string} label
 * @param {'country' | 'city'} group
 * @param {string} country
 * @param {string} city
 */
function drillCell(label, group, country, city) {
  if (!country) return esc(label);
  const extra = group === 'city' ? ` data-drill-city="${esc(city)}"` : '';
  return `<button type="button" class="group-drill" data-drill="${esc(group)}" data-drill-country="${esc(
    country
  )}"${extra}>${esc(label)}</button>`;
}

/**
 * @param {StatsColumn} col
 * @param {import('./stats-combine.js').StatsGroupedRow} row
 * @param {number} index
 * @param {'country' | 'city'} group
 */
function groupedColumnDisplay(col, row, index, group) {
  const langCodes = row.languageCodes || [];
  const langTip = langCodes.map((code) => LANGUAGE_MENU.get(code) || code).join('\n');
  if (col.key === 'label') return drillCell(row.label, group, row.country, row.city);
  if (col.key === 'networks') return esc(row.networks);
  if (col.key === 'languages') return tipCell(String(row.languages), langTip, `glang-${index}`);
  if (col.key === 'addrs') return esc(row.addrs);
  if (col.key === 'games') return esc(row.games);
  if (col.key === 'homeHits') return esc(row.homeHits);
  return esc(row.byGame?.[col.key] ?? 0);
}

/**
 * @param {StatsColumn} col
 * @param {string} inner
 * @param {string | number} sortValue
 */
function dataCell(col, inner, sortValue, extra = '') {
  const cls = col.type === 'num' ? ' class="n"' : '';
  return `<td${cls} data-sort="${esc(sortValue)}"${extra}>${inner}</td>`;
}

/**
 * @param {import('./stats-combine.js').StatsRow} row
 */
function rowDataAttrs(row) {
  const geo = row.geo;
  const place = geo ? `${geo.city} ${geo.region}` : row.location || '';
  const isp = geo?.asOrg || row.location || '';
  const parts = [
    `data-grain="network"`,
    `data-ip="${esc(row.ip)}"`,
    `data-country="${esc(geo?.country || '')}"`,
    `data-city="${esc(geo?.city || '')}"`,
    `data-place="${esc(place)}"`,
    `data-isp="${esc(isp)}"`,
    `data-langs="${esc((row.languageCodes || []).join(' '))}"`,
    `data-languages="${esc(row.languages)}"`,
    `data-games="${esc(row.games)}"`,
    `data-homehits="${esc(row.homeHits)}"`,
    `data-addrs="${esc(row.addrs)}"`,
    `data-location="${esc(row.location || '')}"`,
    `data-perms="${esc(row.perms || '')}"`,
  ];
  for (const g of STATS_GAMES) {
    parts.push(`data-game-${esc(g.id)}="${esc(row.byGame?.[g.id] ?? 0)}"`);
  }
  return parts.join(' ');
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
    var all = Array.prototype.slice.call(tbody.rows);
    var emptyRow = null;
    var hidden = [];
    var rows = [];
    for (var i = 0; i < all.length; i++) {
      var row = all[i];
      if (row.getAttribute('data-empty') === '1') {
        emptyRow = row;
        continue;
      }
      if (row.hidden) hidden.push(row);
      else rows.push(row);
    }
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
    for (var r = 0; r < rows.length; r++) tbody.appendChild(rows[r]);
    for (var h = 0; h < hidden.length; h++) tbody.appendChild(hidden[h]);
    if (emptyRow) tbody.appendChild(emptyRow);
  }

  Array.prototype.forEach.call(headers, function (th, index) {
    var btn = th.querySelector('button.sort');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var type = th.getAttribute('data-type') || 'text';
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

const COLLAPSE_SCRIPT = `(function () {
  var form = document.getElementById('stats-filters');
  var btn = form && form.querySelector('[data-toggle-filters]');
  if (!form || !btn) return;
  var key = 'wordaholic-stats-filters-collapsed';
  function setCollapsed(on) {
    form.classList.toggle('filters-collapsed', on);
    btn.setAttribute('aria-expanded', on ? 'false' : 'true');
    btn.title = on ? 'Show filters' : 'Hide filters';
    btn.textContent = on ? '▸' : '▾';
    try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
  }
  try { if (localStorage.getItem(key) === '1') setCollapsed(true); } catch (e) {}
  btn.addEventListener('click', function () {
    setCollapsed(!form.classList.contains('filters-collapsed'));
  });
})();`;

const FILTER_SCRIPT = `(function () {
  var form = document.getElementById('stats-filters');
  var table = document.getElementById('stats-table');
  if (!form || !table || !table.tBodies[0]) return;
  var tbody = table.tBodies[0];
  var tfoot = table.tFoot;
  var home = form.querySelector('[name=homeHitsOnly]');
  var fromEl = form.querySelector('[name=from]');
  var toEl = form.querySelector('[name=to]');
  var off = ${JSON.stringify(HOME_GT_OFF)};
  var gtKeys = ${JSON.stringify(GT_KEYS)};
  var gameIds = ${JSON.stringify(STATS_GAMES.map((g) => g.id))};
  var langNames = ${JSON.stringify(Object.fromEntries(LANGUAGE_MENU))};
  var debounceTimer = null;

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }
  function compact(s) {
    return fold(s).replace(/[^a-z0-9]+/g, '');
  }
  function smartMatch(hay, query) {
    var q = fold(query).trim();
    if (!q) return true;
    var hayFold = fold(hay);
    var hayComp = compact(hay);
    var tokens = q.split(/\\s+/);
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (!tok) continue;
      var tokComp = compact(tok);
      if (hayFold.indexOf(tok) !== -1) continue;
      if (tokComp.length >= 2 && hayComp.indexOf(tokComp) !== -1) continue;
      return false;
    }
    return true;
  }
  function numAttr(row, name) {
    var n = Number(row.getAttribute(name) || '0');
    return isFinite(n) ? n : 0;
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function countryLabel(code) {
    if (!code) return '';
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch (e) {
      return code;
    }
  }
  function groupedLabel(group, country, city) {
    var name = countryLabel(country);
    if (group === 'country') return name || 'Unknown';
    if (!country && !city) return 'Unknown';
    if (!city) return name ? name + ' (city unknown)' : 'Unknown';
    return name ? city + ', ' + name : city;
  }
  function currentGroup() {
    var el = form.querySelector('[name=group]');
    var v = el ? String(el.value || '') : 'network';
    return v === 'country' || v === 'city' ? v : 'network';
  }
  function setHeaders(group) {
    var labels = group === 'country' ? ['country', 'networks'] : group === 'city' ? ['city', 'networks'] : ['IP', 'location'];
    var types = group === 'network' ? ['text', 'text'] : ['text', 'num'];
    var ths = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells : [];
    for (var i = 0; i < 2 && i < ths.length; i++) {
      ths[i].setAttribute('data-type', types[i]);
      if (types[i] === 'num') ths[i].classList.add('n');
      else ths[i].classList.remove('n');
      var btn = ths[i].querySelector('button.sort');
      if (btn) btn.textContent = labels[i];
      ths[i].removeAttribute('aria-sort');
    }
    if (ths[0]) ths[0].setAttribute('aria-sort', 'ascending');
  }
  function numTd(value) {
    return '<td class="n" data-sort="' + escHtml(value) + '">' + escHtml(value) + '</td>';
  }
  function rollup(visible, group) {
    var buckets = {};
    var order = [];
    var i;
    var j;
    for (i = 0; i < visible.length; i++) {
      var row = visible[i];
      var country = String(row.getAttribute('data-country') || '');
      var city = String(row.getAttribute('data-city') || '');
      var key = group === 'country' ? country : country + '\\n' + city;
      if (!buckets[key]) {
        buckets[key] = {
          country: country,
          city: group === 'city' ? city : '',
          networks: 0,
          addrs: 0,
          games: 0,
          homeHits: 0,
          byGame: {},
          langs: {}
        };
        for (j = 0; j < gameIds.length; j++) buckets[key].byGame[gameIds[j]] = 0;
        order.push(key);
      }
      var b = buckets[key];
      b.networks += 1;
      b.addrs += numAttr(row, 'data-addrs');
      b.games += numAttr(row, 'data-games');
      b.homeHits += numAttr(row, 'data-homehits');
      for (j = 0; j < gameIds.length; j++) {
        b.byGame[gameIds[j]] += numAttr(row, 'data-game-' + gameIds[j]);
      }
      var codes = String(row.getAttribute('data-langs') || '').split(/\\s+/);
      for (var c = 0; c < codes.length; c++) {
        if (codes[c]) b.langs[codes[c]] = true;
      }
    }
    var unknownKey = group === 'country' ? '' : '\\n';
    var items = order.map(function (key) {
      var bucket = buckets[key];
      var langCodes = Object.keys(bucket.langs).sort();
      return {
        key: key,
        label: groupedLabel(group, bucket.country, bucket.city),
        country: bucket.country,
        city: bucket.city,
        networks: bucket.networks,
        addrs: bucket.addrs,
        games: bucket.games,
        homeHits: bucket.homeHits,
        byGame: bucket.byGame,
        languages: langCodes.length,
        langCodes: langCodes
      };
    });
    items.sort(function (a, b) {
      if (a.key === unknownKey && b.key !== unknownKey) return 1;
      if (b.key === unknownKey && a.key !== unknownKey) return -1;
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
    return items;
  }
  function makeGroupedRow(item, group) {
    var tr = document.createElement('tr');
    tr.setAttribute('data-grouped', '1');
    tr.setAttribute('data-country', item.country);
    tr.setAttribute('data-city', item.city);
    tr.setAttribute('data-networks', String(item.networks));
    tr.setAttribute('data-addrs', String(item.addrs));
    tr.setAttribute('data-languages', String(item.languages));
    tr.setAttribute('data-langs', item.langCodes.join(' '));
    tr.setAttribute('data-games', String(item.games));
    tr.setAttribute('data-homehits', String(item.homeHits));
    var j;
    for (j = 0; j < gameIds.length; j++) {
      tr.setAttribute('data-game-' + gameIds[j], String(item.byGame[gameIds[j]] || 0));
    }
    var langTip = item.langCodes.map(function (code) { return langNames[code] || code; }).join('\\n');
    var labelInner;
    if (item.country) {
      labelInner = '<button type="button" class="group-drill" data-drill="' + escHtml(group) +
        '" data-drill-country="' + escHtml(item.country) + '"' +
        (group === 'city' ? ' data-drill-city="' + escHtml(item.city) + '"' : '') +
        '>' + escHtml(item.label) + '</button>';
    } else {
      labelInner = escHtml(item.label);
    }
    var langInner = '<span class="tip-cell"><button type="button" class="tip-trigger" title="' +
      escHtml(langTip) + '">' + escHtml(item.languages) + '</button><span class="tip" role="tooltip">' +
      escHtml(langTip) + '</span></span>';
    var html = '<td data-sort="' + escHtml(item.label) + '">' + labelInner + '</td>' +
      numTd(item.networks) + numTd(item.addrs) +
      '<td class="n" data-sort="' + escHtml(item.languages) + '">' + langInner + '</td>' +
      numTd(item.games);
    for (j = 0; j < gameIds.length; j++) html += numTd(item.byGame[gameIds[j]] || 0);
    html += numTd(item.homeHits);
    tr.innerHTML = html;
    return tr;
  }
  function syncDisabled() {
    var on = !!(home && home.checked);
    for (var i = 0; i < off.length; i++) {
      var el = form.querySelector('[name="gt_' + off[i] + '"]');
      if (el) el.disabled = on;
    }
  }
  function parseGtField(key) {
    var el = form.querySelector('[name="gt_' + key + '"]');
    if (!el || el.disabled) return null;
    var raw = String(el.value || '').trim();
    var fallback = key === 'languages' || key === 'games' ? 0 : null;
    if (!raw) return fallback;
    var n = Number(raw);
    return isFinite(n) ? n : fallback;
  }
  function setTipCell(td, visible, tip) {
    if (!td) return;
    var btn = td.querySelector('.tip-trigger');
    var tipEl = td.querySelector('.tip');
    if (btn) {
      btn.textContent = String(visible);
      btn.setAttribute('title', tip || '');
      if (tipEl) tipEl.textContent = tip || '';
    } else {
      td.textContent = String(visible);
    }
  }
  function updateTotals(visible, group, groupCount) {
    if (!tfoot || !tfoot.rows[0]) return;
    var n = visible.length;
    var addrs = 0;
    var games = 0;
    var homeHits = 0;
    var byGame = {};
    var langs = {};
    var i;
    var j;
    for (j = 0; j < gameIds.length; j++) byGame[gameIds[j]] = 0;
    for (i = 0; i < visible.length; i++) {
      var row = visible[i];
      addrs += numAttr(row, 'data-addrs');
      games += numAttr(row, 'data-games');
      homeHits += numAttr(row, 'data-homehits');
      for (j = 0; j < gameIds.length; j++) {
        byGame[gameIds[j]] += numAttr(row, 'data-game-' + gameIds[j]);
      }
      var codes = String(row.getAttribute('data-langs') || '').split(/\\s+/);
      for (var c = 0; c < codes.length; c++) {
        if (codes[c]) langs[codes[c]] = true;
      }
    }
    var langList = Object.keys(langs).sort();
    var langTip = langList.map(function (code) { return langNames[code] || code; }).join('\\n');
    var footRow = tfoot.rows[0];
    var first = footRow.cells[0];
    var second = footRow.cells[1];
    if (group === 'country' || group === 'city') {
      var one = group === 'city' ? 'city' : 'country';
      var many = group === 'city' ? 'cities' : 'countries';
      if (first) {
        first.classList.remove('n');
        first.textContent = '(' + groupCount + ' ' + (groupCount === 1 ? one : many) + ')';
      }
      if (second) {
        second.classList.add('n');
        second.textContent = String(n);
      }
    } else {
      if (first) {
        first.classList.remove('n');
        first.textContent = '(' + n + ' network' + (n === 1 ? '' : 's') + ')';
      }
      if (second) {
        second.classList.remove('n');
        second.textContent = '';
      }
    }
    var cell = function (key) { return tfoot.querySelector('[data-col="' + key + '"]'); };
    var addrsTd = cell('addrs');
    if (addrsTd) addrsTd.textContent = String(addrs);
    setTipCell(cell('languages'), langList.length, langTip);
    var gamesTd = cell('games');
    if (gamesTd) gamesTd.textContent = String(games);
    var homeTd = cell('homeHits');
    if (homeTd) homeTd.textContent = String(homeHits);
    for (j = 0; j < gameIds.length; j++) {
      var gTd = cell(gameIds[j]);
      if (gTd) gTd.textContent = String(byGame[gameIds[j]]);
    }
  }
  function apply() {
    syncDisabled();
    var group = currentGroup();
    var country = String((form.querySelector('[name=country]') || {}).value || '').trim().toUpperCase();
    var place = String((form.querySelector('[name=place]') || {}).value || '').trim();
    var isp = String((form.querySelector('[name=isp]') || {}).value || '').trim();
    var homeOnly = !!(home && home.checked);
    var oldGrouped = tbody.querySelectorAll('tr[data-grouped="1"]');
    for (var r = 0; r < oldGrouped.length; r++) oldGrouped[r].remove();
    var visible = [];
    var emptyRow = null;
    var rows = tbody.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-empty') === '1') {
        emptyRow = row;
        continue;
      }
      if (row.getAttribute('data-grouped') === '1' || row.getAttribute('data-grain') !== 'network') continue;
      var ok = true;
      if (country && String(row.getAttribute('data-country') || '').toUpperCase() !== country) ok = false;
      if (ok && place && !smartMatch(row.getAttribute('data-place') || '', place)) ok = false;
      if (ok && isp && !smartMatch(row.getAttribute('data-isp') || '', isp)) ok = false;
      if (ok && homeOnly) {
        if (!(numAttr(row, 'data-homehits') > 0 && numAttr(row, 'data-games') === 0)) ok = false;
        for (var g = 0; g < gameIds.length && ok; g++) {
          if (numAttr(row, 'data-game-' + gameIds[g]) > 0) ok = false;
        }
      } else if (ok) {
        for (var k = 0; k < gtKeys.length; k++) {
          var key = gtKeys[k];
          var min = parseGtField(key);
          if (min == null) continue;
          var cur = key === 'languages' || key === 'games' ? numAttr(row, 'data-' + key) : numAttr(row, 'data-game-' + key);
          if (!(cur > min)) {
            ok = false;
            break;
          }
        }
      }
      if (ok) visible.push(row);
      row.hidden = group === 'network' ? !ok : true;
    }
    var groupCount = 0;
    if (group !== 'network') {
      var items = rollup(visible, group);
      groupCount = items.length;
      for (var gi = 0; gi < items.length; gi++) {
        tbody.insertBefore(makeGroupedRow(items[gi], group), emptyRow);
      }
    }
    if (emptyRow) emptyRow.hidden = (group === 'network' ? visible.length : groupCount) > 0;
    setHeaders(group);
    updateTotals(visible, group, groupCount);
    syncUrl();
  }
  function syncUrl() {
    var params = new URLSearchParams();
    params.set('tab', 'totals');
    var from = fromEl ? fromEl.value : '';
    var to = toEl ? toEl.value : '';
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    var countryEl = form.querySelector('[name=country]');
    var placeEl = form.querySelector('[name=place]');
    var ispEl = form.querySelector('[name=isp]');
    if (countryEl && countryEl.value) params.set('country', countryEl.value);
    if (placeEl && placeEl.value) params.set('place', placeEl.value);
    if (ispEl && ispEl.value) params.set('isp', ispEl.value);
    var groupEl = form.querySelector('[name=group]');
    if (groupEl && groupEl.value && groupEl.value !== 'network') params.set('group', groupEl.value);
    for (var i = 0; i < gtKeys.length; i++) {
      var el = form.querySelector('[name="gt_' + gtKeys[i] + '"]');
      if (!el || el.disabled) continue;
      var raw = String(el.value || '').trim();
      if (raw) params.set('gt_' + gtKeys[i], raw);
    }
    if (home && home.checked) params.set('homeHitsOnly', '1');
    var qs = params.toString();
    var next = '/stats' + (qs ? '?' + qs : '');
    if (next !== location.pathname + location.search) history.replaceState(null, '', next);
  }
  function datesChanged() {
    var url = new URL(location.href);
    var from = fromEl ? fromEl.value : '';
    var to = toEl ? toEl.value : '';
    return from !== (url.searchParams.get('from') || '') || to !== (url.searchParams.get('to') || '');
  }
  function goWithDates() {
    syncUrl();
    location.reload();
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (datesChanged()) goWithDates();
    else apply();
  });
  form.addEventListener('input', function (e) {
    var name = e.target && e.target.name;
    if (name === 'from' || name === 'to') {
      if (datesChanged()) goWithDates();
      return;
    }
    if (!name) return;
    if (name === 'place' || name === 'isp') {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(apply, 80);
      return;
    }
    apply();
  });
  form.addEventListener('change', function (e) {
    var name = e.target && e.target.name;
    if (name === 'from' || name === 'to') {
      if (datesChanged()) goWithDates();
      return;
    }
    apply();
  });
  var clearBtn = form.querySelector('[data-clear-filters]');
  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var hadDates = !!(fromEl && fromEl.value) || !!(toEl && toEl.value);
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      var countryEl = form.querySelector('[name=country]');
      var placeEl = form.querySelector('[name=place]');
      var ispEl = form.querySelector('[name=isp]');
      if (countryEl) countryEl.value = '';
      if (placeEl) placeEl.value = '';
      if (ispEl) ispEl.value = '';
      if (home) home.checked = false;
      for (var i = 0; i < gtKeys.length; i++) {
        var el = form.querySelector('[name="gt_' + gtKeys[i] + '"]');
        if (!el) continue;
        el.value = gtKeys[i] === 'languages' || gtKeys[i] === 'games' ? '0' : '';
      }
      if (hadDates) {
        goWithDates();
        return;
      }
      apply();
    });
  }
  tbody.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t && t.closest ? t.closest('[data-drill]') : null;
    if (!btn) return;
    e.preventDefault();
    var countryEl = form.querySelector('[name=country]');
    var placeEl = form.querySelector('[name=place]');
    var groupEl = form.querySelector('[name=group]');
    var country = btn.getAttribute('data-drill-country') || '';
    var city = btn.getAttribute('data-drill-city') || '';
    var grain = btn.getAttribute('data-drill') || '';
    if (countryEl) countryEl.value = country;
    if (placeEl && grain === 'city') placeEl.value = city;
    if (groupEl) groupEl.value = 'network';
    apply();
  });
  apply();
})();`;

const CSV_SCRIPT = `(function () {
  var form = document.getElementById('stats-filters');
  var table = document.getElementById('stats-table');
  var btn = document.querySelector('[data-export-csv]');
  if (!form || !table || !table.tBodies[0] || !btn) return;
  var tbody = table.tBodies[0];
  var networkHeaders = ${JSON.stringify(COLUMNS.map((c) => c.label))};
  var networkKeys = ${JSON.stringify(COLUMNS.map((c) => c.key))};
  var restHeaders = ${JSON.stringify(COLUMNS.slice(2).map((c) => c.label))};
  var restKeys = ${JSON.stringify(COLUMNS.slice(2).map((c) => c.key))};
  var gameIds = ${JSON.stringify(STATS_GAMES.map((g) => g.id))};

  function currentGroup() {
    var el = form.querySelector('[name=group]');
    var v = el ? String(el.value || '') : 'network';
    return v === 'country' || v === 'city' ? v : 'network';
  }
  function columns() {
    var group = currentGroup();
    if (group === 'network') return { headers: networkHeaders, keys: networkKeys };
    return {
      headers: [group === 'country' ? 'country' : 'city', 'networks'].concat(restHeaders),
      keys: ['label', 'networks'].concat(restKeys)
    };
  }
  function csvEscape(value) {
    var s = String(value == null ? '' : value);
    if (/[",\\n\\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function numAttr(row, name) {
    var n = Number(row.getAttribute(name) || '0');
    return isFinite(n) ? n : 0;
  }
  function firstCellText(row) {
    var cell = row.cells[0];
    if (!cell) return '';
    var btn = cell.querySelector('.group-drill') || cell.querySelector('.tip-trigger');
    return (btn ? btn.textContent : cell.textContent) || '';
  }
  function cellValue(row, key) {
    if (key === 'ip' || key === 'label') return firstCellText(row);
    if (key === 'location') return row.cells[1] ? row.cells[1].textContent : '';
    if (key === 'networks') return numAttr(row, 'data-networks');
    if (key === 'addrs') return numAttr(row, 'data-addrs');
    if (key === 'languages') return numAttr(row, 'data-languages');
    if (key === 'games') return numAttr(row, 'data-games');
    if (key === 'homeHits') return numAttr(row, 'data-homehits');
    if (gameIds.indexOf(key) !== -1) return numAttr(row, 'data-game-' + key);
    return '';
  }
  function filename() {
    var fromEl = form.querySelector('[name=from]');
    var toEl = form.querySelector('[name=to]');
    var from = fromEl && fromEl.value ? fromEl.value : 'all';
    var to = toEl && toEl.value ? toEl.value : 'all';
    var group = currentGroup();
    var prefix = group === 'network' ? 'wordaholic-stats-' : 'wordaholic-stats-' + group + '-';
    return prefix + from + '-to-' + to + '.csv';
  }
  btn.addEventListener('click', function () {
    var cols = columns();
    var lines = [cols.headers.map(csvEscape).join(',')];
    var rows = tbody.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-empty') === '1') continue;
      if (row.hidden) continue;
      var out = [];
      for (var k = 0; k < cols.keys.length; k++) out.push(csvEscape(cellValue(row, cols.keys[k])));
      lines.push(out.join(','));
    }
    var blob = new Blob([lines.join('\\n') + '\\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
})();`;

/**
 * @param {ReturnType<typeof parseStatsFilters>} filters
 * @param {string} key
 */
function gtInputValue(filters, key) {
  const n = filters.gt[key];
  if (n == null) return '';
  return String(n);
}

/**
 * @param {{
 *   rows: import('./stats-combine.js').StatsRow[],
 *   trends?: { key: string, label: string, games: number, byGame: Record<string, number> }[],
 *   from?: string,
 *   to?: string,
 *   params?: URLSearchParams | { get?: Function, has?: Function },
 *   backfillRemaining?: number,
 * }} opts
 */
export function renderStatsHtml(opts) {
  const allRows = opts.rows || [];
  const trendRows = opts.trends || [];
  const filters = parseStatsFilters(opts.params);
  const tab = parseStatsTab(opts.params?.get?.('tab'));
  const interval = parseTrendInterval(opts.params?.get?.('interval'));
  const group = parseStatsGroup(opts.params?.get?.('group'));
  const filtered = applyStatsFilters(allRows, filters);
  const totals = combineTotals(filtered);
  const from = opts.from || '';
  const to = opts.to || '';
  const remaining = opts.backfillRemaining || 0;
  const countryOptions = countriesFromRows(allRows);
  if (filters.country && !countryOptions.some(([code]) => code === filters.country)) {
    countryOptions.unshift([filters.country, formatCountry(filters.country) || filters.country]);
  }
  const homeHitsOnly = filters.homeHitsOnly;
  const isTrends = tab === 'trends';

  const qsBase = (extra = {}) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const tabs = `<nav class="stats-tabs" aria-label="Stats views">
      <a href="/stats${qsBase({ tab: 'totals' })}"${isTrends ? '' : ' aria-current="page"'}>Totals</a>
      <a href="/stats${qsBase({ tab: 'trends', interval })}"${isTrends ? ' aria-current="page"' : ''}>Trends</a>
      <span class="stats-tabs-end">
        ${isTrends ? '' : '<button type="button" data-clear-filters>Clear filters</button>'}
        <button type="button" data-toggle-filters aria-expanded="true" aria-controls="stats-filter-body" title="Hide filters">▾</button>
      </span>
    </nav>`;

  const notice = remaining
    ? `<p class="note">Still loading ${remaining} archived hour${remaining === 1 ? '' : 's'} from storage. Refresh shortly.</p>`
    : '';

  const sharedDates = `<label>From (UTC)<input type="date" name="from" value="${esc(from)}"/></label>
      <label>To (UTC)<input type="date" name="to" value="${esc(to)}"/></label>
      <input type="hidden" name="tab" value="${esc(tab)}"/>`;

  const styles = `
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
    h1 { font-size: 1.15rem; margin: 0; }
    h1 .tip-trigger { font: inherit; font-size: inherit; font-weight: inherit; }
    .stats-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      flex: 1 0 100%;
      margin: 0 0 0.35rem;
    }
    .stats-actions { display: flex; align-items: center; gap: 0.65rem; margin-left: auto; }
    .stats-tabs {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1 0 100%;
      margin: 0 0 0.5rem;
    }
    .stats-tabs a {
      color: inherit;
      text-decoration: none;
      font-weight: 600;
      padding: 0.15rem 0;
      border-bottom: 2px solid transparent;
    }
    .stats-tabs a[aria-current="page"] {
      border-bottom-color: currentColor;
    }
    .stats-tabs-end {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .stats-filter-body {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      align-items: end;
      width: 100%;
    }
    form.filters-collapsed .stats-filter-body { display: none; }
    form { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: end; margin-bottom: 0.65rem; }
    label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 12px; }
    label.check { flex-direction: row; align-items: center; gap: 0.35rem; padding-bottom: 0.15rem; }
    .stats-filter-end {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding-bottom: 0.15rem;
    }
    .stats-chrome button[data-export-csv],
    .stats-chrome button[data-clear-filters],
    .stats-chrome button[data-toggle-filters] {
      font: inherit;
      font-weight: 500;
      color: inherit;
      cursor: pointer;
      padding: 0.35rem 0.75rem;
      border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
      border-radius: 0.3rem;
      background: color-mix(in srgb, currentColor 14%, Canvas);
    }
    .stats-chrome button[data-toggle-filters] {
      padding: 0.2rem 0.55rem;
      line-height: 1;
      font-size: 1rem;
    }
    .stats-chrome button[data-export-csv]:hover,
    .stats-chrome button[data-clear-filters]:hover,
    .stats-chrome button[data-toggle-filters]:hover {
      background: color-mix(in srgb, currentColor 22%, Canvas);
    }
    .stats-chrome button[data-export-csv]:active,
    .stats-chrome button[data-clear-filters]:active,
    .stats-chrome button[data-toggle-filters]:active {
      background: color-mix(in srgb, currentColor 28%, Canvas);
    }
    input[type="text"], input[type="date"], select { font: inherit; min-width: 7rem; }
    input[type="number"] {
      font: inherit;
      box-sizing: border-box;
      width: 4.25em;
      min-width: 0;
      max-width: 4.25em;
      padding: 0.15rem 0.2rem;
    }
    .gt-field { display: flex; align-items: center; gap: 0.2rem; }
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
    .stats-chrome .tip {
      top: calc(100% + 0.25rem);
      bottom: auto;
      white-space: pre-wrap;
      max-width: min(36rem, 90vw);
      z-index: 8;
    }
    td.n .tip { left: auto; right: 0; }
    .tip-cell:hover .tip, .tip-cell:focus-within .tip { display: block; }
    button.group-drill {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    button.group-drill:hover { text-decoration-thickness: 2px; }
    .stats-subtabs {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin: 0 0 0.55rem;
    }
    .stats-subtabs a {
      color: inherit;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      padding: 0.1rem 0;
      border-bottom: 2px solid transparent;
    }
    .stats-subtabs a[aria-current="page"] {
      border-bottom-color: currentColor;
    }
    .stats-chart-wrap {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      box-sizing: border-box;
      padding: 0.25rem 0.25rem 0.5rem;
    }
    .stats-chart-svg {
      width: 100%;
      height: 100%;
      min-height: 16rem;
      display: block;
      touch-action: none;
    }
    .stats-chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      margin: 0 0 0.45rem;
      font-size: 12px;
    }
    .stats-chart-legend span {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .stats-chart-swatch {
      width: 0.85rem;
      height: 0.28rem;
      border-radius: 1px;
      background: currentColor;
    }
    .stats-chart-tip {
      display: none;
      position: absolute;
      z-index: 6;
      min-width: 9rem;
      max-width: min(18rem, 80vw);
      padding: 0.4rem 0.55rem;
      background: Canvas;
      color: CanvasText;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      box-shadow: 0 4px 16px color-mix(in srgb, currentColor 18%, transparent);
      font-size: 12px;
      white-space: pre;
      pointer-events: none;
    }
    .stats-chart-tip.is-on { display: block; }
    .stats-chart-empty {
      color: color-mix(in srgb, currentColor 70%, transparent);
      font-size: 13px;
      padding: 1rem 0.25rem;
    }
  `;

  if (isTrends) {
    const trendsView = parseTrendsView(opts.params?.get?.('view'));
    const isGraph = trendsView === 'graph';

    const intervalSelect = `<label>Interval<select name="interval">
${TREND_INTERVALS.map(
  (id) => `        <option value="${esc(id)}"${id === interval ? ' selected' : ''}>${esc(id)}</option>`
).join('\n')}
      </select></label>
      <input type="hidden" name="view" value="${esc(trendsView)}"/>`;

    const subtabs = `<nav class="stats-subtabs" aria-label="Trends display">
      <a href="/stats${qsBase({ tab: 'trends', interval, view: 'table' })}"${
        isGraph ? '' : ' aria-current="page"'
      }>Table</a>
      <a href="/stats${qsBase({ tab: 'trends', interval, view: 'graph' })}"${
        isGraph ? ' aria-current="page"' : ''
      }>Graph</a>
    </nav>`;

    const headerRow = TREND_COLUMNS.map((col, i) => {
      const cls = col.type === 'num' ? ' class="n"' : '';
      const aria = i === 0 ? ' aria-sort="ascending"' : '';
      return `        <th${cls} data-type="${col.type}"${aria}><button type="button" class="sort">${esc(col.label)}</button></th>`;
    }).join('\n');

    const bodyRows = trendRows
      .map((r) => {
        const cells = [
          dataCell(TREND_COLUMNS[0], esc(r.label), r.key),
          dataCell(TREND_COLUMNS[1], trendCell(r.games), r.games),
          ...STATS_GAME_IDS.map((id, i) =>
            dataCell(TREND_COLUMNS[i + 2], trendCell(r.byGame?.[id] || 0), r.byGame?.[id] || 0)
          ),
        ].join('\n');
        return `<tr>\n${cells}\n</tr>`;
      })
      .join('\n');

    const emptyRow = trendRows.length
      ? ''
      : `<tr data-empty="1"><td colspan="${TREND_COLUMNS.length}">No hours in this range.</td></tr>`;

    const chartSeries = [
      { id: 'games', label: 'games', color: TREND_SERIES_COLORS.games },
      ...STATS_GAMES.map((g) => ({
        id: g.id,
        label: g.id,
        color: TREND_SERIES_COLORS[g.id] || '#666',
      })),
    ];
    const chartPayload = {
      labels: trendRows.map((r) => r.label),
      series: chartSeries.map((s) => ({
        ...s,
        values: trendRows.map((r) =>
          s.id === 'games' ? Number(r.games) || 0 : Number(r.byGame?.[s.id]) || 0
        ),
      })),
    };

    const legend = chartSeries
      .map(
        (s) =>
          `<span style="color:${esc(s.color)}"><i class="stats-chart-swatch" aria-hidden="true"></i>${esc(
            s.label
          )}</span>`
      )
      .join('');

    const chartBlock = trendRows.length
      ? `<div class="stats-chart-wrap" id="stats-chart-wrap">
      <div class="stats-chart-legend">${legend}</div>
      <svg class="stats-chart-svg" id="stats-chart" role="img" aria-label="Trends chart"></svg>
      <div class="stats-chart-tip" id="stats-chart-tip" role="tooltip"></div>
    </div>`
      : `<p class="stats-chart-empty">No hours in this range.</p>`;

    const TRENDS_CSV = `(function () {
  var btn = document.querySelector('[data-export-csv]');
  var form = document.getElementById('stats-filters');
  if (!btn) return;
  var headers = ${JSON.stringify(TREND_COLUMNS.map((c) => c.label))};
  var payload = ${JSON.stringify(chartPayload)};
  function csvEscape(value) {
    var s = String(value == null ? '' : value);
    if (/[",\\n\\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  btn.addEventListener('click', function () {
    var lines = [headers.map(csvEscape).join(',')];
    for (var i = 0; i < payload.labels.length; i++) {
      var cells = [payload.labels[i]];
      for (var s = 0; s < payload.series.length; s++) {
        cells.push(payload.series[s].values[i] || 0);
      }
      lines.push(cells.map(csvEscape).join(','));
    }
    var fromEl = form && form.querySelector('[name=from]');
    var toEl = form && form.querySelector('[name=to]');
    var from = fromEl && fromEl.value ? fromEl.value : 'all';
    var to = toEl && toEl.value ? toEl.value : 'all';
    var blob = new Blob([lines.join('\\n') + '\\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wordaholic-trends-' + from + '-to-' + to + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();`;

    const TRENDS_NAV = `(function () {
  var form = document.getElementById('stats-filters');
  if (!form) return;
  function go() {
    var params = new URLSearchParams();
    params.set('tab', 'trends');
    var fromEl = form.querySelector('[name=from]');
    var toEl = form.querySelector('[name=to]');
    var intervalEl = form.querySelector('[name=interval]');
    var viewEl = form.querySelector('[name=view]');
    if (fromEl && fromEl.value) params.set('from', fromEl.value);
    if (toEl && toEl.value) params.set('to', toEl.value);
    if (intervalEl && intervalEl.value) params.set('interval', intervalEl.value);
    if (viewEl && viewEl.value) params.set('view', viewEl.value);
    location.href = '/stats?' + params.toString();
  }
  function onDateOrInterval(e) {
    var name = e.target && e.target.name;
    if (name === 'from' || name === 'to' || name === 'interval') go();
  }
  form.addEventListener('change', onDateOrInterval);
  form.addEventListener('input', function (e) {
    var name = e.target && e.target.name;
    if (name === 'from' || name === 'to') go();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    go();
  });
})();`;

    const TRENDS_CHART = `(function () {
  var wrap = document.getElementById('stats-chart-wrap');
  var svg = document.getElementById('stats-chart');
  var tip = document.getElementById('stats-chart-tip');
  if (!wrap || !svg || !tip) return;
  var data = ${JSON.stringify(chartPayload)};
  if (!data.labels.length) return;

  var pad = { t: 12, r: 16, b: 44, l: 44 };
  var guide = null;
  var points = [];

  function maxValue() {
    var m = 0;
    for (var s = 0; s < data.series.length; s++) {
      for (var i = 0; i < data.series[s].values.length; i++) {
        var v = data.series[s].values[i] || 0;
        if (v > m) m = v;
      }
    }
    return m || 1;
  }

  function niceMax(v) {
    if (v <= 1) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var n = Math.ceil(v / exp);
    if (n <= 2) return 2 * exp;
    if (n <= 5) return 5 * exp;
    return 10 * exp;
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function draw() {
    var rect = wrap.getBoundingClientRect();
    var legendH = (wrap.querySelector('.stats-chart-legend') || {}).offsetHeight || 0;
    var W = Math.max(320, Math.floor(rect.width));
    var H = Math.max(260, Math.floor(rect.height - legendH - 8));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    points = [];

    var plotW = W - pad.l - pad.r;
    var plotH = H - pad.t - pad.b;
    var n = data.labels.length;
    var yMax = niceMax(maxValue());
    var xAt = function (i) {
      return n === 1 ? pad.l + plotW / 2 : pad.l + (plotW * i) / (n - 1);
    };
    var yAt = function (v) {
      return pad.t + plotH * (1 - v / yMax);
    };

    svg.appendChild(
      svgEl('rect', {
        x: pad.l,
        y: pad.t,
        width: plotW,
        height: plotH,
        fill: 'none',
        stroke: 'color-mix(in srgb, currentColor 22%, transparent)',
      })
    );

    for (var tick = 0; tick <= 4; tick++) {
      var yv = (yMax * tick) / 4;
      var y = yAt(yv);
      svg.appendChild(
        svgEl('line', {
          x1: pad.l,
          y1: y,
          x2: pad.l + plotW,
          y2: y,
          stroke: 'color-mix(in srgb, currentColor 12%, transparent)',
          'stroke-width': '1',
        })
      );
      var yl = svgEl('text', {
        x: pad.l - 6,
        y: y + 3,
        'text-anchor': 'end',
        fill: 'currentColor',
        'font-size': '11',
      });
      yl.textContent = String(Math.round(yv));
      svg.appendChild(yl);
    }

    var labelStep = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(plotW / 72))));
    for (var i = 0; i < n; i++) {
      if (i % labelStep !== 0 && i !== n - 1) continue;
      var xl = svgEl('text', {
        x: xAt(i),
        y: H - 12,
        'text-anchor': 'middle',
        fill: 'currentColor',
        'font-size': '10',
      });
      xl.textContent = data.labels[i];
      svg.appendChild(xl);
    }

    guide = svgEl('line', {
      x1: 0,
      y1: pad.t,
      x2: 0,
      y2: pad.t + plotH,
      stroke: 'color-mix(in srgb, currentColor 35%, transparent)',
      'stroke-width': '1',
      'stroke-dasharray': '3 3',
      visibility: 'hidden',
    });
    svg.appendChild(guide);

    for (var s = 0; s < data.series.length; s++) {
      var series = data.series[s];
      var d = [];
      for (var j = 0; j < n; j++) {
        var x = xAt(j);
        var y2 = yAt(series.values[j] || 0);
        d.push((j ? 'L' : 'M') + x.toFixed(1) + ' ' + y2.toFixed(1));
        points.push({ i: j, s: s, x: x, y: y2, color: series.color });
      }
      svg.appendChild(
        svgEl('path', {
          d: d.join(' '),
          fill: 'none',
          stroke: series.color,
          'stroke-width': '2',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        })
      );
    }

    for (var p = 0; p < points.length; p++) {
      var pt = points[p];
      svg.appendChild(
        svgEl('circle', {
          cx: pt.x,
          cy: pt.y,
          r: 3.2,
          fill: pt.color,
          stroke: 'Canvas',
          'stroke-width': '1',
          'data-i': String(pt.i),
        })
      );
    }

    var hit = svgEl('rect', {
      x: pad.l,
      y: pad.t,
      width: plotW,
      height: plotH,
      fill: 'transparent',
    });
    svg.appendChild(hit);

    function nearestIndex(clientX) {
      var bounds = svg.getBoundingClientRect();
      var scaleX = W / Math.max(1, bounds.width);
      var x = (clientX - bounds.left) * scaleX;
      var best = 0;
      var bestDist = Infinity;
      for (var k = 0; k < n; k++) {
        var dx = Math.abs(xAt(k) - x);
        if (dx < bestDist) {
          bestDist = dx;
          best = k;
        }
      }
      return best;
    }

    function showTip(index, clientX, clientY) {
      var lines = [data.labels[index]];
      for (var s = 0; s < data.series.length; s++) {
        lines.push(data.series[s].label + ': ' + (data.series[s].values[index] || 0));
      }
      tip.textContent = lines.join('\\n');
      tip.classList.add('is-on');
      guide.setAttribute('x1', String(xAt(index)));
      guide.setAttribute('x2', String(xAt(index)));
      guide.setAttribute('visibility', 'visible');
      var wrapBox = wrap.getBoundingClientRect();
      var left = clientX - wrapBox.left + 12;
      var top = clientY - wrapBox.top + 12;
      tip.style.left = '0px';
      tip.style.top = '0px';
      var tipW = tip.offsetWidth;
      var tipH = tip.offsetHeight;
      if (left + tipW > wrapBox.width - 4) left = clientX - wrapBox.left - tipW - 12;
      if (top + tipH > wrapBox.height - 4) top = clientY - wrapBox.top - tipH - 12;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = Math.max(4, top) + 'px';
    }

    function hideTip() {
      tip.classList.remove('is-on');
      guide.setAttribute('visibility', 'hidden');
    }

    hit.addEventListener('pointermove', function (e) {
      showTip(nearestIndex(e.clientX), e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', hideTip);
  }

  draw();
  window.addEventListener('resize', function () {
    window.clearTimeout(window.__statsChartResize);
    window.__statsChartResize = window.setTimeout(draw, 80);
  });
})();`;

    const mainPane = isGraph
      ? chartBlock
      : `<div class="stats-table-wrap">
  <table id="stats-table">
    <thead>
      <tr>
${headerRow}
      </tr>
    </thead>
    <tbody>
${bodyRows}
${emptyRow}
    </tbody>
  </table>
  </div>`;

    const scripts = isGraph
      ? `<script>${COLLAPSE_SCRIPT}</script>
  <script>${TRENDS_NAV}</script>
  <script>${TRENDS_CSV}</script>
  <script>${TRENDS_CHART}</script>`
      : `<script>${SORT_SCRIPT}</script>
  <script>${COLLAPSE_SCRIPT}</script>
  <script>${TRENDS_NAV}</script>
  <script>${TRENDS_CSV}</script>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Wordaholic stats — Trends</title>
  <link rel="icon" href="/brand/wordaholic-stats.svg" type="image/svg+xml"/>
  <style>${styles}</style>
</head>
<body>
  <div class="stats-chrome">
    <form id="stats-filters" method="get" action="/stats">
      <div class="stats-head">
        <h1>${tipCell('Stats', STATS_HELP, 'stats-help')}</h1>
        <div class="stats-actions">
          <button type="button" data-export-csv>Export CSV</button>
        </div>
      </div>
      ${tabs}
      ${subtabs}
      <div id="stats-filter-body" class="stats-filter-body">
        ${sharedDates}
        ${intervalSelect}
      </div>
    </form>
    ${notice}
  </div>
  ${mainPane}
  ${scripts}
</body>
</html>
`;
  }

  const columns = totalsColumns(group);
  const grouped = group === 'network' ? [] : groupStatsRows(filtered, group);
  const networkRows = allRows
    .map((r, i) => {
      const match = rowMatchesFilters(r, filters);
      const hide = group !== 'network' || !match;
      const cells = COLUMNS.map((col) => dataCell(col, columnDisplay(col, r, i), columnSortValue(col, r))).join(
        '\n'
      );
      return `<tr ${rowDataAttrs(r)}${hide ? ' hidden' : ''}>\n${cells}\n</tr>`;
    })
    .join('\n');
  const groupedRows = grouped
    .map((r, i) => {
      const grain = group === 'city' ? 'city' : 'country';
      const cells = columns
        .map((col) => dataCell(col, groupedColumnDisplay(col, r, i, grain), groupedColumnSortValue(col, r)))
        .join('\n');
      const attrs = [
        `data-grouped="1"`,
        `data-country="${esc(r.country)}"`,
        `data-city="${esc(r.city)}"`,
        `data-networks="${esc(r.networks)}"`,
        `data-langs="${esc((r.languageCodes || []).join(' '))}"`,
        `data-languages="${esc(r.languages)}"`,
        `data-games="${esc(r.games)}"`,
        `data-homehits="${esc(r.homeHits)}"`,
        `data-addrs="${esc(r.addrs)}"`,
        ...STATS_GAMES.map((g) => `data-game-${esc(g.id)}="${esc(r.byGame?.[g.id] ?? 0)}"`),
      ].join(' ');
      return `<tr ${attrs}>\n${cells}\n</tr>`;
    })
    .join('\n');
  const displayCount = group === 'network' ? filtered.length : grouped.length;
  const emptyHidden = displayCount ? ' hidden' : '';
  const emptyRow = `<tr data-empty="1"${emptyHidden}><td colspan="${columns.length}">No rows in this range.</td></tr>`;
  const bodyRows = [networkRows, groupedRows].filter(Boolean).join('\n');

  const totalRow = allRows.length
    ? `<tr class="total">
${columns
  .map((col) =>
    dataCell(
      col,
      totalDisplay(col, totals, filtered.length, group, grouped.length),
      '',
      ` data-col="${esc(col.key)}"`
    )
  )
  .join('\n')}
</tr>`
    : '';

  const headerRow = columns.map((col, i) => {
    const cls = col.type === 'num' ? ' class="n"' : '';
    const aria = i === 0 ? ' aria-sort="ascending"' : '';
    return `        <th${cls} data-type="${col.type}"${aria}><button type="button" class="sort">${esc(col.label)}</button></th>`;
  }).join('\n');

  const groupSelect = `<label>Group<select name="group">
${GROUP_OPTIONS.map(
  (opt) =>
    `        <option value="${esc(opt.id)}"${opt.id === group ? ' selected' : ''}>${esc(opt.label)}</option>`
).join('\n')}
      </select></label>`;

  const countrySelect = `<select name="country">
        <option value="">All</option>
${countryOptions
  .map(
    ([code, label]) =>
      `        <option value="${esc(code)}"${code === filters.country ? ' selected' : ''}>${esc(label)}</option>`
  )
  .join('\n')}
      </select>`;

  const gtFields = GT_KEYS.map((key) => {
    const disabled = homeHitsOnly && HOME_GT_OFF.includes(key) ? ' disabled' : '';
    const shown = gtInputValue(filters, key);
    return `<label>${esc(key)}<span class="gt-field"><span aria-hidden="true">&gt;</span><input type="number" name="gt_${esc(
      key
    )}" value="${esc(shown)}" placeholder="0" min="${GT_MIN}" max="${GT_MAX}" step="1"${disabled}/></span></label>`;
  }).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Wordaholic stats — Totals</title>
  <link rel="icon" href="/brand/wordaholic-stats.svg" type="image/svg+xml"/>
  <style>${styles}</style>
</head>
<body>
  <div class="stats-chrome">
    <form id="stats-filters" method="get" action="/stats">
      <div class="stats-head">
        <h1>${tipCell('Stats', STATS_HELP, 'stats-help')}</h1>
        <div class="stats-actions">
          <button type="button" data-export-csv>Export CSV</button>
        </div>
      </div>
      ${tabs}
      <div id="stats-filter-body" class="stats-filter-body">
        ${sharedDates}
        ${groupSelect}
        <label>Country${countrySelect}</label>
        <label>Place<input type="text" name="place" value="${esc(filters.place)}" autocomplete="off"/></label>
        <label>ISP<input type="text" name="isp" value="${esc(filters.isp)}" autocomplete="off"/></label>
        ${gtFields}
        <span class="stats-filter-end">
          <label class="check"><input type="checkbox" name="homeHitsOnly" value="1"${homeHitsOnly ? ' checked' : ''}/> Homehits only</label>
        </span>
      </div>
    </form>
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
${bodyRows}
${emptyRow}
    </tbody>
    ${totalRow ? `<tfoot>\n${totalRow}\n    </tfoot>` : ''}
  </table>
  </div>
  <script>${SORT_SCRIPT}</script>
  <script>${COLLAPSE_SCRIPT}</script>
  <script>${FILTER_SCRIPT}</script>
  <script>${CSV_SCRIPT}</script>
</body>
</html>
`;
}
