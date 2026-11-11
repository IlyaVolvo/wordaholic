import { registerGame } from '../../../app/games-contract.js';

registerGame({
  id: 'transword',
  name: 'TransWord',
  storageSchema: 1,
  languages: ['en', 'es', 'fr', 'ru', 'he'],
  async initialize() {},
  start() {},
  saveState() { return null; },
  restoreState() {},
  getStatistics() { return null; },
  scoreboard: {
    configurations() {
      const vocab = [
        [1, 'Basic'],
        [2, 'Standard'],
      ];
      const difficulty = [
        [3, 'Easy'],
        [4, 'Medium'],
        [6, 'Hard'],
      ];
      /** @type {{ id: string, label: string }[]} */
      const options = [];
      for (const [level, levelLabel] of vocab) {
        for (const [rank, rankLabel] of difficulty) {
          options.push({
            id: `${level},${rank}`,
            label: `${levelLabel}, ${rankLabel} (${rank})`,
          });
        }
      }
      return options;
    },
    formatScore(value) {
      const sec = Math.max(0, Math.round(Number(value) / 1000));
      const minutes = Math.floor(sec / 60);
      const seconds = sec % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    },
  },
});
