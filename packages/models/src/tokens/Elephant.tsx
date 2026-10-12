import { useMemo } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { pewter, pewterDark } from "../materials";
import { at, gridSurface, mergeAll, place, taperedTube } from "./geoKit";

/**
 * Indian elephant token, facing +X. Built from a lofted torso, ellipsoid head, bent-sphere ears,
 * tapered-tube trunk and tusks, and a caparison (cloth) shell that follows the torso loft.
 */

// ---------------------------------------------------------------- torso loft
type Station = [x: number, yc: number, ry: number, rz: number];
const STATIONS: Station[] = [
  [-0.315, 0.32, 0.03, 0.03],
  [-0.295, 0.325, 0.1, 0.098],
  [-0.24, 0.34, 0.165, 0.158],
  [-0.15, 0.355, 0.19, 0.175],
  [-0.04, 0.35, 0.188, 0.172],
  [0.07, 0.35, 0.188, 0.17],
  [0.15, 0.36, 0.175, 0.155],
  [0.21, 0.385, 0.165, 0.138],
  [0.28, 0.41, 0.175, 0.158],
  [0.34, 0.402, 0.15, 0.135],
  [0.395, 0.382, 0.098, 0.085],
  [0.425, 0.37, 0.03, 0.03],
];

const curveA = new CatmullRomCurve3(STATIONS.map(([x, yc, ry]) => new Vector3(x, yc, ry)), false, "centripetal");
const curveB = new CatmullRomCurve3(STATIONS.map(([, , , rz]) => new Vector3(rz, 0, 0)), false, "centripetal");
const tmpA = new Vector3();
const tmpB = new Vector3();
function torsoAt(t: number) {
  curveA.getPoint(t, tmpA);
  curveB.getPoint(t, tmpB);
  return { x: tmpA.x, yc: tmpA.y, ry: tmpA.z, rz: tmpB.x };
}
function tForX(x: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (torsoAt(mid).x < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function torsoGeometry(): BufferGeometry {
  return gridSurface(
    (u, v) => {
      const { x, yc, ry, rz } = torsoAt(u);
      const a = v * Math.PI * 2;
      return new Vector3(x, yc + ry * Math.cos(a), rz * Math.sin(a));
    },
    48,
    32,
    true,
  );
}

// ---------------------------------------------------------------- caparison
const CLOTH_X0 = -0.225;
const CLOTH_X1 = 0.055;
const PHI_MAX = (128 * Math.PI) / 180;
const T0 = tForX(CLOTH_X0);
const T1 = tForX(CLOTH_X1);

/** Point on the cloth surface. s: 0..1 front-to-back along X (rear to front), u: -1..1 over the back. */
function clothPoint(s: number, u: number, off: number, out = new Vector3()): Vector3 {
  const { x, yc, ry, rz } = torsoAt(T0 + (T1 - T0) * s);
  const phi = u * PHI_MAX;
  return out.set(x, yc + (ry + off) * Math.cos(phi), (rz + off) * Math.sin(phi));
}

/** Patch of the cloth surface between (s0..s1, u0..u1), lifted by off(a,b). */
function patch(
  s0: number,
  s1: number,
  u0: number,
  u1: number,
  off: (a: number, b: number) => number,
  nu = 12,
  nv = 12,
): BufferGeometry {
  // gridSurface winding follows du x dv; flip by swapping direction if needed (checked visually).
  return gridSurface((a, b) => clothPoint(s0 + (s1 - s0) * a, u0 + (u1 - u0) * b, off(a, b)), nu, nv);
}

const BASE = 0.01;
/** Rounded ridge profile across the narrow direction of a strip (b for u-narrow strips). */
const bead = (peak: number) => (_a: number, b: number) => BASE + 0.0015 + peak * Math.sin(Math.PI * b);
/** Same, for strips that are narrow in the s direction (profile follows a). */
const beadA = (peak: number) => (a: number) => BASE + 0.0015 + peak * Math.sin(Math.PI * a);

function surfaceFrame(s: number, u: number, off: number) {
  const e = 0.01;
  const p = clothPoint(s, u, off);
  const tx = clothPoint(s + e, u, off).sub(clothPoint(s - e, u, off)).normalize();
  const sign = u >= 0 ? 1 : -1;
  const tb = clothPoint(s, u - sign * e, off).sub(clothPoint(s, u + sign * e, off)).normalize(); // toward the spine
  let n = new Vector3().crossVectors(tx, tb).normalize();
  const { yc } = torsoAt(T0 + (T1 - T0) * s);
  const outward = new Vector3(0, p.y - yc, p.z);
  if (n.dot(outward) < 0) n = n.negate();
  // re-orthogonalise tb
  const tb2 = new Vector3().crossVectors(n, tx).normalize();
  if (tb2.dot(tb) < 0) tb2.negate();
  return { p, tx, tb: tb2, n };
}

function lotus(s: number, u: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const f = surfaceFrame(s, u, BASE + 0.003);
  const petal = new SphereGeometry(1, 10, 6);
  const row = (angles: number[], len: number, wid: number, lift: number) => {
    for (const deg of angles) {
      const a = (deg * Math.PI) / 180;
      const d = f.tb.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.tx, Math.sin(a)).normalize();
      const w = new Vector3().crossVectors(d, f.n).normalize();
      const centre = f.p.clone().addScaledVector(d, len * 0.95).addScaledVector(f.n, lift);
      const m = new Matrix4().makeBasis(w.clone().multiplyScalar(wid), d.clone().multiplyScalar(len), f.n.clone().multiplyScalar(0.0055));
      m.setPosition(centre);
      out.push(place(petal, m));
    }
  };
  row([-62, -31, 31, 62], 0.034, 0.0105, 0.0035);
  row([-18, 0, 18], 0.05, 0.0115, 0.0055);
  row([-10, 10], 0.032, 0.0095, 0.0085);
  // bud + base
  out.push(place(new SphereGeometry(1, 8, 6), new Matrix4().makeScale(0.01, 0.01, 0.007).setPosition(f.p.clone().addScaledVector(f.n, 0.007))));
  // leaves either side
  for (const sg of [-1, 1]) {
    const d = f.tx.clone().multiplyScalar(sg).addScaledVector(f.tb, -0.5).normalize();
    const w = new Vector3().crossVectors(d, f.n).normalize();
    const m = new Matrix4().makeBasis(w.clone().multiplyScalar(0.007), d.clone().multiplyScalar(0.03), f.n.clone().multiplyScalar(0.004));
    m.setPosition(f.p.clone().addScaledVector(d, 0.03).addScaledVector(f.n, 0.003));
    out.push(place(petal, m));
  }
  return out;
}

function clothGeometries() {
  const light: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];

  // base shell
  light.push(patch(0, 1, -1, 1, () => BASE, 20, 44));

  // raised border (rounded bead) around the perimeter
  const bs = 0.07; // in s
  const bu = 0.06; // in u
  light.push(patch(0, bs, -1, 1, beadA(0.011), 6, 60));
  light.push(patch(1 - bs, 1, -1, 1, beadA(0.011), 6, 60));
  light.push(patch(bs, 1 - bs, 1 - bu, 1, bead(0.011), 24, 6));
  light.push(patch(bs, 1 - bs, -1, -(1 - bu), bead(0.011), 24, 6));
  // dark inlay line inside the border
  const g1 = 0.016;
  dark.push(patch(bs, bs + g1, -(1 - bu), 1 - bu, () => BASE + 0.0016, 2, 56));
  dark.push(patch(1 - bs - g1, 1 - bs, -(1 - bu), 1 - bu, () => BASE + 0.0016, 2, 56));
  dark.push(patch(bs + g1, 1 - bs - g1, 1 - bu - 0.02, 1 - bu, () => BASE + 0.0016, 22, 2));
  dark.push(patch(bs + g1, 1 - bs - g1, -(1 - bu), -(1 - bu - 0.02), () => BASE + 0.0016, 22, 2));

  // inner panels (one per flank) framed by a small bead, filled dark for contrast
  const ps0 = 0.2;
  const ps1 = 0.8;
  const pu0 = 0.3;
  const pu1 = 0.8;
  for (const sg of [1, -1]) {
    const a0 = sg * pu0;
    const a1 = sg * pu1;
    dark.push(patch(ps0, ps1, a0, a1, () => BASE + 0.0018, 14, 14));
    const fw = 0.02;
    // frame strips
    light.push(patch(ps0 - fw * 0.5, ps0 + fw * 0.5, a0 - sg * 0.02, a1 + sg * 0.02, beadA(0.006), 3, 14));
    light.push(patch(ps1 - fw * 0.5, ps1 + fw * 0.5, a0 - sg * 0.02, a1 + sg * 0.02, beadA(0.006), 3, 14));
    light.push(patch(ps0, ps1, a0 - sg * 0.03, a0 + sg * 0.005, bead(0.006), 14, 3));
    light.push(patch(ps0, ps1, a1 - sg * 0.005, a1 + sg * 0.03, bead(0.006), 14, 3));
    light.push(...lotus(0.5, sg * 0.66));
  }

  // top panel: a row of studs/diamonds along the spine
  const stud = new SphereGeometry(1, 10, 6);
  for (let k = 0; k < 5; k++) {
    const s = 0.2 + (0.6 * k) / 4;
    const f = surfaceFrame(s, 0, BASE + 0.004);
    light.push(place(stud, new Matrix4().makeScale(0.011, 0.005, 0.011).setPosition(f.p.clone().addScaledVector(f.n, 0.004))));
  }
  dark.push(patch(ps0, ps1, -0.14, 0.14, () => BASE + 0.0018, 14, 8));
  // re-add studs over the dark panel (they were placed before, order does not matter when merged)

  // rivet row along the border bead
  const rivet = new SphereGeometry(0.0042, 6, 4);
  for (let k = 0; k < 18; k++) {
    for (const sg of [-1, 1]) {
      const s = 0.1 + (0.8 * k) / 17;
      const f = surfaceFrame(s, sg * 0.88, BASE + 0.0045);
      light.push(place(rivet, new Matrix4().makeTranslation(f.p.x, f.p.y, f.p.z)));
    }
  }

  // tasselled fringe along both hems
  const tassel = new CylinderGeometry(0.005, 0.0075, 0.04, 6, 1);
  const bead2 = new SphereGeometry(0.0085, 6, 4);
  const NT = 24;
  for (let k = 0; k <= NT; k++) {
    const s = k / NT;
    for (const sg of [-1, 1]) {
      const p = clothPoint(s, sg, BASE - 0.002);
      light.push(place(tassel, new Matrix4().makeTranslation(p.x, p.y - 0.022, p.z)));
      light.push(place(bead2, new Matrix4().makeTranslation(p.x, p.y - 0.046, p.z)));
    }
  }
  // hem band (dark) just above the fringe
  dark.push(patch(0, 1, 0.965, 1, () => BASE + 0.0018, 28, 2));
  dark.push(patch(0, 1, -1, -0.965, () => BASE + 0.0018, 28, 2));
  return { light, dark };
}

