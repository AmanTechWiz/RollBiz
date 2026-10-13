import { BufferGeometry, Matrix4, SphereGeometry, Vector3 } from "three";
import { place } from "../geoKit";
import { gridMesh } from "./parts";
import { type Field, gradient } from "./sdf";

// Saddle cloth (caparison): a shell lifted off the body that follows its curvature, with embossed
// relief (border band, stud row, inner frame, nested diamond, corner triangles) on each flank.
// Cloth coordinates: a = metres along X from the back edge, b = arc length over the back from the
// spine (b > 0 runs down the near +Z flank, b < 0 down the far flank).

const X0 = -0.245;
export const CLOTH_W = 0.25;
const YC = 0.47; // axis the arc length is measured around
const BOTTOM_Y = 0.39; // hem height at mid-cloth
const TOP = 0.0075; // shell lift off the skin
const DA = 0.004;
const DB = 0.004;
const PHI_MAX = (150 * Math.PI) / 180;
const NPHI = 300;

type P2 = [number, number];

export interface ClothSurface {
  B: number;
  /** point and unit normal on the skin at (a, b) */
  at(a: number, b: number): { p: Vector3; n: Vector3 };
  /** true if a skin point lies well under the cloth (for culling hidden skin) */
  covers(x: number, y: number, z: number, margin: number): boolean;
}

function hitRadius(f: Field, x: number, phi: number, guess: number): number {
  const dy = Math.cos(phi);
  const dz = Math.sin(phi);
  const inside = (r: number) => f(x, YC + dy * r, dz * r) < 0;
  let lo = Math.max(0.02, guess - 0.03);
  let hi = guess + 0.03;
  while (!inside(lo) && lo > 0.005) lo *= 0.5;
  while (inside(hi)) hi += 0.03;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (inside(m)) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function clothSurface(f: Field): ClothSurface {
  const na = Math.round(CLOTH_W / DA) + 1;
  // per column: phi samples -> radius and cumulative arc length (from phi = 0)
  const cols = [] as { x: number; phis: Float64Array; arc: Float64Array; r: Float64Array }[];
  for (let i = 0; i < na; i++) {
    const x = X0 + i * DA;
    const phis = new Float64Array(2 * NPHI + 1);
    const r = new Float64Array(2 * NPHI + 1);
    const arc = new Float64Array(2 * NPHI + 1);
    for (const dir of [1, -1]) {
      let guess = 0.17;
      let prevY = 0;
      let prevZ = 0;
      let s = 0;
      for (let k = 0; k <= NPHI; k++) {
        const idx = NPHI + dir * k;
        const phi = (dir * k * PHI_MAX) / NPHI;
        const rr = hitRadius(f, x, phi, guess);
        guess = rr;
        const y = Math.cos(phi) * rr;
        const z = Math.sin(phi) * rr;
        if (k > 0) s += Math.hypot(y - prevY, z - prevZ);
        prevY = y;
        prevZ = z;
        phis[idx] = phi;
        r[idx] = rr;
        arc[idx] = dir * s;
      }
    }
    cols.push({ x, phis, arc, r });
  }
  const phiAt = (c: (typeof cols)[number], b: number) => {
    // arc is monotonic increasing with index
    let lo = 0;
    let hi = c.arc.length - 1;
    if (b <= c.arc[lo]!) return c.phis[lo]!;
    if (b >= c.arc[hi]!) return c.phis[hi]!;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (c.arc[m]! <= b) lo = m;
      else hi = m;
    }
    const t = (b - c.arc[lo]!) / (c.arc[hi]! - c.arc[lo]!);
    return c.phis[lo]! + (c.phis[hi]! - c.phis[lo]!) * t;
  };
  const radAt = (c: (typeof cols)[number], phi: number) => {
    const u = (phi / PHI_MAX) * NPHI + NPHI;
    const k = Math.min(2 * NPHI - 1, Math.max(0, Math.floor(u)));
    const t = u - k;
    return c.r[k]! + (c.r[k + 1]! - c.r[k]!) * t;
  };

  // B: arc length at which the near flank reaches the hem height, at mid cloth
  const mid = cols[Math.floor(na / 2)]!;
  let B = 0;
  for (let k = NPHI; k <= 2 * NPHI; k++) {
    const y = YC + Math.cos(mid.phis[k]!) * mid.r[k]!;
    if (y < BOTTOM_Y) {
      B = mid.arc[k]!;
      break;
    }
  }

  // dense table of skin points and normals over the cloth area
  const nb = Math.round((2 * B) / DB) + 1;
  const P = new Float64Array(na * nb * 3);
  const N = new Float64Array(na * nb * 3);
  for (let i = 0; i < na; i++) {
    const c = cols[i]!;
    for (let j = 0; j < nb; j++) {
      const b = -B + j * DB;
      const phi = phiAt(c, b);
      const rr = radAt(c, phi);
      const x = c.x;
      const y = YC + Math.cos(phi) * rr;
      const z = Math.sin(phi) * rr;
      const [gx, gy, gz] = gradient(f, x, y, z, 0.002);
      const l = Math.hypot(gx, gy, gz) || 1;
      const o = (i * nb + j) * 3;
      P[o] = x;
      P[o + 1] = y;
      P[o + 2] = z;
      N[o] = gx / l;
      N[o + 1] = gy / l;
      N[o + 2] = gz / l;
    }
  }
  const at = (a: number, b: number) => {
    const u = Math.min(na - 1.0001, Math.max(0, a / DA));
    const v = Math.min(nb - 1.0001, Math.max(0, (b + B) / DB));
    const i = Math.floor(u);
    const j = Math.floor(v);
    const tu = u - i;
    const tv = v - j;
    const p = new Vector3();
    const n = new Vector3();
    const w = [(1 - tu) * (1 - tv), tu * (1 - tv), (1 - tu) * tv, tu * tv];
    const ids = [i * nb + j, (i + 1) * nb + j, i * nb + j + 1, (i + 1) * nb + j + 1];
    for (let k = 0; k < 4; k++) {
      const o = ids[k]! * 3;
      p.x += P[o]! * w[k]!;
      p.y += P[o + 1]! * w[k]!;
      p.z += P[o + 2]! * w[k]!;
      n.x += N[o]! * w[k]!;
      n.y += N[o + 1]! * w[k]!;
      n.z += N[o + 2]! * w[k]!;
    }
    return { p, n: n.normalize() };
  };
  const covers = (x: number, y: number, z: number, margin: number) => {
    const a = x - X0;
    if (a < margin || a > CLOTH_W - margin) return false;
    const c = cols[Math.round(a / DA)]!;
    const phi = Math.atan2(z, y - YC);
    const lim = Math.abs(phiAt(c, B - margin));
    return Math.abs(phi) < lim;
  };
  return { B, at, covers };
}

