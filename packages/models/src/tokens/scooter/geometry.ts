import { BufferGeometry, LatheGeometry, Matrix4, SphereGeometry, TorusGeometry, Vector2, Vector3 } from "three";
import { mergeAll as merge } from "../geoKit";
import { capsuleBetween, latheX, place, smoothClosed, sphere, tube, wheelParts } from "../vehicles/helpers";
import { lerp, smoothstep, spineLoft, twoViewLoft, type V2, type V3 } from "./loft";

// Classic Vespa-style scooter token, built to match docs/art/reference/token-scooter-v2.png.
// Units are final (no group scale): +X forward, +Y up, ±Z sides, resting on y = 0, ≈ 0.78 long.
// Layout, side view: a low flat floorboard with an open step-through between the leg shield
// (front) and the rear body (back), a long padded seat over an egg-shaped side cowl.

const FW = { x: 0.272, r: 0.088, w: 0.054 }; // front wheel
const RW = { x: -0.25, r: 0.07, w: 0.05 }; // rear wheel
const FLOOR_Y = 0.112; // floorboard spine; its top face sits FLOOR_HT above
const FLOOR_HT = 0.014;
const SEAT_BASE = 0.364;
const LAMP = { x: 0.18, y: 0.582 }; // headset centre

export interface ScooterGeometry {
  body: BufferGeometry;
  dark: BufferGeometry;
  bright: BufferGeometry;
}

/** Orthonormal frame on a lofted surface: origin, outward normal, "up" along the spine, side. */
function frameOn(at: (u: number, z: number) => V3, u: number, z: number) {
  const p = new Vector3(...at(u, z));
  const up = new Vector3(...at(u + 0.004, z)).sub(p).normalize();
  const side = new Vector3(...at(u, z + 0.003)).sub(p).normalize();
  const n = new Vector3().crossVectors(side, up).normalize();
  if (n.x < 0) n.negate();
  side.crossVectors(up, n).normalize();
  return { p, n, up, side };
}

/** Matrix mapping local (x across, y up, z out) onto a surface frame, lifted along the normal. */
function onFrame(f: ReturnType<typeof frameOn>, lift = 0): Matrix4 {
  return new Matrix4().makeBasis(f.side, f.up, f.n).setPosition(f.p.clone().addScaledVector(f.n, lift));
}

/** Oval ring (bead) in local XY, radius rx/ry, tube radius r. */
function ovalRing(rx: number, ry: number, r: number, seg = 32): BufferGeometry {
  const g = new TorusGeometry(1, r / Math.min(rx, ry), 5, seg);
  g.scale(rx, ry, Math.min(rx, ry));
  return g;
}

/** Flattened dome (lens / badge) in local XY, bulging toward +Z. */
function dome(rx: number, ry: number, h: number, seg = 16): BufferGeometry {
  const g = new SphereGeometry(1, seg, Math.max(6, Math.round(seg / 2)), 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.scale(rx, ry, h);
  return g;
}

function lathe(profile: V2[], seg: number): LatheGeometry {
  return new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), seg);
}

