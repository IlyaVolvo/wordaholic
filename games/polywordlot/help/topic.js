/** PolyWordlot How-to. Real screenshots; one callout per step; click circles advance. */
const SHOTS = '/games/polywordlot/help/shots';
const START = `${SHOTS}/start.png`;
const TYPED = `${SHOTS}/typed.png`;
const GUESS1 = `${SHOTS}/guess1.png`;
const GUESS2 = `${SHOTS}/guess2.png`;
const WRONG = `${SHOTS}/wrong.png`;
const SOLVED = `${SHOTS}/solved.png`;
const LANGUAGES = `${SHOTS}/languages.png`;
const CALENDAR = `${SHOTS}/calendar.png`;
const STATS = `${SHOTS}/stats.png`;

export default {
  title: 'PolyWordlot',
  tooltip: 'How to play PolyWordlot',
  steps: [
    {
      image: START,
      callouts: [
        {
          x: 62,
          y: 30,
          text: 'Goal: find the hidden word in 6 tries.\nEach guess must be a real word. After it, colors show which letters are right.',
          place: 'right',
        },
      ],
    },
    {
      image: TYPED,
      click: { x: 35.5, y: 96.3, r: 3 },
      callouts: [{ x: 35.5, y: 92.5, text: 'Type a word, then press Enter.', place: 'top' }],
    },
    {
      image: GUESS1,
      callouts: [
        {
          x: 62,
          y: 25.5,
          text: 'Yellow: M and A are in the word, but not in these places.\nGray: W, O, and N are not in the word.',
          place: 'right',
        },
      ],
    },
    {
      image: GUESS2,
      callouts: [
        {
          x: 62,
          y: 32.3,
          text: 'Green: right letter, right place. A moved into place, and S is new.\nL, E, and T are out.',
          place: 'right',
        },
      ],
    },
    {
      image: GUESS2,
      callouts: [
        {
          x: 62,
          y: 32.3,
          text: 'So the word is _ _ A S _ with an M, and none of W O N L E T.\nWords that fit: SMASH, SPASM, CHASM, AMASS.',
          place: 'right',
        },
      ],
    },
    {
      image: WRONG,
      callouts: [
        {
          x: 62,
          y: 39.1,
          text: 'SMASH is wrong: M is in the wrong place and H is out. Only SPASM still fits.',
          place: 'right',
        },
      ],
    },
    {
      image: WRONG,
      callouts: [
        {
          x: 50,
          y: 85,
          text: 'The keyboard keeps score: A and S green, M yellow, W O N L E T H gray. Light keys like P are still untried.',
          place: 'top',
        },
      ],
    },
    {
      image: SOLVED,
      callouts: [{ x: 62, y: 41.5, text: 'SPASM: all green. Solved in 4.', place: 'right' }],
    },
    {
      image: START,
      click: { x: 3.4, y: 80.5, r: 2.4 },
      callouts: [{ x: 5.8, y: 80.5, text: 'The flag picks the language.', place: 'right' }],
    },
    {
      image: LANGUAGES,
      callouts: [
        { x: 13.4, y: 66, text: 'Each language has its own words, daily puzzles, and statistics.', place: 'right' },
      ],
    },
    {
      image: START,
      click: { x: 7.3, y: 80.5, r: 2.4 },
      callouts: [{ x: 9.7, y: 80.5, text: 'Choose how many letters: 4 to 7.', place: 'right' }],
    },
    {
      image: START,
      click: { x: 95.6, y: 80.5, r: 2.8 },
      callouts: [{ x: 92.6, y: 80.5, text: 'today opens the calendar of daily puzzles.', place: 'left' }],
    },
    {
      image: CALENDAR,
      callouts: [
        {
          x: 35,
          y: 74.5,
          text: 'Pick a day to play or resume it. Colors show won, lost, incomplete, wiped, and not played.',
          place: 'left',
        },
      ],
    },
    {
      image: START,
      click: { x: 94.2, y: 3, r: 1.8 },
      callouts: [{ x: 92.4, y: 9, text: 'Statistics for the current language and length.', place: 'left' }],
    },
    {
      image: STATS,
      callouts: [
        { x: 61.2, y: 34, text: 'How many tries your games took. The ▾ switches charts.', place: 'bottom' },
      ],
    },
    {
      image: START,
      click: { x: 97.1, y: 3, r: 1.8 },
      callouts: [
        {
          x: 95.3,
          y: 12,
          text: 'Compare languages and lengths side by side. A combination shows after more than 3 games.',
          place: 'left',
        },
      ],
    },
    {
      image: START,
      click: { x: 13.3, y: 3, r: 1.8 },
      callouts: [{ x: 15.1, y: 6, text: 'The book reopens this manual anytime.', place: 'right' }],
    },
  ],
};
