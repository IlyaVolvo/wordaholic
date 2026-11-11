import { registerGame } from '../../../app/games-contract.js';

registerGame({
  id: 'polywordlot',
  name: 'PolyWordlot',
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
      return lengths.map((length) => ({ id: String(length), label: `${length} letters` }));
    },
    formatScore(value) {
      const rounded = Math.round(Number(value) * 100) / 100;
      return String(rounded);
    },
  },
});
