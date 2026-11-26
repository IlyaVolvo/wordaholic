/** @type {import('../registry.js').Scene} */
export default {
  id: 'backup',
  title: 'Export, import, auto',
  summary: 'Save finished games and selected languages, bring them back, and turn on Auto export.',
  start: '/',
  steps: [
    {
      detail: 'glance',
      callout: {
        selector: '[data-transfer="export"]',
        text: 'Export downloads a JSON backup of selected languages and finished games.',
        place: 'top',
      },
      do: { type: 'export' },
    },
    {
      detail: 'tour',
      callout: {
        selector: '[data-transfer="import"]',
        text: 'Import reads that same file back. A matching daily keeps the worse result.',
        place: 'top',
      },
      do: { type: 'import' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[data-transfer="auto-export"]',
        text: 'Auto export keeps a master copy on this device after each finished game.',
        place: 'top',
      },
      do: { type: 'click', selector: '[data-transfer="auto-export"]' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[data-auto-enabled]',
        text: 'Turn it on. The browser then asks for a folder. After that, the map badge stays lit.',
        place: 'bottom',
      },
      do: { type: 'click', selector: '[data-auto-enabled]' },
    },
    {
      detail: 'deep',
      callout: {
        selector: '[data-transfer="auto-export"]',
        text: 'The badge shows Auto export is on. Choosing the folder is the browser’s own dialog.',
        place: 'top',
      },
      do: { type: 'click', selector: '[data-auto-export-panel] [data-close]' },
    },
  ],
};
