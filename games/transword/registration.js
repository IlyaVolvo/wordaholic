import { registerGame } from '../../app/games-contract.js';

registerGame({
  id: 'transword',
  name: 'TransWord',
  storageSchema: 1,
  languages: ['en', 'es', 'fr', 'ru', 'he', 'de'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
});
