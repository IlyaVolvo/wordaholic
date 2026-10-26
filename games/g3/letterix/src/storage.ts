import { storage } from '@wordaholic/storage';
import type { Lexicon } from './lexicon.ts';
import { attachLexicon, createSim, exportState, importState, type PersistedSim, type Sim } from './sim.ts';

export const GAME_ID = 'letterix';

export type ScoreRecord = {
  id: string;
  gameId: 'letterix';
  kind: 'game';
  language: string;
  W: number;
  H: number;
  game_date: string;
  score: number | null;
  /** Words taken, in order. Absent on days finished before this field existed. */
  words?: string[];
  /** @deprecated Read-only leftover. Migrated into `score`. */
  first_score?: number | null;
  /** @deprecated Read-only leftover. Migrated into `score`. */
  best_score?: number | null;
  is_complete: 1;
  updated_at: string;
  completed_at: string | null;
};

export function variantKey(language: string, W: number, H: number, date: string): string {
  return `${language}|${W}|${H}|${date}`;
}

export function recordId(language: string, W: number, H: number, date: string): string {
  return `${GAME_ID}:game:${variantKey(language, W, H, date)}`;
}

export async function loadPrefs(): Promise<{ W: number; H: number } | null> {
  const prefs = (await storage.getGameState(GAME_ID, 'prefs')) as { W?: number; H?: number } | null;
  if (!prefs || !prefs.W || !prefs.H) return null;
  return { W: prefs.W, H: prefs.H };
}

export async function savePrefs(W: number, H: number) {
  await storage.setGameState(GAME_ID, 'prefs', { W, H });
}

export async function loadRun(
  language: string,
  W: number,
  H: number,
  date: string,
  lex: Lexicon,
): Promise<Sim | null> {
  const saved = (await storage.getGameState(GAME_ID, `run:${variantKey(language, W, H, date)}`)) as PersistedSim | null;
  if (!saved || (saved.version !== 1 && saved.version !== 2) || saved.W !== W || saved.H !== H || saved.date !== date) return null;
  const sim = importState(saved, lex);
  attachLexicon(sim, lex);
  return sim;
}

export async function saveRun(sim: Sim) {
  if (sim.phase === 'ready') return;
  await storage.setGameState(GAME_ID, `run:${variantKey(sim.language, sim.W, sim.H, sim.date)}`, exportState(sim));
}

export async function listVariantScores(language: string, W: number, H: number): Promise<ScoreRecord[]> {
  const rows = await listLanguageScores(language);
  return rows
    .filter((row) => Number(row.W) === W && Number(row.H) === H)
    .sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)));
}

export async function listLanguageScores(language: string): Promise<ScoreRecord[]> {
  const rows = (await storage.listRecords(GAME_ID)) as ScoreRecord[];
  const kept: ScoreRecord[] = [];
  for (const row of rows) {
    if (row.language !== language || !row.game_date) continue;
    const next = normalizedScore(row);
    if (scoreShapeChanged(row, next)) await storage.putRecord(next);
    kept.push(next);
  }
  return kept;
}

export async function loadScores(language: string, W: number, H: number, date: string): Promise<ScoreRecord | null> {
  const row = (await storage.getRecord(recordId(language, W, H, date))) as ScoreRecord | null;
  if (!row) return null;
  const next = normalizedScore(row);
  if (scoreShapeChanged(row, next)) await storage.putRecord(next);
  return next;
}

/** The number the calendar and averages already show: `score`, else the old best, else the old first. */
export function storedScore(row: Pick<ScoreRecord, 'score' | 'best_score' | 'first_score'> | null | undefined): number | null {
  if (!row) return null;
  if (row.score != null && Number.isFinite(Number(row.score))) return Number(row.score);
  if (row.best_score != null && Number.isFinite(Number(row.best_score))) return Number(row.best_score);
  if (row.first_score != null && Number.isFinite(Number(row.first_score))) return Number(row.first_score);
  return null;
}

export function storedWords(row: Pick<ScoreRecord, 'words'> | null | undefined): string[] {
  if (!row || !Array.isArray(row.words)) return [];
  return row.words.map((word) => String(word));
}

function normalizedScore(row: ScoreRecord, now = new Date().toISOString()): ScoreRecord {
  const score = storedScore(row);
  const record: ScoreRecord = {
    id: row.id,
    gameId: GAME_ID,
    kind: 'game',
    language: row.language,
    W: row.W,
    H: row.H,
    game_date: row.game_date,
    score,
    words: storedWords(row),
    is_complete: 1,
    updated_at: row.updated_at || now,
    completed_at: row.completed_at || row.updated_at || now,
  };
  return record;
}

function scoreShapeChanged(row: ScoreRecord, next: ScoreRecord): boolean {
  if (row.first_score != null || row.best_score != null || (row as { plays?: number }).plays != null) return true;
  if (row.score !== next.score) return true;
  const before = storedWords(row).join('\n');
  return before !== next.words?.join('\n');
}

export async function saveScores(sim: Sim, previous: ScoreRecord | null): Promise<ScoreRecord> {
  const now = new Date().toISOString();
  const already = storedScore(previous);
  if (previous && already != null) {
    const kept = normalizedScore(previous, now);
    if (scoreShapeChanged(previous, kept)) await storage.putRecord(kept);
    return kept;
  }
  const record: ScoreRecord = {
    id: recordId(sim.language, sim.W, sim.H, sim.date),
    gameId: GAME_ID,
    kind: 'game',
    language: sim.language,
    W: sim.W,
    H: sim.H,
    game_date: sim.date,
    score: sim.score,
    words: sim.words.slice(),
    is_complete: 1,
    updated_at: now,
    completed_at: now,
  };
  await storage.putRecord(record);
  return record;
}

export function freshSim(opts: {
  W: number;
  H: number;
  language: string;
  date: string;
  lex: Lexicon;
  A: number;
}): Sim {
  return createSim(opts);
}
