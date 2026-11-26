/** @type {import('../registry.js').Scene} */
export default {
  id: 'transword',
  title: 'TransWord',
  summary: 'Change the start word into the target, one real word at a time.',
  start: '/games/g2/transword/?lang=en&langs=en',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '#target-word',
        text: 'Reach the target. Each step must be a real word: change, add, or drop a letter, or anagram.',
        place: 'bottom',
      },
      do: { type: 'wait', selector: '#btn-help' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '#btn-help',
        text: 'The question mark plays the next word on the built-in solution.',
        place: 'left',
      },
      do: { type: 'click', selector: '#btn-help' },
    },
    {
      detail: 'deep',
      reveal: true,
      callout: {
        selector: '#difficulty',
        text: 'Difficulty is the length of the chain. The scene follows the solution the game already computed.',
        place: 'bottom',
      },
      do: { type: 'solve-transword' },
    },
  ],
};
