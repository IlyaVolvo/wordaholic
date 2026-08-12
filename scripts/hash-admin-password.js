/**
 * Print SHA-256 hex for a password — store that value as ADMIN_PASSWORD on Render.
 *
 *   node scripts/hash-admin-password.js 'your-secret'
 */
import crypto from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-admin-password.js 'your-password'");
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
console.log(hash);
console.log('\nSet on Render (Static Site env):');
console.log(`  ADMIN_PASSWORD=${hash}`);
