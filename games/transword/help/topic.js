/** TransWord How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/transword/help/shots';
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
        { x: 50, y: 6.5, text: 'Turn the start word into this target, one move at a time.', place: 'bottom' },
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
          text: 'One move = replace a letter, add or remove one, or rearrange them. The badge names the move; changed letters are colored.',
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
