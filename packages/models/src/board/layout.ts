// Board geometry shared by the board model and (later) tokens. Units: 1 = one regular tile's width.
// Index 0 is the bottom-right corner (+X, +Z); the track runs clockwise as seen from above with the
// player seated on the +Z side: bottom edge towards -X, up the left side (-Z), along the top, down the right.

/** Width of a regular tile. */
export const TILE_W = 1;
/** Depth of a regular tile (radial extent). Corners are CORNER x CORNER. */
export const TILE_D = 1.6;
export const CORNER = 1.6;
/** Tiles between two corners. */
export const SIDE_TILES = 9;

/** Edge length of the tile track (outer edge of the tiles): 2 * 1.6 + 9 = 12.2. */
export const BOARD_SIZE = CORNER * 2 + SIDE_TILES * TILE_W;
/** Printed margin around the track. */
export const MARGIN = 0.15;
/** Edge length of the printed top face (track plus margin). */
export const PRINT_SIZE = BOARD_SIZE + MARGIN * 2;
/** Card thickness; the top surface sits at y = BOARD_THICKNESS. */
export const BOARD_THICKNESS = 0.12;
/** Edge length of the empty centre square. */
export const INNER_SIZE = BOARD_SIZE - CORNER * 2;

export type Side = 0 | 1 | 2 | 3; // bottom, left, top, right

export interface TileRect {
  index: number;
  side: Side;
  isCorner: boolean;
  /** Centre on the board plane. */
  x: number;
  z: number;
  /** Extent across the track direction / radially. For corners both are CORNER. */
  w: number;
  d: number;
  /** Clockwise canvas rotation (radians) that makes the tile's "up" point at the board centre. */
  rotation: number;
}

const HALF = BOARD_SIZE / 2;
const EDGE = HALF - TILE_D / 2; // centre line of side tiles = HALF - 0.8
const FIRST = HALF - CORNER - TILE_W / 2; // centre of the tile next to corner 0 on the bottom row

/** Placement of one of the 40 tiles. */
export function tileRect(index: number): TileRect {
  const i = ((index % 40) + 40) % 40;
  const side = Math.floor(i / 10) as Side;
  const k = i % 10;
  const rotation = (side * Math.PI) / 2;
  if (k === 0) {
    const sx = side === 0 || side === 3 ? 1 : -1;
    const sz = side === 0 || side === 1 ? 1 : -1;
    return { index: i, side, isCorner: true, x: sx * EDGE, z: sz * EDGE, w: CORNER, d: CORNER, rotation };
  }
  const along = FIRST - (k - 1);
  let x = 0;
  let z = 0;
  if (side === 0) { x = along; z = EDGE; }
  else if (side === 1) { x = -EDGE; z = along; }
  else if (side === 2) { x = -along; z = -EDGE; }
  else { x = EDGE; z = -along; }
  return { index: i, side, isCorner: false, x, z, w: TILE_W, d: TILE_D, rotation };
}

/** World-space centre of a tile's top surface: [x, y, z]. */
export function tileCenter(index: number): [number, number, number] {
  const t = tileRect(index);
  return [t.x, BOARD_THICKNESS, t.z];
}
