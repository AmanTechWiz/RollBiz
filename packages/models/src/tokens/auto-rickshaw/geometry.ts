import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Path,
  Shape,
  SplineCurve,
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
const BEVEL = 0.05; // soft cast-metal edge radius on the cabin
const BOTTOM = 0.13;
const WHEEL_R = 0.105;
const WHEEL_Y = WHEEL_R;
const REAR_X = -0.3;
const ARCH_R = 0.16;
const FRONT_WHEEL_X = 0.53;

// Front face: the windscreen rakes back from its base up into the roof visor.
const FACE_X = 0.44; // lower front face (lamps), before bevel
const SCREEN_BASE: [number, number] = [0.43, 0.53];
const SCREEN_TOP: [number, number] = [0.36, 0.82];
const RAKE = Math.atan2(SCREEN_BASE[0] - SCREEN_TOP[0], SCREEN_TOP[1] - SCREEN_BASE[1]);

// Doorway, open on both sides: the cabin interior is the space it cuts through the shell.
const DOOR = { x0: -0.12, x1: 0.28, y0: 0.17, y1: 0.77 };
const DASH_Y = 0.5; // top of the dashboard, below the windscreen

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

/** Side outline of the cabin: rounded rear, domed roof, raked windscreen, front face, wheel clearances. */
function cabinProfile(): Shape {
  const s = new Shape();
  s.moveTo(0.34, BOTTOM);
  s.lineTo(REAR_X + ARCH_R, BOTTOM);
  s.absarc(REAR_X, BOTTOM, ARCH_R, 0, Math.PI, false); // rear wheel arch
  s.lineTo(-0.465, BOTTOM);
  s.quadraticCurveTo(-0.48, BOTTOM, -0.48, BOTTOM + 0.04);
  s.lineTo(-0.48, 0.64);
  s.bezierCurveTo(-0.48, 0.79, -0.42, 0.86, -0.3, 0.87);
  s.quadraticCurveTo(0.0, 0.9, 0.24, 0.88);
  s.bezierCurveTo(0.31, 0.875, SCREEN_TOP[0], 0.86, SCREEN_TOP[0], SCREEN_TOP[1]);
  // roof's front edge, then the cabin opening: under the roof back to the rear bulkhead,
  // down to the floor, forward to the dashboard, up and over the dash to the windscreen base
  s.lineTo(SCREEN_TOP[0] - 0.012, DOOR.y1);
  s.lineTo(DOOR.x0 + 0.07, DOOR.y1);
  s.quadraticCurveTo(DOOR.x0, DOOR.y1, DOOR.x0, DOOR.y1 - 0.07);
  s.lineTo(DOOR.x0, DOOR.y0 + 0.07);
  s.quadraticCurveTo(DOOR.x0, DOOR.y0, DOOR.x0 + 0.07, DOOR.y0);
  s.lineTo(DOOR.x1 - 0.05, DOOR.y0);
  s.quadraticCurveTo(DOOR.x1, DOOR.y0, DOOR.x1, DOOR.y0 + 0.05);
  s.lineTo(DOOR.x1, DASH_Y - 0.04);
  s.quadraticCurveTo(DOOR.x1, DASH_Y, DOOR.x1 + 0.04, DASH_Y);
  s.lineTo(SCREEN_BASE[0] - 0.012, DASH_Y);
  s.lineTo(SCREEN_BASE[0], SCREEN_BASE[1]);
  s.quadraticCurveTo(FACE_X, SCREEN_BASE[1] - 0.01, FACE_X, SCREEN_BASE[1] - 0.04);
  s.lineTo(FACE_X, 0.31); // lower front face, then step up to clear the front wheel
  s.quadraticCurveTo(FACE_X, 0.26, 0.4, 0.26);
  s.quadraticCurveTo(0.37, 0.26, 0.37, 0.2);
  s.quadraticCurveTo(0.37, BOTTOM, 0.34, BOTTOM);
  return s;
}

