/** Letterix How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/g3/letterix/help/shots';
const START = `${SHOTS}/start.png`;
const WORD_ACROSS = `${SHOTS}/word-across.png`;
const WORD_DOWN = `${SHOTS}/word-down.png`;
const FALLING = `${SHOTS}/falling.png`;
const FALLING_MOVED = `${SHOTS}/falling-moved.png`;
const TOP_SELECT = `${SHOTS}/top-select.png`;
const TOP_MOVED = `${SHOTS}/top-moved.png`;
const TOP_BLOCKED = `${SHOTS}/top-blocked.png`;
const PAUSED = `${SHOTS}/paused.png`;
const GAMEOVER = `${SHOTS}/gameover.png`;
const CALENDAR = `${SHOTS}/calendar.png`;
const STATS = `${SHOTS}/stats.png`;

export default {
  title: 'Letterix',
  tooltip: 'How to play Letterix',
  steps: [
    {
      image: START,
      callouts: [
        {
          x: 63,
          y: 46.2,
          text: 'Goal: score as many points as you can by making words from the falling letters.\nA word is 4 or more letters in a line: across, in the language’s reading direction, or down a column.',
          place: 'right',
        },
      ],
    },
    {
      image: START,
      click: { x: 50, y: 46.2, r: 6 },
      callouts: [{ x: 56.5, y: 46.2, text: 'Press Start.', place: 'right' }],
    },
    {
      image: FALLING,
      callouts: [
        {
          x: 52.5,
          y: 48.4,
          text: 'The blue letter is the one you control. Several letters can fall at once: tap one to select it.',
          place: 'right',
        },
      ],
    },
    {
      image: FALLING,
      click: { x: 56.2, y: 96, r: 2.6 },
      callouts: [
        {
          x: 50,
          y: 92.5,
          text: '← and → move the selected letter one column left or right; Space drops it straight down.\nThe arrow keys, the space bar, and dragging do the same. Press → now.',
          place: 'top',
        },
      ],
    },
    {
      image: FALLING_MOVED,
      callouts: [
        {
          x: 55.9,
          y: 48.4,
          text: 'R moved one column right. A letter can’t move into a cell that is taken.\nSpace won’t drop it while another falling letter is below it.',
          place: 'right',
        },
      ],
    },
    {
      image: TOP_SELECT,
      callouts: [
        {
          x: 56.7,
          y: 75,
          text: 'The top letter of a column can move too: tap it to select it, then use the same ← →.',
          place: 'top',
        },
      ],
    },
    {
      image: TOP_MOVED,
      callouts: [
        {
          x: 60.1,
          y: 75,
          text: '→ moved E onto the next column. A top letter that ends up over a gap falls.',
          place: 'top',
        },
      ],
    },
    {
      image: TOP_BLOCKED,
      callouts: [
        {
          x: 46.6,
          y: 69,
          text: 'A letter can’t pass other letters: L can’t go left (A stands there) or right (I is falling there).\nLetters with another letter on top can’t move.',
          place: 'top',
        },
      ],
    },
    {
      image: WORD_ACROSS,
      callouts: [
        {
          x: 48.3,
          y: 80,
          text: 'Across: WORD, read the way the language is written (left to right in English, right to left in Hebrew).',
          place: 'top',
        },
      ],
    },
    {
      image: WORD_DOWN,
      callouts: [{ x: 52.5, y: 70.5, text: 'Down: RAIN, read top to bottom.', place: 'right' }],
    },
    {
      image: WORD_ACROSS,
      callouts: [
        {
          x: 50,
          y: 12,
          text: 'Each letter has a base value from 1 to 10: the rarer the letter, the more it is worth.\nA word scores its letters’ values, and longer words pay more: each letter past 3 adds half to every letter’s value. WORD makes +38.',
          place: 'bottom',
        },
      ],
    },
    {
      image: WORD_DOWN,
      click: { x: 55.9, y: 95.9, r: 2.6 },
      callouts: [
        {
          x: 55.9,
          y: 92.5,
          text: 'While a word flashes, the fall stops. Use takes the points and clears it; Skip leaves it. ← → choose, Space confirms early for a small bonus; waiting means Use.',
          place: 'top',
        },
      ],
    },
    {
      image: PAUSED,
      callouts: [
        {
          x: 12,
          y: 93.5,
          text: 'Bonuses: a letter dropped with Space earns points for every row it skips.\nA faster speed multiplies word points (100% doubles them). Set it while paused (P), before Start, or after the game.',
          place: 'top',
        },
      ],
    },
    {
      image: GAMEOVER,
      callouts: [
        {
          x: 45.5,
          y: 23.2,
          text: 'Game over: a column grew past the line at the top of the bucket.',
          place: 'right',
        },
      ],
    },
    {
      image: START,
      click: { x: 6.3, y: 89.8, r: 2.2 },
      callouts: [
        { x: 8.6, y: 89.8, text: 'Board width (6–12) and height (10–20). Locked while playing.', place: 'right' },
      ],
    },
    {
      image: CALENDAR,
      callouts: [
        {
          x: 35,
          y: 60,
          text: 'Each day and board size has its own letters. Played days show your score.',
          place: 'left',
        },
      ],
    },
    {
      image: STATS,
      callouts: [
        {
          x: 46,
          y: 24,
          text: 'Average score per board size: last 2 weeks, 4 weeks, and all time.',
          place: 'right',
        },
      ],
    },
  ],
};
