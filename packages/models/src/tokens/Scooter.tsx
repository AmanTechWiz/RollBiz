import { useMemo } from "react";
import { pewter, pewterDark } from "../materials";
import {
  arcBand, capsuleBetween, extrudeXY, lampProfile, latheX, merge, place, rbox, smoothClosed, sphere, tube, wheelParts,
  type V2, type V3,
} from "./vehicles/helpers";

const FW = { x: 0.27, r: 0.115, w: 0.064 }; // front wheel
const RW = { x: -0.265, r: 0.1, w: 0.058 }; // rear wheel
const BAR_Y = 0.565;

/** Points across Z on the rounded top of an extruded slab, so stitching can follow the crown. */
function crownPath(x: number, yTop: number, halfZ: number, bevel: number, bevelXY: number, lift = 0.002): V3[] {
  const flat = halfZ - bevel;
  const pts: V3[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const z = -halfZ * 0.97 + (2 * halfZ * 0.97 * i) / n;
    const u = Math.max(0, (Math.abs(z) - flat) / bevel);
    pts.push([x, yTop + bevelXY * bevel * Math.sqrt(Math.max(0, 1 - u * u)) + lift, z]);
  }
  return pts;
}

/** Largest x of a polygon along the horizontal line at height y (front-most surface). */
function edgeX(poly: V2[], y: number): number {
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i] as V2;
    const [x2, y2] = poly[(i + 1) % poly.length] as V2;
    if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) best = Math.max(best, x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  return best;
}