function extrudeAcross(shape: Shape, width: number, bevel: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 8,
    curveSegments: 40,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

/** Roof line points (before bevel), rear to visor. Shared by the canopy and its seams. */
const ROOF_LINE: [number, number][] = [
  [-0.485, 0.6], [-0.47, 0.77], [-0.41, 0.86], [-0.25, 0.888], [0.0, 0.9], [0.2, 0.89], [0.29, 0.872], [0.335, 0.85],
];

/** Offsets a polyline that runs rear→front over the top along its outward (upper) normal. */
function offsetLine(points: Vector2[], d: number): Vector2[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const t = new Vector2().subVectors(b, a).normalize();
    return new Vector2(p.x - t.y * d, p.y + t.x * d);
  });
}

/** The canopy: a separate thick shell over the roof that overhangs the sides and forms a visor over the windscreen. */
function canopy(): { shell: BufferGeometry; seams: BufferGeometry[] } {
  const line = new SplineCurve(ROOF_LINE.map(([x, y]) => new Vector2(x, y))).getPoints(80);
  const inner = offsetLine(line, BEVEL - 0.012);
  const outer = offsetLine(line, BEVEL + 0.022);
  const shell = extrudeAcross(new Shape([...inner, ...outer.reverse()]), W + 0.03, 0.012);

  const seams = [-0.16, 0, 0.16].map((z) => {
    const top = offsetLine(line, BEVEL + 0.024).map((p) => new Vector3(p.x, p.y, z));
    return new TubeGeometry(new CatmullRomCurve3(top), 80, 0.0055, 8, false);
  });
  return { shell, seams };
}

/** Closed bead (raised frame) following a 2D path, placed on a plane with `toWorld`. */
function bead(path: Path, radius: number, toWorld: Matrix4): BufferGeometry {
  const pts = path.getSpacedPoints(80).slice(0, -1).map((p) => new Vector3(p.x, p.y, 0));
  const g = new TubeGeometry(new CatmullRomCurve3(pts, true), 120, radius, 8, true);
  g.applyMatrix4(toWorld);
  return g;
}

/** Flat pane from a 2D path, placed on a plane with `toWorld`. */
function pane(path: Path, toWorld: Matrix4): BufferGeometry {
  const g = extrudeAcross(new Shape(path.getPoints(24)), 0.012, 0.004);
  g.applyMatrix4(toWorld);
  return g;
}

/** Side-face placement: 2D (x, y) on the cabin side at z = side * (HALF + lift). */
function onSide(side: 1 | -1, lift = 0.003): Matrix4 {
  return new Matrix4().makeTranslation(0, 0, side * (HALF + lift));
}

/** Windscreen-plane placement: 2D (u across, v up the slope) onto the raked screen. */
function onScreen(lift = 0.004): Matrix4 {
  const base = new Vector3(SCREEN_BASE[0] + BEVEL + lift, SCREEN_BASE[1], 0);
  const up = new Vector3(-Math.sin(RAKE), Math.cos(RAKE), 0); // leans back
  const normal = new Vector3(Math.cos(RAKE), Math.sin(RAKE), 0);
  return new Matrix4().makeBasis(new Vector3(0, 0, -1), up, normal).setPosition(base);
}

/** Tyre + hub for one wheel, axis along Z, centred at the origin. */
function wheel(width: number): BufferGeometry[] {
  const r = WHEEL_R;
  const h = width / 2;
  const v = (pts: number[][]) => pts.map(([x, y]) => new Vector2(x!, y!));
  const tyre = new LatheGeometry(
    v([[r * 0.62, -h], [r * 0.86, -h], [r * 0.97, -h * 0.75], [r, -h * 0.25], [r * 0.985, 0], [r, h * 0.25], [r * 0.97, h * 0.75], [r * 0.86, h], [r * 0.62, h]]),
    56,
  );
  const hub = new LatheGeometry(
    v([[0, h * 1.05], [r * 0.25, h * 1.02], [r * 0.45, h * 0.85], [r * 0.6, h * 0.55], [r * 0.64, 0], [r * 0.6, -h * 0.55], [r * 0.45, -h * 0.85], [r * 0.25, -h * 1.02], [0, -h * 1.05]]),
    40,
  );
  for (const g of [tyre, hub]) g.rotateX(Math.PI / 2); // lathe axis Y -> Z
  return [tyre, hub];
}

