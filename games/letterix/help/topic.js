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
          y: 25.8,
          text: 'Letters fall into the bucket. The game ends when one sticks above this line.',
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
          y: 41.2,
          text: '← → move the falling letter; Space drops it. Keys or the buttons below both work.',
          place: 'right',
        },
      ],
    },
    {
      image: RULES,
      callouts: [
        { x: 50, y: 22, text: 'Only the falling letter or the top of a column can move.', place: 'bottom' },
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
      image: SCORE,
      callouts: [
        {
          x: 50,
          y: 9,
          text: 'Letters are worth 1–10. A 3-letter word is their sum; each extra letter adds half.',
          place: 'bottom',
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
      image: GAMEOVER,
      callouts: [{ x: 56, y: 23, text: 'Game over: a letter stuck above the line.', place: 'right' }],
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
