import { CatmullRomCurve3, Vector3 } from "three";
import { type Field, ellipsoid, roundCone, roundCylinder, smin, unionAll } from "./sdf";

// The elephant's moulded body as one smooth-union distance field.
// Units are final model units: +X forward, +Y up, near side (camera) is +Z. Modelled with the soles
// on y = BASE_H (a legacy plinth height); buildElephant() drops everything by BASE_H to stand on y = 0.

export const BASE_H = 0.11;

type V3 = [number, number, number];

export interface Leg {
  hip: V3;
  ankle: V3;
  foot: V3; // centre of the foot pad on the ground
}

const Z = 0.08;
const HIP_Y = 0.4;
const ANKLE_Y = BASE_H + 0.085;
export const FOOT_R = 0.06;
export const LEGS: Leg[] = [
  // near front steps forward, far front stays under the shoulder
  { hip: [0.095, HIP_Y, Z], ankle: [0.138, ANKLE_Y, Z + 0.004], foot: [0.142, BASE_H, Z + 0.004] },
  { hip: [0.08, HIP_Y, -Z], ankle: [0.06, ANKLE_Y, -Z - 0.004], foot: [0.058, BASE_H, -Z - 0.004] },
  // near hind steps back, far hind forward
  { hip: [-0.16, HIP_Y, Z], ankle: [-0.205, ANKLE_Y, Z + 0.004], foot: [-0.208, BASE_H, Z + 0.004] },
  { hip: [-0.15, HIP_Y, -Z], ankle: [-0.12, ANKLE_Y, -Z - 0.004], foot: [-0.118, BASE_H, -Z - 0.004] },
];
export const LEG_R_HIP = 0.078;
export const LEG_R_ANKLE = 0.052;

// Trunk: hangs down in front of the face, slightly forward, the tip curled gently back near the ground.
export const TRUNK = new CatmullRomCurve3(
  [
    new Vector3(0.312, 0.485, 0),
    new Vector3(0.352, 0.452, 0),
    new Vector3(0.374, 0.395, 0),
    new Vector3(0.385, 0.322, 0),
    new Vector3(0.381, 0.252, 0),
    new Vector3(0.364, 0.196, 0),
    new Vector3(0.338, 0.166, 0),
    new Vector3(0.308, 0.165, 0),
    new Vector3(0.292, 0.182, 0),
  ],
  false,
  "centripetal",
);
export function trunkRadius(t: number): number {
  const base = 0.058 - 0.034 * Math.pow(t, 0.6);
  const flare = 0.003 * Math.max(0, (t - 0.9) / 0.1) ** 2;
  return base + flare;
}

export const HEAD = { c: [0.232, 0.54, 0] as V3, r: [0.122, 0.138, 0.115] as V3 };

function trunkField(): Field {
  const n = 26;
  const pts = TRUNK.getSpacedPoints(n);
  const cones: Field[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    cones.push(roundCone([a.x, a.y, a.z], [b.x, b.y, b.z], trunkRadius(i / n), trunkRadius((i + 1) / n)));
  }
  return (x, y, z) => {
    if (x < 0.22) return 1; // far from the trunk: no effect on the blend
    let d = Infinity;
    for (const c of cones) d = Math.min(d, c(x, y, z));
    return d;
  };
}

export function elephantField(): Field {
  const barrel = unionAll(
    [
      ellipsoid(-0.055, 0.47, 0, 0.228, 0.165, 0.15),
      ellipsoid(0.05, 0.48, 0, 0.14, 0.155, 0.138), // shoulders
      ellipsoid(-0.17, 0.46, 0, 0.115, 0.15, 0.14), // rump
      ellipsoid(-0.06, 0.52, 0, 0.17, 0.125, 0.13), // high domed back
    ],
    0.06,
  );
  const head = unionAll(
    [
      ellipsoid(...HEAD.c, ...HEAD.r),
      ellipsoid(0.252, 0.592, 0, 0.092, 0.088, 0.09), // domed forehead
      ellipsoid(0.275, 0.46, 0.042, 0.072, 0.065, 0.06), // cheeks
      ellipsoid(0.275, 0.46, -0.042, 0.072, 0.065, 0.06),
      ellipsoid(0.305, 0.475, 0, 0.052, 0.062, 0.056), // muzzle
      ellipsoid(0.17, 0.53, 0.11, 0.024, 0.085, 0.034), // ear roots
      ellipsoid(0.17, 0.53, -0.11, 0.024, 0.085, 0.034),
    ],
    0.04,
  );
  const legs = LEGS.map((l) => {
    const col = roundCone(l.hip, l.ankle, LEG_R_HIP, LEG_R_ANKLE);
    const pad = roundCylinder(l.foot[0], l.foot[1] + 0.026, l.foot[2], FOOT_R, 0.03, 0.015);
    return (x: number, y: number, z: number) => smin(col(x, y, z), pad(x, y, z), 0.045);
  });
  const trunk = trunkField();
  const base: Field = (x, y, z) => {
    let d = barrel(x, y, z);
    d = smin(d, head(x, y, z), 0.05);
    for (const l of legs) d = smin(d, l(x, y, z), 0.05);
    d = smin(d, trunk(x, y, z), 0.035);
    return d;
  };
  return (x, y, z) => Math.max(base(x, y, z), BASE_H - y); // flat soles on the ground plane
}

export const FIELD_BOX = { min: [-0.3, BASE_H - 0.02, -0.17] as V3, max: [0.46, 0.71, 0.17] as V3 };
