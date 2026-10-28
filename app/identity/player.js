/**
 * Nickname on this device. The server accepts a change before it is stored here.
 */
import { browserId } from '../stats/plays.js';

const NICK_KEY = 'wordaholic-nickname';
const MEMORY_KEY = 'wordaholic-nickname-import';
const PENDING_KEY = 'wordaholic-nickname-pending';

const ADJECTIVES = [
  'Quiet', 'Bright', 'Swift', 'Amber', 'Bold', 'Calm', 'Clear', 'Cool', 'Fair', 'Glad',
  'Keen', 'Kind', 'Lucky', 'Merry', 'Noble', 'Rapid', 'Sunny', 'Warm', 'Wild', 'Wise',
];
const NOUNS = [
  'Otter', 'Maple', 'Heron', 'Cedar', 'Finch', 'Harbor', 'Lark', 'Meadow', 'Pebble', 'Quill',
  'River', 'Sparrow', 'Thistle', 'Willow', 'Badger', 'Clover', 'Falcon', 'Grove', 'Ivy', 'Juniper',
];

export function randomNickname() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}${noun}`.slice(0, 16);
}

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

export function importMemory() {
  const value = localStorage.getItem(MEMORY_KEY);
  return value === 'take' || value === 'keep' ? value : '';
}

export function setImportMemory(value) {
  if (value === 'take' || value === 'keep') localStorage.setItem(MEMORY_KEY, value);
  else localStorage.removeItem(MEMORY_KEY);
}

/**
 * @param {'set' | 'join' | 'clear'} action
 * @param {string} [nickname]
 */
export async function submitNickname(action, nickname) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, offline: true };
  }
  const res = await fetch('/api/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browserId: browserId(), action, nickname }),
  });
  if (res.status === 409) {
    const body = await res.json();
    return { ok: false, taken: true, suggestions: Array.isArray(body.suggestions) ? body.suggestions : [] };
  }
  if (!res.ok) return { ok: false };
  const body = await res.json();
  const stored = typeof body.nickname === 'string' ? body.nickname : '';
  if (stored) localStorage.setItem(NICK_KEY, stored);
  else localStorage.removeItem(NICK_KEY);
  localStorage.removeItem(PENDING_KEY);
  return { ok: true, nickname: stored };
}

export function queueJoin(nickname) {
  localStorage.setItem(PENDING_KEY, nickname);
  void flushPendingNickname();
}

export async function flushPendingNickname() {
  const pending = localStorage.getItem(PENDING_KEY);
  if (!pending) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const result = await submitNickname('join', pending);
  if (result.ok || result.taken) localStorage.removeItem(PENDING_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushPendingNickname();
  });
  void flushPendingNickname();
}
