/**
 * SQLite tables inside the StatsStore Durable Object.
 * @param {{ exec: (query: string, ...binds: unknown[]) => Iterable<Record<string, unknown>> }} sql
 */
import { emptyPlacesDocument, placeKey, suggestPlace } from '../../../scripts/stats-places.js';
import { suffixSuggestions } from '../../../scripts/play-model.js';

export function ensureSchema(sql) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS nicknames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_key TEXT NOT NULL UNIQUE,
      display TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS browsers (
      id TEXT PRIMARY KEY,
      nickname_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS plays (
      browser_id TEXT NOT NULL,
      game_id INTEGER NOT NULL,
      puzzle_date TEXT NOT NULL,
      language TEXT NOT NULL,
      variant TEXT NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      rank_value INTEGER,
      help_count INTEGER,
      ip TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      as_org TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (browser_id, game_id, puzzle_date, language, variant)
    )`,
    `CREATE INDEX IF NOT EXISTS plays_board ON plays (game_id, language, variant, puzzle_date)`,
    `CREATE TABLE IF NOT EXISTS daily_frozen (
      ip TEXT NOT NULL,
      day TEXT NOT NULL,
      home_hits INTEGER NOT NULL DEFAULT 0,
      languages TEXT NOT NULL DEFAULT '{}',
      games TEXT NOT NULL DEFAULT '{}',
      country TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      as_org TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (ip, day)
    )`,
    `CREATE TABLE IF NOT EXISTS daily_live (
      ip TEXT NOT NULL,
      day TEXT NOT NULL,
      home_hits INTEGER NOT NULL DEFAULT 0,
      languages TEXT NOT NULL DEFAULT '{}',
      country TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      as_org TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (ip, day)
    )`,
    `CREATE TABLE IF NOT EXISTS places (
      key TEXT PRIMARY KEY,
      country TEXT NOT NULL,
      region TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL,
      lon REAL,
      source TEXT NOT NULL
    )`,
  ];
  for (const statement of statements) sql.exec(statement);
}

/**
 * @param {ReturnType<typeof sqlRows>} rows
 */
function sqlRows(sql, query, ...binds) {
  return [...sql.exec(query, ...binds)];
}

function sqlOne(sql, query, ...binds) {
  return sqlRows(sql, query, ...binds)[0] || null;
}

/**
 * @param {string | null | undefined} raw
 */
function readJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
function geoFromRow(row) {
  if (!row) return null;
  const country = String(row.country || '');
  const region = String(row.region || '');
  const city = String(row.city || '');
  const asOrg = String(row.as_org || '');
  if (!country && !region && !city && !asOrg) return null;
  return { country, region, city, asOrg };
}

export function getCutover(sql) {
  const row = sqlOne(sql, `SELECT value FROM meta WHERE key = 'cutover'`);
  return row && typeof row.value === 'string' ? row.value : null;
}

/**
 * The first import chooses the cutover date. A later import does not move it.
 * @param {string} day
 */
export function setCutoverIfEmpty(sql, day) {
  if (getCutover(sql)) return getCutover(sql);
  sql.exec(`INSERT INTO meta (key, value) VALUES ('cutover', ?)`, day);
  return day;
}

export function ensureBrowser(sql, browserId) {
  sql.exec(`INSERT OR IGNORE INTO browsers (id, nickname_id) VALUES (?, NULL)`, browserId);
}

function nicknameRow(sql, nameKey) {
  return sqlOne(sql, `SELECT id, display, name_key FROM nicknames WHERE name_key = ?`, nameKey);
}

function dropOrphanNicknames(sql) {
  sql.exec(`
    DELETE FROM nicknames
    WHERE id NOT IN (SELECT nickname_id FROM browsers WHERE nickname_id IS NOT NULL)
  `);
}

/**
 * @param {'set' | 'join' | 'clear'} action
 * @param {string} [display]
 * @returns {{ ok: true, nickname: string | null } | { ok: false, suggestions: string[] }}
 */
export function changeNickname(sql, browserId, action, display) {
  ensureBrowser(sql, browserId);
  if (action === 'clear') {
    sql.exec(`UPDATE browsers SET nickname_id = NULL WHERE id = ?`, browserId);
    dropOrphanNicknames(sql);
    return { ok: true, nickname: null };
  }
  const parsedDisplay = String(display || '');
  const nameKey = parsedDisplay.toLowerCase();
  const existing = nicknameRow(sql, nameKey);
  const browser = sqlOne(sql, `SELECT nickname_id FROM browsers WHERE id = ?`, browserId);
  if (existing) {
    if (browser && browser.nickname_id === existing.id) {
      return { ok: true, nickname: String(existing.display) };
    }
    if (action === 'join') {
      sql.exec(`UPDATE browsers SET nickname_id = ? WHERE id = ?`, existing.id, browserId);
      dropOrphanNicknames(sql);
      return { ok: true, nickname: String(existing.display) };
    }
    const suggestions = suffixSuggestions(parsedDisplay, (key) => Boolean(nicknameRow(sql, key)));
    return { ok: false, suggestions };
  }
  sql.exec(`INSERT INTO nicknames (name_key, display) VALUES (?, ?)`, nameKey, parsedDisplay);
  const created = nicknameRow(sql, nameKey);
  sql.exec(`UPDATE browsers SET nickname_id = ? WHERE id = ?`, created.id, browserId);
  dropOrphanNicknames(sql);
  return { ok: true, nickname: parsedDisplay };
}

export function browserNickname(sql, browserId) {
  const row = sqlOne(
    sql,
    `SELECT n.display AS display, n.name_key AS name_key
     FROM browsers b JOIN nicknames n ON n.id = b.nickname_id
     WHERE b.id = ?`,
    browserId
  );
  if (!row) return null;
  return { nickname: String(row.display), nameKey: String(row.name_key) };
}

/**
 * @param {{ country?: string, region?: string, city?: string, asOrg?: string } | null} geo
 */
function rememberPlace(sql, geo) {
  if (!geo || !geo.country) return;
  const suggested = suggestPlace(geo.country, geo.region || '', geo.city || '');
  if (!suggested) return;
  const key = placeKey(suggested.country, suggested.region, suggested.city);
  sql.exec(
    `INSERT OR IGNORE INTO places (key, country, region, city, lat, lon, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    key,
    suggested.country,
    suggested.region,
    suggested.city,
    suggested.lat,
    suggested.lon,
    suggested.source
  );
}

