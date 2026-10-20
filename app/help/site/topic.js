/** Home How-to. Shots stay in /help/site/. One callout per step; click circles advance. */
const MAP = '/help/site/map.png';
const POPUP = { src: '/help/site/overlays/canada-popup.png', x: 23.88, y: 18.04, w: 15.83 };
const POPUP_ON = { src: '/help/site/overlays/canada-popup-selected.png', x: 23.88, y: 18.04, w: 15.83 };
const FRENCH_CHIP = { src: '/help/site/overlays/french-chip.png', x: 0.56, y: 4.21, w: 8.68 };
const ACTIVITY = { src: '/help/site/overlays/activity-panel.png', x: 0, y: 0, w: 9.8 };

export default {
  title: 'Wordaholic',
  tooltip: 'How Wordaholic works',
  steps: [
    {
      image: MAP,
      callouts: [
        { x: 28, y:32, text: 'Languages live on countries. Hover to peek, click to keep the list open.', place: 'right' },
      ],
    },
    {
      image: MAP,
      click: { x: 28, y: 25, r: 6 },
      callouts: [{ x: 28, y: 25, text: 'Click Canada to keep the list open.', place: 'right' }],
    },
    {
      image: MAP,
      overlays: [POPUP],
      callouts: [
        { x: 42, y: 22, text: 'Bright = playable.\nDark green = selected.\nGrey = not in the games yet.', place: 'right' },
      ],
    },
    {
      image: MAP,
      overlays: [POPUP],
      click: { x: 31.5, y: 22.2, r: 3.2 },
      callouts: [{ x: 34.9, y: 22.2, text: 'Click Français to add French. It appears on the left.', place: 'right' }],
    },
    {
      image: MAP,
      overlays: [POPUP_ON, FRENCH_CHIP],
      click: { x: 31.5, y: 22.2, r: 3.2 },
      callouts: [
        { x: 34.9, y: 22.2, text: 'Click Français again to remove it from the left-hand list.', place: 'right' },
      ],
    },
    {
      image: MAP,
      overlays: [POPUP],
      callouts: [{ x: 5, y: 6, text: 'French is removed: Français is no longer selected, and it is gone from the left.', place: 'right' }],
    },
    {
      image: MAP,
      overlays: [POPUP],
      click: { x: 2.7, y: 49.3, r: 2.4 },
      callouts: [{ x: 8, y: 49.3, text: 'Click > to open activity.', place: 'right' }],
    },
    {
      image: MAP,
      overlays: [ACTIVITY],
      callouts: [
        { x: 12, y: 18, text: 'Online, colored dots show where people have played. From/To narrows dates.', place: 'right' },
      ],
    },
    {
      image: MAP,
      click: { x: 89.4, y: 95.2, r: 1.9 },
      callouts: [{ x: 89.4, y: 90, text: 'Export saves finished games and selected languages as a JSON backup.', place: 'top' }],
    },
    {
      image: MAP,
      click: { x: 92.1, y: 95.2, r: 1.9 },
      callouts: [{ x: 92.1, y: 90, text: 'Import merges that file. Same daily keeps the worse result.', place: 'top' }],
    },
    {
      image: '/help/site/tower-of-babel.jpg',
      callouts: [
        { x: 50, y: 12, text: 'Even without a game, the map is a world atlas of who speaks what.', place: 'bottom' },
      ],
      text:
        'Ideas for new games are welcome. Join the Telegram group at https://t.me/wordaholicgames\n\n' +
        'Adding a language is still tedious; that is being improved.\n\n' +
        'Supported: English, French, Spanish, Russian, Hebrew, Armenian.\n' +
        'Wanted next: German, Italian, Portuguese, Greek, Ukrainian.',
    },
    {
      text:
        'PolyWordlot is inspired by Wordle.\n' +
        'Hydra is inspired by Sedecordle.\n\n' +
        'Word sets were curated by:\n\n' +
        '• French — Tanya Levshina\n' +
        '• Spanish — Olga Lichten\n' +
        '• Hebrew — Alex Kaplinsky\n' +
        '• Armenian — Aram Hayrapetian\n' +
        '• English / Russian — Ilya Volvovski',
    },
    {
      menu: true,
    },
  ],
};
