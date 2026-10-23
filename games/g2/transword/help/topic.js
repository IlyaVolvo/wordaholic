/** TransWord How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/g2/transword/help/shots';
const START = `${SHOTS}/start.png`;
const STEPS = `${SHOTS}/steps.png`;
const INVALID = `${SHOTS}/invalid.png`;
const HELPED = `${SHOTS}/helped.png`;
const SOLVED = `${SHOTS}/solved.png`;
const DISPLAY = `${SHOTS}/display.png`;
const STATS = `${SHOTS}/stats.png`;

export default {
  title: 'TransWord',
  tooltip: 'How to play TransWord',
  steps: [
    {
      image: START,
      callouts: [
        {
          x: 50,
          y: 6.5,
          text: 'Goal: transform the start word (terse) into the target (shake), one word at a time, in as few steps as you can.',
          place: 'bottom',
        },
      ],
    },
    {
      image: START,
      callouts: [
        {
          x: 50,
          y: 24.5,
          text: 'Each new word must be a real word, made from the previous one by exactly one of 4 rules:\n1. Replace one letter:\nester\u00a0→\u00a0aster.\n2. Add one letter:\nstar\u00a0→\u00a0stare.\n3. Remove one letter:\nstare\u00a0→\u00a0star.\n4. Rearrange all letters:\nterse\u00a0→\u00a0ester.',
          place: 'bottom',
        },
      ],
    },
    {
      image: START,
      callouts: [{ x: 58, y: 22.1, text: 'Type the next word and press Enter.', place: 'right' }],
    },
    {
      image: STEPS,
      callouts: [
        {
          x: 57,
          y: 27.1,
          text: 'The badge names the rule you used: terse\u00a0→\u00a0ester is anagrammed, ester\u00a0→\u00a0aster is replaced. Changed letters are colored.',
          place: 'right',
        },
      ],
    },
    {
      image: INVALID,
      callouts: [
        { x: 58, y: 45.4, text: 'Not a single legal move? The word turns red and is not added.', place: 'right' },
      ],
    },
    {
      image: STEPS,
      click: { x: 57.5, y: 29.6, r: 1.8 },
      callouts: [
        {
          x: 59.5,
          y: 29.6,
          text: '↑ takes back the last word. Use it to leave a dead end, a word that cannot reach the target.',
          place: 'right',
        },
      ],
    },
    {
      image: STEPS,
      click: { x: 57.5, y: 39.5, r: 1.8 },
      callouts: [{ x: 59.5, y: 39.5, text: 'Stuck? ? plays a good next word for you.', place: 'right' }],
    },
    {
      image: HELPED,
      callouts: [{ x: 58, y: 41.8, text: 'Help added stare. It counts in Helps.', place: 'right' }],
    },
    {
      image: HELPED,
      callouts: [
        {
          x: 88,
          y: 6,
          text: 'Steps so far, the shortest possible (Optimal), dead ends, and helps.',
          place: 'bottom',
        },
      ],
    },
    {
      image: SOLVED,
      callouts: [
        {
          x: 65,
          y: 45,
          text: 'Reach the target to solve. Fewer steps, dead ends, and helps are better.',
          place: 'right',
        },
      ],
    },
    {
      image: START,
      click: { x: 4.6, y: 80.7, r: 2.8 },
      callouts: [
        { x: 7.6, y: 80.7, text: 'Difficulty: Easy 2–3, Medium 4–5, Hard 6–8 moves.', place: 'right' },
      ],
    },
    {
      image: START,
      click: { x: 11.3, y: 80.7, r: 2.8 },
      callouts: [{ x: 14.3, y: 80.7, text: 'Basic uses common words; Standard allows more.', place: 'right' }],
    },
    {
      image: DISPLAY,
      callouts: [{ x: 26.5, y: 10, text: 'The gear can hide the timer or the optimal count.', place: 'right' }],
    },
    {
      image: STATS,
      callouts: [
        { x: 64, y: 45, text: 'Statistics per language, vocabulary, and difficulty.', place: 'right' },
      ],
    },
  ],
};
