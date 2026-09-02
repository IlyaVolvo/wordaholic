import { combineTotals, formatCountry, parseStatsTab, parseTrendInterval, TREND_INTERVALS } from './stats-combine.js';
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
  'Export CSV downloads the rows currently visible under those filters (not the totals row).\n' +
  'Trends shows activity by hour, day, week, or month for the From/To window (empty = all available).\n' +
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

/** @type {StatsColumn[]} */
const TREND_COLUMNS = [
  { key: 'bucket', label: 'interval', type: 'text' },
  { key: 'games', label: 'games', type: 'num' },
  ...STATS_GAMES.map((g) => ({ key: g.id, label: g.id, type: /** @type {'num'} */ ('num') })),
];

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
    `data-country="${esc(geo?.country || '')}"`,
    `data-place="${esc(place)}"`,
    `data-isp="${esc(isp)}"`,
    `data-langs="${esc((row.languageCodes || []).join(' '))}"`,
    `data-languages="${esc(row.languages)}"`,
    `data-games="${esc(row.games)}"`,
    `data-homehits="${esc(row.homeHits)}"`,
    `data-addrs="${esc(row.addrs)}"`,
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
  function updateTotals(visible) {
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
    var cell = function (key) { return tfoot.querySelector('[data-col="' + key + '"]'); };
    var ipTd = cell('ip');
    if (ipTd) ipTd.textContent = '(' + n + ' network' + (n === 1 ? '' : 's') + ')';
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
    var country = String((form.querySelector('[name=country]') || {}).value || '').trim().toUpperCase();
    var place = String((form.querySelector('[name=place]') || {}).value || '').trim();
    var isp = String((form.querySelector('[name=isp]') || {}).value || '').trim();
    var homeOnly = !!(home && home.checked);
    var visible = [];
    var emptyRow = null;
    var rows = tbody.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-empty') === '1') {
        emptyRow = row;
        continue;
      }
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
      row.hidden = !ok;
      if (ok) visible.push(row);
    }
    if (emptyRow) emptyRow.hidden = visible.length > 0;
    updateTotals(visible);
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
    location.href = location.pathname + location.search;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (datesChanged()) goWithDates();
    else apply();
  });
  form.addEventListener('input', function (e) {
    var name = e.target && e.target.name;
    if (!name || name === 'from' || name === 'to') return;
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
      goWithDates();
      return;
    }
    apply();
  });
  var clearBtn = form.querySelector('[data-clear-filters]');
  if (clearBtn) {
    clearBtn.addEventListener('click', function (e) {
      e.preventDefault();
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
      apply();
    });
  }
  apply();
})();`;

const CSV_SCRIPT = `(function () {
  var form = document.getElementById('stats-filters');
  var table = document.getElementById('stats-table');
  var btn = document.querySelector('[data-export-csv]');
  if (!form || !table || !table.tBodies[0] || !btn) return;
  var tbody = table.tBodies[0];
  var headers = ${JSON.stringify(COLUMNS.map((c) => c.label))};
  var keys = ${JSON.stringify(COLUMNS.map((c) => c.key))};
  var gameIds = ${JSON.stringify(STATS_GAMES.map((g) => g.id))};

  function csvEscape(value) {
    var s = String(value == null ? '' : value);
    if (/[",\\n\\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function numAttr(row, name) {
    var n = Number(row.getAttribute(name) || '0');
    return isFinite(n) ? n : 0;
  }
  function cellValue(row, key) {
    if (key === 'ip') {
      var btn = row.cells[0] && row.cells[0].querySelector('.tip-trigger');
      return btn ? btn.textContent : (row.cells[0] ? row.cells[0].textContent : '');
    }
    if (key === 'location') return row.cells[1] ? row.cells[1].textContent : '';
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
    return 'wordaholic-stats-' + from + '-to-' + to + '.csv';
  }
  btn.addEventListener('click', function () {
    var lines = [headers.map(csvEscape).join(',')];
    var rows = tbody.rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-empty') === '1') continue;
      if (row.hidden) continue;
      var cols = [];
      for (var k = 0; k < keys.length; k++) cols.push(csvEscape(cellValue(row, keys[k])));
      lines.push(cols.join(','));
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
    .stats-chrome button[data-clear-filters] {
      font: inherit;
      font-weight: 500;
      color: inherit;
      cursor: pointer;
      padding: 0.35rem 0.75rem;
      border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
      border-radius: 0.3rem;
      background: color-mix(in srgb, currentColor 14%, Canvas);
    }
    .stats-chrome button[data-export-csv]:hover,
    .stats-chrome button[data-clear-filters]:hover {
      background: color-mix(in srgb, currentColor 22%, Canvas);
    }
    .stats-chrome button[data-export-csv]:active,
    .stats-chrome button[data-clear-filters]:active {
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
  `;

  if (isTrends) {
    const intervalSelect = `<label>Interval<select name="interval">
${TREND_INTERVALS.map(
  (id) => `        <option value="${esc(id)}"${id === interval ? ' selected' : ''}>${esc(id)}</option>`
).join('\n')}
      </select></label>`;

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

    const TRENDS_CSV = `(function () {
  var table = document.getElementById('stats-table');
  var btn = document.querySelector('[data-export-csv]');
  var form = document.getElementById('stats-filters');
  if (!table || !table.tBodies[0] || !btn) return;
  var headers = ${JSON.stringify(TREND_COLUMNS.map((c) => c.label))};
  function csvEscape(value) {
    var s = String(value == null ? '' : value);
    if (/[",\\n\\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  btn.addEventListener('click', function () {
    var lines = [headers.map(csvEscape).join(',')];
    var rows = table.tBodies[0].rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-empty') === '1') continue;
      var cells = [];
      for (var c = 0; c < headers.length; c++) {
        cells.push(csvEscape((row.cells[c] && row.cells[c].innerText || '').trim()));
      }
      lines.push(cells.join(','));
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
    if (fromEl && fromEl.value) params.set('from', fromEl.value);
    if (toEl && toEl.value) params.set('to', toEl.value);
    if (intervalEl && intervalEl.value) params.set('interval', intervalEl.value);
    location.href = '/stats?' + params.toString();
  }
  form.addEventListener('change', function (e) {
    var name = e.target && e.target.name;
    if (name === 'from' || name === 'to' || name === 'interval') go();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    go();
  });
})();`;

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
      ${sharedDates}
      ${intervalSelect}
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
  </table>
  </div>
  <script>${SORT_SCRIPT}</script>
  <script>${TRENDS_NAV}</script>
  <script>${TRENDS_CSV}</script>
</body>
</html>
`;
  }

  const bodyRows = allRows
    .map((r, i) => {
      const match = rowMatchesFilters(r, filters);
      const cells = COLUMNS.map((col) => dataCell(col, columnDisplay(col, r, i), columnSortValue(col, r))).join(
        '\n'
      );
      return `<tr ${rowDataAttrs(r)}${match ? '' : ' hidden'}>\n${cells}\n</tr>`;
    })
    .join('\n');

  const emptyHidden = filtered.length ? ' hidden' : '';
  const emptyRow = `<tr data-empty="1"${emptyHidden}><td colspan="${COLUMNS.length}">No rows in this range.</td></tr>`;

  const totalRow = allRows.length
    ? `<tr class="total">
${COLUMNS.map((col) =>
  dataCell(col, totalDisplay(col, totals, filtered.length), '', ` data-col="${esc(col.key)}"`)
).join('\n')}
</tr>`
    : '';

  const headerRow = COLUMNS.map((col, i) => {
    const cls = col.type === 'num' ? ' class="n"' : '';
    const aria = i === 0 ? ' aria-sort="ascending"' : '';
    return `        <th${cls} data-type="${col.type}"${aria}><button type="button" class="sort">${esc(col.label)}</button></th>`;
  }).join('\n');

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
      ${sharedDates}
      <label>Country${countrySelect}</label>
      <label>Place<input type="text" name="place" value="${esc(filters.place)}" autocomplete="off"/></label>
      <label>ISP<input type="text" name="isp" value="${esc(filters.isp)}" autocomplete="off"/></label>
      ${gtFields}
      <span class="stats-filter-end">
        <label class="check"><input type="checkbox" name="homeHitsOnly" value="1"${homeHitsOnly ? ' checked' : ''}/> Homehits only</label>
        <button type="button" data-clear-filters>Clear filters</button>
      </span>
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
  <script>${FILTER_SCRIPT}</script>
  <script>${CSV_SCRIPT}</script>
</body>
</html>
`;
}
