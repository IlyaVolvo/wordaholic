import { deriveGameOutcome } from '../utils/gameOutcome';
import {
  appendFeedback,
  gameIdentity,
  getFeedback,
  getMeta,
  getPrefs,
  ingestLegacyStore,
  listStoredGames,
  putStoredGame,
  setMeta,
  setPrefs,
  type StoredGame,
} from '../storage/platform';

export interface User {
  id: number;
  email: string;
  verified?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface GameResponse {
  game: {
    id: number;
    language: string;
    word_length: number;
    target_word: string;
    game_date: string;
    is_random_mode: number;
    word_seed: number | null;
    is_complete: number;
    isWon: boolean;
    guessesCount: number;
    guesses: Array<{
      word: string;
      evaluations: unknown[];
    }>;
  } | null;
}

const LOCAL_USER: User = { id: 1, email: 'local@wordaholic', verified: 1 };

function matchesGame(
  game: StoredGame,
  params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
    isComplete?: boolean;
  }
): boolean {
  if (params.language && game.language !== params.language) return false;
  if (params.wordLength != null && game.word_length !== params.wordLength) return false;
  if (params.gameDate && game.game_date !== params.gameDate) return false;
  if (params.isRandomMode !== undefined) {
    const want = params.isRandomMode ? 1 : 0;
    if (game.is_random_mode !== want) return false;
  }
  if (params.wordSeed != null && game.word_seed !== params.wordSeed) return false;
  if (params.isComplete !== undefined) {
    const want = params.isComplete ? 1 : 0;
    if (game.is_complete !== want) return false;
  }
  return true;
}

async function withOutcome(game: StoredGame): Promise<NonNullable<GameResponse['game']>> {
  const outcome = await deriveGameOutcome({
    language: game.language,
    isComplete: game.is_complete === 1,
    targetWord: game.target_word,
    guesses: game.guesses,
  });
  return {
    ...game,
    isWon: outcome.isWon,
    guessesCount: outcome.guessesCount,
  };
}

class ApiClient {
  private token: string | null = 'local';

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async register(_email: string, _password: string, _lastReleaseIndex?: number): Promise<AuthResponse> {
    this.setToken('local');
    return { token: 'local', user: LOCAL_USER };
  }

  async login(_email: string, _password: string): Promise<AuthResponse> {
    this.setToken('local');
    return { token: 'local', user: LOCAL_USER };
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return { user: LOCAL_USER };
  }

  async forgotPassword(_email: string, _baseUrl: string): Promise<{ message: string }> {
    return { message: 'Offline mode — password reset is not available.' };
  }

  async resetPassword(_token: string, _password: string): Promise<{ message: string }> {
    return { message: 'Offline mode — password reset is not available.' };
  }

  async sendFeedback(comments: string): Promise<{ success: boolean; message: string }> {
    await appendFeedback(comments);
    return { success: true, message: 'Saved locally (offline).' };
  }

