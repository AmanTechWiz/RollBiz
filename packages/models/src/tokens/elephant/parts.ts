import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { at, flipWinding, place, taperedTube } from "../geoKit";
import { BASE_H, FOOT_R, LEGS, TRUNK, trunkRadius } from "./body";
import { type Field, normalAt, project, rayHit } from "./sdf";

type V3 = [number, number, number];

/** Grid of points -> indexed triangles; flips winding so faces agree with `outward` at the middle. */
export function gridMesh(pts: Vector3[][], outward: (p: Vector3) => Vector3, closeV = false, testRow?: number): BufferGeometry {
  const nu = pts.length;
  const nv = pts[0]!.length;
  const pos: number[] = [];
  for (const row of pts) for (const p of row) pos.push(p.x, p.y, p.z);
  const idx: number[] = [];
  const cols = closeV ? nv : nv - 1;
  for (let i = 0; i < nu - 1; i++)
    for (let j = 0; j < cols; j++) {
      const j2 = (j + 1) % nv;
      const a = i * nv + j, b = i * nv + j2, c = (i + 1) * nv + j, d = (i + 1) * nv + j2;
      idx.push(a, b, c, b, d, c);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // orientation test on a central quad
  const i = testRow ?? Math.floor((nu - 1) / 2);
  const j = Math.floor(cols / 2);
  const A = pts[i]![j]!, B = pts[i]![(j + 1) % nv]!, C = pts[i + 1]![j]!;
  const n = new Vector3().subVectors(B, A).cross(new Vector3().subVectors(C, A));
  if (n.dot(outward(A)) < 0) flipWinding(g);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ ears

const EAR_OUTLINE: [number, number][] = [
  [-0.012, 0.085], [0.03, 0.118], [0.088, 0.126], [0.142, 0.104], [0.18, 0.055], [0.195, -0.012],
  [0.183, -0.08], [0.148, -0.13], [0.1, -0.163], [0.06, -0.188], [0.034, -0.17], [0.02, -0.11], [0.0, -0.04],
];

const EAR_SCALE = 1.12;

/** Thin fan ear with a rounded, raised rim and a slight cup. side = +1 near (+Z), -1 far. */
export function earGeometry(side: number): BufferGeometry {
  const outline = new CatmullRomCurve3(EAR_OUTLINE.map(([u, v]) => new Vector3(u, v, 0)), true, "centripetal");
  const C = new Vector3(0.085, -0.02, 0);
  const A = new Vector3(0.172, 0.535, side * 0.132);
  const U = new Vector3(-1, 0, side * 0.2).normalize();
  const V = new Vector3(0, 1, 0);
  const N = new Vector3().crossVectors(V, U).normalize();
  if (N.z * side < 0) N.negate();
  const NR = 20;
  const NC = 52;
  const rows: Vector3[][] = [];
  const o = new Vector3();
  for (let i = 0; i <= NR; i++) {
    const psi = (i / NR) * Math.PI;
    const rho = Math.sin(psi);
    const c = Math.cos(psi);
    const row: Vector3[] = [];
    for (let j = 0; j < NC; j++) {
      outline.getPointAt(j / NC, o);
      const u = (C.x + rho * (o.x - C.x)) * EAR_SCALE;
      const v = (C.y + rho * (o.y - C.y)) * EAR_SCALE;
      const rim = Math.exp(-(((rho - 0.86) / 0.07) ** 2));
      const half = 0.005 + 0.0072 * rim;
      const thick = Math.sign(c) * Math.pow(Math.abs(c), 0.45) * half;
      // cup: middle sits back toward the head, edge curls out; back edge leans out more
      // gently domed toward the root, the back and lower edges curling out into a shallow cup
      const cup = 0.017 * (1 - rho * rho) + 0.013 * Math.max(0, u / 0.21) ** 3 + 0.006 * Math.max(0, -v / 0.2) ** 2;
      // soft fold running down and back from the root, on the outer face
      const fu = u - 0.03, fv = v + 0.01;
      const along = Math.max(0, Math.min(1, (fu * 0.6 - fv * 0.8) / 0.16));
      const dist = Math.abs(fu * 0.8 + fv * 0.6);
      const fold = c > 0 ? 0.006 * Math.exp(-((dist / 0.02) ** 2)) * Math.sin(Math.PI * along) * c : 0;
      const p = A.clone().addScaledVector(U, u).addScaledVector(V, v * 0.94).addScaledVector(N, thick + cup + fold);
      row.push(p);
    }
    rows.push(row);
  }
  // front face is psi < pi/2 (positive N side)
  return gridMesh(rows, () => N.clone(), true, Math.floor(NR / 4));
}

// ------------------------------------------------------------------ small parts

export function tuskGeometry(side: number): BufferGeometry {
  const c = new CatmullRomCurve3([
    new Vector3(0.298, 0.445, side * 0.052),
    new Vector3(0.345, 0.428, side * 0.066),
    new Vector3(0.4, 0.424, side * 0.077),
    new Vector3(0.448, 0.44, side * 0.081),
    new Vector3(0.478, 0.468, side * 0.079),
  ]);
  return taperedTube(c, (t) => 0.0195 * Math.pow(1 - t, 0.8) + 0.0035, 36, 14);
}

/** Eye centre on the head surface plus its outward normal. */
export function eyeFrame(field: Field, side: number): { p: Vector3; n: Vector3 } {
  const hit = rayHit(field, [0.27, 0.535, 0], new Vector3(0.42, 0.12, side).normalize().toArray() as V3);
  const n = normalAt(field, ...hit);
  return { p: new Vector3(...hit), n: new Vector3(...n) };
}

export function eyeGeometry(field: Field, side: number): BufferGeometry {
  const { p, n } = eyeFrame(field, side);
  const g = new SphereGeometry(0.0125, 16, 12);
  g.translate(p.x - n.x * 0.0045, p.y - n.y * 0.0045, p.z - n.z * 0.0045);
  return g;
}

/** Soft lid ring around each eye, in body plastic. */
export function eyeLid(field: Field, side: number): BufferGeometry {
  const { p, n } = eyeFrame(field, side);
  const g = new TorusGeometry(0.0138, 0.0042, 8, 28);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  g.applyMatrix4(new Matrix4().compose(p.clone().addScaledVector(n, -0.003), q, new Vector3(1, 1, 1)));
  return g;
}

export function tailGeometry(): BufferGeometry[] {
  const c = new CatmullRomCurve3([
    new Vector3(-0.24, 0.53, 0),
    new Vector3(-0.285, 0.5, 0),
    new Vector3(-0.305, 0.44, 0.004),
    new Vector3(-0.305, 0.38, 0.01),
  ]);
  const tube = taperedTube(c, (t) => 0.0125 - 0.0045 * t, 28, 10);
  const tuft = place(new SphereGeometry(1, 12, 10), at(-0.304, 0.368, 0.01, 0.0135, 0.024, 0.0135));
  return [tube, tuft];
}

/** Horizontal radius of the field's surface around a vertical axis at height y. */
function radiusAround(field: Field, cx: number, y: number, cz: number): number {
  let sum = 0;
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const h = rayHit(field, [cx, y, cz], [Math.cos(a), 0, Math.sin(a)], 0.2);
    sum += Math.hypot(h[0] - cx, h[2] - cz);
  }
  return sum / n;
}

/** Raised ankle bands and three rounded toenails per foot. */
export function feetDetails(field: Field): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const nail = new SphereGeometry(1, 10, 7);
  for (const leg of LEGS) {
    const yb = BASE_H + 0.068;
    const t = (yb - leg.ankle[1]) / (leg.hip[1] - leg.ankle[1]);
    const cx = leg.ankle[0] + (leg.hip[0] - leg.ankle[0]) * t;
    const cz = leg.ankle[2] + (leg.hip[2] - leg.ankle[2]) * t;
    const r = radiusAround(field, cx, yb, cz);
    const band = new TorusGeometry(r + 0.0005, 0.0062, 6, 36);
    band.rotateX(Math.PI / 2);
    band.scale(1, 1.7, 1);
    const axis = new Vector3(leg.hip[0] - leg.ankle[0], leg.hip[1] - leg.ankle[1], leg.hip[2] - leg.ankle[2]).normalize();
    band.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis));
    band.translate(cx, yb, cz);
    out.push(band);
    const side = Math.sign(leg.foot[2]);
    for (const deg of [-44, 0, 44]) {
      const a = ((deg + side * 12) * Math.PI) / 180;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const y = BASE_H + 0.022;
      const rr = radiusAround(field, leg.foot[0], y, leg.foot[2]);
      const m = new Matrix4()
        .makeTranslation(leg.foot[0] + dx * (rr - 0.0045), y, leg.foot[2] + dz * (rr - 0.0045))
        .multiply(new Matrix4().makeRotationY(-a))
        .multiply(new Matrix4().makeScale(0.0115, 0.022, 0.022));
      out.push(place(nail, m));
    }
  }
  void FOOT_R;
  return out;
}

