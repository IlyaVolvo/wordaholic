/**
 * Client-side admin gate (soft protection for a static site).
 * Default password: wordaholic-admin
 * To change: update PASSWORD_HASH to sha256 hex of the new password.
 */
export const PASSWORD_HASH =
  '1729cd87b3025b54276345ffb5bd8504b68decb3f9f6e59794498d862e1eccd8';

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyAdminPassword(password) {
  const hash = await sha256Hex(password);
  return hash === PASSWORD_HASH;
}
