/**
 * Realistic world map with selected languages centered on it.
 * Game icons live in the toolbar rail, immediately right of Languages.
 */

async function loadMapSvg() {
  const res = await fetch('/map/world.svg', { cache: 'reload' });
  if (!res.ok) throw new Error('Failed to load world map');
  let svg = await res.text();
  svg = svg.replace(/<\?xml[^>]*>/, '').trim();
  if (!svg.includes('wh-map-style')) {
    svg = svg.replace(
      /<svg([^>]*)>/,
      `<svg$1><rect id="ocean" width="100%" height="100%" fill="#6fa8c9"/><style id="wh-map-style">path,polygon,polyline{fill:#c5d4a8!important;stroke:#6b7d52!important;stroke-width:0.35!important}</style>`
    );
  }
  return svg;
}

/**
 * @param {HTMLElement} container
 * @param {{ favoriteLanguages?: { code: string, menu: string, flag?: string }[] }} [opts]
 */
export async function renderWorldMap(container, opts = {}) {
  const favorites = opts.favoriteLanguages || [];
  let mapSvg = '';
  try {
    mapSvg = await loadMapSvg();
  } catch (err) {
    console.warn(err);
    mapSvg = `<div class="map-fallback">World map unavailable</div>`;
  }

  const chips = favorites.length
    ? favorites
        .map(
          (l) =>
            `<span class="map-lang-chip" title="${l.menu}">${l.flag || l.code}<span class="map-lang-name">${l.menu}</span></span>`
        )
        .join('')
    : `<span class="map-lang-empty">No favorites</span>`;

  container.innerHTML = `
    <div class="map-stage">
      <div class="world-map-svg" aria-hidden="true">${mapSvg}</div>
      <div class="map-lang-center" aria-label="Selected languages">${chips}</div>
    </div>
  `;

  const svgEl = container.querySelector('.world-map-svg svg');
  if (svgEl) {
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.classList.add('world-map-inline');
  }
}

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
      <path d="M10 20h14M20 12l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="12" cy="20" r="2.2" fill="currentColor"/>
      <circle cx="28" cy="20" r="2.2" fill="currentColor"/>
    </svg>`,
};

/**
 * @param {HTMLElement} rail
 * @param {{ games: {id:string,name:string}[], favoriteLanguages: {code:string,menu:string,games:string[]}[], onGameSelect: (gameId: string, langCodes: string[]) => void }} opts
 */
export function renderGameRail(rail, opts) {
  const { games, favoriteLanguages, onGameSelect } = opts;
  const playable = games
    .map((game) => {
      const langs = favoriteLanguages.filter((l) => (l.games || []).includes(game.id));
      if (!langs.length) return null;
      return { game, langs };
    })
    .filter(Boolean);

  if (!favoriteLanguages.length || !playable.length) {
    rail.innerHTML = '';
    return;
  }

  rail.innerHTML = playable
    .map(({ game, langs }) => {
      const langLabel = langs.map((l) => l.menu).join(', ');
      const icon = GAME_ICONS[game.id] || GAME_ICONS.polywordlot;
      return `
        <button type="button" class="rail-game" data-game="${game.id}"
          aria-label="${game.name}. Languages: ${langLabel}"
          title="${game.name} — ${langLabel}">
          <span class="map-game-icon">${icon}</span>
          <span class="map-game-name">${game.name}</span>
        </button>`;
    })
    .join('');

  rail.querySelectorAll('.rail-game').forEach((el) => {
    el.addEventListener('click', () => {
      const gameId = el.getAttribute('data-game');
      const entry = playable.find((p) => p.game.id === gameId);
      if (!entry) return;
      onGameSelect(
        gameId,
        entry.langs.map((l) => l.code)
      );
    });
  });
}
