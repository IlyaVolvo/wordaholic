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
 *   bucket: string,
 *   objectKey: string,
 *   body: string,
 *   now?: Date,
 *   region?: string,
 *   fetchImpl?: typeof fetch,
 * }} opts
 */
export async function putGcsObject(opts) {
  const region = opts.region || 'auto';
  const service = 's3';
  const now = opts.now || new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const uri = canonicalUri(opts.bucket, opts.objectKey);
  const host = 'storage.googleapis.com';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const contentType = 'application/json; charset=utf-8';

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    uri,
    '',
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

  const fetchImpl = opts.fetchImpl || fetch;
  const url = `https://${host}${uri}`;
  const res = await fetchImpl(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body: opts.body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GCS PUT ${res.status} ${opts.objectKey}: ${text.slice(0, 500)}`);
  }
}

/**
 * @param {{ GCS_BUCKET?: string, GCS_HMAC_ACCESS_KEY?: string, GCS_HMAC_SECRET?: string }} env
 */
export function gcsConfigured(env) {
  return Boolean(env.GCS_BUCKET && env.GCS_HMAC_ACCESS_KEY && env.GCS_HMAC_SECRET);
}
