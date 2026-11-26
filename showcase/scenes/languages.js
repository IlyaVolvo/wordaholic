/** @type {import('../registry.js').Scene} */
export default {
  id: 'languages',
  title: 'Languages',
  summary: 'Select and deselect languages on the map, and see which games remain.',
  start: '/',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '#canada',
        text: 'Languages live on countries. Click Canada to keep the list open.',
        place: 'right',
      },
      do: { type: 'click', selector: '#canada' },
    },
    {
      detail: 'glance',
      callout: {
        selector: '[data-lang-code="fr"]',
        text: 'Français is playable. Click it to add French beside English.',
        place: 'right',
      },
      do: { type: 'click', selector: '[data-lang-code="fr"]' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '#usa',
        text: 'English is still selected. Open the United States to turn it off.',
        place: 'left',
      },
      do: { type: 'click', selector: '#usa' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '#game-rail',
        text: 'With only French left, Letterix leaves the rail. It has no French word list. The other games stay.',
        place: 'left',
      },
      do: { type: 'click', selector: '[data-lang-code="en"]' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[data-game="polywordlot"]',
        text: 'Open PolyWordlot. Its language menu will offer only what is still selected.',
        place: 'left',
      },
      do: { type: 'click', selector: '[data-game="polywordlot"]' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '.language-dropdown-trigger',
        text: 'Only languages selected on the map appear here. English is gone, so this game is in French.',
        place: 'bottom',
      },
      do: { type: 'click', selector: '.language-dropdown-trigger' },
    },
  ],
};
