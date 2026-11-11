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
  scoreboard: {
    configurations(language) {
      const lengths = Array.isArray(language?.polywordlotLengths) ? language.polywordlotLengths : [];
      /** @type {{ id: string, label: string }[]} */
      const options = [];
      for (const length of lengths) {
        for (let boards = 2; boards <= 20; boards += 1) {
          options.push({ id: `${length},${boards}`, label: `${length} letters, ${boards} boards` });
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
