import { useMemo } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { pewter, pewterDark } from "../materials";
import { at, mergeAll, place } from "./geoKit";

/**
 * Steam locomotive token, facing +X (smokebox and pilot at +X, cab at the rear).
 * Everything is merged into two meshes: pewter, plus pewterDark for recesses.
 */

const AXLE_Y = 0.07;
const WHEEL_R = 0.066;
const WHEEL_Z = 0.15;
const WHEEL_X = [-0.19, -0.065, 0.06, 0.185];
const PIN_R = 0.026;
const PIN_ANGLE = (38 * Math.PI) / 180;

const BOILER_Y = 0.268;
const BOILER_R = 0.105;
const FIT = 0.95;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}
/** Cylinder along X. */
function cylX(r0: number, r1: number, len: number, x: number, y: number, z: number, seg = 24): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, len, seg, 1);
  g.rotateZ(-Math.PI / 2);
  return g.translate(x, y, z);
}
/** Cylinder along Z. */
function cylZ(r0: number, r1: number, len: number, x: number, y: number, z: number, seg = 20): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, len, seg, 1);
  g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}
/** Ring around the X axis. */
function ringX(r: number, tube: number, x: number, y: number, seg = 40): BufferGeometry {
  const g = new TorusGeometry(r, tube, 8, seg);
  g.rotateY(Math.PI / 2);
  return g.translate(x, y, 0);
}
function lathe(profile: [number, number][], seg = 32): LatheGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg);
}
/** Thin bar between two points in the XY plane at depth z. */
function bar(x0: number, y0: number, x1: number, y1: number, thick: number, depth: number, z: number): BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const g = new BoxGeometry(len, thick, depth);
  const m = new Matrix4().makeRotationZ(ang).setPosition((x0 + x1) / 2, (y0 + y1) / 2, z);
  return place(g, m);
}

// ------------------------------------------------------------------ wheels
function buildWheel(light: BufferGeometry[], dark: BufferGeometry[], x: number, sg: number) {
  const z = sg * WHEEL_Z;
  // tyre with a small flange on the inner side
  const tyre = lathe(
    [
      [0.05, -0.011], [0.0655, -0.011], [0.0655, 0.006], [0.07, 0.009], [0.07, 0.012], [0.05, 0.012], [0.05, -0.011],
    ],
    40,
  );
  tyre.rotateX(Math.PI / 2);
  if (sg < 0) tyre.rotateY(Math.PI);
  light.push(place(tyre, new Matrix4().makeTranslation(x, AXLE_Y, z)));
  // dark web behind the spokes so they read clearly
  dark.push(cylZ(0.052, 0.052, 0.006, x, AXLE_Y, z - sg * 0.002, 32));
  // spokes
  const spoke = new BoxGeometry(0.007, 0.042, 0.01);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const m = new Matrix4().makeRotationZ(a);
    m.setPosition(x - Math.sin(a) * 0.033, AXLE_Y + Math.cos(a) * 0.033, z + sg * 0.002);
    light.push(place(spoke, m));
  }
  // counterweight on the web
  light.push(place(new CylinderGeometry(0.046, 0.046, 0.009, 14, 1, false, 0, 1.3).rotateX(Math.PI / 2), new Matrix4().makeRotationZ(PIN_ANGLE + Math.PI - 0.65 + Math.PI / 2).setPosition(x, AXLE_Y, z + sg * 0.003)));
  // hub and boss
  light.push(cylZ(0.019, 0.019, 0.026, x, AXLE_Y, z + sg * 0.003, 20));
  light.push(place(new SphereGeometry(1, 14, 10), at(x, AXLE_Y, z + sg * 0.016, 0.012, 0.012, 0.007)));
  // crank pin
  const px = x + Math.cos(PIN_ANGLE) * PIN_R;
  const py = AXLE_Y + Math.sin(PIN_ANGLE) * PIN_R;
  light.push(cylZ(0.007, 0.007, 0.03, px, py, z + sg * 0.018, 12));
}

