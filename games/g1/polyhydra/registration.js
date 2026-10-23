import { registerGame } from '../../../app/games-contract.js';

registerGame({
  id: 'polyhydra',
  name: 'Hydra',
  storageSchema: 1,
  languages: ['en', 'ru', 'fr', 'es', 'he', 'hy'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
});
