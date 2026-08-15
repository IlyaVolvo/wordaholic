/**
 * Realistic world map with selected languages centered on it.
 * Game icons live in the toolbar rail, immediately right of Languages.
 */

import {
  getCountryLanguage,
  playableLanguageCodes,
  fallbackCountryName,
} from './country-languages.js';

const SKIP_IDS = new Set(['ocean', 'svg2', 'wh-map-style', 'false']);

/** Persists across gateway re-renders so zoom isn't lost when favorites change. */
const mapView = { scale: 1, x: 0, y: 0 };
/** @type {string | null} */
let selectedCountryId = null;
/** When true, tooltip stays open after leaving the country (click-to-pin). */
let mapTooltipPinned = false;
/** Last pinned selector position in stage coordinates. */
const mapTooltipPos = { left: /** @type {number | null} */ (null), top: /** @type {number | null} */ (null) };
const MIN_SCALE = 1;
const MAX_SCALE = 10;
const TOOLTIP_FOCUS_DELAY_MS = 1000;

async function loadMapSvg() {
  const res = await fetch('/map/world.svg');
  if (!res.ok) throw new Error('Failed to load world map');
  let svg = await res.text();
  svg = svg.replace(/<\?xml[^>]*>/, '').trim();
  if (!svg.includes('wh-map-style')) {
    svg = svg.replace(
      /<svg([^>]*)>/,
      `<svg$1><rect id="ocean" width="100%" height="100%" fill="#6fa8c9"/><style id="wh-map-style">path,polygon,polyline{fill:#a8adb3!important;stroke:#6f757c!important;stroke-width:0.35!important}</style>`
    );
  }
  return svg;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   favoriteLanguages?: { code: string, menu: string, flag?: string }[],
 *   supportedLanguageCodes?: Set<string> | string[],
 *   languageMenus?: Record<string, string>,
 *   onFavoriteLanguages?: (codes: string[]) => void | Promise<void>,
 *   onUnfavoriteLanguages?: (codes: string[]) => void | Promise<void>,
 *   onExportData?: () => void | Promise<void>,
 *   onImportData?: (file: File) => void | Promise<void>,
 *   onFeedback?: () => void,
 *   onReloadLatest?: () => void | Promise<void>,
 * }} [opts]
 */
