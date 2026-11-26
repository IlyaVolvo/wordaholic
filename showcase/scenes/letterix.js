/** @type {import('../registry.js').Scene} */
export default {
  id: 'letterix',
  title: 'Letterix',
  summary: 'Falling letters. Move them, drop them, and spell words.',
  start: '/games/g3/letterix/?lang=en&langs=en',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '.letterix-start',
        text: 'Letters fall into the well. Start the day’s run, then move the falling letter and drop it.',
        place: 'bottom',
      },
      do: { type: 'click', selector: '.letterix-start' },
    },
    {
      detail: 'tour',
      do: { type: 'wait', selector: '.letterix[data-phase="fall"]' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '.letterix canvas',
        text: 'Arrows move the letter. Space drops it. Words across or down score and clear.',
        place: 'right',
      },
      do: { type: 'press', keys: ['ArrowLeft', 'ArrowLeft', ' ', 'ArrowRight', ' '] },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[aria-label="Choose daily date"]',
        text: 'The day’s letters are fixed. Board size, speed, and the calendar sit in the header.',
        place: 'bottom',
      },
      do: { type: 'wait', ms: 400 },
    },
  ],
};
