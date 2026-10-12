import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, type Curve } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Small geometry helpers shared by the Elephant and SteamTrain tokens. */

export function flipWinding(g: BufferGeometry): BufferGeometry {
  const idx = g.index;
  if (idx) {
    const a = idx.array as unknown as number[];
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1] as number;
      a[i + 1] = a[i + 2] as number;
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.getAttribute(name);
      const n = at.itemSize;
      const arr = at.array as unknown as number[];
      for (let i = 0; i < at.count; i += 3) {
        for (let k = 0; k < n; k++) {
          const p = (i + 1) * n + k;
          const q = (i + 2) * n + k;
          const t = arr[p] as number;
          arr[p] = arr[q] as number;
          arr[q] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  return g;
}

/** Clone a geometry and apply a matrix (keeps winding correct for mirrored matrices). */
export function place(geo: BufferGeometry, m: Matrix4): BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  return g;
}

export function at(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx): Matrix4 {
  return new Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z);
}

/** Merge into one position+normal geometry (drops uv so mixed primitives can be merged). */
export function mergeAll(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) {
      if (name !== "position" && name !== "normal") n.deleteAttribute(name);
    }
    return n;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error("mergeAll failed");
  return merged;
}

/** Tube along a curve whose radius varies with t (0..1). Ends are capped with a point. */
export function taperedTube(
  curve: Curve<Vector3>,
  radius: (t: number) => number,
  tubular = 48,
  radial = 12,
  squashZ = 1,
): BufferGeometry {
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, p);
    const N = frames.normals[i] as Vector3;
    const B = frames.binormals[i] as Vector3;
    const r = radius(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r * squashZ;
      pos.push(p.x + c * N.x + s * B.x, p.y + c * N.y + s * B.y, p.z + c * N.z + s * B.z);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  // End caps
  for (const end of [0, tubular]) {
    const centre = pos.length / 3;
    curve.getPointAt(end / tubular, p);
    pos.push(p.x, p.y, p.z);
    for (let j = 0; j < radial; j++) {
      const a = end * radial + j;
      const b = end * radial + ((j + 1) % radial);
      if (end === 0) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Parametric grid surface: f(u,v) -> point, u,v in 0..1. Winding follows (du x dv). */
export function gridSurface(
  f: (u: number, v: number) => Vector3,
  nu: number,
  nv: number,
  wrapV = false,
): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const cols = wrapV ? nv : nv + 1;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j < cols; j++) {
      const q = f(i / nu, j / nv);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < (wrapV ? nv : nv); j++) {
      const j2 = wrapV ? (j + 1) % nv : j + 1;
      const a = i * cols + j;
      const b = i * cols + j2;
      const c = (i + 1) * cols + j;
      const d = (i + 1) * cols + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
