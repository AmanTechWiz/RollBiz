import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Euler,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Apply position / euler rotation / scale in place and return the geometry. */
export function place<T extends BufferGeometry>(g: T, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): T {
  const m = new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

/** Merge geometries (made non-indexed so mixed primitives are compatible). */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(n.attributes)) if (key !== "position" && key !== "normal" && key !== "uv") n.deleteAttribute(key);
    return n;
  });
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error("mergeGeometries failed");
  return out;
}

/** Closed Catmull-Rom sampled to a 2D polygon, for smooth blobby silhouettes. */
export function smoothClosed(points: V2[], samples = 64, tension = 0.5): V2[] {
  const curve = new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x, y, 0)), true, "catmullrom", tension);
  return curve.getSpacedPoints(samples).slice(0, -1).map((p) => [p.x, p.y] as V2);
}

/**
 * Extrude an XY outline across Z, centred on z = 0 with total half-thickness `halfZ`.
 * The bevel rounds the Z-edges. Note the XY silhouette grows by `bevel * bevelXY` at mid-depth.
 */
export function extrudeXY(points: V2[], halfZ: number, bevel = 0.02, bevelXY = 0.6, segments = 4): BufferGeometry {
  const shape = new Shape(points.map(([x, y]) => new Vector2(x, y)));
  const depth = Math.max(0.0001, 2 * (halfZ - bevel));
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * bevelXY,
    bevelOffset: 0,
    bevelSegments: segments,
    curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  // smooth the bevel but keep crisp creases where the outline turns sharply
  return toCreasedNormals(g, Math.PI / 3.2);
}

/** Annular sector in XY (angle 0 = +X, CCW), extruded across Z. */
export function arcBand(rIn: number, rOut: number, a0: number, a1: number, halfZ: number, bevel = 0.012, steps = 24): BufferGeometry {
  const pts: V2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([Math.cos(a) * rOut, Math.sin(a) * rOut]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([Math.cos(a) * rIn, Math.sin(a) * rIn]);
  }
  return extrudeXY(pts, halfZ, bevel, 0.5, 3);
}

export function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.0001, h / 2 - 0.0001, d / 2 - 0.0001));
}

/** Capsule between two points. */
export function capsuleBetween(a: V3, b: V3, radius: number, radial = 6): BufferGeometry {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new CapsuleGeometry(radius, Math.max(0.0001, len - 2 * radius), 2, radial);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return g;
}

export function tube(points: V3[], radius: number, segments = 24, radial = 8, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, "catmullrom", 0.5);
  return new TubeGeometry(curve, segments, radius, radial, closed);
}

export function sphere(r: number, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): BufferGeometry {
  const w = r < 0.02 ? 10 : 16;
  const g = new SphereGeometry(r, w, Math.round(w * 0.7));
  return place(g, pos, [0, 0, 0], scale);
}

/** Lathe from (radius, height) pairs; axis is Y. */
export function lathe(profile: V2[], segments = 40): LatheGeometry {
  return new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), segments);
}

/** Lathe whose axis points along +X (for lamps facing forward). */
export function latheX(profile: V2[], pos: V3, segments = 36): BufferGeometry {
  const g = lathe(profile, segments);
  g.rotateZ(-Math.PI / 2);
  return place(g, pos);
}

/** Round lamp, bezel plus domed lens, facing +Y before rotation. */
export function lampProfile(r: number): V2[] {
  return [
    [0, 0], [r * 1.05, 0], [r * 1.08, r * 0.14], [r * 0.95, r * 0.26], [r * 0.82, r * 0.22],
    [r * 0.78, r * 0.16], [r * 0.7, r * 0.2], [r * 0.5, r * 0.5], [r * 0.25, r * 0.65], [0, r * 0.7],
  ];
}

/**
 * Wheel with its axis along Z, centred at the origin. Returns tyre (dark) and hub/rim (pewter) parts.
 * `lugs` adds tread blocks round the tyre.
 */
export function wheelParts(R: number, w: number, lugs = 28): { tyre: BufferGeometry; hub: BufferGeometry } {
  const hw = w / 2;
  const ri = R * 0.66;
  const tyreProfile: V2[] = [
    [ri, -hw * 0.85], [R * 0.88, -hw], [R * 0.96, -hw * 0.9], [R * 0.995, -hw * 0.55], [R, -hw * 0.25],
    [R, hw * 0.25], [R * 0.995, hw * 0.55], [R * 0.96, hw * 0.9], [R * 0.88, hw], [ri, hw * 0.85],
  ];
  const tyreBody = lathe(tyreProfile, 40);
  tyreBody.rotateX(Math.PI / 2);
  const parts: BufferGeometry[] = [tyreBody];
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    const lug = new BoxGeometry(R * 0.1, R * 0.035, w * 0.8);
    place(lug, [Math.cos(a) * R * 0.995, Math.sin(a) * R * 0.995, 0], [0, 0, a - Math.PI / 2]);
    parts.push(lug);
  }
  const hubProfile: V2[] = [
    [0, -hw * 0.95], [R * 0.1, -hw * 0.95], [R * 0.14, -hw * 0.75], [R * 0.24, -hw * 0.72], [R * 0.3, -hw * 0.6],
    [R * 0.55, -hw * 0.6], [R * 0.58, -hw * 0.5], [ri * 1.02, -hw * 0.72], [ri * 1.02, hw * 0.72], [R * 0.58, hw * 0.5],
    [R * 0.55, hw * 0.6], [R * 0.3, hw * 0.6], [R * 0.24, hw * 0.72], [R * 0.14, hw * 0.75], [R * 0.1, hw * 0.95], [0, hw * 0.95],
  ];
  const hub = lathe(hubProfile, 32);
  hub.rotateX(Math.PI / 2);
  const hubParts: BufferGeometry[] = [hub];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      hubParts.push(place(new SphereGeometry(R * 0.045, 6, 4), [Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4, s * hw * 0.66]));
    }
  }
  return { tyre: merge(parts), hub: merge(hubParts) };
}
