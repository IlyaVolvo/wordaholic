const DB_NAME = 'wordaholic';
const DB_VERSION = 1;

/**
 * Platform IndexedDB wrapper.
 * Per-game stores use keys scoped by gameId.
 */
export class WordaholicStorage {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('results')) {
          const store = db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
          store.createIndex('byGame', 'gameId', { unique: false });
          store.createIndex('byGameLang', ['gameId', 'language'], { unique: false });
        }
        if (!db.objectStoreNames.contains('gameState')) {
          db.createObjectStore('gameState', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('statistics')) {
          db.createObjectStore('statistics', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async _tx(storeName, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSetting(key, fallback = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
      req.onerror = () => reject(req.error);
    });
  }

  async setSetting(key, value) {
    await this._tx('settings', 'readwrite', (store) => {
      store.put({ key, value });
    });
  }

  async putResult(gameId, language, result) {
    const record = {
      gameId,
      language,
      result,
      playedAt: new Date().toISOString(),
      storageSchema: result?.storageSchema ?? 1,
    };
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('results', 'readwrite');
      const req = tx.objectStore('results').add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async listResults(gameId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('results', 'readonly');
      const idx = tx.objectStore('results').index('byGame');
      const req = idx.getAll(gameId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async clearResults(gameId) {
    const all = await this.listResults(gameId);
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('results', 'readwrite');
      const store = tx.objectStore('results');
      for (const row of all) store.delete(row.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getGameState(gameId, key) {
    const fullKey = `${gameId}:${key}`;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gameState', 'readonly');
      const req = tx.objectStore('gameState').get(fullKey);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  async setGameState(gameId, key, value) {
    const fullKey = `${gameId}:${key}`;
    await this._tx('gameState', 'readwrite', (store) => {
      store.put({ key: fullKey, value, gameId });
    });
  }

  async getStatistics(gameId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('statistics', 'readonly');
      const req = tx.objectStore('statistics').get(gameId);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  async setStatistics(gameId, value) {
    await this._tx('statistics', 'readwrite', (store) => {
      store.put({ key: gameId, value });
    });
  }

  async getMetadata(key, fallback = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readonly');
      const req = tx.objectStore('metadata').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
      req.onerror = () => reject(req.error);
    });
  }

  async setMetadata(key, value) {
    await this._tx('metadata', 'readwrite', (store) => {
      store.put({ key, value });
    });
  }

  /**
   * Per-game export envelope (smart merge rules later).
   * @param {string} gameId
   */
  async exportGame(gameId) {
    const [results, statistics, stateKeys] = await Promise.all([
      this.listResults(gameId),
      this.getStatistics(gameId),
      this._listGameStates(gameId),
    ]);
    return {
      format: 'wordaholic-game-backup',
      formatVersion: 1,
      gameId,
      exportedAt: new Date().toISOString(),
      statistics,
      results,
      gameState: stateKeys,
    };
  }

  async _listGameStates(gameId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gameState', 'readonly');
      const req = tx.objectStore('gameState').getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).filter((r) => r.gameId === gameId || String(r.key).startsWith(`${gameId}:`));
        resolve(rows.map((r) => ({ key: r.key, value: r.value })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Import per-game backup. Preserve-by-append for results; replace statistics if present.
   * Detailed merge rules are parked for later.
   * @param {object} payload
   */
  async importGame(payload) {
    if (!payload || payload.format !== 'wordaholic-game-backup' || !payload.gameId) {
      throw new Error('Invalid Wordaholic game backup');
    }
    const gameId = payload.gameId;
    if (payload.statistics != null) {
      await this.setStatistics(gameId, payload.statistics);
    }
    if (Array.isArray(payload.results)) {
      for (const row of payload.results) {
        await this.putResult(gameId, row.language || 'en', row.result || row);
      }
    }
    if (Array.isArray(payload.gameState)) {
      for (const row of payload.gameState) {
        const key = String(row.key || '').replace(new RegExp(`^${gameId}:`), '');
        if (key) await this.setGameState(gameId, key, row.value);
      }
    }
    return { gameId, importedResults: payload.results?.length || 0 };
  }
}

export const storage = new WordaholicStorage();
