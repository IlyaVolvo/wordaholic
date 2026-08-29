/**
 * PUT an object to GCS via the XML API and HMAC (AWS SigV4, region auto, service s3).
 * @see https://cloud.google.com/storage/docs/authentication/hmackeys
 */

const encoder = new TextEncoder();

/**
 * @param {string} hourIso
 */
export function gcsHourObjectKey(hourIso) {
  return `hours/${hourIso}.json`;
}

/**
 * @param {string} hour
 * @param {Record<string, unknown>} ips
 */
export function closedHourFile(hour, ips) {
  return JSON.stringify({ hours: [{ hour, ips }] });
}

/**
 * @param {BufferSource} buf
 */
function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {BufferSource | string} key
 * @param {string} message
 */
async function hmacSha256(key, message) {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

/**
 * @param {string} text
 */
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return hex(digest);
}

/**
 * @param {string} secret
 * @param {string} dateStamp
 * @param {string} region
 * @param {string} service
 */
async function signingKey(secret, dateStamp, region, service) {
  const kDate = await hmacSha256(`AWS4${secret}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * @param {string} objectKey
 */
function canonicalUri(bucket, objectKey) {
  return `/${bucket}/${objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

/**
 * @param {{
 *   accessKey: string,
 *   secret: string,
 *   method: string,
 *   uri: string,
 *   query?: string,
 *   extraHeaders?: Record<string, string>,
 *   body?: string,
 *   now?: Date,
 *   region?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
async function gcsSignedFetch(opts) {
  const region = opts.region || 'auto';
  const service = 's3';
  const now = opts.now || new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = 'storage.googleapis.com';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  /** @type {Record<string, string>} */
  const headerMap = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(opts.extraHeaders || {}),
  };
  const signedNames = Object.keys(headerMap)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = signedNames
    .map((name) => {
      const key = Object.keys(headerMap).find((k) => k.toLowerCase() === name);
      return `${name}:${headerMap[key]}\n`;
    })
    .join('');
  const signedHeaders = signedNames.join(';');
  const canonicalQuery = opts.query || '';
  const canonicalRequest = [
    opts.method,
    opts.uri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const key = await signingKey(opts.secret, dateStamp, region, service);
  const signature = hex(await hmacSha256(key, stringToSign));
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = canonicalQuery
    ? `https://${host}${opts.uri}?${canonicalQuery}`
    : `https://${host}${opts.uri}`;
  /** @type {Record<string, string>} */
  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
  };
  for (const [name, value] of Object.entries(opts.extraHeaders || {})) {
    headers[name] = value;
  }
  const fetchImpl = opts.fetchImpl || fetch;
  return fetchImpl(url, {
    method: opts.method,
    headers,
    body: opts.body,
  });
}

/**
 * @param {{
 *   accessKey: string,
 *   secret: string,
 *   bucket: string,
 *   objectKey: string,
 *   body: string,
 *   now?: Date,
 *   region?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function putGcsObject(opts) {
  const contentType = 'application/json; charset=utf-8';
  const res = await gcsSignedFetch({
    accessKey: opts.accessKey,
    secret: opts.secret,
    method: 'PUT',
    uri: canonicalUri(opts.bucket, opts.objectKey),
    extraHeaders: { 'Content-Type': contentType },
    body: opts.body,
    now: opts.now,
    region: opts.region,
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GCS PUT ${res.status} ${opts.objectKey}: ${text.slice(0, 500)}`);
  }
}

/**
 * @param {{
 *   accessKey: string,
 *   secret: string,
 *   bucket: string,
 *   objectKey: string,
 *   now?: Date,
 *   region?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function getGcsObject(opts) {
  const res = await gcsSignedFetch({
    accessKey: opts.accessKey,
    secret: opts.secret,
    method: 'GET',
    uri: canonicalUri(opts.bucket, opts.objectKey),
    now: opts.now,
    region: opts.region,
    fetchImpl: opts.fetchImpl,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`GCS GET ${res.status} ${opts.objectKey}: ${text.slice(0, 500)}`);
  }
  return text;
}

/**
 * @param {{
 *   accessKey: string,
 *   secret: string,
 *   bucket: string,
 *   prefix?: string,
 *   now?: Date,
 *   region?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function listGcsKeys(opts) {
  const prefix = opts.prefix || '';
  /** @type {string[]} */
  const keys = [];
  let marker = '';
  for (;;) {
    const params = [];
    if (prefix) params.push(`prefix=${encodeURIComponent(prefix)}`);
    if (marker) params.push(`marker=${encodeURIComponent(marker)}`);
    const query = params.join('&');
    const res = await gcsSignedFetch({
      accessKey: opts.accessKey,
      secret: opts.secret,
      method: 'GET',
      uri: `/${opts.bucket}`,
      query,
      now: opts.now,
      region: opts.region,
      fetchImpl: opts.fetchImpl,
    });
    const xml = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`GCS LIST ${res.status} ${opts.bucket}: ${xml.slice(0, 500)}`);
    }
    const page = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    keys.push(...page);
    const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
    if (!truncated) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : page[page.length - 1] || '';
    if (!marker) break;
  }
  return keys;
}

/**
 * @param {{ GCS_BUCKET?: string, GCS_HMAC_ACCESS_KEY?: string, GCS_HMAC_SECRET?: string }} env
 */
export function gcsConfigured(env) {
  return Boolean(env.GCS_BUCKET && env.GCS_HMAC_ACCESS_KEY && env.GCS_HMAC_SECRET);
}