/** Round lamp, lens facing +X. */
function lamp(r: number): BufferGeometry {
  const g = new LatheGeometry(
    [[0, 0.75 * r], [0.55 * r, 0.7 * r], [0.85 * r, 0.45 * r], [r, 0], [r, -0.25 * r]].map(([x, y]) => new Vector2(x!, y!)),
    32,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

function rail(points: [number, number, number][], radius: number): BufferGeometry {
  return new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 64, radius, 8, false);
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

  // --- Cabin shell and canopy
  body.push(extrudeAcross(cabinProfile(), W, BEVEL));
  const roof = canopy();
  body.push(roof.shell, ...roof.seams);

  for (const side of [1, -1] as const) {
    // Raised bead along the opening's roof edge, rear pillar and sill.
    const zb = side * (HALF + 0.004);
    body.push(
      rail(
        [
          [SCREEN_TOP[0] - 0.03, DOOR.y1 + 0.045, zb], [DOOR.x0 + 0.03, DOOR.y1 + 0.045, zb], [DOOR.x0 - 0.04, DOOR.y1 - 0.01, zb],
          [DOOR.x0 - 0.045, DOOR.y0 + 0.02, zb], [DOOR.x0 + 0.03, DOOR.y0 - 0.045, zb], [DOOR.x1 + 0.0, DOOR.y0 - 0.045, zb],
          [DOOR.x1 + 0.045, DOOR.y0 + 0.03, zb], [DOOR.x1 + 0.045, DASH_Y - 0.02, zb],
        ],
        0.011,
      ),
    );

    // Rear quarter window: pane with a raised frame.
    const quarter = new Path();
    roundedRectPath(quarter, -0.42, 0.52, -0.25, 0.76, 0.05);
    glass.push(pane(quarter, onSide(side)));
    body.push(bead(quarter, 0.01, onSide(side, 0.006)));

    // Front quarter-light ahead of the doorway; its front edge follows the windscreen rake.
    const slant = (y: number) => SCREEN_BASE[0] - 0.03 - (y - SCREEN_BASE[1]) * Math.tan(RAKE);
    const ql = new Path();
    ql.moveTo(0.34, 0.56);
    ql.lineTo(slant(0.56), 0.56);
    ql.lineTo(slant(0.77), 0.77);
    ql.lineTo(0.34, 0.77);
    ql.lineTo(0.34, 0.56);
    glass.push(pane(ql, onSide(side)));
    body.push(bead(ql, 0.008, onSide(side, 0.006)));

    // Waist line: a raised ledge along the body sides.
    const z = side * (HALF + 0.004);
    body.push(rail([[-0.49, 0.47, z * 0.9], [-0.42, 0.47, z], [DOOR.x0 - 0.06, 0.47, z]], 0.011));
    body.push(rail([[DOOR.x1 + 0.06, 0.47, z], [0.42, 0.47, z], [0.48, 0.47, z * 0.88]], 0.011));
  }

  // --- Raked windscreen: one clear pane (no dividers) inside a raised surround that meets the roof.
  const screenLen = Math.hypot(SCREEN_BASE[0] - SCREEN_TOP[0], SCREEN_TOP[1] - SCREEN_BASE[1]);
  const screen = new Path();
  roundedRectPath(screen, -0.215, 0.03, 0.215, screenLen - 0.02, 0.04);
  glass.push(pane(screen, onScreen(0.018)));
  const surround = new Path();
  roundedRectPath(surround, -0.245, 0.0, 0.245, screenLen + 0.02, 0.05);
  body.push(bead(surround, 0.022, onScreen(0.018)));

  // --- Front face: a nose column projecting forward, a lamp on it, lamps on both corners
  const nose = new Shape();
  nose.moveTo(0.42, 0.5);
  nose.lineTo(0.5, 0.5);
  nose.quadraticCurveTo(0.535, 0.49, 0.535, 0.45);
  nose.lineTo(0.53, 0.31);
  nose.quadraticCurveTo(0.525, 0.27, 0.49, 0.27);
  nose.lineTo(0.42, 0.27);
  nose.lineTo(0.42, 0.5);
  body.push(extrudeAcross(nose, 0.15, 0.03));
  body.push(place(lamp(0.034), [0.565, 0.43, 0]));
  for (const s of [1, -1]) body.push(place(lamp(0.044), [FACE_X + BEVEL + 0.012, 0.42, s * 0.17]));

  // --- Front wheel, fork and mudguard
  for (const g of wheel(0.065)) body.push(place(g, [FRONT_WHEEL_X, WHEEL_Y, 0]));
  const guard = new Shape();
  guard.absarc(0, 0, WHEEL_R + 0.03, -0.3, Math.PI * 0.82, false);
  guard.absarc(0, 0, WHEEL_R + 0.012, Math.PI * 0.82, -0.3, true);
  body.push(place(extrudeAcross(guard, 0.1, 0.008), [FRONT_WHEEL_X, WHEEL_Y, 0]));
  for (const s of [1, -1]) {
    body.push(place(new CylinderGeometry(0.009, 0.009, 0.12, 12), [FRONT_WHEEL_X - 0.01, WHEEL_Y + 0.06, s * 0.042], [0, 0, 0.15]));
  }

  // --- Rear wheels (a mirrored pair) with flared arch lips
  for (const s of [1, -1]) {
    const z = s * (HALF - 0.06);
    for (const g of wheel(0.075)) body.push(place(g, [REAR_X, WHEEL_Y, z]));
    const lip = new TorusGeometry(ARCH_R - BEVEL + 0.012, 0.012, 10, 48, Math.PI - 0.1);
    lip.rotateZ(0.05);
    lip.translate(REAR_X, BOTTOM, s * (HALF + 0.002));
    body.push(lip);
  }

  // --- Interior: passenger bench at the back, driver seat and handlebar up front
  const benchX = DOOR.x0;
  dark.push(place(new RoundedBoxGeometry(0.15, 0.08, W - 0.06, 4, 0.025), [benchX + 0.08, DOOR.y0 + 0.1, 0]));
  dark.push(place(new RoundedBoxGeometry(0.11, 0.07, W - 0.08, 3, 0.02), [benchX + 0.06, DOOR.y0 + 0.035, 0]));
  dark.push(place(new RoundedBoxGeometry(0.04, 0.25, W - 0.06, 3, 0.015), [benchX + 0.02, DOOR.y0 + 0.28, 0]));
  // padded backrest: tightly packed vertical rolls
  const rolls = 12;
  const pitch = (W - 0.1) / rolls;
  for (let i = 0; i < rolls; i++) {
    const z = -(W - 0.1) / 2 + pitch * (i + 0.5);
    dark.push(place(new RoundedBoxGeometry(0.035, 0.23, pitch * 1.02, 4, pitch * 0.45), [benchX + 0.045, DOOR.y0 + 0.29, z]));
  }

  const driverX = 0.15;
  dark.push(place(new RoundedBoxGeometry(0.1, 0.035, 0.16, 3, 0.014), [driverX, 0.33, 0]));
  dark.push(place(new RoundedBoxGeometry(0.03, 0.09, 0.14, 3, 0.012), [driverX - 0.05, 0.39, 0]));
  body.push(place(new CylinderGeometry(0.014, 0.018, 0.15, 12), [driverX, 0.245, 0]));
  const rx = driverX - 0.075;
  body.push(rail([[rx, 0.17, HALF - 0.04], [rx, 0.44, HALF - 0.04], [rx, 0.46, 0.12], [rx, 0.46, -0.12], [rx, 0.44, -(HALF - 0.04)], [rx, 0.17, -(HALF - 0.04)]], 0.009));

  body.push(place(new RoundedBoxGeometry(0.06, 0.08, W - 0.06, 3, 0.02), [DOOR.x1 - 0.01, DASH_Y - 0.03, 0]));
  body.push(place(new CylinderGeometry(0.012, 0.012, 0.18, 10), [DOOR.x1 - 0.06, 0.42, 0], [0, 0, 0.5]));
  body.push(rail([[DOOR.x1 - 0.09, 0.5, -0.15], [DOOR.x1 - 0.1, 0.5, 0], [DOOR.x1 - 0.09, 0.5, 0.15]], 0.01));
  for (const s of [1, -1]) dark.push(place(new CylinderGeometry(0.015, 0.015, 0.05, 12), [DOOR.x1 - 0.09, 0.5, s * 0.16], [Math.PI / 2, 0, 0]));

  return { body: merge(body), dark: merge(dark), glass: merge(glass) };
}