// ---------------------------------------------------------------- body parts
function legGeometry(): BufferGeometry {
  const prof: [number, number][] = [
    [0, 0], [0.066, 0], [0.077, 0.009], [0.079, 0.026], [0.074, 0.05], [0.071, 0.09],
    [0.074, 0.15], [0.082, 0.21], [0.09, 0.3], [0.0, 0.3],
  ];
  return new LatheGeometry(prof.map(([r, y]) => new Vector2(r, y)), 24);
}

function earGeometry(): BufferGeometry {
  const L = 0.17;
  const H = 0.225;
  const g = new SphereGeometry(1, 28, 20);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const chord = Math.sqrt(Math.max(1 - y * y, 1e-4));
    const u = Math.min(1, Math.max(0, (x + chord) / (2 * chord))); // 0 at the attach edge, 1 at the free edge
    const top = (y + 1) / 2; // 1 at the top
    const ex = -u * L;
    const ht = 0.02 - 0.05 * Math.pow(u, 3); // rounded upper rear corner
    const hb = -H * (1 - 0.35 * u * u); // lower edge slopes up towards the free edge, tip near the attach side
    const ey = hb + (ht - hb) * top - 0.03 * u * u;
    const thick = 0.0075 + 0.003 * (1 - u);
    const bend = 0.045 * u * u; // flare outward towards the free edge
    const ripple = 0.003 * Math.sin(top * 9) * u;
    pos.setXYZ(i, ex, ey, z * thick + bend + ripple);
  }
  g.computeVertexNormals();
  return g;
}

