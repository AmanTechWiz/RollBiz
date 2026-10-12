import { useMemo } from "react";
import { Color, MeshStandardMaterial } from "three";
import { pewter, pewterDark } from "../materials";
import {
  arcBand, capsuleBetween, extrudeXY, lampProfile, latheX, merge, place, rbox, sphere, tube, wheelParts,
  type V2,
} from "./vehicles/helpers";

// Polished pewter for windscreen and window panes (brighter and smoother than the body).
const glass = new MeshStandardMaterial({ color: new Color("#d3d8de"), metalness: 0.75, roughness: 0.12 });

const HALF = 0.19; // body half-width (z)
const REAR = { x: -0.2, r: 0.095, w: 0.056, z: 0.226 };
const FRONT = { x: 0.335, r: 0.09, w: 0.05 };
const ROOF_A = 0.335;
const ROOF_H = 0.1;
const ROOF_BASE = 0.54;
const roofTop = (x: number) => ROOF_BASE + ROOF_H * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / ROOF_A, 2.4)), 1 / 2.4) + 0.02;

function build() {
  const P: ReturnType<typeof rbox>[] = []; // pewter
  const D: ReturnType<typeof rbox>[] = []; // pewterDark
  const G: ReturnType<typeof rbox>[] = []; // glass
  const T = ROOF_BASE; // underside of roof / top of the glazing
  const BELT = 0.35; // beltline under the windscreen

  // --- chassis -------------------------------------------------------------
  P.push(place(rbox(0.5, 0.05, 2 * HALF, 0.015), [-0.1, 0.145, 0]));
  // rear closed section (back panel + side panels), with a domed rear shoulder
  P.push(
    extrudeXY(
      [[-0.34, 0.12], [-0.2, 0.12], [-0.2, T], [-0.29, T + 0.01], [-0.335, T - 0.04], [-0.35, 0.38], [-0.355, 0.2]],
      HALF, 0.05, 0.4, 4,
    ),
  );
  // interior back wall + side window recesses
  D.push(place(rbox(0.008, T - 0.2, 2 * HALF - 0.04, 0.003), [-0.198, 0.33, 0]));
  for (const s of [-1, 1]) {
    const win: V2[] = [[-0.33, 0.34], [-0.235, 0.34], [-0.235, 0.46], [-0.25, 0.5], [-0.31, 0.5], [-0.33, 0.46]];
    G.push(place(extrudeXY(win, 0.006, 0.003, 0.5, 2), [0, 0, s * (HALF + 0.01)]));
    P.push(place(capsuleBetween([-0.335, 0.335, 0], [-0.23, 0.335, 0], 0.005), [0, 0, s * (HALF + 0.014)]));
    // body crease beads
    P.push(place(capsuleBetween([-0.35, 0.285, 0], [-0.2, 0.285, 0], 0.006), [0, 0, s * (HALF + 0.012)]));
    P.push(place(capsuleBetween([-0.345, 0.23, 0], [-0.2, 0.23, 0], 0.004), [0, 0, s * (HALF + 0.008)]));
  }

  // front cab: lower apron/nose, glazing, pillars
  P.push(
    extrudeXY(
      [[0.1, 0.12], [0.28, 0.12], [0.325, 0.16], [0.348, 0.24], [0.345, 0.31], [0.32, BELT - 0.004], [0.1, BELT]],
      HALF, 0.07, 0.4, 4,
    ),
  );
  const WS_TOP = 0.272; // x of the windscreen top edge
  G.push(extrudeXY([[0.105, BELT], [0.325, BELT], [WS_TOP, T], [0.105, T]], HALF - 0.022, 0.006, 0.5, 2));
  for (const s of [-1, 1]) {
    const zz = s * (HALF - 0.012);
    P.push(capsuleBetween([0.325, BELT, zz], [WS_TOP, T + 0.005, zz], 0.011));
    P.push(capsuleBetween([0.105, BELT, zz], [0.105, T + 0.005, zz], 0.012));
    // door frame uprights, sill rail and top rail around the open section
    P.push(capsuleBetween([-0.2, 0.15, s * (HALF - 0.004)], [-0.2, T, s * (HALF - 0.004)], 0.01));
    P.push(capsuleBetween([0.1, 0.15, s * (HALF - 0.004)], [0.1, T, s * (HALF - 0.004)], 0.01));
    P.push(capsuleBetween([-0.2, T - 0.004, s * (HALF - 0.004)], [0.1, T - 0.004, s * (HALF - 0.004)], 0.009));
    P.push(capsuleBetween([-0.2, 0.14, s * (HALF - 0.004)], [0.1, 0.14, s * (HALF - 0.004)], 0.01));
    // side window mullion of the cab
    P.push(capsuleBetween([0.2, BELT, zz], [0.2, T, zz], 0.005));
    // belt-line bead
    P.push(capsuleBetween([0.1, BELT - 0.004, s * (HALF + 0.006)], [0.33, BELT - 0.004, s * (HALF + 0.006)], 0.006));
    P.push(capsuleBetween([0.1, 0.25, s * (HALF + 0.006)], [0.3, 0.25, s * (HALF + 0.006)], 0.004));
    // side mirrors on stalks
    P.push(capsuleBetween([0.3, 0.46, s * (HALF - 0.01)], [0.318, T + 0.01, s * 0.262], 0.005));
    P.push(sphere(0.027, [0.322, T + 0.025, s * 0.266], [0.55, 1, 0.9]));
  }
  // windscreen centre divider + belt across the front
  P.push(capsuleBetween([0.325, BELT, 0], [WS_TOP, T + 0.005, 0], 0.007));
  P.push(place(capsuleBetween([0, 0, -0.17], [0, 0, 0.17], 0.006), [0.332, BELT - 0.003, 0]));
  // windscreen wiper
  P.push(capsuleBetween([0.314, BELT + 0.03, 0.0], [0.298, T - 0.06, 0.11], 0.003));

  // central nose with slot and badge
  P.push(extrudeXY([[0.29, 0.13], [0.35, 0.17], [0.372, 0.25], [0.362, 0.32], [0.3, BELT - 0.004]], 0.04, 0.022, 0.6));
  D.push(place(rbox(0.012, 0.075, 0.03, 0.006), [0.373, 0.25, 0]));
  P.push(sphere(0.013, [0.345, BELT + 0.006, 0], [0.5, 1, 1]));
  // headlamps
  for (const s of [-1, 1]) {
    P.push(latheX(lampProfile(0.04), [0.364, 0.262, s * 0.1]));
    D.push(latheX([[0.0, 0], [0.043, 0], [0.043, 0.01], [0, 0.01]], [0.358, 0.262, s * 0.1]));
  }

  // --- roof -----------------------------------------------------------------
  const roof: V2[] = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const x = -ROOF_A + (2 * ROOF_A * i) / N;
    roof.push([x, roofTop(x) - 0.02]);
  }
  roof.push([ROOF_A, ROOF_BASE], [-ROOF_A, ROOF_BASE]);
  roof.reverse();
  P.push(extrudeXY(roof, 0.205, 0.065, 0.4, 4));
  for (const x of [-0.17, 0.02, 0.2]) {
    P.push(place(capsuleBetween([0, 0, -0.13], [0, 0, 0.13], 0.0065), [x, roofTop(x) + 0.005, 0]));
  }

  // --- interior --------------------------------------------------------------
  D.push(place(rbox(0.5, 0.012, 2 * HALF - 0.03, 0.004), [-0.1, 0.173, 0]));
  P.push(place(rbox(0.14, 0.065, 2 * HALF - 0.03, 0.012), [-0.13, 0.2, 0])); // seat base
  D.push(place(rbox(0.135, 0.045, 2 * HALF - 0.04, 0.015), [-0.13, 0.25, 0])); // cushion
  D.push(place(rbox(0.04, 0.19, 2 * HALF - 0.04, 0.012), [-0.18, 0.35, 0])); // backrest
  for (let i = 0; i < 9; i++) {
    const z = -0.14 + (i * 0.28) / 8;
    P.push(capsuleBetween([-0.158, 0.28, z], [-0.158, 0.44, z], 0.0105));
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.17 + i * 0.03;
    P.push(place(capsuleBetween([0, 0, -0.14], [0, 0, 0.14], 0.007), [x, 0.274, 0]));
  }
  // grab post at the front edge of the bench
  for (const s of [-1, 1]) {
    P.push(tube([[0.055, 0.2, s * 0.15], [0.058, 0.32, s * 0.15], [0.07, 0.4, s * 0.15]], 0.008, 12, 8));
  }
  P.push(capsuleBetween([0.058, 0.33, -0.15], [0.058, 0.33, 0.15], 0.0045));

  // --- mudguards & wheels ----------------------------------------------------
  const wr = wheelParts(REAR.r, REAR.w);
  const wf = wheelParts(FRONT.r, FRONT.w);
  for (const s of [-1, 1]) {
    D.push(place(wr.tyre.clone(), [REAR.x, REAR.r, s * REAR.z]));
    P.push(place(wr.hub.clone(), [REAR.x, REAR.r, s * REAR.z]));
    const fender = arcBand(REAR.r + 0.01, REAR.r + 0.034, -0.4, Math.PI + 0.5, 0.045, 0.014);
    P.push(place(fender, [REAR.x, REAR.r, s * REAR.z]));
  }
  D.push(place(wf.tyre, [FRONT.x, FRONT.r, 0]));
  P.push(place(wf.hub, [FRONT.x, FRONT.r, 0]));
  P.push(place(arcBand(FRONT.r + 0.012, FRONT.r + 0.032, -0.55, 2.55, 0.05, 0.014), [FRONT.x, FRONT.r, 0]));
  // front fork and axle
  for (const s of [-1, 1]) {
    P.push(capsuleBetween([FRONT.x, FRONT.r, s * 0.036], [FRONT.x - 0.012, 0.24, s * 0.036], 0.007));
  }
  P.push(sphere(0.012, [FRONT.x, FRONT.r, 0.042]));
  // nose underside blend between fender and body
  P.push(place(rbox(0.1, 0.05, 0.1, 0.02), [0.31, 0.15, 0]));

  return { pewter: merge(P), dark: merge(D), glass: merge(G) };
}

export function AutoRickshaw() {
  const g = useMemo(build, []);
  return (
    <group>
      <mesh geometry={g.pewter} material={pewter} castShadow receiveShadow />
      <mesh geometry={g.dark} material={pewterDark} castShadow receiveShadow />
      <mesh geometry={g.glass} material={glass} castShadow receiveShadow />
    </group>
  );
}
