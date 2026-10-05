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
  first_score: number | null;
  best_score: number | null;
  plays?: number;
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
  const rows = (await storage.listRecords(GAME_ID)) as ScoreRecord[];
  return rows
    .filter((row) => row.language === language && Number(row.W) === W && Number(row.H) === H && row.game_date)
    .sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)));
}

export async function loadScores(language: string, W: number, H: number, date: string): Promise<ScoreRecord | null> {
  const row = (await storage.getRecord(recordId(language, W, H, date))) as ScoreRecord | null;
  return row || null;
}

/** Finished games stored for a day. Older records without a count count as one. */
export function playCount(row: Pick<ScoreRecord, 'plays' | 'first_score' | 'best_score'> | null | undefined): number {
  if (!row) return 0;
  if (typeof row.plays === 'number' && row.plays > 0) return row.plays;
  if (row.first_score == null && row.best_score == null) return 0;
  return 1;
}

export async function saveScores(sim: Sim, previous: ScoreRecord | null): Promise<ScoreRecord> {
  const now = new Date().toISOString();
  const first = previous?.first_score == null ? sim.score : previous.first_score;
  const best = Math.max(previous?.best_score == null ? 0 : Number(previous.best_score), sim.score);
  const record: ScoreRecord = {
    id: recordId(sim.language, sim.W, sim.H, sim.date),
    gameId: GAME_ID,
    kind: 'game',
    language: sim.language,
    W: sim.W,
    H: sim.H,
    game_date: sim.date,
    first_score: first,
    best_score: Math.max(best, first),
    plays: playCount(previous) + 1,
    is_complete: 1,
    updated_at: now,
    completed_at: previous?.first_score == null ? now : previous.completed_at || now,
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
