/** @type {import('../registry.js').Scene} */
export default {
  id: 'polywordlot',
  title: 'PolyWordlot',
  summary: 'A daily hidden word. Guesses mark each letter.',
  start: '/games/g1/polywordlot/?lang=en&langs=en',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '.date-display',
        text: 'One hidden word for the day. This scene plays 1 June 2024.',
        place: 'bottom',
      },
      do: { type: 'wait', selector: '.date-display', text: '2024' },
    },
    {
      detail: 'tour',
      reveal: true,
      callout: {
        selector: '[aria-label="Report questionable words"]',
        text: 'The day’s word. Green is a letter in the right place.',
        place: 'bottom',
      },
      do: { type: 'press', keys: ['{daily}', 'Enter'] },
    },
    {
      detail: 'deep',
      callout: {
        selector: '.language-dropdown-trigger',
        text: 'Language follows the favorites from the map.',
        place: 'bottom',
      },
      do: { type: 'click', selector: '.language-dropdown-trigger' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[aria-label="Number of letters"]',
        text: 'Word length and the calendar are here. The calendar opens any earlier day.',
        place: 'bottom',
      },
      do: { type: 'wait', ms: 400 },
    },
  ],
};
