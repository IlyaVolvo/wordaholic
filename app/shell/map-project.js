/**
 * Project WGS84 lon/lat onto world.svg country silhouettes.
 * The artwork is not a geographic grid; a global affine only matches
 * country centroids. Cities are placed inside the drawn path for that land.
 */

const MAP_VB_W = 950;
const MAP_VB_H = 620;

/** Fallback when the country path or geo box is missing. */
export function projectLonLatAffine(lon, lat) {
  return clampMap(447.172 + 2.642 * Number(lon), 332.713 - 2.9481 * Number(lat));
}

/**
 * @typedef {{ path: string, west: number, south: number, east: number, north: number }} LandBox
 * @typedef {{ lon: number, lat: number, x: number, y: number }} LandAnchor
 */

/**
 * Ground-control points on world.svg, taken from path vertices of that land.
 * One set per silhouette, fitted together — not coast-by-coast. Interior
 * cities interpolate. Add another land the same way when bbox is not enough.
 * @type {Record<string, LandAnchor[]>}
 */
export const LAND_ANCHORS = {
  usa: [
    { lon: -122.75, lat: 49.0, x: 140.0, y: 160.5 },
    { lon: -122.33, lat: 47.61, x: 136.0, y: 165.4 },
    { lon: -124.36, lat: 40.44, x: 131.0, y: 192.0 },
    { lon: -122.42, lat: 37.77, x: 135.8, y: 204.6 },
    { lon: -118.24, lat: 34.05, x: 138.0, y: 220.5 },
    { lon: -117.16, lat: 32.72, x: 146.2, y: 224.5 },
    { lon: -106.49, lat: 31.76, x: 169.2, y: 231.6 },
    { lon: -97.5, lat: 25.9, x: 186.4, y: 252.5 },
    { lon: -95.37, lat: 29.76, x: 200.6, y: 239.2 },
    { lon: -81.76, lat: 24.55, x: 231.3, y: 257.5 },
    { lon: -80.19, lat: 25.76, x: 235.5, y: 251.5 },
    { lon: -80.5, lat: 28.0, x: 234.5, y: 244.0 },
    { lon: -81.66, lat: 30.33, x: 236.2, y: 236.6 },
    { lon: -81.09, lat: 32.08, x: 246.4, y: 227.9 },
    { lon: -76.29, lat: 36.85, x: 253.1, y: 218.3 },
    { lon: -74.01, lat: 40.71, x: 263.8, y: 206.8 },
    { lon: -71.06, lat: 42.36, x: 273.5, y: 204.0 },
    { lon: -66.98, lat: 44.81, x: 282.0, y: 189.5 },
    { lon: -95.0, lat: 49.0, x: 219.3, y: 170.0 },
  ],
};

/** ISO 3166-1 → mainland path id and the land that path represents. */
export const COUNTRY_LAND = {
  AR: land('argentina', -73.58, -55.06, -53.59, -21.78),
  AT: land('austria', 9.53, 46.37, 17.16, 49.02),
  AU: land('australia', 113.34, -43.63, 153.57, -10.67),
  BE: land('belgium', 2.51, 49.5, 6.4, 51.51),
  BR: land('brazil', -73.99, -33.75, -34.73, 5.27),
  CA: land('canada', -141.0, 41.68, -52.62, 83.11),
  CH: land('switzerland', 5.956, 45.818, 10.492, 47.808),
  CL: land('chile', -75.64, -55.61, -66.42, -17.51),
  CN: land('china', 73.56, 18.16, 134.77, 53.56),
  CZ: land('czech', 12.09, 48.55, 18.86, 51.06),
  DE: land('germany', 5.867, 47.27, 15.042, 55.058),
  DK: land('denmark', 8.08, 54.56, 12.69, 57.75),
  EG: land('egypt', 24.7, 21.99, 36.24, 31.67),
  ES: land('spain', -9.39, 35.97, 3.32, 43.79),
  FI: land('finland', 20.56, 59.81, 31.59, 70.09),
  FR: land('france', -5.14, 42.33, 8.23, 51.09),
  GB: land('britain', -8.65, 49.86, 1.76, 60.86),
  GR: land('greece', 19.37, 34.8, 28.25, 41.75),
  IE: land('ireland', -10.48, 51.39, -6.0, 55.39),
  IL: land('israel', 34.267, 29.453, 35.896, 33.335),
  IN: land('india', 68.18, 6.75, 97.4, 35.5),
  IT: land('italy', 6.63, 36.62, 18.52, 47.09),
  JP: land('honshu', 129.41, 31.03, 145.82, 45.52),
  KE: land('kenya', 33.91, -4.68, 41.9, 5.51),
  MX: land('mexico', -118.36, 14.54, -86.81, 32.72),
  NL: land('netherlands', 3.36, 50.75, 7.23, 53.55),
  NO: land('norway', 4.99, 58.08, 31.29, 71.18),
  PE: land('peru', -81.33, -18.35, -68.65, -0.04),
  PL: land('poland', 14.12, 49.0, 24.15, 54.84),
  PT: land('portugal', -9.53, 36.96, -6.19, 42.15),
  RU: land('russia', 27.39, 41.19, 180.0, 81.86),
  SE: land('sweden', 11.03, 55.36, 24.17, 69.06),
  TR: land('turkey', 25.67, 35.82, 44.83, 42.11),
  UA: land('ukraine', 22.14, 44.38, 40.23, 52.38),
  US: land('usa', -124.85, 24.39, -66.88, 49.38),
  ZA: land('south africa', 16.34, -34.82, 32.89, -22.13),
};

