export function asWords(values) {
  if (typeof values === 'string') {
    try {
      values = JSON.parse(values);
    } catch {
      return values ? [values] : [];
    }
  }
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => {
      if (typeof v === 'string') return v;
      if (!v || typeof v !== 'object') return '';
      if (v.word) return String(v.word);
      if (v.guess) return String(v.guess);
      const letters = Array.isArray(v.evaluations) ? v.evaluations : Array.isArray(v) ? v : [];
      return letters.map((item) => (typeof item === 'string' ? item : item?.letter || '')).join('');
    })
    .filter(Boolean);
}

export function asGameDate(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : raw;
}

function sameWord(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function polyFields(row) {
  const guesses = asWords(row.guesses);
  const target = String(row.target_word || row.targetWord || '').trim();
  const stated = Number(row.word_length ?? row.wordLength);
  const word_length =
    Number.isFinite(stated) && stated > 0
      ? stated
      : guesses[0]?.length || target.length || 0;
  return {
    language: String(row.language || '').trim(),
    word_length,
    target_word: target,
    game_date: asGameDate(row.game_date || row.gameDate),
    guesses,
    updated_at: row.updated_at || row.updatedAt || '',
    completed_at: row.completed_at || row.completedAt || '',
  };
}

export function isPracticeRecord(row) {
  return Number(row?.is_random_mode) === 1;
}

function isTranswordRow(row) {
  if (row?.gameId === 'transword') return true;
  if (row?.gameId === 'polywordlot' || row?.guesses || row?.game_date || row?.word_length != null) {
    return false;
  }
  return Array.isArray(row?.path) && Boolean(row?.gameDate);
}

export function isCompletedRecord(row) {
  if (!row || typeof row !== 'object' || isPracticeRecord(row)) return false;
  if (isTranswordRow(row)) {
    const path = asWords(row.path);
    return Boolean(row.isComplete) || Boolean(row.end && path.includes(row.end));
  }
  const poly = polyFields(row);
  if (poly.guesses.length >= 6) return true;
  if (polyWon({ ...row, ...poly })) return true;
  return Number(row.is_complete) === 1 || row.isComplete === true;
}

function toTranswordExport(row) {
  const out = {
    language: String(row.language || ''),
    vocabLevel: Number(row.vocabLevel),
    difficulty: Number(row.difficulty),
    gameDate: String(row.gameDate || ''),
    start: String(row.start || ''),
    end: String(row.end || ''),
    optimal: Number(row.optimal) || 0,
    path: asWords(row.path),
    elapsedMs: Math.max(0, Number(row.elapsedMs) || 0),
    deadendCount: Math.max(0, Number(row.deadendCount) || 0),
    helpCount: Math.max(0, Number(row.helpCount) || 0),
  };
  if (row.updatedAt) out.updatedAt = String(row.updatedAt);
  return out;
}

export function toExportRecord(row) {
  if (isTranswordRow(row)) return toTranswordExport(row);
  const poly = polyFields(row);
  const out = {
    language: poly.language,
    word_length: poly.word_length,
    target_word: poly.target_word,
    game_date: poly.game_date,
    guesses: poly.guesses,
    won: polyWon(poly),
  };
  if (poly.updated_at) out.updated_at = poly.updated_at;
  if (poly.completed_at) out.completed_at = poly.completed_at;
  return out;
}

export function completedRecordId(gameId, row) {
  if (gameId === 'transword') {
    const gameDate = asGameDate(row?.gameDate);
    if (!row?.language || row.vocabLevel == null || row.difficulty == null || !gameDate) return '';
    return `${gameId}:${row.language}:${row.vocabLevel}:${row.difficulty}:${gameDate}`;
  }
  const poly = polyFields(row);
  if (!poly.language || !poly.word_length || !poly.game_date) return '';
  return `${gameId}:game:${poly.language}|${poly.word_length}|${poly.game_date}|0|`;
}

export function toStoredRecord(gameId, row, numericId = 0) {
  if (gameId === 'transword') {
    const gameDate = asGameDate(row.gameDate);
    return {
      id: completedRecordId(gameId, { ...row, gameDate }),
      gameId,
      language: String(row.language || ''),
      vocabLevel: Number(row.vocabLevel),
      difficulty: Number(row.difficulty),
      gameDate,
      start: String(row.start || ''),
      end: String(row.end || ''),
      optimal: Number(row.optimal) || 0,
      path: asWords(row.path),
      elapsedMs: Math.max(0, Number(row.elapsedMs) || 0),
      deadendCount: Math.max(0, Number(row.deadendCount) || 0),
      helpCount: Math.max(0, Number(row.helpCount) || 0),
      isComplete: true,
      updatedAt: row.updatedAt || new Date().toISOString(),
    };
  }
  const poly = polyFields(row);
  return {
    id: completedRecordId(gameId, poly),
    gameId,
    kind: 'game',
    numericId,
    language: poly.language,
    word_length: poly.word_length,
    target_word: poly.target_word,
    game_date: poly.game_date,
    is_random_mode: 0,
    word_seed: null,
    is_complete: 1,
    guesses: poly.guesses,
    updated_at: poly.updated_at || new Date().toISOString(),
    completed_at: poly.completed_at || poly.updated_at || new Date().toISOString(),
  };
}

function polyWon(row) {
  const poly = polyFields(row);
  const last = poly.guesses[poly.guesses.length - 1];
  return Boolean(last && poly.target_word && sameWord(last, poly.target_word));
}

function pickPolywordlot(local, incoming) {
  const localWon = polyWon(local);
  const incomingWon = polyWon(incoming);
  if (localWon !== incomingWon) return incomingWon ? local : incoming;
  const localN = asWords(local.guesses).length;
  const incomingN = asWords(incoming.guesses).length;
  if (incomingN !== localN) return incomingN > localN ? incoming : local;
  return local;
}

function pickTransword(local, incoming) {
  const localSteps = Math.max(0, asWords(local.path).length - 1);
  const incomingSteps = Math.max(0, asWords(incoming.path).length - 1);
  if (incomingSteps !== localSteps) return incomingSteps > localSteps ? incoming : local;
  const localAssist = (Number(local.helpCount) || 0) + (Number(local.deadendCount) || 0);
  const incomingAssist = (Number(incoming.helpCount) || 0) + (Number(incoming.deadendCount) || 0);
  if (incomingAssist !== localAssist) return incomingAssist > localAssist ? incoming : local;
  const localTime = Number(local.elapsedMs) || 0;
  const incomingTime = Number(incoming.elapsedMs) || 0;
  if (incomingTime !== localTime) return incomingTime > localTime ? incoming : local;
  return local;
}

export function pickRecordToKeep(local, incoming) {
  if (!local) return incoming;
  if (!isCompletedRecord(local)) return incoming;
  if (!isCompletedRecord(incoming)) return local;
  if (isTranswordRow(local) || isTranswordRow(incoming)) return pickTransword(local, incoming);
  return pickPolywordlot(local, incoming);
}
