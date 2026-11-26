/** @type {import('../registry.js').Scene} */
export default {
  id: 'reports',
  title: 'Telegram and word reports',
  summary: 'The group button, the home word report, and the two report controls inside a game.',
  start: '/',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '[data-transfer="feedback"]',
        text: 'This opens the Wordaholic group on Telegram. Word reports are sent there too.',
        place: 'top',
      },
      do: { type: 'wait', ms: 400 },
    },
    {
      detail: 'glance',
      callout: {
        selector: '[data-transfer="word-report"]',
        text: 'Report a word from the map: pick the game, the language, and whether it is missing or questionable.',
        place: 'top',
      },
      do: { type: 'click', selector: '[data-transfer="word-report"]' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '[data-word-report] select[name="game"]',
        text: 'The report names a game. The same dialog is not sent during this showcase.',
        place: 'left',
      },
      do: { type: 'select', selector: '[data-word-report] select[name="game"]', value: 'polywordlot' },
    },
    {
      detail: 'tour',
      do: { type: 'select', selector: '[data-word-report] select[name="language"]', value: 'en' },
    },
    {
      detail: 'tour',
      do: { type: 'click', selector: '[data-word-report] input[value="missing"]' },
    },
    {
      detail: 'tour',
      do: { type: 'type', selector: '[data-word-report] input[name="words"]', text: 'crane' },
    },
    {
      detail: 'tour',
      do: { type: 'click', selector: '[data-word-report] [data-close]' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[data-game="polywordlot"]',
        text: 'Each game has its own reports: one while you play, and one when the game ends.',
        place: 'left',
      },
      do: { type: 'click', selector: '[data-game="polywordlot"]' },
    },
    {
      detail: 'deep',
      do: { type: 'wait', selector: '.date-display', text: '2024' },
    },
    {
      detail: 'deep',
      reveal: true,
      callout: {
        selector: '[aria-label="Report missing word"]',
        text: 'A word the dictionary does not know can be reported from the row, while the game is still going.',
        place: 'left',
      },
      do: { type: 'press', keys: ['q', 'q', 'q', 'q', 'q'] },
    },
    {
      detail: 'deep',
      reveal: true,
      callout: {
        selector: '[aria-label="Report questionable words"]',
        text: 'When the game ends, Report replaces the manual. Hydra, TransWord, and Letterix do the same.',
        place: 'bottom',
      },
      do: {
        type: 'press',
        keys: ['Backspace', 'Backspace', 'Backspace', 'Backspace', 'Backspace', '{daily}', 'Enter'],
      },
    },
  ],
};