const US_ALASKA = land('alaska', -168.0, 54.5, -129.99, 71.5);
const US_HAWAII = land('hawaii', -156.1, 18.9, -154.75, 20.27);
const IT_SICILY = land('sicily', 12.42, 36.64, 15.65, 38.3);

/**
 * @param {string} path
 * @param {number} west
 * @param {number} south
 * @param {number} east
 * @param {number} north
 * @returns {LandBox}
 */
function land(path, west, south, east, north) {
  return { path, west, south, east, north };
}

/**
 * @param {string} [country]
 * @param {string} [region]
 * @param {number} [lon]
 * @param {number} [lat]
 * @returns {LandBox | null}
 */
export function landForPlace(country, region = '', lon = 0, lat = 0) {
  const cc = String(country || '').trim().toUpperCase();
  const reg = String(region || '').toLowerCase();
  if (cc === 'US') {
    if (/alaska/.test(reg) || lon < -129) return US_ALASKA;
    if (/hawaii/.test(reg) || (lat < 23 && lon < -154)) return US_HAWAII;
  }
  if (cc === 'IT' && /sicily|sicilia/.test(reg)) return IT_SICILY;
  return COUNTRY_LAND[cc] || null;
}

/** @type {WeakMap<SVGSVGElement, Map<string, { x: number, y: number, width: number, height: number }>>} */
const bboxCache = new WeakMap();

/**
 * @param {SVGSVGElement | null | undefined} svgEl
 * @param {string} pathId
 */
function pathBox(svgEl, pathId) {
  if (!svgEl || !pathId) return null;
  let byId = bboxCache.get(svgEl);
  if (!byId) {
    byId = new Map();
    bboxCache.set(svgEl, byId);
  }
  if (byId.has(pathId)) return byId.get(pathId) || null;
  const node = svgEl.getElementById(pathId);
  if (!node || typeof node.getBBox !== 'function') {
    byId.set(pathId, /** @type {any} */ (null));
    return null;
  }
  try {
    const box = node.getBBox();
    if (!box.width || !box.height) {
      byId.set(pathId, /** @type {any} */ (null));
      return null;
    }
    byId.set(pathId, { x: box.x, y: box.y, width: box.width, height: box.height });
    return byId.get(pathId) || null;
  } catch {
    byId.set(pathId, /** @type {any} */ (null));
    return null;
  }
}

/** @type {Map<string, LandAnchor[][]>} */
const meshCache = new Map();

/**
 * @param {LandAnchor[]} anchors
 */
function meshFor(anchors) {
  const key = anchors.map((a) => `${a.lon},${a.lat},${a.x},${a.y}`).join('|');
  const cached = meshCache.get(key);
  if (cached) return cached;
  const mesh = delaunay(anchors);
  meshCache.set(key, mesh);
  return mesh;
}

/**
 * @param {LandAnchor} a
 * @param {LandAnchor} b
 * @param {LandAnchor} c
 */
function circumcircle(a, b, c) {
  const d = 2 * (a.lon * (b.lat - c.lat) + b.lon * (c.lat - a.lat) + c.lon * (a.lat - b.lat));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.lon * a.lon + a.lat * a.lat;
  const b2 = b.lon * b.lon + b.lat * b.lat;
  const c2 = c.lon * c.lon + c.lat * c.lat;
  const ux = (a2 * (b.lat - c.lat) + b2 * (c.lat - a.lat) + c2 * (a.lat - b.lat)) / d;
  const uy = (a2 * (c.lon - b.lon) + b2 * (a.lon - c.lon) + c2 * (b.lon - a.lon)) / d;
  return { ux, uy, r2: (ux - a.lon) ** 2 + (uy - a.lat) ** 2 };
}

/**
 * @param {LandAnchor[]} anchors
 * @returns {LandAnchor[][]}
 */
