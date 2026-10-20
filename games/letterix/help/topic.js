/** Letterix How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/letterix/help/shots';
const START = `${SHOTS}/start.png`;
const PLAYING = `${SHOTS}/playing.png`;
const PAUSED = `${SHOTS}/paused.png`;
const GAMEOVER = `${SHOTS}/gameover.png`;
const CALENDAR = `${SHOTS}/calendar.png`;
const STATS = `${SHOTS}/stats.png`;
const SCORE = `${SHOTS}/score.png`;
const RULES = `${SHOTS}/rules.png`;

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
          text: 'Goal: score as many points as you can by making words from the falling letters.\nA word is 3 or more letters in a line: across, left to right, or up a column, bottom to top.',
          place: 'right',
        },
      ],
    },
    {
      image: SCORE,
      callouts: [
        {
          x: 50,
          y: 9,
          text: 'Each letter has a base value from 1 to 10: common letters are worth little, rare ones a lot.\nLonger words pay more: every letter past 3 adds half to each letter’s value.\nDropping a letter adds a bonus for every row it skips.',
          place: 'bottom',
        },
      ],
    },
    {
      image: GAMEOVER,
      callouts: [
        {
          x: 45.5,
          y: 23.2,
          text: 'The game ends when a column grows over the line at the top of the bucket.',
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
      image: PLAYING,
      callouts: [
        {
          x: 62.2,
          y: 41.1,
          text: 'One letter is active (blue).\n← → move it one column, if that spot is free.\nSpace drops it straight down. Keys, the buttons below, or dragging all work.',
          place: 'right',
        },
      ],
    },
    {
      image: PLAYING,
      callouts: [
        {
          x: 44.5,
          y: 21.2,
          text: 'Several letters can fall at once. Tap one to make it active.\nSpace can’t drop a letter while another falling letter is below it in the same column.',
          place: 'left',
        },
      ],
    },
    {
      image: RULES,
      callouts: [
        {
          x: 50,
          y: 22,
          text: 'The top letter of each column moves the same way: tap it, then ← →. Over an empty spot, it falls.\nLetters covered by another letter can’t move.',
          place: 'bottom',
        },
      ],
    },
    {
      image: SCORE,
      callouts: [
        {
          x: 50,
          y: 82,
          text: 'A word of 3+ letters flashes and the fall pauses. ← picks Use (take the points), → picks Skip. Space confirms early for a small bonus; waiting means Use.',
          place: 'top',
        },
      ],
    },
    {
      image: PLAYING,
      click: { x: 97.2, y: 96, r: 2.4 },
      callouts: [{ x: 94.6, y: 94, text: 'Pause (or P) stops the fall.', place: 'left' }],
    },
    {
      image: PAUSED,
      callouts: [
        {
          x: 12,
          y: 93.5,
          text: 'Speed 0–400% can be set while paused, before Start, or after the game. Faster falls multiply word points.',
          place: 'top',
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
