/**
 * A slippy-map tile layer, small enough to own.
 *
 * The map has been bare vector geometry since the first day, with a note saying tile
 * providers are unreachable from this environment. That note was true and the conclusion
 * drawn from it was wrong: *this* environment cannot reach them, but the app does not run
 * here — it runs in a browser on somebody's phone, which reaches them perfectly well. The
 * design has had a real basemap in it the whole time.
 *
 * Leaflet would be the obvious answer and is what the design uses, but bringing it in means
 * handing it the projection and re-expressing every pin, ripple and route line through its
 * API. The alternative is about sixty lines: Web Mercator is a closed-form pair of
 * equations, tiles are a naming convention, and an SVG `<image>` loads a URL. Sixty lines
 * we understand beats forty kilobytes we adapt to, and the pins keep the coordinate system
 * they already have.
 *
 * The one thing it must do is fail invisibly. A tile that does not load leaves the dark
 * background showing through, which is exactly the map as it looks today — so a blocked
 * network, an expired tile service or an offline phone degrades to the previous design
 * rather than to a broken one.
 */

/** Pixels per tile edge at every zoom. The convention, not a choice. */
const TILE = 256;

/** Metres per pixel at the equator, zoom 0. */
const EQUATOR_M_PER_PX = 156543.03392804097;

export interface TilePlan {
  readonly zoom: number;
  /** Where world-pixel (0,0) of this zoom sits in the SVG's own coordinates. */
  readonly originX: number;
  readonly originY: number;
  /** How much to scale a tile so the fractional part of the zoom is honoured. */
  readonly scale: number;
  readonly tiles: readonly { x: number; y: number; px: number; py: number }[];
}

/** Web Mercator, in world pixels at a given zoom. */
export function toWorld(lat: number, lng: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const s = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)));
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

/**
 * Which tiles cover a view, and where to put them.
 *
 * `spanKm` is measured across the view's width. Zoom is chosen to match it and then floored
 * — a fractional zoom would mean asking for tiles that do not exist, so the remainder
 * becomes a scale on the ones that do.
 */
export function planTiles(
  centre: { lat: number; lng: number },
  spanKm: number,
  widthPx: number,
  heightPx: number,
): TilePlan {
  const mPerPx = (spanKm * 1000) / Math.max(widthPx, 1);
  const cos = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
  const exact = Math.log2((EQUATOR_M_PER_PX * cos) / mPerPx);
  // Rounded, not floored. Flooring always lands on the zoom *below* the one wanted, so
  // every tile is stretched — measured at 1.6× to 1.9× across the three travel modes, which
  // is visibly soft on a phone and soft in exactly the way that makes a map look cheap.
  // Rounding keeps the scale between 0.71 and 1.41 and usually shrinks rather than stretches,
  // at the cost of one more tile across.
  //
  // 19 is past the deepest most basemaps publish; 1 keeps the whole world on screen rather
  // than asking for tile (0,0) of a zoom that does not tile.
  const zoom = Math.max(1, Math.min(19, Math.round(exact)));
  const scale = 2 ** (exact - zoom);

  const world = toWorld(centre.lat, centre.lng, zoom);
  // SVG coordinates of world-pixel zero, given the centre sits in the middle of the view.
  const originX = widthPx / 2 - world.x * scale;
  const originY = heightPx / 2 - world.y * scale;

  const span = 2 ** zoom;
  const size = TILE * scale;
  const firstX = Math.floor(-originX / size);
  const lastX = Math.floor((widthPx - originX) / size);
  const firstY = Math.max(0, Math.floor(-originY / size));
  const lastY = Math.min(span - 1, Math.floor((heightPx - originY) / size));

  const tiles: { x: number; y: number; px: number; py: number }[] = [];
  for (let x = firstX; x <= lastX; x++) {
    for (let y = firstY; y <= lastY; y++) {
      // Longitude wraps; latitude does not. A negative x is the same tile as one a world
      // away, which is what lets a view straddle the antimeridian without a gap.
      const wrapped = ((x % span) + span) % span;
      tiles.push({ x: wrapped, y, px: originX + x * size, py: originY + y * size });
    }
  }

  return { zoom, originX, originY, scale, tiles };
}

/**
 * Esri's dark grey canvas, which is what the design uses.
 *
 * Chosen to match rather than on the merits, and that is the right reason here: the design
 * was drawn against this basemap's particular grey, and a different provider's dark theme
 * would put every colour decision half a step out.
 *
 * Its licence requires the attribution the map renders in the corner. That line is not
 * decoration and must not be removed.
 */
export const TILE_URL = (x: number, y: number, z: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;

export const TILE_ATTRIBUTION = "Tiles © Esri";