const FIT = 0.88;

function buildElephant() {
  const light: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];
  const sph = new SphereGeometry(1, 20, 14);

  light.push(torsoGeometry());

  // legs, toenails and wrinkle rings
  const leg = legGeometry();
  const ring = new TorusGeometry(1, 0.0036, 5, 24);
  ring.rotateX(Math.PI / 2);
  const nail = new SphereGeometry(1, 8, 6);
  const legs: [number, number, number][] = [
    [0.125, 0.1, 1],
    [0.125, -0.1, 1],
    [-0.205, 0.107, 1.04],
    [-0.205, -0.107, 1.04],
  ];
  for (const [x, z, sc] of legs) {
    light.push(place(leg, at(x, 0, z, sc, 1, sc)));
    for (const [yy, rr] of [[0.08, 0.0735], [0.125, 0.0725]] as const) {
      light.push(place(ring, at(x, yy, z, rr * sc, 1, rr * sc)));
    }
    for (const deg of [-52, -26, 0, 26, 52]) {
      const a = (deg * Math.PI) / 180;
      const r = 0.077 * sc;
      const m = new Matrix4()
        .makeRotationY(-a)
        .multiply(new Matrix4().makeScale(0.011, 0.014, 0.019));
      m.setPosition(x + r * Math.cos(a), 0.022, z + r * Math.sin(a));
      light.push(place(nail, m));
    }
  }

  // head (the torso loft carries on into the skull); forehead lobes and brow
  const eyeAt = (sg: number) => {
    const y = 0.44;
    const x = 0.345;
    const t = tForX(x);
    const { yc, ry, rz } = torsoAt(t);
    const z = rz * Math.sqrt(Math.max(0, 1 - ((y - yc) / ry) ** 2));
    return new Vector3(x, y, sg * z);
  };
  for (const sg of [1, -1]) {
    const e = eyeAt(sg);
    dark.push(place(sph, at(e.x, e.y, e.z - sg * 0.002, 0.0115, 0.0105, 0.008)));
    light.push(place(sph, at(e.x, e.y, e.z - sg * 0.004, 0.017, 0.016, 0.01)));
  }

  // ears
  const ear = earGeometry();
  const earM = new Matrix4().makeRotationY(0.55).setPosition(0.235, 0.575, 0.105);
  light.push(place(ear, earM));
  const earMirror = new Matrix4().makeScale(1, 1, -1).multiply(earM);
  light.push(place(ear, earMirror));

  // trunk
  const trunkCurve = new CatmullRomCurve3(
    [
      new Vector3(0.34, 0.4, 0),
      new Vector3(0.405, 0.335, 0),
      new Vector3(0.437, 0.255, 0),
      new Vector3(0.44, 0.175, 0),
      new Vector3(0.425, 0.105, 0),
      new Vector3(0.395, 0.055, 0),
      new Vector3(0.355, 0.04, 0),
      new Vector3(0.328, 0.065, 0),
    ],
    false,
    "catmullrom",
    0.5,
  );
  light.push(
    taperedTube(
      trunkCurve,
      (t) => (0.074 - 0.056 * Math.pow(t, 0.75)) * (1 + 0.05 * Math.sin(t * 75) * Math.min(1, t * 4)),
      72,
      16,
      1.05,
    ),
  );
  // trunk tip nostril
  const tipEnd = trunkCurve.getPoint(1);
  dark.push(place(sph, at(tipEnd.x - 0.004, tipEnd.y + 0.004, tipEnd.z, 0.007, 0.006, 0.007)));

  // tusks
  for (const sg of [1, -1]) {
    const c = new CatmullRomCurve3([
      new Vector3(0.355, 0.345, sg * 0.045),
      new Vector3(0.41, 0.3, sg * 0.062),
      new Vector3(0.47, 0.262, sg * 0.07),
      new Vector3(0.52, 0.255, sg * 0.068),
      new Vector3(0.555, 0.282, sg * 0.062),
    ]);
    light.push(taperedTube(c, (t) => 0.021 * Math.pow(1 - t, 0.9) + 0.0025, 40, 12));
    light.push(place(sph, at(0.362, 0.342, sg * 0.05, 0.024, 0.022, 0.022)));
  }

  // tail
  const tail = new CatmullRomCurve3([
    new Vector3(-0.285, 0.375, 0),
    new Vector3(-0.33, 0.325, 0),
    new Vector3(-0.345, 0.24, 0),
    new Vector3(-0.34, 0.17, 0.004),
  ]);
  light.push(taperedTube(tail, (t) => 0.013 - 0.006 * t, 24, 8));
  light.push(place(sph, at(-0.34, 0.145, 0.004, 0.012, 0.03, 0.012)));

  const cloth = clothGeometries();
  light.push(...cloth.light);
  dark.push(...cloth.dark);

  const a = mergeAll(light);
  const b = mergeAll(dark);
  a.computeBoundingBox();
  const box = a.boundingBox!;
  const dx = -(box.min.x + box.max.x) / 2;
  const dy = -box.min.y;
  a.translate(dx, dy, 0);
  b.translate(dx, dy, 0);
  a.scale(FIT, FIT, FIT);
  b.scale(FIT, FIT, FIT);
  return { light: a, dark: b };
}

export function Elephant() {
  const { light, dark } = useMemo(buildElephant, []);
  return (
    <group>
      <mesh geometry={light} material={pewter} castShadow receiveShadow />
      <mesh geometry={dark} material={pewterDark} castShadow />
    </group>
  );
}

