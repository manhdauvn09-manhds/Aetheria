// Aetheria — hex grid math.
//
// We use **pointy-top** axial coordinates `(q, r)`. Conversion to/from
// pixel space follows the Red Blob Games reference:
//   x = size * sqrt(3) * (q + r/2)
//   y = size * 3/2 * r
// Cube rounding handles "which hex did the user click?" — convert axial
// to cube, round each axis, fix the largest delta, convert back.

export interface Axial {
  readonly q: number;
  readonly r: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

const SQRT3 = Math.sqrt(3);

export const axialToPixel = (q: number, r: number, size: number): PixelPoint => ({
  x: size * SQRT3 * (q + r / 2),
  y: size * (3 / 2) * r,
});

export const pixelToAxial = (x: number, y: number, size: number): Axial => {
  const q = (SQRT3 / 3) * x / size - (1 / 3) * y / size;
  const r = (2 / 3) * y / size;
  return roundAxial(q, r);
};

export const roundAxial = (q: number, r: number): Axial => {
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
};

/**
 * Six corner offsets of a pointy-top hex of `size` radius (centre→corner).
 * Corner 0 is the top, corners go clockwise.
 */
export const hexCorners = (size: number): readonly PixelPoint[] => {
  const out: PixelPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    out.push({ x: size * Math.cos(angleRad), y: size * Math.sin(angleRad) });
  }
  return out;
};

/**
 * Bounding box for a list of axial tiles, in pixel space, given hex size.
 * Useful for sizing the canvas + initial camera placement.
 */
export const tilesBounds = (
  tiles: readonly Axial[],
  size: number,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  if (tiles.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    const { x, y } = axialToPixel(t.q, t.r, size);
    if (x - size < minX) minX = x - size;
    if (y - size < minY) minY = y - size;
    if (x + size > maxX) maxX = x + size;
    if (y + size > maxY) maxY = y + size;
  }
  return { minX, minY, maxX, maxY };
};
