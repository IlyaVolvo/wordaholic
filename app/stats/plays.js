/**
 * Browser id and the offline play-report queue.
 * Reports keep the device time from the moment the play happened.
 */

const ID_KEY = 'wordaholic-browser-id';
const QUEUE_KEY = 'wordaholic-play-queue';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function browserId() {
  let id = localStorage.getItem(ID_KEY) || '';
  if (!UUID_RE.test(id)) {
    id = crypto.randomUUID().toLowerCase();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * @param {Record<string, unknown>} report
 */
export function enqueuePlay(report) {
  const queue = readQueue();
  queue.push({ ...report, browserId: browserId() });
  writeQueue(queue);
  void flushPlays();
}

/**
 * @param {{ gameId: number, language: string, variant: string, puzzleDate: string }} fields
 */
export function reportPlayStart(fields) {
  enqueuePlay({ ...fields, kind: 'start', clientTime: Date.now() });
}

/**
 * @param {{ gameId: number, language: string, variant: string, puzzleDate: string, value: number, lossReason?: number | null }} fields
 */
export function reportPlayEnd(fields) {
  enqueuePlay({
    ...fields,
    kind: 'end',
    clientTime: Date.now(),
    value: fields.value,
    lossReason: fields.lossReason,
  });
}

let flushing = false;
let flushAgain = false;

function sameReport(a, b) {
  return (
    a.kind === b.kind &&
    a.browserId === b.browserId &&
    a.gameId === b.gameId &&
    a.puzzleDate === b.puzzleDate &&
    a.language === b.language &&
    a.variant === b.variant &&
    a.clientTime === b.clientTime
  );
}

export async function flushPlays() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    const queue = readQueue();
    if (!queue.length) return;
    const batch = queue.slice(0, 50);
    const res = await fetch('/api/plays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: batch }),
    });
    if (!res.ok) return;
    const body = await res.json();
    const results = Array.isArray(body.results) ? body.results : [];
    const pending = batch.map((item, index) => {
      const result = results[index];
      const keep = !result || result.retry === true || (result.ok !== true && result.ok !== false);
      return keep ? item : null;
    });
    const current = readQueue();
    const kept = [];
    const used = new Set();
    for (const item of current) {
      const index = pending.findIndex((candidate, i) => candidate && !used.has(i) && sameReport(candidate, item));
      if (index >= 0) {
        used.add(index);
        kept.push(item);
      } else if (!batch.some((sent) => sameReport(sent, item))) {
        kept.push(item);
      }
    }
    writeQueue(kept);
    const accepted = pending.filter((item) => !item).length;
    const arrived = current.filter((item) => !batch.some((sent) => sameReport(sent, item)));
    if ((accepted > 0 && kept.length > 0) || arrived.length > 0) flushAgain = true;
  } catch {
    /* stay queued */
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      void flushPlays();
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushPlays();
  });
  void flushPlays();
}
