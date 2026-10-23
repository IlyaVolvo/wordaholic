/** Hydra How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/g1/polyhydra/help/shots';
const START = `${SHOTS}/start.png`;
const FULL = `${SHOTS}/full.png`;
const SUMMARY = `${SHOTS}/summary.png`;
const TWO_N = `${SHOTS}/two-n.png`;
const ONE_N = `${SHOTS}/one-n.png`;
const WON = `${SHOTS}/won.png`;
const STATS_LANG = `${SHOTS}/stats-lang.png`;

export default {
  title: 'Hydra',
  tooltip: 'How to play Hydra',
  steps: [
    {
      image: START,
      callouts: [
        {
          x: 62,
          y: 30,
          text: 'Goal: find all 16 hidden words. Play it like PolyWordlot, but every guess goes to all boards at once.\nThe strategy changes: aim for the fewest guesses in total, not the fastest solve on each board.',
          place: 'right',
        },
      ],
    },
    {
      image: START,
      callouts: [
        {
          x: 53.5,
          y: 4.5,
          text: 'Words left / guesses left. You get one guess per board, plus 5.',
          place: 'bottom',
        },
      ],
    },
    {
      image: START,
      click: { x: 50, y: 49.6, r: 2.2 },
      callouts: [{ x: 52.5, y: 49.6, text: 'After a couple of guesses, ↓ shows the full board.', place: 'right' }],
    },
    {
      image: FULL,
      callouts: [
        {
          x: 62,
          y: 40,
          text: 'The full board lists every guess, colored for this board.\nWith 16 boards that is 21 rows: it runs off the screen, and you have to scroll to see it all. Not convenient.',
          place: 'right',
        },
      ],
    },
    {
      image: FULL,
      click: { x: 39.7, y: 12.2, r: 2 },
      callouts: [{ x: 37.5, y: 12.2, text: '↑ goes back to the summary.', place: 'left' }],
    },
    {
      image: SUMMARY,
      callouts: [
        {
          x: 62,
          y: 23.8,
          text: 'The summary keeps only what CRANE and INANE taught you here: one row per found letter.\nGreen: right letter, right place. C is first, E is last.\nYellow: A is in the word, but not where you tried it.',
          place: 'right',
        },
      ],
    },
    {
      image: SUMMARY,
      callouts: [
        {
          x: 62,
          y: 54.8,
          text: 'Your last guess stays under the arrow. Type the next word below it.',
          place: 'right',
        },
      ],
    },
    {
      image: TWO_N,
      callouts: [
        {
          x: 62,
          y: 17,
          text: 'Board 13: both N’s of INANE are in the word, so the row shows two N’s.\nGreen: one N is in place 4.\nYellow: the other N is not in place 2.',
          place: 'right',
        },
      ],
    },
    {
      image: ONE_N,
      callouts: [
        {
          x: 62,
          y: 23.8,
          text: 'Board 9: one N is green, the other N came back gray. So the word has only one N.\nAll other squares in the row turn gray: a second N is impossible. The yellow square marks where you tried it.',
          place: 'right',
        },
      ],
    },
    {
      image: SUMMARY,
      click: { x: 98.6, y: 43.8, r: 2.2 },
      callouts: [{ x: 96.6, y: 43.8, text: '‹ and › switch boards.', place: 'left' }],
    },
    {
      image: SUMMARY,
      callouts: [
        {
          x: 50,
          y: 9,
          text: 'The strip on top has one cell per board, with greens/yellows found. Tap a cell to open that board.',
          place: 'bottom',
        },
      ],
    },
    {
      image: WON,
      callouts: [
        {
          x: 25,
          y: 4.5,
          text: 'All boards solved. +1 = one guess more than the number of boards; +0 is perfect.',
          place: 'bottom',
        },
      ],
    },
    {
      image: START,
      click: { x: 11.5, y: 80.5, r: 2.4 },
      callouts: [{ x: 14, y: 80.5, text: 'Choose how many boards to play.', place: 'right' }],
    },
    {
      image: START,
      click: { x: 97.1, y: 3, r: 1.8 },
      callouts: [{ x: 95.3, y: 9, text: 'Statistics for your Hydra games.', place: 'left' }],
    },
    {
      image: STATS_LANG,
      callouts: [
        {
          x: 12.8,
          y: 22,
          text: 'Statistics are kept separately for each language. Pick one here.',
          place: 'right',
        },
      ],
    },
    {
      image: STATS_LANG,
      callouts: [
        {
          x: 50,
          y: 62,
          text: 'One bar per board count and length: wins by +N, and losses. Rare results are listed above a bar.',
          place: 'bottom',
        },
      ],
    },
  ],
};