export async function renderWorldMap(container, opts = {}) {
  const favoriteCodes = new Set((opts.favoriteLanguages || []).map((l) => l.code));
  const supported = opts.supportedLanguageCodes instanceof Set
    ? opts.supportedLanguageCodes
    : new Set(opts.supportedLanguageCodes || []);
  /** @type {Record<string, string>} */
  const catalogMenus = opts.languageMenus || {};

  let mapSvg = '';
  try {
    mapSvg = await loadMapSvg();
  } catch (err) {
    console.warn(err);
    mapSvg = `<div class="map-fallback">World map unavailable</div>`;
  }

  container.innerHTML = `
    <div class="map-stage">
      <div class="world-map-layer" aria-hidden="true">
        <div class="world-map-svg">${mapSvg}</div>
      </div>
      <div class="map-zoom-controls" role="group" aria-label="Map tools">
        <div class="map-transfer-controls">
          <button type="button" class="map-zoom-btn" data-transfer="reload" title="Reload latest version" aria-label="Reload latest version">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button type="button" class="map-zoom-btn" data-transfer="export" title="Export completed games" aria-label="Export completed games">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button type="button" class="map-zoom-btn" data-transfer="import" title="Import game data" aria-label="Import game data">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </button>
          <button type="button" class="map-zoom-btn" data-transfer="feedback" title="Send feedback" aria-label="Send feedback">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <input data-transfer-file type="file" accept="application/json,.json" hidden />
        </div>
        <div class="map-zoom-stack" role="group" aria-label="Map zoom">
          <button type="button" class="map-zoom-btn" data-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
          <button type="button" class="map-zoom-btn" data-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" class="map-zoom-btn" data-zoom="reset" title="Reset zoom" aria-label="Reset zoom">⌂</button>
        </div>
      </div>
      <div class="map-lang-tooltip" hidden></div>
      <div class="map-fav-toast" hidden role="status"></div>
    </div>
  `;

  const svgEl = container.querySelector('.world-map-svg svg');
  if (!svgEl) return;

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');
  svgEl.classList.add('world-map-inline');

  const tooltip = container.querySelector('.map-lang-tooltip');
  const toast = container.querySelector('.map-fav-toast');
  const stage = container.querySelector('.map-stage');
  const layer = container.querySelector('.world-map-layer');
  let toastTimer = 0;

  function applyMapView() {
    if (!layer) return;
    layer.style.transform = `translate(${mapView.x}px, ${mapView.y}px) scale(${mapView.scale})`;
    stage?.classList.toggle('map-stage--zoomed', mapView.scale > 1.01);
  }

  /**
   * Zoom toward a stage-local point.
   * @param {number} factor
   * @param {number} originX
   * @param {number} originY
   */
  function zoomAt(factor, originX, originY) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, mapView.scale * factor));
    if (next === mapView.scale) {
      if (next === MIN_SCALE) {
        mapView.x = 0;
        mapView.y = 0;
        applyMapView();
      }
      return;
    }
    const ratio = next / mapView.scale;
    mapView.x = originX - (originX - mapView.x) * ratio;
    mapView.y = originY - (originY - mapView.y) * ratio;
    mapView.scale = next;
    if (mapView.scale <= MIN_SCALE + 0.001) {
      mapView.scale = MIN_SCALE;
      mapView.x = 0;
      mapView.y = 0;
    }
    applyMapView();
  }

  function resetMapView() {
    mapView.scale = MIN_SCALE;
    mapView.x = 0;
    mapView.y = 0;
    applyMapView();
  }

  applyMapView();

  stage?.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-zoom');
      if (!stage) return;
      const cx = stage.clientWidth / 2;
      const cy = stage.clientHeight / 2;
      if (action === 'in') zoomAt(1.25, cx, cy);
      else if (action === 'out') zoomAt(1 / 1.25, cx, cy);
      else if (action === 'reset') resetMapView();
    });
  });

  const transferFile = stage?.querySelector('[data-transfer-file]');
  stage?.querySelectorAll('[data-transfer]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-transfer');
      if (action === 'reload' && typeof opts.onReloadLatest === 'function') {
        void opts.onReloadLatest();
      } else if (action === 'export' && typeof opts.onExportData === 'function') {
        void opts.onExportData();
      } else if (action === 'import') {
        transferFile?.click();
      } else if (action === 'feedback' && typeof opts.onFeedback === 'function') {
        opts.onFeedback();
      }
    });
  });
  transferFile?.addEventListener('change', () => {
    const file = transferFile.files?.[0];
    if (file && typeof opts.onImportData === 'function') {
      void opts.onImportData(file);
    }
    transferFile.value = '';
  });

  stage?.addEventListener(
    'wheel',
    (e) => {
      if (!stage) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, ox, oy);
    },
    { passive: false }
  );

  /** @type {{ id: number, x: number, y: number, moved: boolean } | null} */
  let pan = null;
  /** @type {{ x: number, y: number, dist: number } | null} */
  let pinch = null;

  stage?.addEventListener('pointerdown', (e) => {
    if (!stage) return;
    if (mapView.scale <= MIN_SCALE) return;
    if (e.target instanceof Element && e.target.closest('.map-zoom-controls, .map-lang-tooltip')) return;
    if (e.pointerType === 'touch') return; // touch handled via touch events for pinch
    stage.setPointerCapture(e.pointerId);
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    stage.classList.add('map-stage--panning');
  });

  stage?.addEventListener('pointermove', (e) => {
    if (!pan || pan.id !== e.pointerId) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    if (!pan.moved && dx * dx + dy * dy < 9) return;
    pan.moved = true;
    pan.x = e.clientX;
    pan.y = e.clientY;
    if (mapView.scale <= MIN_SCALE) return;
    mapView.x += dx;
    mapView.y += dy;
    applyMapView();
  });

  function endPan(e) {
    if (!pan || pan.id !== e.pointerId) return;
    if (pan.moved) suppressClickAfterPan = true;
    pan = null;
    stage?.classList.remove('map-stage--panning');
  }
  let suppressClickAfterPan = false;
  stage?.addEventListener('pointerup', endPan);
  stage?.addEventListener('pointercancel', endPan);

  stage?.addEventListener(
    'touchstart',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.map-zoom-controls, .map-lang-tooltip')) return;
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        pinch = {
          x: (a.clientX + b.clientX) / 2,
          y: (a.clientY + b.clientY) / 2,
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        };
        pan = null;
      } else if (e.touches.length === 1 && mapView.scale > MIN_SCALE) {
        const t = e.touches[0];
        pan = { id: -1, x: t.clientX, y: t.clientY, moved: false };
        stage?.classList.add('map-stage--panning');
      }
    },
    { passive: true }
  );

  stage?.addEventListener(
    'touchmove',
    (e) => {
      if (!stage) return;
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const cx = (a.clientX + b.clientX) / 2;
        const cy = (a.clientY + b.clientY) / 2;
        const rect = stage.getBoundingClientRect();
        const factor = dist / (pinch.dist || dist);
        zoomAt(factor, cx - rect.left, cy - rect.top);
        pinch = { x: cx, y: cy, dist };
        return;
      }
      if (pan && e.touches.length === 1 && mapView.scale > MIN_SCALE) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - pan.x;
        const dy = t.clientY - pan.y;
        pan.x = t.clientX;
        pan.y = t.clientY;
        pan.moved = true;
        mapView.x += dx;
        mapView.y += dy;
        applyMapView();
      }
    },
    { passive: false }
  );

  stage?.addEventListener(
    'touchend',
    () => {
      if (pan?.moved) suppressClickAfterPan = true;
      pinch = null;
      pan = null;
      stage?.classList.remove('map-stage--panning');
    },
    { passive: true }
  );

  /** @param {string} message */
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  /**
   * @param {string} code
   */
  function languageMenu(code) {
    return catalogMenus[code] || code;
  }

  /**
   * @param {SVGElement} el
   */
  function countryShape(el) {
    if (!(el instanceof SVGElement)) return null;
    if (el.id === 'ocean' || el.tagName.toLowerCase() === 'rect') return null;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'path' && tag !== 'polygon' && tag !== 'polyline') return null;
    const id = el.id;
    if (!id || SKIP_IDS.has(id) || id.startsWith('path-effect') || id.startsWith('path')) return null;
    return el;
  }

  const shapes = [...svgEl.querySelectorAll('path, polygon, polyline')]
    .map((el) => countryShape(el))
    .filter(Boolean);

  for (const shape of shapes) {
    const meta = getCountryLanguage(shape.id);
    const playable = playableLanguageCodes(meta, supported);
    shape.classList.add('map-country');
    if (playable.length) {
      shape.classList.add('map-country--supported');
      shape.style.setProperty('--lang-count', String(playable.length));
      if (playable.some((code) => favoriteCodes.has(code))) {
        shape.classList.add('map-country--favorite');
      }
    }
    shape.style.cursor = 'pointer';
  }

  /**
   * @param {import('./country-languages.js').CountryInfo | null} meta
   */
  function renderLanguageChips(meta) {
    const langs = meta?.languages || [];
    if (!langs.length) {
      return `<span class="map-lang-chip map-lang-chip--muted">Unknown</span>`;
    }
    return langs
      .map((lang) => {
        const playable = Boolean(lang.code && supported.has(lang.code));
        const label = playable ? languageMenu(lang.code) : lang.name;
        if (!playable) {
          return `<span class="map-lang-chip map-lang-chip--muted" title="Not available yet">${label}</span>`;
        }
        const favorited = favoriteCodes.has(lang.code);
        if (favorited) {
          return `<button type="button" class="map-lang-chip map-lang-chip--favorited" data-lang-code="${lang.code}" data-favorited="1" title="Click to remove from favorites">${label}</button>`;
        }
        return `<button type="button" class="map-lang-chip map-lang-chip--playable" data-lang-code="${lang.code}" title="Click to add to favorites">${label}</button>`;
      })
      .join('');
  }

  /**
   * Resolve the country under the pointer. Uses elementsFromPoint so thin
   * borders / zoom transforms still hit reliably.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {SVGElement | null | 'tooltip'}
   */
  function countryAtPoint(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      if (tooltip?.contains(el)) return 'tooltip';
      if (el.closest?.('.map-zoom-controls')) return null;
      const shape = countryShape(/** @type {SVGElement} */ (el));
      if (shape) return shape;
      // Walk up in case the event target is a child / use-element wrapper.
      let node = el.parentElement;
      while (node && node !== stage) {
        if (tooltip?.contains(node)) return 'tooltip';
        const parentShape = countryShape(/** @type {SVGElement} */ (node));
        if (parentShape) return parentShape;
        node = node.parentElement;
      }
    }
    return null;
  }

  /**
   * @param {{ clientX: number, clientY: number }} e
   * @param {SVGElement} shape
   * @param {{ reposition?: boolean, pin?: boolean }} [opts]
   */
  function openLanguageSelector(e, shape, opts = {}) {
    if (!tooltip || !stage) return;
    const meta = getCountryLanguage(shape.id);
    const country = meta?.country || fallbackCountryName(shape.id);
    const playable = playableLanguageCodes(meta, supported);
    const pin = opts.pin === true;
    const sameCountry = selectedCountryId === shape.id && !tooltip.hidden && mapTooltipPinned === pin;

    if (pin) {
      mapTooltipPinned = true;
      tooltip.classList.add('map-lang-tooltip--pinned');
    } else if (!mapTooltipPinned) {
      tooltip.classList.remove('map-lang-tooltip--pinned');
    }

    let hint = 'Unsupported languages are greyed out';
    if (playable.length) {
      hint = mapTooltipPinned
        ? 'Click a language to select or deselect'
        : 'Click the country to keep this open';
    }

    if (!sameCountry || opts.pin) {
      tooltip.innerHTML = `
        <button type="button" class="map-lang-tooltip-close" data-tooltip-close title="Close" aria-label="Close">×</button>
        <div class="map-lang-tooltip-country">${country}</div>
        <div class="map-lang-tooltip-langs">${renderLanguageChips(meta)}</div>
        <div class="map-lang-tooltip-hint">${hint}</div>
      `;
    }
    tooltip.hidden = false;
    selectedCountryId = shape.id;

    const shouldReposition = opts.reposition === true || (!sameCountry && !mapTooltipPinned);
    if (!shouldReposition) {
      if (mapTooltipPos.left != null && mapTooltipPos.top != null) {
        tooltip.style.left = `${mapTooltipPos.left}px`;
        tooltip.style.top = `${mapTooltipPos.top}px`;
      }
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const x = e.clientX - stageRect.left;
    const y = e.clientY - stageRect.top;
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    const left = Math.min(Math.max(8, x + 14), stageRect.width - tipW - 8);
    const top = Math.min(Math.max(8, y - tipH - 10), stageRect.height - tipH - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    mapTooltipPos.left = left;
    mapTooltipPos.top = top;
  }

  function refreshPinnedChips() {
    if (!tooltip || tooltip.hidden || !selectedCountryId) return;
    const langsEl = tooltip.querySelector('.map-lang-tooltip-langs');
    if (!langsEl) return;
    langsEl.innerHTML = renderLanguageChips(getCountryLanguage(selectedCountryId));
  }

  function syncFavoriteCountryStyles() {
    for (const shape of shapes) {
      const meta = getCountryLanguage(shape.id);
      const playable = playableLanguageCodes(meta, supported);
      shape.classList.toggle(
        'map-country--favorite',
        playable.some((code) => favoriteCodes.has(code))
      );
    }
  }

  let hoverShape = null;
  /** @type {SVGElement | null} */
  let selectedShape = null;
  let hoverTooltipTimer = 0;

  function setHoverShape(shape) {
    if (hoverShape === shape) return;
    hoverShape?.classList.remove('map-country--hover');
    hoverShape = shape;
    if (hoverShape) hoverShape.classList.add('map-country--hover');
  }

  function setSelectedShape(shape) {
    selectedShape?.classList.remove('map-country--selected');
    selectedShape = shape;
    selectedShape?.classList.add('map-country--selected');
  }

  function clearHoverTooltipTimer() {
    if (!hoverTooltipTimer) return;
    window.clearTimeout(hoverTooltipTimer);
    hoverTooltipTimer = 0;
  }

  function hideHoverTooltip() {
    clearHoverTooltipTimer();
    if (mapTooltipPinned) return;
    if (tooltip) {
      tooltip.hidden = true;
      tooltip.classList.remove('map-lang-tooltip--pinned');
    }
    selectedShape?.classList.remove('map-country--selected');
    selectedShape = null;
    selectedCountryId = null;
  }

  function hideLanguageSelector() {
    mapTooltipPinned = false;
    hideHoverTooltip();
  }

  /**
   * @param {{ clientX: number, clientY: number }} e
   * @param {SVGElement} shape
   */
  function scheduleHoverTooltip(e, shape) {
    clearHoverTooltipTimer();
    const { clientX, clientY } = e;
    hoverTooltipTimer = window.setTimeout(() => {
      hoverTooltipTimer = 0;
      openLanguageSelector({ clientX, clientY }, shape, { pin: false, reposition: true });
    }, TOOLTIP_FOCUS_DELAY_MS);
  }

  stage.addEventListener('pointermove', (e) => {
    if (pan?.moved) return;
    if (e.target instanceof Element && e.target.closest('.map-zoom-controls')) return;

    const hit = countryAtPoint(e.clientX, e.clientY);

    // Pinned: stay open for chip clicks; only update country hover highlight.
    if (mapTooltipPinned) {
      if (hit === 'tooltip') return;
      setHoverShape(hit && hit !== 'tooltip' ? hit : null);
      return;
    }

    // Focus highlight is immediate; country/language tooltip waits, then hides at once.
    if (hit && hit !== 'tooltip') {
      const changed = hoverShape !== hit;
      setHoverShape(hit);
      if (changed) {
        hideHoverTooltip();
        scheduleHoverTooltip(e, hit);
      }
      return;
    }

    setHoverShape(null);
    hideLanguageSelector();
  });

  stage.addEventListener('pointerleave', () => {
    setHoverShape(null);
    if (!mapTooltipPinned) hideLanguageSelector();
  });

  stage.addEventListener('click', (e) => {
    if (suppressClickAfterPan) {
      suppressClickAfterPan = false;
      return;
    }
    if (e.target instanceof Element && e.target.closest('.map-zoom-controls')) return;
    if (tooltip?.contains(/** @type {Node} */ (e.target))) return;

    const hit = countryAtPoint(e.clientX, e.clientY);
    if (!hit || hit === 'tooltip') {
      hideLanguageSelector();
      return;
    }
    clearHoverTooltipTimer();
    setHoverShape(hit);
    setSelectedShape(hit);
    openLanguageSelector(e, hit, { pin: true, reposition: true });
  });

  tooltip?.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('[data-tooltip-close]')) {
      e.preventDefault();
      e.stopPropagation();
      hideLanguageSelector();
      return;
    }
    const btn = /** @type {HTMLElement | null} */ (e.target.closest('[data-lang-code]'));
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!mapTooltipPinned) return;
    const code = btn.getAttribute('data-lang-code');
    if (!code || !supported.has(code)) return;

    const selected = btn.getAttribute('data-favorited') === '1' || favoriteCodes.has(code);
    if (selected) {
      favoriteCodes.delete(code);
      refreshPinnedChips();
      syncFavoriteCountryStyles();
      if (typeof opts.onUnfavoriteLanguages === 'function') {
        void Promise.resolve(opts.onUnfavoriteLanguages([code])).then(() => {
          showToast(`Removed ${languageMenu(code)} from favorites`);
        });
      }
      return;
    }
    favoriteCodes.add(code);
    refreshPinnedChips();
    syncFavoriteCountryStyles();
    if (typeof opts.onFavoriteLanguages === 'function') {
      void Promise.resolve(opts.onFavoriteLanguages([code])).then(() => {
        showToast(`Added ${languageMenu(code)} to favorites`);
      });
    }
  });

  // Restore pinned selector after a full map rebuild (import, first paint).
  if (selectedCountryId && mapTooltipPinned) {
    const restored = /** @type {SVGElement | null} */ (
      shapes.find((el) => el.id === selectedCountryId) || null
    );
    if (restored) {
      setSelectedShape(restored);
      openLanguageSelector(
        { clientX: 0, clientY: 0 },
        restored,
        { pin: true, reposition: false }
      );
    } else {
      selectedCountryId = null;
      mapTooltipPinned = false;
    }
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
      <path d="M8 20h16M18 10l12 10-12 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="10" cy="20" r="2.2" fill="currentColor"/>
      <circle cx="30" cy="20" r="2.2" fill="currentColor"/>
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
      const langs = favoriteLanguages.filter(
        (l) => (l.games || []).includes(game.id) && (game.languages || []).includes(l.code)
      );
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
      const tipLangs = langs
        .map((l) => `<span class="rail-game-tip-lang">${l.menu}</span>`)
        .join('');
      return `
        <button type="button" class="rail-game" data-game="${game.id}"
          aria-label="${game.name}. Languages: ${langLabel}">
          <span class="map-game-icon">${icon}</span>
          <span class="map-game-name">${game.name}</span>
          <span class="rail-game-tip" role="tooltip">${tipLangs}</span>
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
