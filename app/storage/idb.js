const DB_NAME = 'wordaholic';
const DB_VERSION = 3;

/**
 * Platform IndexedDB wrapper.
 * Per-game stores use keys scoped by gameId.
 */
const OPEN_TIMEOUT_MS = 2500;

export class WordaholicStorage {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
    /** @type {Promise<IDBDatabase>|null} */
    this._opening = null;
    this._lifecycleHooked = false;
    this._dailiesCopied = false;
  }

  _hookLifecycle() {
    if (this._lifecycleHooked || typeof window === 'undefined') return;
    this._lifecycleHooked = true;
    const close = () => this.close();
    window.addEventListener('pagehide', close);
    document.addEventListener('freeze', close);
  }

  close() {
    if (!this.db) return;
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
    this.db = null;
  }

  /**
   * Open the database. Times out on iOS when a bfcache'd page still holds the
   * connection; a later success still stores `this.db` for the next caller.
   * @param {{ timeoutMs?: number }} [opts]
   */
  async open(opts = {}) {
    if (this.db && this._dailiesCopied) return this.db;
    this._hookLifecycle();
    if (this._opening) return this._opening;

    const timeoutMs = opts.timeoutMs ?? OPEN_TIMEOUT_MS;
    this._opening = (async () => {
      const db = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('IndexedDB open timed out'));
      }, timeoutMs);

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = req.transaction;
        const oldVersion = /** @type {IDBVersionChangeEvent} */ (event).oldVersion || 0;
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
        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('byGame', 'gameId', { unique: false });
        }
        // v2 dailies → generic records (same document: id + gameId + payload).
        if (
          oldVersion < 3 &&
          db.objectStoreNames.contains('dailies') &&
          db.objectStoreNames.contains('records') &&
          tx
        ) {
          const source = tx.objectStore('dailies');
          const dest = tx.objectStore('records');
          const cursorReq = source.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const row = cursor.value;
            if (row && row.id) dest.put(row);
            cursor.continue();
          };
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          if (this.db === db) this.db = null;
        };
        db.onversionchange = () => this.close();
        this.db = db;
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(db);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(req.error || new Error('IndexedDB open failed'));
      };
    });
      await this._copyLegacyDailiesIfNeeded();
      return db;
    })();

    try {
      return await this._opening;
    } finally {
      this._opening = null;
    }
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
      let id = null;
      req.onsuccess = () => {
        id = req.result;
      };
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
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

  async _copyLegacyDailiesIfNeeded() {
    if (this._dailiesCopied) return;
    const db = this.db;
    if (!db || !db.objectStoreNames.contains('dailies') || !db.objectStoreNames.contains('records')) {
      this._dailiesCopied = true;
      return;
    }

    const already = await new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readonly');
      const req = tx.objectStore('metadata').get('dailies-copied-to-records');
      req.onsuccess = () => resolve(req.result ? req.result.value : false);
      req.onerror = () => reject(req.error);
    });
    if (already) {
      this._dailiesCopied = true;
      return;
    }

    const legacy = await new Promise((resolve, reject) => {
      const tx = db.transaction('dailies', 'readonly');
      const req = tx.objectStore('dailies').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'metadata'], 'readwrite');
      const rec = tx.objectStore('records');
      for (const row of legacy) {
        if (row?.id) rec.put(row);
      }
      tx.objectStore('metadata').put({ key: 'dailies-copied-to-records', value: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this._dailiesCopied = true;
  }

  /**
   * Generic per-game documents (completed and in-progress share this store).
   * @param {{ id: string, gameId: string }} record
   */
  async putRecord(record) {
    if (!record?.id || !record?.gameId) {
      throw new Error('Record requires id and gameId');
    }
    await this._tx('records', 'readwrite', (store) => {
      store.put(record);
    });
  }

  async getRecord(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const req = tx.objectStore('records').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async listRecords(gameId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const idx = tx.objectStore('records').index('byGame');
      const req = idx.getAll(gameId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async putDaily(record) {
    await this.putRecord(record);
  }

  async getDaily(id) {
    return this.getRecord(id);
  }

  async listDailies(gameId) {
    return this.listRecords(gameId);
  }

  /**
   * Per-game export envelope (smart merge rules later).
   * @param {string} gameId
   */
  async exportGame(gameId) {
    const [results, statistics, stateKeys, records] = await Promise.all([
      this.listResults(gameId),
      this.getStatistics(gameId),
      this._listGameStates(gameId),
      this.listRecords(gameId),
    ]);
    return {
      format: 'wordaholic-game-backup',
      formatVersion: 1,
      gameId,
      exportedAt: new Date().toISOString(),
      statistics,
      results,
      gameState: stateKeys,
      records,
      dailies: records,
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
    const docs = Array.isArray(payload.records)
      ? payload.records
      : Array.isArray(payload.dailies)
        ? payload.dailies
        : [];
    for (const row of docs) {
      if (!row || typeof row !== 'object') continue;
      const id = row.id || `${gameId}:${row.language}:${row.vocabLevel}:${row.difficulty}:${row.gameDate}`;
      await this.putRecord({ ...row, id, gameId });
    }
    return { gameId, importedResults: payload.results?.length || 0 };
  }
}

export const storage = new WordaholicStorage();
