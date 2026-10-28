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
 * @param {{ gameId: number, language: string, variant: string, puzzleDate: string, value: number, helpCount?: number }} fields
 */
export function reportPlayEnd(fields) {
  enqueuePlay({
    ...fields,
    kind: 'end',
    clientTime: Date.now(),
    value: fields.value,
    helpCount: fields.helpCount,
  });
}

let flushing = false;

export async function flushPlays() {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return;
  const queue = readQueue();
  if (!queue.length) return;
  flushing = true;
  try {
    const batch = queue.slice(0, 50);
    const rest = queue.slice(50);
    const res = await fetch('/api/plays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: batch }),
    });
    if (!res.ok) return;
    const body = await res.json();
    const results = Array.isArray(body.results) ? body.results : [];
    const retry = [];
    for (let i = 0; i < batch.length; i += 1) {
      const result = results[i];
      if (!result || (result.ok !== true && result.ok !== false)) retry.push(batch[i]);
    }
    writeQueue([...retry, ...rest]);
  } catch {
    /* stay queued */
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushPlays();
  });
  void flushPlays();
}
