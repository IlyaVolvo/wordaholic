/**
 * City / region via ipwho.is; country + network via Team Cymru if needed.
 */
import { formatLocation, normalizeGeo, pickRicherGeo } from './stats-combine.js';

const DOH = 'https://cloudflare-dns.com/dns-query';
const IPWHO = 'https://ipwho.is';

/**
 * @param {string} ipOrIdentity
 * @returns {string | null}
 */
export function lookupAddress(ipOrIdentity) {
  const raw = String(ipOrIdentity || '').split('%')[0].trim();
  if (!raw || raw === '-') return null;
  const addr = raw.endsWith('/64') ? raw.slice(0, -3) : raw;
  if (isPrivate(addr)) return null;
  return addr;
}

/**
 * @param {string} addr
 */
function isPrivate(addr) {
  const v = addr.toLowerCase();
  if (v === '127.0.0.1' || v === '::1') return true;
  if (v.startsWith('192.168.') || v.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('203.0.113.')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  return false;
}

/**
 * @param {string} addr
 * @returns {Promise<import('./stats-combine.js').StatsGeo | null>}
 */
async function lookupIpwho(addr) {
  const res = await fetch(`${IPWHO}/${encodeURIComponent(addr)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body || body.success === false) return null;
  const conn = body.connection && typeof body.connection === 'object' ? body.connection : {};
  return normalizeGeo({
    country: body.country_code || '',
    city: body.city || '',
    region: body.region || '',
    asOrg: conn.isp || conn.org || '',
  });
}

/**
 * @param {string} name
 * @returns {Promise<string | null>}
 */
async function dohTxt(name) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=TXT`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
  if (!res.ok) return null;
  const body = await res.json();
  const answers = Array.isArray(body.Answer) ? body.Answer : [];
  for (const ans of answers) {
    const data = String(ans.data || '').replace(/^"+|"+$/g, '').trim();
    if (data) return data;
  }
  return null;
}

/**
 * @param {string} addr
 */
function originName(addr) {
  if (addr.includes(':')) {
    const hex = expandV6Hex(addr);
    if (!hex) return null;
    return `${hex.split('').reverse().join('.')}.origin6.asn.cymru.com`;
  }
  const oct = addr.split('.');
  if (oct.length !== 4) return null;
  return `${oct[3]}.${oct[2]}.${oct[1]}.${oct[0]}.origin.asn.cymru.com`;
}

/**
 * @param {string} ip
 */
function expandV6Hex(ip) {
  const bare = ip.split('%')[0].trim().toLowerCase();
  let head;
  let tail;
  if (bare.includes('::')) {
    const parts = bare.split('::');
    if (parts.length !== 2) return null;
    head = parts[0] ? parts[0].split(':') : [];
    tail = parts[1] ? parts[1].split(':') : [];
  } else {
    head = bare.split(':');
    tail = [];
  }
  const pad = (groups) =>
    groups.filter((g) => g.length > 0).map((g) => {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      return g.padStart(4, '0');
    });
  const left = pad(head);
  const right = pad(tail);
  if (left.includes(null) || right.includes(null)) return null;
  const missing = 8 - left.length - right.length;
  if (bare.includes('::')) {
    if (missing < 1) return null;
  } else if (missing !== 0) {
    return null;
  }
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0000'), ...right];
  return groups.length === 8 ? groups.join('') : null;
}

/**
 * @param {string} addr
 * @returns {Promise<import('./stats-combine.js').StatsGeo | null>}
 */
async function lookupCymru(addr) {
  const origin = originName(addr);
  if (!origin) return null;
  const originTxt = await dohTxt(origin);
  if (!originTxt) return null;
  const parts = originTxt.split('|').map((p) => p.trim());
  const asn = parts[0] || '';
  const country = parts[2] || '';
  let asOrg = '';
  if (/^\d+$/.test(asn)) {
    const asTxt = await dohTxt(`AS${asn}.asn.cymru.com`);
    if (asTxt) {
      const asParts = asTxt.split('|').map((p) => p.trim());
      asOrg = asParts[4] || '';
    }
  }
  return normalizeGeo({ country, city: '', region: '', asOrg });
}

/**
 * @param {string} ipOrIdentity
 * @returns {Promise<import('./stats-combine.js').StatsGeo | null>}
 */
export async function lookupGeo(ipOrIdentity) {
  const addr = lookupAddress(ipOrIdentity);
  if (!addr) return null;
  try {
    const who = await lookupIpwho(addr);
    if (who && (who.city || who.region)) return who;
    const cymru = await lookupCymru(addr);
    return pickRicherGeo(who, cymru);
  } catch {
    try {
      return await lookupCymru(addr);
    } catch {
      return null;
    }
  }
}

/**
 * @param {import('./stats-combine.js').StatsRow[]} rows
 * @returns {Promise<Map<string, import('./stats-combine.js').StatsGeo>>}
 */
export async function lookupMissingGeos(rows) {
  /** @type {Map<string, import('./stats-combine.js').StatsGeo>} */
  const found = new Map();
  await Promise.all(
    (rows || []).map(async (row) => {
      if (!row) return;
      if (row.geo && (row.geo.city || row.geo.region)) return;
      const geo = await lookupGeo(row.ip);
      if (!geo) return;
      found.set(row.ip, geo);
      row.geo = geo;
      row.location = formatLocation(geo);
    })
  );
  return found;
}