/**
 * @param {{ ip: string, country: string, region: string, city: string, asOrg: string }} edge
 */
export function applyPlay(sql, report, edge) {
  ensureBrowser(sql, report.browserId);
  rememberPlace(sql, edge);
  const existing = sqlOne(
    sql,
    `SELECT started_at, finished_at, rank_value FROM plays
     WHERE browser_id = ? AND game_id = ? AND puzzle_date = ? AND language = ? AND variant = ?`,
    report.browserId,
    report.gameId,
    report.puzzleDate,
    report.language,
    report.variant
  );
  if (report.kind === 'start') {
    if (existing) return;
    sql.exec(
      `INSERT INTO plays (
        browser_id, game_id, puzzle_date, language, variant, started_at, ip, country, region, city, as_org
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      report.browserId,
      report.gameId,
      report.puzzleDate,
      report.language,
      report.variant,
      report.clientTime,
      edge.ip,
      edge.country,
      edge.region,
      edge.city,
      edge.asOrg
    );
    return;
  }
  if (!existing) {
    sql.exec(
      `INSERT INTO plays (
        browser_id, game_id, puzzle_date, language, variant, finished_at, rank_value, help_count,
        ip, country, region, city, as_org
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      report.browserId,
      report.gameId,
      report.puzzleDate,
      report.language,
      report.variant,
      report.clientTime,
      report.value,
      report.helpCount,
      edge.ip,
      edge.country,
      edge.region,
      edge.city,
      edge.asOrg
    );
    return;
  }
  if (existing.rank_value != null) return;
  sql.exec(
    `UPDATE plays SET finished_at = ?, rank_value = ?, help_count = ?
     WHERE browser_id = ? AND game_id = ? AND puzzle_date = ? AND language = ? AND variant = ? AND rank_value IS NULL`,
    report.clientTime,
    report.value,
    report.helpCount,
    report.browserId,
    report.gameId,
    report.puzzleDate,
    report.language,
    report.variant
  );
}

export function boardFinishes(sql, gameId, language, variant, from, to) {
  return sqlRows(
    sql,
    `SELECT n.display AS nickname, n.name_key AS name_key, p.puzzle_date AS puzzle_date,
            p.rank_value AS rank_value, p.help_count AS help_count, p.finished_at AS finished_at,
            p.browser_id AS browser_id
     FROM plays p
     JOIN browsers b ON b.id = p.browser_id
     JOIN nicknames n ON n.id = b.nickname_id
     WHERE p.game_id = ? AND p.language = ? AND p.variant = ?
       AND p.puzzle_date >= ? AND p.puzzle_date <= ?
       AND p.rank_value IS NOT NULL AND p.finished_at IS NOT NULL`,
    gameId,
    language,
    variant,
    from,
    to
  ).map((row) => ({
    nickname: String(row.nickname),
    nameKey: String(row.name_key),
    puzzleDate: String(row.puzzle_date),
    rankValue: Number(row.rank_value),
    helpCount: row.help_count == null ? null : Number(row.help_count),
    finishedAt: Number(row.finished_at),
    browserId: String(row.browser_id),
  }));
}

export function catalogRows(sql) {
  return sqlRows(
    sql,
    `SELECT DISTINCT game_id, language, variant FROM plays
     WHERE rank_value IS NOT NULL
     ORDER BY game_id, language, variant`
  ).map((row) => ({
    game: Number(row.game_id),
    language: String(row.language),
    variant: String(row.variant),
  }));
}

/**
 * @param {{ homeHits?: number, languages?: Record<string, number> }} delta
 * @param {{ country?: string, region?: string, city?: string, asOrg?: string } | null} geo
 */
export function addLiveDay(sql, ip, day, delta, geo) {
  const place = geo || { country: '', region: '', city: '', asOrg: '' };
  rememberPlace(sql, place.country ? place : null);
  const existing = sqlOne(sql, `SELECT home_hits, languages, country, region, city, as_org FROM daily_live WHERE ip = ? AND day = ?`, ip, day);
  const languages = readJson(existing && existing.languages);
  for (const [code, n] of Object.entries(delta.languages || {})) {
    languages[code] = (Number(languages[code]) || 0) + (Number(n) || 0);
  }
  const homeHits = (existing ? Number(existing.home_hits) || 0 : 0) + (delta.homeHits || 0);
  const country = String(existing?.country || '') || place.country || '';
  const region = String(existing?.region || '') || place.region || '';
  const city = String(existing?.city || '') || place.city || '';
  const asOrg = String(existing?.as_org || '') || place.asOrg || '';
  sql.exec(
    `INSERT INTO daily_live (ip, day, home_hits, languages, country, region, city, as_org)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ip, day) DO UPDATE SET
       home_hits = excluded.home_hits,
       languages = excluded.languages,
       country = excluded.country,
       region = excluded.region,
       city = excluded.city,
       as_org = excluded.as_org`,
    ip,
    day,
    homeHits,
    JSON.stringify(languages),
    country,
    region,
    city,
    asOrg
  );
}

/**
 * Frozen rows are inserted once. A second import leaves them as they are.
 * @param {{ ip: string, day: string, homeHits: number, languages: Record<string, number>, games: Record<string, Record<string, number>>, geo: { country?: string, region?: string, city?: string, asOrg?: string } | null }[]} days
 */
export function importFrozenDays(sql, days, cutover) {
  let inserted = 0;
  for (const day of days) {
    if (!day || !day.ip || !day.day || day.day >= cutover) continue;
    const geo = day.geo || {};
    const cursor = sql.exec(
      `INSERT OR IGNORE INTO daily_frozen (
        ip, day, home_hits, languages, games, country, region, city, as_org
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      day.ip,
      day.day,
      day.homeHits || 0,
      JSON.stringify(day.languages || {}),
      JSON.stringify(day.games || {}),
      geo.country || '',
      geo.region || '',
      geo.city || '',
      geo.asOrg || ''
    );
    inserted += Number(cursor.rowsWritten) || 0;
    rememberPlace(sql, geo.country ? geo : null);
  }
  return inserted;
}

/**
 * @param {{ places?: Record<string, { country?: string, region?: string, city?: string, lat?: number | null, lon?: number | null, source?: string }> }} doc
 */
export function importPlaces(sql, doc) {
  const places = doc && doc.places && typeof doc.places === 'object' ? doc.places : {};
  let inserted = 0;
  for (const [key, place] of Object.entries(places)) {
    if (!key || !place || !place.country) continue;
    const cursor = sql.exec(
      `INSERT OR IGNORE INTO places (key, country, region, city, lat, lon, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      key,
      place.country,
      place.region || '',
      place.city || '',
      place.lat ?? null,
      place.lon ?? null,
      place.source || 'manual'
    );
    inserted += Number(cursor.rowsWritten) || 0;
  }
  return inserted;
}

export function loadPlacesDocument(sql) {
  const doc = emptyPlacesDocument();
  for (const row of sqlRows(sql, `SELECT key, country, region, city, lat, lon, source FROM places`)) {
    doc.places[String(row.key)] = {
      country: String(row.country),
      region: String(row.region || ''),
      city: String(row.city || ''),
      lat: row.lat == null ? null : Number(row.lat),
      lon: row.lon == null ? null : Number(row.lon),
      source: /** @type {'table' | 'capital' | 'geocode' | 'unresolved' | 'manual'} */ (
        row.source || 'manual'
      ),
    };
  }
  return doc;
}

export function loadTableRows(sql) {
  const frozen = sqlRows(sql, `SELECT * FROM daily_frozen`).map((row) => ({
    ip: String(row.ip),
    day: String(row.day),
    homeHits: Number(row.home_hits) || 0,
    languages: readJson(String(row.languages || '')),
    games: readJson(String(row.games || '')),
    geo: geoFromRow(row),
  }));
  const live = sqlRows(sql, `SELECT * FROM daily_live`).map((row) => ({
    ip: String(row.ip),
    day: String(row.day),
    homeHits: Number(row.home_hits) || 0,
    languages: readJson(String(row.languages || '')),
    geo: geoFromRow(row),
  }));
  const plays = sqlRows(
    sql,
    `SELECT ip,
            substr(datetime(COALESCE(started_at, finished_at) / 1000, 'unixepoch'), 1, 10) AS day,
            game_id, language, variant, COUNT(*) AS n
     FROM plays
     WHERE COALESCE(started_at, finished_at) IS NOT NULL AND ip != ''
     GROUP BY ip, day, game_id, language, variant`
  ).map((row) => ({
    ip: String(row.ip),
    day: String(row.day),
    gameId: Number(row.game_id),
    language: String(row.language),
    variant: String(row.variant),
    n: Number(row.n) || 0,
  }));
  return { frozen, live, plays };
}

/**
 * Fill an empty city on live rows after a lookup. Frozen rows stay as imported.
 * @param {string} ip
 * @param {{ country?: string, region?: string, city?: string, asOrg?: string }} geo
 */
export function fillLiveGeo(sql, ip, geo) {
  if (!geo) return;
  const rows = sqlRows(sql, `SELECT day, country, region, city, as_org FROM daily_live WHERE ip = ?`, ip);
  for (const row of rows) {
    const country = String(row.country || '') || geo.country || '';
    const region = String(row.region || '') || geo.region || '';
    const city = String(row.city || '') || geo.city || '';
    const asOrg = String(row.as_org || '') || geo.asOrg || '';
    if (
      country === String(row.country || '') &&
      region === String(row.region || '') &&
      city === String(row.city || '') &&
      asOrg === String(row.as_org || '')
    ) {
      continue;
    }
    sql.exec(
      `UPDATE daily_live SET country = ?, region = ?, city = ?, as_org = ? WHERE ip = ? AND day = ?`,
      country,
      region,
      city,
      asOrg,
      ip,
      String(row.day)
    );
  }
  rememberPlace(sql, geo.country ? geo : null);
}
