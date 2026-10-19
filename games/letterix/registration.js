import { registerGame } from '../../app/games-contract.js';

registerGame({
  id: 'letterix',
  name: 'Letterix',
  storageSchema: 1,
  languages: ['en'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
});