// ------------------------------------------------------------------ path helpers

/** Closed polygon with filleted corners, sampled roughly every `step`. */
function rounded(corners: P2[], r: number, step: number): P2[] {
  const out: P2[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const c = corners[i]!;
    const p = corners[(i + n - 1) % n]!;
    const q = corners[(i + 1) % n]!;
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const l2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
    const s: P2 = [c[0] + ((p[0] - c[0]) / l1) * rr, c[1] + ((p[1] - c[1]) / l1) * rr];
    const e: P2 = [c[0] + ((q[0] - c[0]) / l2) * rr, c[1] + ((q[1] - c[1]) / l2) * rr];
    const K = 5;
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const a = (1 - t) * (1 - t);
      const b = 2 * t * (1 - t);
      const d = t * t;
      out.push([a * s[0] + b * c[0] + d * e[0], a * s[1] + b * c[1] + d * e[1]]);
    }
    // straight run to the next corner's fillet start
    const l3 = l2 - 2 * Math.min(r, l2 * 0.45);
    const m = Math.floor(l3 / step);
    for (let k = 1; k < m; k++) {
      const t = (rr + (l3 * k) / m) / l2;
      out.push([c[0] + (q[0] - c[0]) * t, c[1] + (q[1] - c[1]) * t]);
    }
  }
  return out;
}

/**
 * Sweep a cross-section along a closed path lying on the cloth. Profile points are
 * [side, up]: side > 0 is to the left of the path (inside a CCW loop), up is off the skin.
 */
function ribbon(S: ClothSurface, path: P2[], profile: P2[]): BufferGeometry {
  const rows: Vector3[][] = [];
  const n = path.length;
  for (let k = 0; k < n; k++) {
    const [a, b] = path[k]!;
    const p0 = path[(k + n - 1) % n]!;
    const p1 = path[(k + 1) % n]!;
    let ta = p1[0] - p0[0];
    let tb = p1[1] - p0[1];
    const tl = Math.hypot(ta, tb) || 1;
    ta /= tl;
    tb /= tl;
    const { p, n: nn } = S.at(a, b);
    const e = 0.002;
    const s1 = S.at(a - tb * e, b + ta * e).p;
    const s0 = S.at(a + tb * e, b - ta * e).p;
    const side = s1.sub(s0);
    side.addScaledVector(nn, -side.dot(nn)).normalize();
    rows.push(profile.map(([sd, up]) => p.clone().addScaledVector(side, sd).addScaledVector(nn, up)));
  }
  // close the loop by repeating the first row
  rows.push(rows[0]!.map((v) => v.clone()));
  const mid = Math.floor(profile.length / 2);
  void mid;
  return gridMesh(rows, (q) => {
    // outward = the skin normal near q
    let best = Infinity;
    let bn = new Vector3(0, 1, 0);
    for (const [a, b] of [path[0]!, path[Math.floor(n / 2)]!]) {
      const s = S.at(a, b);
      const d = s.p.distanceTo(q);
      if (d < best) {
        best = d;
        bn = s.n;
      }
    }
    return bn;
  });
}

/** Rounded bead profile, width 2w, height h above the cloth top. */
function bead(w: number, h: number, flat = 0.6, segs = 4): P2[] {
  const out: P2[] = [];
  for (let k = 0; k <= segs; k++) {
    const t = (k / segs) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push([-w * Math.sign(c) * Math.pow(Math.abs(c), flat), TOP - 0.0015 + (h + 0.0015) * Math.pow(s, flat)]);
  }
  return out;
}