/** Subtle ring wrinkles where the trunk leaves the face, on its front and sides only. */
export function trunkWrinkles(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const p = new Vector3();
  const tng = new Vector3();
  const arc = Math.PI * 1.15;
  for (const t of [0.1, 0.135, 0.17, 0.205, 0.24, 0.275]) {
    TRUNK.getPointAt(t, p);
    TRUNK.getTangentAt(t, tng);
    const r = trunkRadius(t);
    const g = new TorusGeometry(r - 0.0022, 0.0042, 5, 18, arc);
    g.rotateZ(-arc / 2);
    const xa = new Vector3(1, 0, 0).addScaledVector(tng, -tng.x).normalize();
    const ya = new Vector3().crossVectors(tng, xa);
    g.applyMatrix4(new Matrix4().makeBasis(xa, ya, tng).setPosition(p));
    out.push(g);
  }
  return out;
}

/** Smiling mouth: a fine moulded lip line under the trunk root, curving back and up each side. */
export function smileGeometry(field: Field, side: number): BufferGeometry {
  const raw: V3[] = [
    [0.322, 0.418, side * 0.035],
    [0.302, 0.414, side * 0.06],
    [0.282, 0.424, side * 0.075],
    [0.268, 0.44, side * 0.08],
  ];
  const pts = raw.map((q) => {
    const p = project(field, q, 4);
    const n = normalAt(field, ...p);
    return new Vector3(p[0] + n[0] * 0.0008, p[1] + n[1] * 0.0008, p[2] + n[2] * 0.0008);
  });
  const c = new CatmullRomCurve3(pts);
  return taperedTube(c, (t) => 0.0032 * Math.sin(Math.PI * (0.08 + 0.84 * t)) + 0.0006, 24, 6);
}
