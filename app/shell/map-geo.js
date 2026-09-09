/**
 * Home-map play-activity bubbles (public /api/stats/geo).
 */

/** Same palette as /stats Trends graph (per-game series). */
export const GEO_GAME_COLORS = {
  polywordlot: '#0d9488',
  transword: '#c2410c',
  polyhydra: '#7c3aed',
};

export const GEO_GAME_LABELS = {
  polywordlot: 'PolyWordlot',
  transword: 'TransWord',
  polyhydra: 'PolyHydra',
};

export const GEO_GAME_IDS = /** @type {const} */ (['polywordlot', 'transword', 'polyhydra']);

const MAP_VB_W = 950;
const MAP_VB_H = 620;

/**
 * Affine fit of lon/lat into this repo's world.svg (Illustrator low-res map).
 * Not pure equirectangular — calibrated against country path centroids.
 * @param {number} lon
 * @param {number} lat
 */
export function projectLonLat(lon, lat) {
  const x = 447.172 + 2.642 * Number(lon);
  const y = 332.713 - 2.9481 * Number(lat);
  return {
    x: Math.min(MAP_VB_W, Math.max(0, x)),
    y: Math.min(MAP_VB_H, Math.max(0, y)),
  };
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [100, 100, 100];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Weighted RGB mix by per-game event counts.
 * @param {Record<string, number>} byGame
 */
export function mixLocalityColor(byGame) {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const id of GEO_GAME_IDS) {
    const n = Number(byGame?.[id]) || 0;
    if (n <= 0) continue;
    const [cr, cg, cb] = hexToRgb(GEO_GAME_COLORS[id]);
    r += cr * n;
    g += cg * n;
    b += cb * n;
    w += n;
  }
  if (!w) return 'rgb(37, 99, 235)';
  return `rgb(${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)})`;
}

/**
 * Screen-pixel radii at zoom 1: min stays readable without zooming;
 * max keeps the largest place from covering a country.
 * (SVG user units are derived from the live map CTM.)
 */
export const GEO_BUBBLE_MIN_PX = 5;
export const GEO_BUBBLE_MAX_PX = 11;

/**
 * SVG user-units per CSS pixel at zoom 1 (pan/zoom CSS scale factored out).
 * @param {SVGSVGElement} svgEl
 * @param {number} [zoomScale]
 */
export function svgUserUnitsPerCssPixel(svgEl, zoomScale = 1) {
  const ctm = svgEl.getScreenCTM?.();
  if (!ctm) return 1;
  const pxPerUnit = Math.hypot(ctm.a, ctm.b) / Math.max(0.001, Number(zoomScale) || 1);
  if (!Number.isFinite(pxPerUnit) || pxPerUnit <= 0) return 1;
  return 1 / pxPerUnit;
}

/**
 * Radius ∝ √(share of max); never below GEO_BUBBLE_MIN_PX on screen.
 * @param {number} total
 * @param {number} maxTotal
 * @param {number} [unitsPerPx]
 */
export function bubbleScale(total, maxTotal, unitsPerPx = 1) {
  const max = Math.max(1, Number(maxTotal) || 1);
  const t = Math.sqrt(Math.max(0, Number(total) || 0) / max);
  const rPx = GEO_BUBBLE_MIN_PX + t * (GEO_BUBBLE_MAX_PX - GEO_BUBBLE_MIN_PX);
  const u = Math.max(0.01, Number(unitsPerPx) || 1);
  return {
    r: rPx * u,
    opacity: 0.52 + t * 0.32,
    strokeWidth: Math.max(0.4, 1.2 * u),
  };
}

/**
 * Collapse localities that share the same projected point (e.g. capital fallbacks).
 * @param {{
 *   key: string,
 *   label: string,
 *   lat: number,
 *   lon: number,
 *   total: number,
 *   byGame: Record<string, number>,
 * }[]} localities
 */