function build() {
  const P: ReturnType<typeof rbox>[] = [];
  const D: ReturnType<typeof rbox>[] = [];

  // --- leg shield / front apron (side profile, extruded and bevelled) -------------------------
  const apron = smoothClosed(
    [
      [0.205, 0.5], [0.225, 0.43], [0.2, 0.32], [0.15, 0.22], [0.09, 0.15], [0.02, 0.125],
      [-0.07, 0.125], [-0.075, 0.16], [-0.03, 0.2], [0.04, 0.28], [0.085, 0.38], [0.105, 0.47],
    ],
    48,
    0.5,
  );
  P.push(extrudeXY(apron, 0.1, 0.05, 0.5, 4));

  // raised bead lines following the apron edges, plus horn grille slats
  const bead: V3[] = [[0.19, 0.465, 0], [0.205, 0.41, 0], [0.18, 0.31, 0], [0.135, 0.22, 0], [0.08, 0.17, 0], [0.02, 0.145, 0]];
  const bead2: V3[] = [[0.115, 0.46, 0], [0.098, 0.38, 0], [0.065, 0.285, 0], [0.01, 0.2, 0], [-0.045, 0.16, 0]];
  for (const s of [-1, 1]) {
    P.push(place(tube(bead, 0.0035, 16, 4), [0, 0, s * 0.1]));
    P.push(place(tube(bead2, 0.0035, 16, 4), [0, 0, s * 0.1]));
  }
  const GROWTH = 0.025; // bevel growth of the apron silhouette
  for (let i = 0; i < 4; i++) {
    const y = 0.285 + i * 0.017;
    const x = edgeX(apron, y) + GROWTH - 0.001;
    D.push(capsuleBetween([x, y, -0.035], [x, y, 0.035], 0.0045));
  }
  // front centre rib and oval insets on the apron
  P.push(tube([0.45, 0.4, 0.34, 0.28, 0.22].map((y) => [edgeX(apron, y) + GROWTH + 0.001, y, 0] as V3), 0.0045, 20, 6));
  for (const s of [-1, 1]) {
    const x = edgeX(apron, 0.395) + GROWTH - 0.003;
    D.push(place(rbox(0.006, 0.07, 0.032, 0.003), [x, 0.395, s * 0.062]));
  }

  // --- floorboard with ribbed strips ------------------------------------------------------
  P.push(place(rbox(0.2, 0.026, 0.2, 0.01), [-0.01, 0.128, 0]));
  for (let i = 0; i < 6; i++) {
    D.push(place(rbox(0.008, 0.004, 0.17, 0.002), [-0.07 + i * 0.026, 0.142, 0]));
  }
  for (const s of [-1, 1]) {
    P.push(capsuleBetween([-0.1, 0.135, s * 0.105], [0.06, 0.135, s * 0.105], 0.008));
  }

  // --- rear side cowl ----------------------------------------------------------------------
  const cowl = smoothClosed(
    [
      [-0.06, 0.2], [-0.052, 0.31], [-0.075, 0.395], [-0.18, 0.405], [-0.27, 0.385], [-0.335, 0.335], [-0.36, 0.265],
      [-0.345, 0.2], [-0.29, 0.165], [-0.18, 0.152], [-0.1, 0.16],
    ],
    48,
    0.5,
  );
  P.push(extrudeXY(cowl, 0.108, 0.085, 0.75, 5));
  // vent slats on both sides, cowl crease bead, rear lamp
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      D.push(capsuleBetween([-0.31, 0.255 + i * 0.022, s * 0.1085], [-0.225, 0.255 + i * 0.022, s * 0.1085], 0.0055));
    }
    P.push(tube([[-0.36, 0.215, 0], [-0.3, 0.19, 0], [-0.2, 0.18, 0], [-0.1, 0.19, 0]], 0.005, 14, 5).translate(0, 0, s * 0.108));
    P.push(tube([[-0.06, 0.24, 0], [-0.1, 0.3, 0], [-0.16, 0.355, 0], [-0.25, 0.375, 0]], 0.0035, 14, 4).translate(0, 0, s * 0.1085));
  }
  P.push(sphere(0.018, [-0.358, 0.3, 0], [0.5, 1, 1.2]));

  // --- seat ----------------------------------------------------------------------------------
  const seat: V2[] = smoothClosed(
    [[-0.315, 0.405], [-0.32, 0.43], [-0.28, 0.45], [-0.17, 0.455], [-0.05, 0.455], [0.02, 0.445], [0.035, 0.425], [0.0, 0.405], [-0.15, 0.4]],
    44,
    0.5,
  );
  D.push(extrudeXY(seat, 0.088, 0.04, 0.5, 4));
  P.push(place(rbox(0.33, 0.014, 0.17, 0.006), [-0.14, 0.392, 0]));
  for (const x of [-0.255, -0.16, -0.065]) {
    P.push(tube(crownPath(x, 0.455, 0.088, 0.04, 0.5), 0.0035, 20, 4));
  }
  for (const s of [-1, 1]) {
    P.push(capsuleBetween([-0.31, 0.425, s * 0.0885], [0.025, 0.425, s * 0.0885], 0.0035));
  }

  // --- front fork, fender and wheel ------------------------------------------------------
  const wf = wheelParts(FW.r, FW.w);
  D.push(place(wf.tyre, [FW.x, FW.r, 0]));
  P.push(place(wf.hub, [FW.x, FW.r, 0]));
  P.push(place(arcBand(FW.r + 0.012, FW.r + 0.034, -0.45, 2.55, 0.062, 0.02), [FW.x, FW.r, 0]));
  // wheel-arch lip and badge on the fender
  P.push(sphere(0.011, [FW.x + 0.1, FW.r + 0.1, 0.07]));
  for (const s of [-1, 1]) {
    P.push(capsuleBetween([FW.x, FW.r, s * 0.038], [0.207, 0.27, s * 0.038], 0.011));
    P.push(sphere(0.016, [FW.x, FW.r, s * 0.04]));
  }
  P.push(capsuleBetween([FW.x, FW.r, -0.04], [FW.x, FW.r, 0.04], 0.01));

  // --- rear wheel, exhaust ------------------------------------------------------------------
  const wr = wheelParts(RW.r, RW.w);
  D.push(place(wr.tyre, [RW.x, RW.r, 0]));
  P.push(place(wr.hub, [RW.x, RW.r, 0]));
  P.push(capsuleBetween([-0.24, 0.1, 0.08], [-0.07, 0.115, 0.08], 0.03));
  P.push(sphere(0.031, [-0.07, 0.115, 0.08], [0.6, 1, 1]));
  D.push(capsuleBetween([-0.255, 0.1, 0.08], [-0.26, 0.1, 0.08], 0.022));
  P.push(capsuleBetween([-0.07, 0.09, 0.075], [0.0, 0.135, 0.07], 0.012));

  // --- steering column, headset, headlight, handlebar --------------------------------------
  P.push(tube([[0.2, 0.44, 0], [0.2, 0.5, 0], [0.185, 0.545, 0], [0.16, 0.575, 0]], 0.036, 24, 14));
  P.push(sphere(0.045, [0.15, BAR_Y, 0], [1.1, 0.7, 1.2]));
  // headlight barrel (axis +X) with domed lens
  P.push(latheX([[0, 0], [0.05, 0], [0.052, 0.012], [0.054, 0.05], [0.048, 0.062], [0, 0.062]], [0.14, BAR_Y + 0.012, 0], 40));
  P.push(latheX(lampProfile(0.047), [0.196, BAR_Y + 0.012, 0], 40));
  D.push(latheX([[0, 0], [0.038, 0], [0.038, 0.004], [0, 0.004]], [0.1975, BAR_Y + 0.012, 0], 28));
  // handlebar with grips, levers and mirror stalks
  P.push(tube([[0.05, BAR_Y - 0.01, -0.18], [0.095, BAR_Y, -0.1], [0.115, BAR_Y, 0], [0.095, BAR_Y, 0.1], [0.05, BAR_Y - 0.01, 0.18]], 0.0085, 32, 8));
  for (const s of [-1, 1]) {
    D.push(capsuleBetween([0.052, BAR_Y - 0.01, s * 0.165], [0.044, BAR_Y - 0.012, s * 0.215], 0.014));
    P.push(capsuleBetween([0.07, BAR_Y - 0.005, s * 0.15], [0.14, BAR_Y - 0.03, s * 0.2], 0.0035));
    P.push(sphere(0.007, [0.14, BAR_Y - 0.03, s * 0.2]));
    P.push(tube([[0.1, BAR_Y + 0.01, s * 0.11], [0.092, BAR_Y + 0.05, s * 0.16], [0.08, BAR_Y + 0.11, s * 0.225]], 0.0045, 20, 6));
    P.push(sphere(0.04, [0.077, BAR_Y + 0.15, s * 0.245]));
  }
  // switch gear / cables
  P.push(tube([[0.12, BAR_Y - 0.005, 0.02], [0.14, BAR_Y - 0.06, 0.05], [0.18, 0.42, 0.04]], 0.003, 16, 5));

  return { pewter: merge(P), dark: merge(D) };
}

export function Scooter() {
  const g = useMemo(build, []);
  return (
    <group>
      <mesh geometry={g.pewter} material={pewter} castShadow receiveShadow />
      <mesh geometry={g.dark} material={pewterDark} castShadow receiveShadow />
    </group>
  );
}
