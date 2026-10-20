/**
 * Game icons shared by the home rail and the help manuals menu.
 * Kept dependency-free: game bundles import it through the help dialog.
 */

export const GAME_ICONS = {
  polywordlot: `
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="currentColor" opacity="0.12"/>
      <g fill="none" stroke="currentColor" stroke-width="2">
        <rect x="8" y="8" width="8" height="8" rx="1.5"/>
        <rect x="16" y="8" width="8" height="8" rx="1.5"/>
        <rect x="24" y="8" width="8" height="8" rx="1.5"/>
        <rect x="8" y="16" width="8" height="8" rx="1.5"/>
        <rect x="16" y="16" width="8" height="8" rx="1.5"/>
        <rect x="24" y="16" width="8" height="8" rx="1.5"/>
        <rect x="8" y="24" width="8" height="8" rx="1.5"/>
        <rect x="16" y="24" width="8" height="8" rx="1.5"/>
        <rect x="24" y="24" width="8" height="8" rx="1.5"/>
      </g>
    </svg>`,
  transword: `
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="currentColor" opacity="0.12"/>
      <path d="M8 20h16M18 10l12 10-12 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="10" cy="20" r="2.2" fill="currentColor"/>
      <circle cx="30" cy="20" r="2.2" fill="currentColor"/>
    </svg>`,
  polyhydra: `
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="currentColor" opacity="0.12"/>
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 28c0-4 2-7 6-8 4 1 6 4 6 8"/>
        <path d="M20 20c-1-5-5-8-8-9"/>
        <path d="M20 20c0-6 2-10 6-11"/>
        <path d="M20 20c2-5 7-7 10-6"/>
        <path d="M20 20c-3-3-9-3-11 0"/>
        <circle cx="10" cy="10" r="2.2"/>
        <circle cx="26" cy="8" r="2.2"/>
        <circle cx="32" cy="13" r="2.2"/>
        <circle cx="8" cy="16" r="2.2"/>
      </g>
    </svg>`,
  letterix: `
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="currentColor" opacity="0.12"/>
      <path d="M10 30h20M10 14v16M30 14v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <rect x="17" y="8" width="6" height="6" rx="1" fill="currentColor"/>
      <rect x="12" y="18" width="6" height="6" rx="1" fill="currentColor" opacity="0.85"/>
      <rect x="22" y="22" width="6" height="6" rx="1" fill="currentColor" opacity="0.7"/>
    </svg>`,
};
