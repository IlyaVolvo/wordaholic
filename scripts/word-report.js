/**
 * Anonymous word reports posted into a Telegram topic as a poll.
 * Missing and Questionable topics come from TELEGRAM_TOPIC_MISSING and TELEGRAM_TOPIC_QUESTIONABLE.
 * The question is the words. The description is language, game, name, and client IP.
 * Missing votes Add or Leave out. Questionable votes Remove or Keep.
 * Authentication is not required yet; reject here later before sendTelegram.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;
/** @type {Map<string, number[]>} */
const recent = new Map();

export const WORD_REPORT_MAX_BYTES = 2048;

/** Menus match word-data/<Language>/language.json. */
const LANGUAGES = {
  en: 'English',
  ru: 'Русский',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  he: 'עברית',
  hy: 'Հայերեն',
};

const ACTIONS = new Set(['missing', 'questionable']);

/** Ids and names match the home-screen game registry. */
const GAMES = {
  polywordlot: 'PolyWordlot',
  transword: 'TransWord',
  polyhydra: 'Hydra',
  letterix: 'Letterix',
};

const WORD_RE = /^(?=.*\p{L})[\p{L}\p{M}'’ʼ-]+$/u;
const MAX_WORDS = 40;
const MAX_NAME = 80;
const POLL_QUESTION_MAX = 300;
const POLL_DESCRIPTION_MAX = 1024;

/**
 * Blank stays anonymous. A provided name is one line, capped in length.
 * @param {unknown} raw
 * @returns {string | null}
 */
function reportName(raw) {
  if (typeof raw !== 'string') return 'anonymous';
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return 'anonymous';
  if (name.length > MAX_NAME || /[\u0000-\u001F\u007F]/.test(name)) return null;
  return name;
}

/**
 * @param {string} raw
 * @returns {string[] | null}
 */
function parseWords(raw) {
  const words = String(raw || '').trim().split(/[,\s]+/).filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return null;
  if (words.some((word) => word.length > 64 || !WORD_RE.test(word))) return null;
  return words;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, report: { game: string, gameName: string, language: string, languageName: string, action: string, words: string[], name: string } } | { ok: false, error: string }}
 */
export function parseWordReport(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid report' };
  const game = typeof body.game === 'string' ? body.game.trim() : '';
  const language = typeof body.language === 'string' ? body.language.trim().toLowerCase() : '';
  const rawAction = typeof body.action === 'string' ? body.action.trim() : '';
  const action = rawAction === 'remove' ? 'questionable' : rawAction;
  const words = typeof body.words === 'string' ? parseWords(body.words) : null;
  const name = reportName(body.name);
  if (!GAMES[game]) return { ok: false, error: 'Choose a game' };
  if (!LANGUAGES[language]) return { ok: false, error: 'Choose a language' };
  if (!ACTIONS.has(action)) return { ok: false, error: 'Choose missing or questionable' };
  if (!words) return { ok: false, error: 'Enter one or more words, separated by spaces or commas' };
  if (!name) return { ok: false, error: 'Name is too long' };
  return {
    ok: true,
    report: {
      game,
      gameName: GAMES[game],
      language,
      languageName: LANGUAGES[language],
      action,
      words,
      name,
    },
  };
}

/**
 * Topic id for this report. Missing and Questionable are separate configuration values.
 * @param {{ TELEGRAM_TOPIC_MISSING?: string, TELEGRAM_TOPIC_QUESTIONABLE?: string }} env
 * @param {string} action
 */
function topicId(env, action) {
  const raw = action === 'missing' ? env?.TELEGRAM_TOPIC_MISSING : env?.TELEGRAM_TOPIC_QUESTIONABLE;
  const id = Number(String(raw || '').trim());
  return Number.isInteger(id) && id > 0 ? id : 0;
}

/**
 * Keep a client address that can sit inside parentheses. Anything else becomes a dash.
 * @param {string} ip
 */
function reportIp(ip) {
  const value = String(ip || '').trim().replace(/^::ffff:/i, '');
  return /^[0-9a-f:.]+$/i.test(value) ? value : '-';
}

/**
 * Telegram counts characters, including ones outside the BMP.
 * @param {string} text
 * @param {number} max
 */
function clip(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  if (max < 1) return '';
  return `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * Poll the topic can vote on. The question is the words. The description keeps
 * language, game, name, and client IP. A blank name is written as anonymous.
 * @param {{ gameName: string, languageName: string, action: string, words: string[], name: string }} report
 * @param {string} ip
 * @returns {{ question: string, description: string, options: { text: string }[] }}
 */
export function reportPoll(report, ip) {
  const who = report.name && report.name.trim() ? report.name.trim() : 'anonymous';
  const words = report.words.join(', ');
  const about = `${report.languageName}: ${report.gameName}: ${who} (${reportIp(ip)})`;
  const question = clip(words, POLL_QUESTION_MAX);
  const description = clip(question === words ? about : `${about}\n${words}`, POLL_DESCRIPTION_MAX);
  const options = report.action === 'missing'
    ? [{ text: 'Add' }, { text: 'Leave out' }]
    : [{ text: 'Remove' }, { text: 'Keep' }];
  return { question, description, options };
}

/**
 * @param {string} ip
 * @param {number} [now]
 */
export function allowReport(ip, now = Date.now()) {
  const key = ip || '-';
  const prev = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_PER_WINDOW) {
    recent.set(key, prev);
    return false;
  }
  prev.push(now);
  recent.set(key, prev);
  return true;
}

/**
 * @param {string} token
 * @param {string} chatId
 * @param {number} threadId
 * @param {{ question: string, description: string, options: { text: string }[] }} poll
 */
async function sendTelegram(token, chatId, threadId, poll) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId,
        question: poll.question,
        description: poll.description,
        options: poll.options,
        is_anonymous: false,
        allows_multiple_answers: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('word report telegram', err instanceof Error ? err.message : 'fetch failed');
    return false;
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || !payload || payload.ok !== true) {
    console.error('word report telegram status', res.status);
    return false;
  }
  return true;
}

/**
 * @param {{ method: string, raw: string, env: { TELEGRAM_BOT_TOKEN?: string, TELEGRAM_CHAT_ID?: string, TELEGRAM_TOPIC_MISSING?: string, TELEGRAM_TOPIC_QUESTIONABLE?: string }, ip: string }} input
 * @returns {Promise<{ status: number, body: { ok?: boolean, error?: string } }>}
 */
export async function submitWordReport({ method, raw, env, ip }) {
  if (method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } };
  }
  if (typeof raw !== 'string' || raw.length > WORD_REPORT_MAX_BYTES) {
    return { status: 413, body: { error: 'Payload too large' } };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  const report = parseWordReport(parsed);
  if (!report.ok) return { status: 400, body: { error: report.error } };
  const token = String(env?.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(env?.TELEGRAM_CHAT_ID || '').trim();
  const threadId = topicId(env, report.report.action);
  if (!token || !chatId || !threadId) {
    return { status: 503, body: { error: 'Reports can’t be sent right now' } };
  }
  if (!allowReport(ip)) {
    return { status: 429, body: { error: 'Too many reports. Try again later.' } };
  }
  const sent = await sendTelegram(token, chatId, threadId, reportPoll(report.report, ip));
  if (!sent) return { status: 502, body: { error: 'Could not send the report' } };
  return { status: 200, body: { ok: true } };
}