function delaunay(anchors) {
  const lons = anchors.map((p) => p.lon);
  const lats = anchors.map((p) => p.lat);
  const minLon = Math.min(...lons) - 20;
  const maxLon = Math.max(...lons) + 20;
  const minLat = Math.min(...lats) - 20;
  const maxLat = Math.max(...lats) + 20;
  /** @type {(LandAnchor & { super?: boolean })[]} */
  const st = [
    { lon: minLon - 10, lat: minLat - 10, x: 0, y: 0, super: true },
    { lon: maxLon + 40, lat: minLat - 10, x: 0, y: 0, super: true },
    { lon: (minLon + maxLon) / 2, lat: maxLat + 40, x: 0, y: 0, super: true },
  ];
  /** @type {(LandAnchor & { super?: boolean })[][]} */
  let tris = [[st[0], st[1], st[2]]];
  for (const p of anchors) {
    const bad = tris.filter((t) => {
      const c = circumcircle(t[0], t[1], t[2]);
      return c && (p.lon - c.ux) ** 2 + (p.lat - c.uy) ** 2 <= c.r2 + 1e-12;
    });
    const edgeKey = (a, b) =>
      a.lon < b.lon || (a.lon === b.lon && a.lat < b.lat)
        ? `${a.lon},${a.lat}|${b.lon},${b.lat}`
        : `${b.lon},${b.lat}|${a.lon},${a.lat}`;
    /** @type {Map<string, number>} */
    const count = new Map();
    /** @type {[LandAnchor, LandAnchor][]} */
    const edges = [];
    for (const t of bad) {
      for (const e of /** @type {[LandAnchor, LandAnchor][]} */ ([
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ])) {
        const k = edgeKey(e[0], e[1]);
        count.set(k, (count.get(k) || 0) + 1);
        if (!edges.some((x) => edgeKey(x[0], x[1]) === k)) edges.push(e);
      }
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const e of edges) {
      if (count.get(edgeKey(e[0], e[1])) === 1) tris.push([e[0], e[1], p]);
    }
  }
  return tris.filter((t) => !t.some((p) => /** @type {{ super?: boolean }} */ (p).super));
}

/**
 * @param {{ lon: number, lat: number }} p
 * @param {LandAnchor} a
 * @param {LandAnchor} b
 * @param {LandAnchor} c
 */
function barycentric(p, a, b, c) {
  const det = (b.lat - c.lat) * (a.lon - c.lon) + (c.lon - b.lon) * (a.lat - c.lat);
  const wA = ((b.lat - c.lat) * (p.lon - c.lon) + (c.lon - b.lon) * (p.lat - c.lat)) / det;
  const wB = ((c.lat - a.lat) * (p.lon - c.lon) + (a.lon - c.lon) * (p.lat - c.lat)) / det;
  return [wA, wB, 1 - wA - wB];
}

/**
 * @param {number} lon
 * @param {number} lat
 * @param {LandAnchor[]} anchors
 */
function projectAnchors(lon, lat, anchors) {
  const mesh = meshFor(anchors);
  const p = { lon, lat };
  let best = /** @type {{ t: LandAnchor[], w: number[] } | null} */ (null);
  let bestMin = -Infinity;
  for (const t of mesh) {
    const w = barycentric(p, t[0], t[1], t[2]);
    const mn = Math.min(w[0], w[1], w[2]);
    if (mn > bestMin) {
      bestMin = mn;
      best = { t, w };
    }
    if (mn >= -1e-9) {
      return {
        x: w[0] * t[0].x + w[1] * t[1].x + w[2] * t[2].x,
        y: w[0] * t[0].y + w[1] * t[1].y + w[2] * t[2].y,
      };
    }
  }
  if (!best) return { x: 0, y: 0 };
  const { t, w } = best;
  return {
    x: w[0] * t[0].x + w[1] * t[1].x + w[2] * t[2].x,
    y: w[0] * t[0].y + w[1] * t[1].y + w[2] * t[2].y,
  };
}

/**
 * @param {number} lon
 * @param {number} lat
 * @param {{ country?: string, region?: string, svg?: SVGSVGElement | null }} [opts]
 */
export function projectLonLat(lon, lat, opts = {}) {
  const lonN = Number(lon);
  const latN = Number(lat);
  if (!Number.isFinite(lonN) || !Number.isFinite(latN)) return { x: 0, y: 0 };
  const landBox = landForPlace(opts.country, opts.region, lonN, latN);
  const anchors = landBox ? LAND_ANCHORS[landBox.path] : null;
  if (anchors && anchors.length >= 3) {
    const pt = projectAnchors(lonN, latN, anchors);
    return clampMap(pt.x, pt.y);
  }
  const box = landBox ? pathBox(opts.svg, landBox.path) : null;
  if (landBox && box) {
    const u = (lonN - landBox.west) / (landBox.east - landBox.west);
    const v = (landBox.north - latN) / (landBox.north - landBox.south);
    return clampMap(box.x + u * box.width, box.y + v * box.height);
  }
  return projectLonLatAffine(lonN, latN);
}

function clampMap(x, y) {
  return {
    x: Math.min(MAP_VB_W, Math.max(0, x)),
    y: Math.min(MAP_VB_H, Math.max(0, y)),
  };
}