function rect(a0: number, b0: number, a1: number, b1: number): P2[] {
  return [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
}

/** CCW in (a, b): reverse for the far flank where b is negative. */
function ccw(poly: P2[]): P2[] {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s > 0 ? poly : poly.slice().reverse();
}

export function clothGeometries(S: ClothSurface): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const W = CLOTH_W;
  const B = S.B;

  // shell
  const NA = 24;
  const NB = 50;
  const rows: Vector3[][] = [];
  for (let i = 0; i <= NA; i++) {
    const row: Vector3[] = [];
    for (let j = 0; j <= NB; j++) {
      const { p, n } = S.at((W * i) / NA, -B + (2 * B * j) / NB);
      row.push(p.addScaledVector(n, TOP));
    }
    rows.push(row);
  }
  out.push(gridMesh(rows, (q) => new Vector3(0, q.y - YC, q.z)));

  // rounded hem all round: from the shell top down onto the skin, outward
  const hem = ccw(rounded(rect(0, -B, W, B), 0.012, 0.008));
  out.push(
    ribbon(S, hem, [
      [0.0015, TOP],
      [-0.0015, TOP * 0.95],
      [-0.0035, TOP * 0.7],
      [-0.0048, TOP * 0.35],
      [-0.0052, -0.002],
    ]),
  );

  const stud = new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const addStud = (a: number, b: number, r: number, h: number) => {
    const { p, n } = S.at(a, b);
    const t = new Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
    const u = new Vector3().crossVectors(n, t);
    const m = new Matrix4().makeBasis(t.multiplyScalar(r), n.clone().multiplyScalar(h), u.multiplyScalar(r));
    m.setPosition(p.addScaledVector(n, TOP - 0.0012));
    out.push(place(stud, m));
  };

  const bt = 0.072; // where the flank panel meets the band over the back
  for (const s of [1, -1]) {
    const B0 = bt;
    const flank = (poly: P2[]) => ccw(poly.map(([a, b]) => [a, s * b] as P2));
    // outer border band
    const e1 = 0.016;
    out.push(ribbon(S, rounded(flank(rect(e1, B0, W - e1, B - e1)), 0.008, 0.009), bead(0.0105, 0.0045, 0.35)));
    // stud row inside the border (sides and bottom)
    const e2 = 0.038;
    const sr = 0.0098;
    const bTop = B0 + 0.03;
    const bBot = B - e2;
    const nSide = 5;
    for (let k = 0; k < nSide; k++) {
      const b = bTop + ((bBot - bTop) * k) / (nSide - 1);
      addStud(e2, s * b, sr, 0.0078);
      addStud(W - e2, s * b, sr, 0.0078);
    }
    const nBot = 6;
    for (let k = 1; k < nBot - 1; k++) addStud(e2 + ((W - 2 * e2) * k) / (nBot - 1), s * bBot, sr, 0.0078);
    // inner frame
    const e3 = 0.06;
    const fb0 = B0 + 0.028;
    const fb1 = B - e3;
    out.push(ribbon(S, rounded(flank(rect(e3, fb0, W - e3, fb1)), 0.004, 0.009), bead(0.005, 0.0038, 0.45)));
    // nested diamonds
    const ca = W / 2;
    const cb = (fb0 + fb1) / 2;
    const dia = (ha: number, hb: number): P2[] => [[ca, cb - hb], [ca + ha, cb], [ca, cb + hb], [ca - ha, cb]];
    const ha = (W - 2 * e3) / 2 - 0.022;
    const hb = (fb1 - fb0) / 2 - 0.016;
    out.push(ribbon(S, rounded(flank(dia(ha, hb)), 0.004, 0.008), bead(0.0052, 0.0042, 0.45)));
    out.push(ribbon(S, rounded(flank(dia(ha * 0.45, hb * 0.45)), 0.003, 0.006), bead(0.0046, 0.0042, 0.45)));
    // corner triangles inside the inner frame
    const g = 0.012;
    const L = 0.026;
    const tris: P2[][] = [
      [[e3 + g, fb0 + g], [e3 + g + L, fb0 + g], [e3 + g, fb0 + g + L]],
      [[W - e3 - g, fb0 + g], [W - e3 - g, fb0 + g + L], [W - e3 - g - L, fb0 + g]],
      [[e3 + g, fb1 - g], [e3 + g, fb1 - g - L], [e3 + g + L, fb1 - g]],
      [[W - e3 - g, fb1 - g], [W - e3 - g - L, fb1 - g], [W - e3 - g, fb1 - g - L]],
    ];
    for (const t of tris) out.push(ribbon(S, rounded(flank(t), 0.003, 0.008), bead(0.0042, 0.0036, 0.45)));
  }
  // band over the top of the back: studs along the spine between the two border lines
  for (let k = 0; k < 6; k++) addStud(0.03 + ((W - 0.06) * k) / 5, 0, 0.0085, 0.006);
  return out;
}
