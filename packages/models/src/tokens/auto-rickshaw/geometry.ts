import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { merge, place } from "../vehicles/helpers";

// Auto-rickshaw token, built to match docs/art/reference/token-auto-rickshaw.png.
// Units: overall length ≈ 1 (scaled down in the component). +X forward, +Y up, ±Z sides.
// Spec and analysis: .img2threejs/auto-rickshaw/ (img2threejs pipeline, generic profile).

const W = 0.58; // cabin width
const HALF = W / 2;
const BEVEL = 0.035;
const WHEEL_R = 0.105;
const WHEEL_Y = WHEEL_R;
const REAR_X = -0.3;
const FRONT_WHEEL_X = 0.5;
const ARCH_R = 0.145;

// Doorway, open on both sides: the cabin interior is the space it cuts through the shell.
const DOOR = { x0: -0.135, x1: 0.28, y0: 0.17, y1: 0.77 };

function roundedRectPath(path: Path, x0: number, y0: number, x1: number, y1: number, r: number) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/** Side outline of the cabin: domed roof, rounded rear, upright front, rear wheel arch. */
function cabinProfile(): Shape {
  const s = new Shape();
  const bottom = 0.13;
  s.moveTo(0.31, bottom);
  // rear wheel arch (semicircle over the rear wheel)
  s.lineTo(REAR_X + ARCH_R, bottom);
  s.absarc(REAR_X, bottom, ARCH_R, 0, Math.PI, false);
  s.lineTo(-0.452, bottom);
  // rounded rear, curving into the domed roof
  s.quadraticCurveTo(-0.48, bottom, -0.48, bottom + 0.06);
  s.lineTo(-0.48, 0.66);
  s.bezierCurveTo(-0.48, 0.8, -0.42, 0.86, -0.3, 0.87);
  s.quadraticCurveTo(0.05, 0.9, 0.3, 0.87);
  s.bezierCurveTo(0.37, 0.865, 0.41, 0.84, 0.41, 0.78);
  // upright front (windscreen face), down to the nose
  // lower front steps up to clear the front wheel
  s.lineTo(0.41, 0.27);
  s.quadraticCurveTo(0.41, 0.22, 0.37, 0.22);
  s.quadraticCurveTo(0.34, 0.22, 0.34, 0.18);
  s.quadraticCurveTo(0.34, bottom, 0.31, bottom);

  const door = new Path();
  roundedRectPath(door, DOOR.x0, DOOR.y0, DOOR.x1, DOOR.y1, 0.07);
  s.holes.push(door);
  return s;
}

function extrudeAcross(shape: Shape, width: number, bevel = BEVEL): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: 40,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

/** Thin raised seam following the roof crown, front to back. */
function roofSeam(z: number): BufferGeometry {
  const pts = [
    [-0.47, 0.6], [-0.46, 0.76], [-0.38, 0.86], [-0.2, 0.895], [0.05, 0.905], [0.25, 0.89], [0.36, 0.865], [0.405, 0.8],
  ].map(([x, y]) => new Vector3(x!, y! + BEVEL + 0.001, z));
  return new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.0045, 8, false);
}

/** A tube tracing a list of points (bead lines, rails). */
function rail(points: [number, number, number][], radius: number, closed = false): BufferGeometry {
  return new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed), 64, radius, 8, closed);
}

/** Tyre + hub for one wheel, axis along Z, centred at the origin. */
function wheel(width: number): { tyre: BufferGeometry; hub: BufferGeometry } {
  const r = WHEEL_R;
  const h = width / 2;
  // tyre cross-section revolved around its axis: rounded shoulders, slight centre groove
  const tyreProfile = [
    [r * 0.62, -h], [r * 0.86, -h], [r * 0.97, -h * 0.75], [r, -h * 0.25], [r * 0.985, 0],
    [r, h * 0.25], [r * 0.97, h * 0.75], [r * 0.86, h], [r * 0.62, h],
  ].map(([x, y]) => new Vector2(x!, y!));
  const tyre = new LatheGeometry(tyreProfile, 56);
  const hubProfile = [
    [0, h * 1.05], [r * 0.25, h * 1.02], [r * 0.45, h * 0.85], [r * 0.6, h * 0.55], [r * 0.64, 0],
    [r * 0.6, -h * 0.55], [r * 0.45, -h * 0.85], [r * 0.25, -h * 1.02], [0, -h * 1.05],
  ].map(([x, y]) => new Vector2(x!, y!));
  const hub = new LatheGeometry(hubProfile, 40);
  // Lathe revolves around Y; turn the axis to Z.
  for (const g of [tyre, hub]) g.rotateX(Math.PI / 2);
  return { tyre, hub };
}