export function buildScooter(): ScooterGeometry {
  const body: BufferGeometry[] = [];
  const dark: BufferGeometry[] = [];
  const bright: BufferGeometry[] = [];

  // --- floorboard + leg shield: one continuous sweep -----------------------------------------
  // The spine runs rear→front along the floor, bends up and rises into the shield. Its outer face
  // is the floor's underside and the shield's convex front; the edges curl back toward the rider.
  const shield = spineLoft({
    spine: [
      [-0.15, FLOOR_Y], [-0.06, FLOOR_Y], [0.04, FLOOR_Y], [0.1, FLOOR_Y + 0.006], [0.145, 0.15],
      [0.178, 0.215], [0.198, 0.3], [0.205, 0.38], [0.201, 0.45], [0.193, 0.505],
    ],
    section: (_u, p, t) => {
      const k = smoothstep(0.35, 0.8, t.y); // 0 on the floor, 1 up the shield
      const hwShield = lerp(0.14, 0.08, smoothstep(0.24, 0.52, p.y));
      const bow = lerp(0.1, 0.042, smoothstep(0.26, 0.52, p.y)) * smoothstep(0.12, 0.25, p.y);
      return { hw: lerp(0.088, hwShield, k), ht: FLOOR_HT, bow };
    },
    rows: 64,
    ring: 32,
    exponent: 3,
    cap: [0.03, 0.035],
  });
  body.push(shield.geometry);
  const sh = (u: number, z: number) => shield.outer(u, z);
  const uAtY = (y: number) => {
    let lo = 0.2;
    let hi = 1;
    for (let i = 0; i < 32; i++) {
      const m = (lo + hi) / 2;
      if (sh(m, 0)[1] < y) lo = m;
      else hi = m;
    }
    return lo;
  };
  // rolled rim along both shield edges, from the floor sides up to the top
  for (const s of [-1, 1]) {
    const rim: V3[] = [];
    for (let i = 0; i <= 40; i++) rim.push(sh(0.06 + (0.9 * i) / 40, s * 1));
    body.push(tube(rim, 0.0068, 64, 6));
  }
  // slim raised centre ridge down the shield front
  const ridge: V3[] = [];
  const uRidge = uAtY(0.2);
  for (let i = 0; i <= 20; i++) {
    const u = lerp(uRidge, 0.975, i / 20);
    const f = frameOn(sh, u, 0);
    ridge.push(f.p.addScaledVector(f.n, 0.002).toArray() as V3);
  }
  body.push(tube(ridge, 0.0055, 60, 8));
  // horn grille: a raised lozenge badge on the ridge with dark slots
  {
    const f = frameOn(sh, uAtY(0.43), 0);
    const plate = dome(0.024, 0.03, 0.007, 24);
    plate.applyMatrix4(onFrame(f, 0.004));
    body.push(plate);
    body.push(ovalRing(0.024, 0.03, 0.003).applyMatrix4(onFrame(f, 0.004)));
    for (let i = -2; i <= 2; i++) {
      const slot = capsuleBetween([-0.014 + Math.abs(i) * 0.003, i * 0.009, 0], [0.014 - Math.abs(i) * 0.003, i * 0.009, 0], 0.0022, 6);
      slot.applyMatrix4(onFrame(f, 0.0105));
      dark.push(slot);
    }
  }
  // rounded indicator lenses with raised bezels on each side of the shield face
  for (const s of [-1, 1]) {
    const f = frameOn(sh, uAtY(0.34), s * 0.072);
    body.push(ovalRing(0.0135, 0.0175, 0.0032).applyMatrix4(onFrame(f, 0.002)));
    bright.push(dome(0.011, 0.0145, 0.0055).applyMatrix4(onFrame(f, 0.0)));
  }
  // floorboard: ribbed rubber strips and pewter edge rails
  const floorTop = FLOOR_Y + FLOOR_HT;
  for (let i = -2; i <= 2; i++) {
    dark.push(capsuleBetween([-0.085, floorTop + 0.001, i * 0.03], [0.09, floorTop + 0.001, i * 0.03], 0.0045, 6));
  }
  for (const s of [-1, 1]) {
    body.push(capsuleBetween([-0.12, floorTop - 0.001, s * 0.082], [0.1, floorTop - 0.001, s * 0.082], 0.0055, 8));
  }

  // --- rear body: one smooth cowl that bulges at the sides and tapers to a rounded tail ---------
  // A short frame body fills the space under the seat front and gives the leg space its back wall.
  const centre = twoViewLoft({
    side: smoothClosed(
      [
        [-0.105, 0.1], [-0.088, 0.17], [-0.078, 0.27], [-0.075, 0.345], [-0.12, 0.356], [-0.2, 0.357],
        [-0.27, 0.35], [-0.29, 0.3], [-0.27, 0.2], [-0.2, 0.17], [-0.14, 0.12],
      ],
      64,
      0.5,
    ),
    halfWidth: (t) => 0.07 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.35),
    rows: 24,
    ring: 24,
    exponent: 2.8,
  });
  body.push(centre.geometry);

  const cowlSide = smoothClosed(
    [
      [-0.084, 0.342], [-0.15, 0.368], [-0.26, 0.37], [-0.338, 0.35], [-0.38, 0.316], [-0.401, 0.284],
      [-0.398, 0.235], [-0.37, 0.165], [-0.315, 0.114], [-0.245, 0.094], [-0.175, 0.1], [-0.124, 0.13],
      [-0.097, 0.19], [-0.087, 0.27],
    ],
    96,
    0.5,
  );
  // plan view: widest just behind mid-body, narrowing smoothly to the tail and rounding into the front
  const cowl = twoViewLoft({
    side: cowlSide,
    halfWidth: (t) => 0.142 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.92)), 0.62),
    rows: 48,
    ring: 44,
    exponent: 2.5,
  });
  body.push(cowl.geometry);
  let cx = 0;
  let cy = 0;
  for (const [x, y] of cowlSide) {
    cx += x / cowlSide.length;
    cy += y / cowlSide.length;
  }
  for (const s of [-1, 1]) {
    // panel seam: a raised bead just inside the side panel's front and lower edges
    const seam: V3[] = [];
    for (let i = 38; i <= 100; i += 2) {
      const [x, y] = cowlSide[i % cowlSide.length]!;
      const px = cx + (x - cx) * 0.9;
      const py = cy + (y - cy) * 0.84;
      seam.push([px, py, s * (cowl.sideZ(px, py) + 0.0012)]);
    }
    body.push(tube(seam, 0.0042, 60, 5));
    // horizontal vent slats near the rear, each over a dark slot
    const vx0 = -0.352;
    const vx1 = -0.288;
    for (let i = 0; i < 4; i++) {
      const y = 0.212 + i * 0.019;
      const slat: V3[] = [];
      for (let k = 0; k <= 6; k++) {
        const x = lerp(vx0, vx1, k / 6);
        slat.push([x, y, s * (cowl.sideZ(x, y) + 0.003)]);
      }
      body.push(tube(slat, 0.0045, 16, 6));
      const gap: V3[] = slat.map(([x, yy]) => [x, yy - 0.0095, s * (cowl.sideZ(x, yy - 0.0095) + 0.0005)]);
      dark.push(tube(gap.slice(1, -1), 0.0042, 12, 5));
    }
  }

  // --- seat: long padded saddle with stitched ridges, piping and a pan under it ---------------
  const seatSide = smoothClosed(
    [
      [-0.37, SEAT_BASE + 0.008], [-0.376, SEAT_BASE + 0.046], [-0.348, SEAT_BASE + 0.08], [-0.25, SEAT_BASE + 0.09],
      [-0.13, SEAT_BASE + 0.087], [-0.066, SEAT_BASE + 0.072], [-0.04, SEAT_BASE + 0.04], [-0.048, SEAT_BASE + 0.006],
      [-0.12, SEAT_BASE], [-0.25, SEAT_BASE - 0.001], [-0.34, SEAT_BASE + 0.002],
    ],
    96,
    0.5,
  );
  const pleats = [-0.295, -0.225, -0.155];
  const seat = twoViewLoft({
    side: seatSide,
    halfWidth: (t) => 0.092 * Math.pow(Math.sin(Math.PI * t), 0.3) * (1 - 0.14 * t),
    rows: 60,
    ring: 28,
    exponent: 2.8,
    topOffset: (x) => pleats.reduce((s, c) => s + 0.0065 * Math.exp(-(((x - c) / 0.007) ** 2)), 0),
  });
  dark.push(seat.geometry);
  // piped edge round the cushion, just above its base
  const pipeY = SEAT_BASE + 0.016;
  const pipe: V3[] = [];
  const pipeX = (i: number, n: number) => lerp(-0.364, -0.05, 0.5 - 0.5 * Math.cos((Math.PI * i) / n));
  for (let i = 0; i <= 24; i++) {
    const x = pipeX(i, 24);
    pipe.push([x, pipeY, seat.sideZ(x, pipeY) + 0.001]);
  }
  for (let i = 23; i >= 1; i--) {
    const [x, y, z] = pipe[i]!;
    pipe.push([x, y, -z]);
  }
  dark.push(tube(pipe, 0.0048, 80, 5, true));
  // pewter seat pan: a slim inset slab that leaves a shadow line between seat and body
  const pan = twoViewLoft({
    side: smoothClosed([[-0.36, SEAT_BASE - 0.002], [-0.2, SEAT_BASE + 0.002], [-0.06, SEAT_BASE + 0.002], [-0.065, SEAT_BASE - 0.01], [-0.2, SEAT_BASE - 0.012], [-0.355, SEAT_BASE - 0.01]], 40, 0.5),
    halfWidth: (t) => 0.078 * Math.pow(Math.sin(Math.PI * t), 0.3),
    rows: 24,
    ring: 20,
    exponent: 3,
  });
  body.push(pan.geometry);

  // --- rear lamp, exhaust, stand ---------------------------------------------------------------
  {
    // small rear lamp capping the tail: a bezel cup with a domed dark lens
    const lamp = lathe([[0, 0], [0.016, 0], [0.019, 0.006], [0.0165, 0.012], [0, 0.013]], 24);
    lamp.rotateZ(Math.PI / 2); // faces -X
    lamp.scale(1, 0.8, 1.25);
    lamp.translate(-0.393, 0.285, 0);
    body.push(lamp);
    const lens = dome(0.0185, 0.0118, 0.006, 16);
    lens.rotateY(-Math.PI / 2);
    lens.translate(-0.405, 0.285, 0);
    dark.push(lens);
  }
  const EZ = 0.098;
  body.push(capsuleBetween([-0.365, 0.07, EZ], [-0.2, 0.078, EZ], 0.026, 16));
  body.push(tube([[-0.29, 0.106, EZ - 0.012], [-0.25, 0.104, EZ - 0.012]], 0.004, 4, 6)); // heat-shield strap
  dark.push(capsuleBetween([-0.375, 0.069, EZ], [-0.36, 0.0695, EZ], 0.011, 10));
  body.push(tube([[-0.21, 0.079, EZ], [-0.175, 0.085, EZ - 0.02], [-0.15, 0.11, 0.05]], 0.009, 12, 8));

  // --- wheels ----------------------------------------------------------------------------------
  for (const W of [FW, RW]) {
    const w = wheelParts(W.r, W.w, 30);
    dark.push(place(w.tyre, [W.x, W.r, 0]));
    body.push(place(w.hub, [W.x, W.r, 0]));
  }
  body.push(capsuleBetween([RW.x, RW.r, -0.03], [RW.x, RW.r, 0.075], 0.01, 8)); // rear axle into the engine side

  // --- front fender: a deep shell hugging the wheel, with a rolled lip -------------------------
  const Rf = FW.r + 0.02;
  const fenderSpine: V2[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = ((-32 + (168 * i) / 14) * Math.PI) / 180;
    fenderSpine.push([FW.x + Math.cos(a) * Rf, FW.r + Math.sin(a) * Rf]);
  }
  // walked counter-clockwise (front-low → over the top → back) so the outer normal faces away from the wheel
  const fender = spineLoft({
    spine: fenderSpine,
    section: (u) => ({ hw: lerp(0.044, 0.05, smoothstep(0.2, 1, u)), ht: 0.0075, bow: 0.03 }),
    rows: 36,
    ring: 24,
    exponent: 3,
    cap: [0.05, 0.03],
  });
  body.push(fender.geometry);
  for (const s of [-1, 1]) {
    const lip: V3[] = [];
    for (let i = 0; i <= 24; i++) lip.push(fender.outer(0.04 + (0.93 * i) / 24, s));
    body.push(tube(lip, 0.0055, 60, 6));
  }
  {
    const crest: V3[] = [];
    for (let i = 0; i <= 16; i++) {
      const f = frameOn(fender.outer, 0.12 + (0.6 * i) / 16, 0);
      crest.push(f.p.addScaledVector(f.n, 0.0015).toArray() as V3);
    }
    body.push(tube(crest, 0.004, 40, 6));
  }

  // --- front suspension: steering tube behind the fender, single trailing link on +Z -----------
  body.push(capsuleBetween([0.205, 0.2, 0], [0.235, 0.15, 0], 0.016, 10));
  const LZ = FW.w / 2 + 0.012;
  body.push(capsuleBetween([0.214, 0.19, LZ - 0.012], [0.226, 0.112, LZ], 0.0085, 8)); // fork leg
  body.push(capsuleBetween([0.226, 0.112, LZ], [FW.x, FW.r, LZ], 0.008, 8)); // trailing link arm
  body.push(capsuleBetween([0.222, 0.17, LZ + 0.003], [FW.x - 0.022, FW.r + 0.006, LZ + 0.003], 0.0095, 10)); // damper
  body.push(sphere(0.016, [FW.x, FW.r, LZ + 0.004], [1, 1, 0.55])); // hub cap over the link
  body.push(sphere(0.012, [FW.x, FW.r, -(LZ - 0.006)], [1, 1, 0.5]));

  // --- headset: neck, rounded housing, big round headlamp, handlebars, levers, mirrors ----------
  body.push(capsuleBetween([0.196, 0.46, 0], [LAMP.x - 0.004, LAMP.y - 0.02, 0], 0.026, 16));
  {
    // the column flares slightly where it rises out of the shield top
    const flare = lathe([[0, 0], [0.034, 0], [0.033, 0.018], [0.029, 0.045], [0.026, 0.075], [0, 0.075]], 20);
    flare.scale(0.85, 1, 1);
    flare.rotateZ(0.19);
    flare.translate(0.199, 0.45, 0);
    body.push(flare);
  }
  body.push(
    latheX(
      [[0, -0.056], [0.02, -0.052], [0.032, -0.04], [0.04, -0.022], [0.045, 0.0], [0.047, 0.02], [0.047, 0.034], [0.045, 0.04], [0, 0.04]],
      [LAMP.x, LAMP.y, 0],
      36,
    ),
  );
  body.push(place(new TorusGeometry(0.043, 0.0055, 8, 44), [LAMP.x + 0.042, LAMP.y, 0], [0, Math.PI / 2, 0])); // bezel
  bright.push(latheX([[0.039, 0], [0.034, 0.008], [0.022, 0.014], [0, 0.016]], [LAMP.x + 0.04, LAMP.y, 0], 40)); // lens
  bright.push(sphere(0.008, [LAMP.x + 0.054, LAMP.y, 0], [0.6, 1, 1]));
  // handlebar casting
  const BY = LAMP.y - 0.006;
  const BX = LAMP.x - 0.022;
  body.push(tube([[BX - 0.008, BY - 0.006, -0.172], [BX - 0.002, BY - 0.002, -0.1], [BX, BY, 0], [BX - 0.002, BY - 0.002, 0.1], [BX - 0.008, BY - 0.006, 0.172]], 0.0105, 40, 10));
  for (const s of [-1, 1]) {
    body.push(sphere(0.019, [BX, BY + 0.002, s * 0.06], [1.1, 1, 1.4])); // swell where the bar leaves the housing
    dark.push(capsuleBetween([BX - 0.007, BY - 0.005, s * 0.13], [BX - 0.011, BY - 0.008, s * 0.2], 0.0135, 12)); // grip
    body.push(sphere(0.0145, [BX - 0.011, BY - 0.008, s * 0.205], [0.9, 0.9, 0.5])); // bar-end
    body.push(sphere(0.009, [BX + 0.006, BY + 0.003, s * 0.112])); // lever pivot
    body.push(tube([[BX + 0.008, BY + 0.003, s * 0.112], [BX + 0.024, BY - 0.002, s * 0.14], [BX + 0.024, BY - 0.006, s * 0.19]], 0.0034, 12, 6)); // lever
    // mirror stalk rising out at an angle, to a ball mirror
    body.push(sphere(0.007, [BX - 0.004, BY + 0.01, s * 0.092]));
    body.push(tube([[BX - 0.004, BY + 0.01, s * 0.092], [BX - 0.012, BY + 0.062, s * 0.135], [BX - 0.024, BY + 0.112, s * 0.178]], 0.0042, 16, 6));
    bright.push(sphere(0.029, [BX - 0.028, BY + 0.135, s * 0.19]));
  }

  return { body: merge(body), dark: merge(dark), bright: merge(bright) };
}
