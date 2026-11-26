/** @type {import('../registry.js').Scene} */
export default {
  id: 'hydra',
  title: 'Hydra',
  summary: 'One guess is played on every board.',
  start: '/games/g1/polyhydra/?lang=en&langs=en',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '[aria-label="Board progress"]',
        text: 'Several boards, one guess. Every board hears the same letters.',
        place: 'top',
      },
      do: { type: 'wait', selector: '[aria-label="Board progress"]' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '[aria-label="Board progress"]',
        text: 'This guess is one of the day’s secrets. The other boards stay open.',
        place: 'top',
      },
      do: { type: 'press', keys: ['{hydra}', 'Enter'] },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[aria-label="Number of boards"]',
        text: 'Board count is part of the game you chose. More boards, more words, a longer solve.',
        place: 'bottom',
      },
      do: { type: 'wait', ms: 400 },
    },
  ],
};