// ------------------------------------------------------------------ cab
function cabSideWall(): BufferGeometry {
  const x0 = -0.345;
  const x1 = -0.1;
  const y0 = 0.15;
  const y1 = 0.432;
  const s = new Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);
  for (const cx of [-0.278, -0.17]) {
    const h = new Path();
    const w = 0.03;
    const cy = 0.315;
    h.moveTo(cx - w, cy - w * 1.2);
    h.lineTo(cx - w, cy + w * 1.2);
    h.lineTo(cx + w, cy + w * 1.2);
    h.lineTo(cx + w, cy - w * 1.2);
    h.lineTo(cx - w, cy - w * 1.2);
    s.holes.push(h);
  }
  return new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
}

function cabRoof(): BufferGeometry {
  const hw = 0.148; // half-width (overhangs the walls)
  const s = new Shape();
  s.moveTo(-hw, 0.43);
  s.lineTo(hw, 0.43);
  s.lineTo(hw, 0.438);
  s.quadraticCurveTo(hw * 0.78, 0.462, 0, 0.466);
  s.quadraticCurveTo(-hw * 0.78, 0.462, -hw, 0.438);
  s.lineTo(-hw, 0.43);
  const depth = 0.3;
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); // shape x -> world z, depth -> -x
  return g.translate(-0.055, 0, 0);
}