/** Curved mudguard band over a wheel, in the XY plane, `width` deep along Z. */
function mudguard(cx: number, cy: number, inner: number, thick: number, width: number, a0: number, a1: number): BufferGeometry {
  const s = new Shape();
  s.absarc(0, 0, inner + thick, a0, a1, false);
  s.absarc(0, 0, inner, a1, a0, true);
  const g = extrudeAcross(s, width, 0.008);
  g.translate(cx, cy, 0);
  return g;
}

export interface RickshawGeometry {
  body: BufferGeometry;
  dark: BufferGeometry;
  glass: BufferGeometry;
}

export function buildRickshaw(): RickshawGeometry {
  const body: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];
  const glass: BufferGeometry[] = [];

  // --- Cabin shell (body, roof, front face and doorway in one continuous extrusion)
  body.push(extrudeAcross(cabinProfile(), W));

  // Roof seams: three thin raised lines along the crown.
  for (const z of [-0.15, 0, 0.15]) body.push(roofSeam(z));

  // Waist bead wrapping the rear quarter and the front corners.
  for (const s of [1, -1]) {
    const z = s * (HALF + 0.003);
    body.push(rail([[-0.47, 0.47, z * 0.92], [-0.4, 0.47, z], [DOOR.x0 - 0.01, 0.47, z]], 0.008));
    body.push(rail([[DOOR.x1 + 0.01, 0.47, z], [0.38, 0.47, z], [0.42, 0.47, z * 0.9]], 0.008));
  }

  // Rear quarter window (recessed pane with a raised frame) on both sides.
  for (const s of [1, -1]) {
    const pane = new Shape();
    roundedRectPath(pane, -0.42, 0.53, -0.27, 0.76, 0.045);
    const g = extrudeAcross(pane, 0.012, 0.004);
    g.translate(0, 0, s * (HALF + 0.004));
    glass.push(g);
  }

  // Windscreen: two panes split by a centre pillar, plus a quarter-light ahead of each doorway.
  for (const s of [1, -1]) {
    const pane = new Shape();
    // after rotateY(+90°) the shape's x maps to -z, so pick each pane's x-range by side
    if (s > 0) roundedRectPath(pane, -0.205, 0.53, -0.025, 0.79, 0.035);
    else roundedRectPath(pane, 0.025, 0.53, 0.205, 0.79, 0.035);
    const g = extrudeAcross(pane, 0.012, 0.004);
    g.rotateY(Math.PI / 2); // lay the pane on the front face (YZ plane)
    g.translate(0.447, 0, 0);
    glass.push(g);

    const ql = new Shape();
    roundedRectPath(ql, 0.315, 0.58, 0.375, 0.79, 0.025);
    const q = extrudeAcross(ql, 0.012, 0.004);
    q.translate(0, 0, s * (HALF + 0.004));
    glass.push(q);
  }

  // --- Front: nose cowl, lamps and the vertical nose strip
  const nose = new Shape();
  nose.moveTo(0.4, 0.52);
  nose.lineTo(0.47, 0.52);
  nose.quadraticCurveTo(0.505, 0.51, 0.505, 0.47);
  nose.lineTo(0.5, 0.3);
  nose.quadraticCurveTo(0.495, 0.25, 0.46, 0.25);
  nose.lineTo(0.4, 0.25);
  nose.lineTo(0.4, 0.52);
  body.push(extrudeAcross(nose, 0.15, 0.03));
  // round lamp on the nose face, and a lamp on each front corner of the cabin
  const lampGeo = (r: number) => {
    const g = new LatheGeometry(
      [[0, 0.75 * r], [0.55 * r, 0.7 * r], [0.85 * r, 0.45 * r], [r, 0], [r, -0.25 * r]].map(([x, y]) => new Vector2(x!, y!)),
      32,
    );
    g.rotateZ(-Math.PI / 2); // lens faces +X
    return g;
  };
  body.push(place(lampGeo(0.034), [0.535, 0.44, 0]));
  for (const s of [1, -1]) body.push(place(lampGeo(0.042), [0.448, 0.42, s * 0.2]));

  // --- Front wheel, fork and mudguard
  const fw = wheel(0.065);
  body.push(place(fw.tyre, [FRONT_WHEEL_X, WHEEL_Y, 0]));
  body.push(place(fw.hub, [FRONT_WHEEL_X, WHEEL_Y, 0]));
  body.push(mudguard(FRONT_WHEEL_X, WHEEL_Y, WHEEL_R + 0.012, 0.018, 0.1, -0.25, Math.PI * 0.85));
  for (const s of [1, -1]) {
    body.push(place(new CylinderGeometry(0.009, 0.009, 0.12, 12), [FRONT_WHEEL_X - 0.01, WHEEL_Y + 0.06, s * 0.042], [0, 0, 0.15]));
  }

  // --- Rear wheels (a mirrored pair) with flared arch lips
  for (const s of [1, -1]) {
    const rw = wheel(0.075);
    const z = s * (HALF - 0.06);
    body.push(place(rw.tyre, [REAR_X, WHEEL_Y, z]));
    body.push(place(rw.hub, [REAR_X, WHEEL_Y, z]));
    const lip = new TorusGeometry(ARCH_R - 0.028, 0.011, 10, 48, Math.PI - 0.1);
    lip.rotateZ(0.05);
    lip.translate(REAR_X, 0.13, s * (HALF + 0.002));
    body.push(lip);
  }

  // --- Interior: passenger bench at the back, driver seat and handlebar up front
  // Bench cushion and ribbed backrest against the rear bulkhead of the cabin.
  dark.push(place(new RoundedBoxGeometry(0.15, 0.08, W - 0.06, 4, 0.025), [DOOR.x0 + 0.08, DOOR.y0 + 0.1, 0]));
  dark.push(place(new RoundedBoxGeometry(0.11, 0.07, W - 0.08, 3, 0.02), [DOOR.x0 + 0.06, DOOR.y0 + 0.035, 0]));
  dark.push(place(new RoundedBoxGeometry(0.04, 0.25, W - 0.06, 3, 0.015), [DOOR.x0 + 0.02, DOOR.y0 + 0.28, 0]));
  for (let i = 0; i < 9; i++) {
    const z = -(W - 0.12) / 2 + ((W - 0.12) * i) / 8;
    dark.push(place(new RoundedBoxGeometry(0.03, 0.22, 0.036, 3, 0.014), [DOOR.x0 + 0.045, DOOR.y0 + 0.29, z]));
  }

  // Driver seat: a small saddle on a post, with a rail behind it (the passengers' grab bar).
  const driverX = 0.15;
  dark.push(place(new RoundedBoxGeometry(0.1, 0.035, 0.16, 3, 0.014), [driverX, 0.33, 0]));
  dark.push(place(new RoundedBoxGeometry(0.03, 0.09, 0.14, 3, 0.012), [driverX - 0.05, 0.39, 0]));
  body.push(place(new CylinderGeometry(0.014, 0.018, 0.15, 12), [driverX, 0.245, 0]));
  body.push(rail([[driverX - 0.075, 0.17, HALF - 0.04], [driverX - 0.075, 0.44, HALF - 0.04], [driverX - 0.075, 0.46, 0.12], [driverX - 0.075, 0.46, -0.12], [driverX - 0.075, 0.44, -(HALF - 0.04)], [driverX - 0.075, 0.17, -(HALF - 0.04)]], 0.009));

  // Dashboard and handlebar at the front bulkhead.
  body.push(place(new RoundedBoxGeometry(0.06, 0.08, W - 0.06, 3, 0.02), [DOOR.x1 - 0.02, 0.44, 0]));
  body.push(place(new CylinderGeometry(0.012, 0.012, 0.18, 10), [DOOR.x1 - 0.06, 0.42, 0], [0, 0, 0.5]));
  body.push(rail([[DOOR.x1 - 0.09, 0.5, -0.15], [DOOR.x1 - 0.1, 0.5, 0], [DOOR.x1 - 0.09, 0.5, 0.15]], 0.01));
  for (const s of [1, -1]) dark.push(place(new CylinderGeometry(0.015, 0.015, 0.05, 12), [DOOR.x1 - 0.09, 0.5, s * 0.16], [Math.PI / 2, 0, 0]));

  return { body: merge(body), dark: merge(dark), glass: merge(glass) };
}
