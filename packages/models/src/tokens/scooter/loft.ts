import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V2 = [number, number];
export type V3 = [number, number, number];

const sgnPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Build an indexed (rows x ring) grid with the ring wrapped, weld coincident points, smooth normals. */
function ringGrid(rows: V3[][], flip = false): BufferGeometry {
  const nv = rows[0]!.length;
  const pos: number[] = [];
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
  const idx: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * nv + j;
      const b = i * nv + ((j + 1) % nv);
      const c = (i + 1) * nv + j;
      const d = (i + 1) * nv + ((j + 1) % nv);
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const w = mergeVertices(g, 1e-6);
  w.computeVertexNormals();
  return w;
}

export type Section = { hw: number; ht: number; bow: number };

/**
 * Loft a curved slab along a spine in the XY plane. The cross-section is a superellipse
 * (half-thickness `ht` along the spine's in-plane normal, half-width `hw` along Z), bent so its
 * Z-edges sit `bow` behind the outer face. The outer normal is (t.y, -t.x): for a spine
 * running forward along the floor it points down, for one rising it points forward.
 */
export function spineLoft(opts: {
  spine: V2[];
  section: (u: number, p: Vector3, t: Vector3) => Section;
  rows?: number;
  ring?: number;
  exponent?: number;
  cap?: [number, number];
}): { geometry: BufferGeometry; outer: (u: number, z?: number) => V3 } {
  const { spine, section, rows = 80, ring = 40, exponent = 2.6, cap = [0.04, 0.04] } = opts;
  const curve = new CatmullRomCurve3(spine.map(([x, y]) => new Vector3(x, y, 0)), false, "centripetal");
  const env = (u: number) => {
    let e = 1;
    if (cap[0] > 0 && u < cap[0]) e = Math.sqrt(Math.max(0, 1 - (1 - u / cap[0]) ** 2));
    if (cap[1] > 0 && u > 1 - cap[1]) e = Math.min(e, Math.sqrt(Math.max(0, 1 - (1 - (1 - u) / cap[1]) ** 2)));
    return e;
  };
  const frame = (u: number) => {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new Vector3(t.y, -t.x, 0).normalize();
    const s = section(u, p, t);
    const e = env(u);
    return { p, n, hw: s.hw * e, ht: s.ht * e, bow: s.bow * e };
  };
  const q = 2 / exponent;
  const rowsPts: V3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / rows);
    const { p, n, hw, ht, bow } = frame(u);
    const r: V3[] = [];
    for (let j = 0; j < ring; j++) {
      const th = (j / ring) * Math.PI * 2;
      const a = sgnPow(Math.cos(th), q);
      const b = sgnPow(Math.sin(th), q);
      const ln = ht * a - bow * b * b;
      r.push([p.x + n.x * ln, p.y + n.y * ln, hw * b]);
    }
    rowsPts.push(r);
  }
  const outer = (u: number, z = 0): V3 => {
    const { p, n, hw, ht, bow } = frame(u);
    const b = Math.max(-1, Math.min(1, z / Math.max(1e-6, hw)));
    const a = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(b), exponent)), 1 / exponent);
    const ln = ht * a - bow * b * b;
    return [p.x + n.x * ln, p.y + n.y * ln, hw * b];
  };
  return { geometry: ringGrid(rowsPts), outer };
}

/** y-values where a closed polygon crosses the vertical line x. */
function crossings(poly: V2[], x: number): number[] {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) ys.push(y1 + ((x - x1) * (y2 - y1)) / (x2 - x1));
  }
  return ys;
}

/**
 * Two-view loft along X: the side silhouette is a closed XY outline, the plan view is a
 * half-width function of t (0 = rear end, 1 = front end). Each station is a superellipse.
 * `topOffset` dents the top line (for seat pleats). Returns the side-surface sampler too.
 */
export function twoViewLoft(opts: {
  side: V2[];
  halfWidth: (t: number) => number;
  rows?: number;
  ring?: number;
  exponent?: number;
  topOffset?: (x: number) => number;
}): { geometry: BufferGeometry; sideZ: (x: number, y: number) => number; top: (x: number) => number } {
  const { side, halfWidth, rows = 60, ring = 56, exponent = 2.6, topOffset } = opts;
  let xmin = Infinity;
  let xmax = -Infinity;
  let yAtMin = 0;
  let yAtMax = 0;
  for (const [x, y] of side) {
    if (x < xmin) [xmin, yAtMin] = [x, y];
    if (x > xmax) [xmax, yAtMax] = [x, y];
  }
  const station = (x: number) => {
    const ys = crossings(side, x);
    const t = (x - xmin) / (xmax - xmin);
    let top = ys.length ? Math.max(...ys) : lerp(yAtMin, yAtMax, t);
    const bot = ys.length ? Math.min(...ys) : top;
    if (topOffset) top = Math.max(bot, top - topOffset(x));
    return { yc: (top + bot) / 2, h: (top - bot) / 2, w: halfWidth(t), top };
  };
  const q = 2 / exponent;
  const rowsPts: V3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const x = xmin + (xmax - xmin) * (0.5 - 0.5 * Math.cos((Math.PI * i) / rows));
    const r: V3[] = [];
    if (i === 0 || i === rows) {
      const y = i === 0 ? yAtMin : yAtMax;
      for (let j = 0; j < ring; j++) r.push([x, y, 0]);
    } else {
      const { yc, h, w } = station(x);
      for (let j = 0; j < ring; j++) {
        const th = (j / ring) * Math.PI * 2;
        r.push([x, yc + h * sgnPow(Math.sin(th), q), w * sgnPow(Math.cos(th), q)]);
      }
    }
    rowsPts.push(r);
  }
  const sideZ = (x: number, y: number) => {
    const { yc, h, w } = station(x);
    const b = Math.min(1, Math.abs((y - yc) / Math.max(1e-6, h)));
    return w * Math.pow(Math.max(0, 1 - Math.pow(b, exponent)), 1 / exponent);
  };
  return { geometry: ringGrid(rowsPts, true), sideZ, top: (x: number) => station(x).top };
}