  async getCurrentGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const games = await listStoredGames();
    const found = games.find((g) => matchesGame(g, { ...params, isComplete: false }));
    if (!found) return { game: null };
    return { game: await withOutcome(found) };
  }

  async getCompletedGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const games = await listStoredGames();
    const found = games.find((g) => matchesGame(g, { ...params, isComplete: true }));
    if (!found) return { game: null };
    return { game: await withOutcome(found) };
  }

  async saveGame(gameData: {
    language: string;
    wordLength: number;
    targetWord: string;
    gameDate: string;
    isRandomMode?: boolean;
    wordSeed?: number;
    guesses?: Array<{ word: string; evaluations: unknown[] }>;
    isComplete: boolean;
    isWon: boolean;
  }): Promise<{ success: boolean; gameId: number }> {
    if (gameData.isRandomMode) return { success: true, gameId: 0 };
    const games = await listStoredGames();
    const isRandom = 0;
    const seed = gameData.wordSeed ?? null;
    const identity = gameIdentity({
      language: gameData.language,
      word_length: gameData.wordLength,
      game_date: gameData.gameDate,
      is_random_mode: isRandom,
      word_seed: seed,
    });
    const existing = games.find((g) => gameIdentity(g) === identity);
    const now = new Date().toISOString();
    if (existing) {
      await putStoredGame({
        ...existing,
        target_word: gameData.targetWord,
        guesses: gameData.guesses || [],
        is_complete: gameData.isComplete ? 1 : 0,
        updated_at: now,
        completed_at: gameData.isComplete ? now : null,
      });
      return { success: true, gameId: existing.id };
    }

    const meta = await getMeta();
    const id = meta.nextId;
    await setMeta({ nextId: id + 1 });
    await putStoredGame({
      id,
      language: gameData.language,
      word_length: gameData.wordLength,
      target_word: gameData.targetWord,
      game_date: gameData.gameDate,
      is_random_mode: isRandom,
      word_seed: seed,
      is_complete: gameData.isComplete ? 1 : 0,
      guesses: gameData.guesses || [],
      updated_at: now,
      completed_at: gameData.isComplete ? now : null,
    });
    return { success: true, gameId: id };
  }

  async getHistory(
    language?: string,
    wordLength?: number,
    limit?: number
  ): Promise<{ games: unknown[] }> {
    let games = await listStoredGames();
    games = games.filter((g) => {
      if (language && g.language !== language) return false;
      if (wordLength != null && g.word_length !== wordLength) return false;
      return true;
    });
    games = games.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (limit != null) games = games.slice(0, limit);

    const mapped = await Promise.all(
      games.map(async (game) => {
        const outcome = await deriveGameOutcome({
          language: game.language,
          isComplete: game.is_complete === 1,
          targetWord: game.target_word,
          guesses: game.guesses,
        });
        // Statistics expects parseable gameStarted/gameEnded timestamps (mlw API shape).
        const started = game.updated_at || `${game.game_date}T12:00:00.000Z`;
        const ended = game.completed_at || (game.is_complete === 1 ? started : null);
        return {
          id: game.id,
          userId: LOCAL_USER.id,
          language: game.language,
          wordLength: game.word_length,
          targetWord: game.target_word,
          gameDate: game.game_date,
          game_date: game.game_date,
          gameStarted: started,
          gameEnded: ended,
          isRandomMode: game.is_random_mode === 1,
          wordSeed: game.word_seed,
          isComplete: game.is_complete === 1,
          isWon: outcome.isWon,
          guessesCount: outcome.guessesCount,
          guesses: game.guesses,
        };
      })
    );
    return { games: mapped };
  }

  async getBulkGames(params: {
    language: string;
    wordLength: number;
    startDate: string;
    endDate: string;
  }): Promise<{ games: Record<string, unknown> }> {
    const all = await listStoredGames();
    const entries = await Promise.all(
      all
        .filter(
          (g) =>
            g.language === params.language &&
            g.word_length === params.wordLength &&
            g.is_random_mode === 0 &&
            g.game_date >= params.startDate &&
            g.game_date <= params.endDate
        )
        .map(async (game) => {
          const withOut = await withOutcome(game);
          return [game.game_date, withOut] as const;
        })
    );
    return { games: Object.fromEntries(entries) };
  }

  async getPreferences(): Promise<{ selectedLanguages: string[] | null }> {
    const prefs = await getPrefs();
    return { selectedLanguages: prefs?.selectedLanguages ?? null };
  }

  async savePreferences(selectedLanguages: string[] | null): Promise<{ success: boolean }> {
    const prefs = (await getPrefs()) || {
      randomMode: false,
      language: 'en',
      wordLength: 5,
    };
    await setPrefs({
      ...prefs,
      selectedLanguages: selectedLanguages || undefined,
    });
    return { success: true };
  }

  async updateReleaseSeen(_index: number): Promise<{ success: boolean }> {
    return { success: true };
  }

  async exportData(): Promise<string> {
    const [games, meta, prefs, feedback] = await Promise.all([
      listStoredGames(),
      getMeta(),
      getPrefs(),
      getFeedback(),
    ]);
    return JSON.stringify(
      {
        format: 'wordaholic-polywordlot',
        version: 1,
        exportedAt: new Date().toISOString(),
        store: {
          nextId: meta.nextId,
          games,
          selectedLanguages: prefs?.selectedLanguages ?? null,
          feedback,
        },
      },
      null,
      2
    );
  }

  async importData(jsonText: string): Promise<{ success: boolean; games: number }> {
    const parsed = JSON.parse(jsonText) as {
      store?: { nextId?: number; games?: StoredGame[]; selectedLanguages?: string[] | null };
    } & { games?: StoredGame[]; nextId?: number; selectedLanguages?: string[] | null };
    const incoming = parsed.store || parsed;
    if (!incoming || !Array.isArray(incoming.games)) {
      throw new Error('Invalid PolyWordlot export file');
    }
    const count = await ingestLegacyStore(incoming);
    return { success: true, games: count };
  }
}

export const apiClient = new ApiClient();