export function mergeByCoords(localities) {
  /** @type {Map<string, {
   *   key: string,
   *   label: string,
   *   lat: number,
   *   lon: number,
   *   total: number,
   *   byGame: Record<string, number>,
   *   places: number,
   * }>} */
  const buckets = new Map();
  for (const loc of localities || []) {
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const k = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
    const prev = buckets.get(k);
    if (!prev) {
      buckets.set(k, {
        key: loc.key || k,
        label: loc.label || '',
        lat,
        lon,
        total: Number(loc.total) || 0,
        byGame: { ...(loc.byGame || {}) },
        places: 1,
      });
      continue;
    }
    const add = Number(loc.total) || 0;
    if (add > prev.total) {
      prev.label = loc.label || prev.label;
      prev.key = loc.key || prev.key;
    }
    prev.total += add;
    prev.places += 1;
    for (const id of GEO_GAME_IDS) {
      prev.byGame[id] = (prev.byGame[id] || 0) + (Number(loc.byGame?.[id]) || 0);
    }
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}

/**
 * @param {string} [from]
 * @param {string} [to]
 * @returns {Promise<{
 *   localities: {
 *     key: string,
 *     label: string,
 *     lat: number,
 *     lon: number,
 *     total: number,
 *     byGame: Record<string, number>,
 *   }[],
 *   total: number,
 * } | null>}
 */
export async function fetchGeoLocalities(from = '', to = '') {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString();
  const url = q ? `/api/stats/geo?${q}` : '/api/stats/geo';
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.localities)) return null;
  return {
    localities: data.localities,
    total: Number(data.total) || 0,
  };
}

/**
 * @param {SVGSVGElement} svgEl
 * @param {ReturnType<typeof mergeByCoords>} merged
 * @param {{ zoomScale?: number }} [opts]
 */
export function paintGeoBubbles(svgEl, merged, opts = {}) {
  let group = svgEl.querySelector('g.map-geo-bubbles');
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'map-geo-bubbles');
    svgEl.appendChild(group);
  }
  group.replaceChildren();
  if (!merged.length) return group;

  const unitsPerPx = svgUserUnitsPerCssPixel(svgEl, opts.zoomScale ?? 1);
  const maxTotal = merged.reduce((m, loc) => Math.max(m, loc.total), 0);
  // Draw largest first so smaller localities stay hoverable on top.
  const ordered = [...merged].sort((a, b) => b.total - a.total);
  for (const loc of ordered) {
    const { x, y } = projectLonLat(loc.lon, loc.lat);
    const { r, opacity, strokeWidth } = bubbleScale(loc.total, maxTotal, unitsPerPx);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'map-geo-bubble');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', mixLocalityColor(loc.byGame));
    circle.setAttribute('fill-opacity', String(opacity));
    circle.setAttribute('stroke', 'rgba(255,255,255,0.92)');
    circle.setAttribute('stroke-width', String(strokeWidth));
    circle.dataset.geoKey = encodeURIComponent(loc.key);
    circle.style.pointerEvents = 'all';
    circle.style.cursor = 'pointer';
    circle.setAttribute('title', 'Click to select languages');
    group.appendChild(circle);
  }
  return group;
}

/**
 * @param {ReturnType<typeof mergeByCoords>[number]} loc
 */
export function geoTooltipHtml(loc) {
  const lines = GEO_GAME_IDS.map((id) => {
    const n = Number(loc.byGame?.[id]) || 0;
    if (n <= 0) return '';
    return `<div class="map-geo-tip-row"><span class="map-geo-swatch" style="background:${GEO_GAME_COLORS[id]}"></span>${GEO_GAME_LABELS[id]} <strong>${n}</strong></div>`;
  }).filter(Boolean);
  const placeNote =
    loc.places > 1 ? `<div class="map-geo-tip-note">${loc.places} places at this point</div>` : '';
  return `
    <div class="map-geo-tip-place">${escapeHtml(loc.label || 'Unknown')}</div>
    <div class="map-geo-tip-total">Plays <strong>${loc.total}</strong></div>
    ${placeNote}
    <div class="map-geo-tip-games">${lines.join('')}</div>
  `;
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