// ------------------------------------------------------------------ build
function build() {
  const light: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];

  // chassis frame, axles, running boards
  light.push(box(0.7, 0.05, 0.2, -0.015, 0.1, 0));
  for (const x of WHEEL_X) dark.push(cylZ(0.008, 0.008, 0.33, x, AXLE_Y, 0, 10));
  for (const sg of [1, -1]) {
    light.push(box(0.65, 0.011, 0.045, -0.02, 0.157, sg * 0.14)); // running board
    light.push(box(0.65, 0.007, 0.01, -0.02, 0.1625, sg * 0.162)); // board lip
    for (const x of WHEEL_X) buildWheel(light, dark, x, sg);
    // coupling rod and bosses
    const px0 = WHEEL_X[0]! + Math.cos(PIN_ANGLE) * PIN_R;
    const px3 = WHEEL_X[3]! + Math.cos(PIN_ANGLE) * PIN_R;
    const py = AXLE_Y + Math.sin(PIN_ANGLE) * PIN_R;
    light.push(box(px3 - px0, 0.012, 0.007, (px0 + px3) / 2, py, sg * 0.176));
    for (const wx of WHEEL_X) {
      light.push(cylZ(0.011, 0.011, 0.008, wx + Math.cos(PIN_ANGLE) * PIN_R, py, sg * 0.176, 14));
    }
    // steam cylinder, crosshead and main rod
    light.push(cylX(0.027, 0.027, 0.115, 0.255, 0.105, sg * 0.105, 24));
    light.push(place(new SphereGeometry(1, 16, 10), at(0.315, 0.105, sg * 0.105, 0.02, 0.027, 0.027)));
    light.push(cylX(0.012, 0.012, 0.07, 0.34 - 0.07, 0.105, sg * 0.105, 10).translate(0.0, 0, 0));
    const mx = WHEEL_X[2]! + Math.cos(PIN_ANGLE) * PIN_R;
    light.push(bar(0.195, 0.105, mx, py, 0.012, 0.007, sg * 0.186));
    light.push(box(0.026, 0.02, 0.02, 0.195, 0.105, sg * 0.18));
    // handrail along the boiler with posts
    light.push(cylX(0.0045, 0.0045, 0.3, 0.14, 0.31, sg * 0.113, 8));
    for (const x of [-0.005, 0.07, 0.15, 0.27]) light.push(cylX(0.0035, 0.0035, 0.002, x, 0.31, sg * 0.113, 6)); // knobs
    for (const x of [-0.005, 0.07, 0.15, 0.27]) {
      light.push(bar(x, 0.31, x, 0.263, 0.005, 0.005, sg * 0.1).translate(0, 0, 0));
    }
    // cab side wall
    const wall = cabSideWall();
    wall.translate(0, 0, sg > 0 ? 0.119 : -0.131);
    light.push(wall);
    // window frames (raised bead round each opening)
    for (const cx of [-0.278, -0.17]) {
      const w = 0.03;
      const cy = 0.315;
      const zf = sg * 0.133;
      light.push(box(2 * w + 0.012, 0.006, 0.006, cx, cy + w * 1.2 + 0.003, zf));
      light.push(box(2 * w + 0.012, 0.006, 0.006, cx, cy - w * 1.2 - 0.003, zf));
      light.push(box(0.006, 2 * w * 1.2, 0.006, cx - w - 0.003, cy, zf));
      light.push(box(0.006, 2 * w * 1.2, 0.006, cx + w + 0.003, cy, zf));
    }
    // cab step
    light.push(box(0.05, 0.006, 0.03, -0.215, 0.1, sg * 0.138));
  }

  // cab: front/back walls, dark interior, roof
  light.push(box(0.012, 0.28, 0.25, -0.106, 0.29, 0));
  light.push(box(0.012, 0.282, 0.25, -0.339, 0.291, 0));
  dark.push(box(0.21, 0.255, 0.215, -0.222, 0.29, 0));
  light.push(box(0.245, 0.01, 0.26, -0.222, 0.152, 0)); // floor
  light.push(cabRoof());
  // back-wall opening hint and lamp
  dark.push(box(0.003, 0.1, 0.08, -0.346, 0.26, 0));
  light.push(box(0.03, 0.008, 0.04, -0.34, 0.425, 0)); // roof vent
  // rear buffer beam, buffers
  light.push(box(0.022, 0.04, 0.3, -0.352, 0.13, 0));
  for (const sg of [1, -1]) {
    light.push(cylX(0.012, 0.012, 0.03, -0.378, 0.135, sg * 0.1, 14));
    light.push(cylX(0.024, 0.024, 0.008, -0.396, 0.135, sg * 0.1, 18));
  }

  // boiler, smokebox, bands
  light.push(cylX(BOILER_R, BOILER_R, 0.34, 0.07, BOILER_Y, 0, 40));
  light.push(cylX(BOILER_R + 0.006, BOILER_R + 0.006, 0.12, 0.275, BOILER_Y, 0, 40));
  for (const x of [-0.03, 0.04, 0.115, 0.185]) {
    light.push(ringX(BOILER_R + 0.001, 0.0065, x, BOILER_Y));
  }
  light.push(ringX(BOILER_R + 0.006, 0.008, 0.215, BOILER_Y)); // smokebox joint
  light.push(ringX(BOILER_R + 0.006, 0.006, 0.325, BOILER_Y)); // front lip
  light.push(ringX(BOILER_R + 0.003, 0.006, -0.1, BOILER_Y)); // firebox joint

  // smokebox door: domed plate, ring, rivets, centre boss
  const door = lathe([[0, 0.0], [0.04, -0.003], [0.08, -0.009], [0.11, -0.014], [0.111, -0.02]], 40);
  door.rotateZ(-Math.PI / 2);
  light.push(door.translate(0.337, BOILER_Y, 0));
  light.push(place(new TorusGeometry(0.086, 0.0065, 8, 48).rotateY(Math.PI / 2), new Matrix4().makeTranslation(0.331, BOILER_Y, 0)));
  dark.push(place(new TorusGeometry(0.066, 0.005, 8, 48).rotateY(Math.PI / 2), new Matrix4().makeTranslation(0.333, BOILER_Y, 0)));
  const rivet = new SphereGeometry(0.0055, 8, 6);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    light.push(place(rivet, new Matrix4().makeTranslation(0.335, BOILER_Y + Math.cos(a) * 0.098, Math.sin(a) * 0.098)));
  }
  light.push(place(new SphereGeometry(1, 20, 12), at(0.343, BOILER_Y, 0, 0.016, 0.026, 0.026)));
  light.push(ringX(0.035, 0.005, 0.339, BOILER_Y, 28));
  // door handle bar and lamp bracket
  light.push(box(0.008, 0.007, 0.06, 0.348, BOILER_Y, 0));

  // chimney (flared) with dark throat
  const chimney = lathe([
    [0, 0.33], [0.036, 0.33], [0.037, 0.352], [0.03, 0.375], [0.023, 0.4], [0.021, 0.42],
    [0.024, 0.44], [0.032, 0.462], [0.04, 0.48], [0.044, 0.49], [0.044, 0.497], [0.037, 0.5], [0.034, 0.494],
  ]);
  light.push(chimney.translate(0.28, 0, 0));
  const throat = new CylinderGeometry(0.034, 0.034, 0.004, 24).translate(0.28, 0.492, 0);
  dark.push(throat);

  // domes
  const dome = (r: number, h: number, x: number, taper = 0.7) => {
    const base = BOILER_Y + BOILER_R - 0.012;
    return lathe([
      [0, base], [r * 1.12, base], [r * 1.1, base + 0.01], [r, base + 0.016],
      [r * taper, base + h * 0.72], [r * 0.5, base + h * 0.9], [r * 0.2, base + h * 0.99], [0, base + h],
    ]).translate(x, 0, 0);
  };
  light.push(dome(0.04, 0.062, 0.135));
  light.push(dome(0.03, 0.045, 0.045, 0.85));
  light.push(place(new SphereGeometry(1, 12, 8), at(0.135, 0.268 + 0.105 + 0.056, 0, 0.01, 0.007, 0.01))); // finial
  // whistle / safety valve
  light.push(new CylinderGeometry(0.008, 0.01, 0.03, 10).translate(0.205, BOILER_Y + BOILER_R + 0.01, 0));

  // pilot (cowcatcher): beam, side plates, slats
  light.push(box(0.03, 0.045, 0.3, 0.335, 0.148, 0));
  const plate = new Shape();
  plate.moveTo(0.34, 0.14);
  plate.lineTo(0.34, 0.054);
  plate.lineTo(0.428, 0.054);
  plate.lineTo(0.428, 0.062);
  plate.lineTo(0.34, 0.14);
  for (const sg of [1, -1]) {
    const g = new ExtrudeGeometry(plate, { depth: 0.01, bevelEnabled: false });
    g.translate(0, 0, sg > 0 ? 0.14 : -0.15);
    light.push(g);
  }
  const NS = 12;
  for (let k = 0; k < NS; k++) {
    const z = -0.126 + (0.252 * k) / (NS - 1);
    light.push(bar(0.345, 0.126, 0.428, 0.052, 0.013, 0.012, z));
  }
  light.push(box(0.008, 0.012, 0.28, 0.43, 0.06, 0)); // front rail
  light.push(bar(0.37, 0.104, 0.4, 0.08, 0.007, 0.28, 0).translate(0, 0, 0)); // crossbar
  // front buffers
  for (const sg of [1, -1]) {
    light.push(cylX(0.012, 0.012, 0.03, 0.368, 0.15, sg * 0.105, 14));
    light.push(cylX(0.024, 0.024, 0.008, 0.386, 0.15, sg * 0.105, 18));
  }
  // dark shadow behind the slats
  dark.push(bar(0.348, 0.118, 0.42, 0.054, 0.006, 0.26, 0));

  const a = mergeAll(light);
  const b = mergeAll(dark);
  a.computeBoundingBox();
  const box3 = a.boundingBox!;
  const dx = -(box3.min.x + box3.max.x) / 2;
  const dy = -box3.min.y;
  a.translate(dx, dy, 0);
  b.translate(dx, dy, 0);
  a.scale(FIT, FIT, FIT);
  b.scale(FIT, FIT, FIT);
  return { light: a, dark: b };
}

export function SteamTrain() {
  const { light, dark } = useMemo(build, []);
  return (
    <group>
      <mesh geometry={light} material={pewter} castShadow receiveShadow />
      <mesh geometry={dark} material={pewterDark} castShadow />
    </group>
  );
}
