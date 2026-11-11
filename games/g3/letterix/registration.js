import { registerGame } from '../../../app/games-contract.js';

registerGame({
  id: 'letterix',
  name: 'Letterix',
  storageSchema: 1,
  languages: ['en', 'ru','he'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
  scoreboard: {
    configurations() {
      /** @type {{ id: string, label: string }[]} */
      const options = [];
      for (let width = 6; width <= 12; width += 1) {
        for (let height = 10; height <= 20; height += 1) {
          options.push({ id: `${width},${height}|average`, label: `${width}×${height}, average` });
          options.push({ id: `${width},${height}|best`, label: `${width}×${height}, best` });
        }
      }
      return options;
    },
    formatScore(value) {
      const rounded = Math.round(Number(value) * 100) / 100;
      return String(rounded);
    },
  },
});
