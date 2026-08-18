/**
 * Help topics for the site and each game.
 * `screenshot` is a public URL under /help/.
 * @typedef {{ title: string, body: string, screenshot?: string | null }} HelpStep
 * @typedef {{ title: string, tooltip: string, intro: string, steps: HelpStep[] }} HelpTopic
 */

/** @type {Record<string, HelpTopic>} */
export const HELP_TOPICS = {
  site: {
    title: 'Wordaholic',
    tooltip: 'How Wordaholic works',
    intro: 'Pick languages on the map. Games use the ones you selected.',
    steps: [
      {
        title: 'The map is the menu',
        screenshot: '/help/site/map.png',
        body:
          'Wordaholic starts on a world map. Languages live on countries — not in a long ' +
          'dropdown. Hover a country to peek at what is spoken there. Click the country to ' +
          'keep that list open so you can tap a language to select or deselect it.\n\n' +
          'Zoom in if a country is tiny. Click empty ocean (or the ×) to close the list.',
      },
      {
        title: 'Select a language',
        screenshot: '/help/site/canada-french-selection.png',
        body:
          'In the open list, bright languages can be played - dark background if selected. ' +
          'Click to toggle. Grey ones are not in the games yet.\n\n' +
          'Canada is a good example. Click Français to add French. It appears in the list ' +
          'on the left. That set is what the games will use.\n\n' +
          'A country can list several languages — pick only the ones you want.',
      },
      {
        title: 'Deselect a language',
        screenshot: '/help/site/canada-french-deselection.png',
        body:
          'On Canada again, click Français a second time to remove French. It leaves the ' +
          'left-hand list.\n\n' +
          'You can keep as many languages as you like. None selected means no game icons ' +
          'yet — the map is still there to browse.',
      },
      {
        title: 'What this means for the games',
        screenshot: '/help/site/games.png',
        body:
          'Game icons on the right appear only when at least one selected language is ' +
          'supported by that game. Open a game and it starts with those languages.\n\n' +
          'Not every game has every language yet. If an icon is missing, that game simply ' +
          'does not have a word list for the languages you picked.\n\n' +
          'Selected languages are also prepared for offline play on this device.',
      },
      {
        title: 'Export and import',
        screenshot: '/help/site/export-import.svg',
        body:
          'Wordaholic keeps completed games on this device — there is no account. The two ' +
          'tray icons at the bottom left move that history.\n\n' +
          'Export (arrow into the tray) saves a JSON file: finished PolyWordlot and ' +
          'TransWord games, plus the languages you selected. Use it as a backup, or to copy ' +
          'progress to another browser or phone.\n\n' +
          'Import (arrow out of the tray) reads that file. Puzzles merge with what is ' +
          'already here. If the same daily exists on both, the worse result is kept. ' +
          'Selected languages from the file are restored too.\n\n' +
          'On a phone, export may ask you to save the file instead of downloading it.',
      },
      {
        title: 'Invitation to collaborate',
        screenshot: '/help/site/tower-of-babel.jpg',
        body:
          'The ideas for new games are welcome. I am open to suggestions, just contact me at ilya@volvovski.com\n\n' +
          'The addition of new language is a tedious process now but I am working on improving it.\n\n' +
          'Supported languages: English, French, Spanish, Russian, Hebrew, Armenian.\n\n' +
          'The langauges I would like to add: German, Italian, Portuguese, Greek and Ukranian.',
      },
      {
        title: 'A small confession',
        screenshot: '/help/site/tower-of-babel.jpg',
        body:
          'Even if you never play a single game, poking around the map is a decent way to ' +
          'learn which languages people actually speak in each country. Consider it a world ' +
          'atlas that occasionally dares you to play a word game.',
      },
    ],
  },
  polywordlot: {
    title: 'PolyWordlot',
    tooltip: 'How to play PolyWordlot',
    intro: 'Guess a hidden word. Letter colors tell you what matched.',
    steps: [
      {
        title: 'Welcome to PolyWordlot!',
        screenshot: '/help/polywordlot/welcome.svg',
        body:
          'Your goal is to guess a hidden word in 6 attempts or fewer. Word length depends ' +
          'on the language you picked. Let’s walk through a sample 5-letter game. The ' +
          'secret word is hidden — can you figure it out?',
      },
      {
        title: 'First guess: STARE',
        screenshot: '/help/polywordlot/stare.svg',
        body:
          'We start with a common word. After submitting, each letter gets a color:\n\n' +
          'Green = correct letter, correct position\n' +
          'Yellow = correct letter, wrong position\n' +
          'Gray = letter not in the word\n\n' +
          'Here, A and R are in the word but misplaced (yellow), E is in the right spot ' +
          '(green), and S and T are not in the word (gray).',
      },
      {
        title: 'Second guess: BRAIN',
        screenshot: '/help/polywordlot/brain.svg',
        body:
          'Using what we learned — we know A, R, and E are in the word. Let’s try BRAIN.\n\n' +
          'R, A, and N are in the word but in wrong positions (yellow). B and I are not in ' +
          'the word (gray). Now we know the word contains: A, R, E, N.',
      },
      {
        title: 'Third guess: NEARS',
        screenshot: '/help/polywordlot/nears.svg',
        body:
          'We now know four letters: A, R, E, N. Let’s try rearranging them with NEARS.\n\n' +
          'All four known letters light up yellow — they are all in the word, but none are ' +
          'in the right position yet. This narrows down the arrangement significantly.',
      },
      {
        title: 'Final guess: CRANE',
        screenshot: '/help/polywordlot/crane.svg',
        body:
          'With all the clues, there is really only one option left: CRANE!\n\n' +
          'All green — the word was CRANE. You solved it in 4 attempts.',
      },
      {
        title: 'You’re ready',
        screenshot: '/help/polywordlot/ready.svg',
        body:
          'That’s the core of the game. A few tips:\n\n' +
          '• Start with words that use common letters (S, T, A, R, E in English)\n' +
          '• Yellow letters are in the word, just not in that spot\n' +
          '• Use elimination to narrow down positions\n' +
          '• You have 6 attempts per game — take your time\n\n' +
          'PolyWordlot supports multiple languages and word lengths.',
      },
      {
        title: 'Daily and Practice',
        screenshot: '/help/polywordlot/daily.svg',
        body:
          'Daily is one shared puzzle per calendar day for the current language and word ' +
          'length. Practice (shown as Random) is an unsaved extra game — use the restart ' +
          'control for a new one anytime.',
      },
      {
        title: 'Calendar',
        screenshot: '/help/polywordlot/calendar.svg',
        body:
          'In Daily mode, tap the date control to open the calendar. Completed days, ' +
          'in-progress days, and days you have not played yet are marked. Pick an earlier ' +
          'date to play or resume that day’s puzzle. Today jumps back to the current day.',
      },
      {
        title: 'Statistics',
        screenshot: '/help/polywordlot/stats.svg',
        body:
          'The bar-chart icon opens statistics for the current language and word length: ' +
          'games played, win rate, and how many attempts you usually need.',
      },
      {
        title: 'Cross-language comparison',
        screenshot: '/help/polywordlot/cross.svg',
        body:
          'The 2×2 grid icon compares your results across languages and word lengths, so ' +
          'you can see which ones take more attempts on average.',
      },
    ],
  },
  transword: {
    title: 'TransWord',
    tooltip: 'How to play TransWord',
    intro: 'Change the start word into the target, one allowed move at a time.',
    steps: [
      {
        title: 'The rules',
        screenshot: '/help/transword/rules.svg',
        body:
          'You are given a start word and a target word. Build a chain from start to ' +
          'target. Each step must be a real word from the current vocabulary, reached by ' +
          'exactly one move:\n\n' +
          '• Substitute — change one letter (same length)\n' +
          '• Insert — add one letter\n' +
          '• Delete — remove one letter\n' +
          '• Anagram — rearrange the letters\n\n' +
          'The puzzle is solved when the target is part of your chain. The colored letters ' +
          'on each step show what changed.',
      },
      {
        title: 'Word lists',
        screenshot: '/help/transword/words.svg',
        body:
          'Words and their frequency ranks have not been fully verified. Lists can include ' +
          'odd, rare, or imperfect entries. Volunteers who can go through a language’s word ' +
          'set and clean it up would be greatly appreciated.',
      },
      {
        title: 'Difficulty and vocabulary',
        screenshot: '/help/transword/difficulty.svg',
        body:
          'Difficulty is the length of a shortest solution:\n\n' +
          '• Easy — 2–3 steps\n' +
          '• Medium — 4–5 steps\n' +
          '• Hard — 6–8 steps\n\n' +
          'Vocabulary chooses how large the word list is. Basic uses a smaller, more common ' +
          'subset. Standard uses a larger list, so more words are legal — and puzzles can ' +
          'feel harder.\n\n' +
          'Each combination of language, vocabulary, and difficulty has its own Daily ' +
          'puzzle.',
      },
      {
        title: 'Help, undo, and dead ends',
        screenshot: '/help/transword/help-undo.svg',
        body:
          'The ? next to the input asks for Help: it fills the next word on a shortest path ' +
          'to the target. Helps are counted.\n\n' +
          'The ↑ on the latest word undoes that step (go backwards). You can undo as far as ' +
          'the start word.\n\n' +
          'A dead end means the current word cannot reach the target. The banner appears ' +
          'and the word is marked. Help will not work until you undo. Undo, then try a ' +
          'different word.',
      },
      {
        title: 'Calendar, earlier games, and Practice',
        screenshot: '/help/transword/calendar.svg',
        body:
          'Daily is one puzzle per calendar day for the current language, vocabulary, and ' +
          'difficulty. Everyone in the same time zone gets the same Daily. Open the ' +
          'calendar to play or resume an earlier day. Finished days stay read-only.\n\n' +
          'Practice is a random extra puzzle. It is not saved as a Daily. Use the restart ' +
          'control for a new Practice game anytime.',
      },
      {
        title: 'Settings',
        screenshot: '/help/transword/settings.svg',
        body:
          'Open Display from the gear to show or hide the timer and the shortest-path ' +
          'length. Some people prefer not to see the clock. Optimal can feel like a ' +
          'spoiler, so leave it off unless you want it.\n\n' +
          'Both choices stay on this device.',
      },
    ],
  },
};

/** Public screenshot URLs used by help steps (for offline cache). */
export function helpScreenshotUrls() {
  const urls = [];
  for (const topic of Object.values(HELP_TOPICS)) {
    for (const step of topic.steps || []) {
      if (step.screenshot) urls.push(step.screenshot);
    }
  }
  return urls;
}

export const HELP_ICON_SVG = (size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
