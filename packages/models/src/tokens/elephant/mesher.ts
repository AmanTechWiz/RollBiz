import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { type Field, gradient } from "./sdf";

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Naive surface nets over a regular grid with spacing h, sampled coarse-to-fine: the field is only
 * evaluated finely inside coarse cells that can contain the surface. Vertices are then pulled onto
 * the exact zero set and shaded with the field gradient, so the result reads as one moulded surface.
 */
export function meshField(f: Field, box: Box, h: number): BufferGeometry {
  const C = 4; // coarse factor
  const dims = [0, 1, 2].map((a) => {
    const cells = Math.ceil((box.max[a]! - box.min[a]!) / h / C) * C;
    return cells + 1;
  }) as [number, number, number];
  const [nx, ny, nz] = dims;
  const [ox, oy, oz] = box.min;
  const vals = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // coarse pass
  const cx = (nx - 1) / C + 1;
  const cy = (ny - 1) / C + 1;
  const cz = (nz - 1) / C + 1;
  const coarse = new Float32Array(cx * cy * cz);
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) coarse[cid(i, j, k)] = f(ox + i * C * h, oy + j * C * h, oz + k * C * h);

  const near = 1.6 * C * h * Math.sqrt(3);
  for (let k = 0; k < cz - 1; k++)
    for (let j = 0; j < cy - 1; j++)
      for (let i = 0; i < cx - 1; i++) {
        let mn = Infinity;
        for (let c = 0; c < 8; c++) mn = Math.min(mn, Math.abs(coarse[cid(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!));
        const active = mn < near;
        const fill = coarse[cid(i, j, k)]!;
        for (let kk = 0; kk <= C; kk++)
          for (let jj = 0; jj <= C; jj++)
            for (let ii = 0; ii <= C; ii++) {
              const fi = i * C + ii;
              const fj = j * C + jj;
              const fk = k * C + kk;
              const n = id(fi, fj, fk);
              if (active) vals[n] = f(ox + fi * h, oy + fj * h, oz + fk * h);
              else if (vals[n] === 0) vals[n] = fill;
            }
      }
  // one vertex per sign-changing cell
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellId = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a]!;
          const vb = corner[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
          const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          cnt++;
        }
        cellVert[cellId(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
      }

  // quads across sign-changing grid edges
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const v0 = vals[id(i, j, k)]! < 0, v1 = vals[id(i + 1, j, k)]! < 0;
        if (v0 === v1) continue;
        quad(cellVert[cellId(i, j - 1, k - 1)]!, cellVert[cellId(i, j, k - 1)]!, cellVert[cellId(i, j, k)]!, cellVert[cellId(i, j - 1, k)]!, !v0);
      }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = vals[id(i, j, k)]! < 0, v1 = vals[id(i, j + 1, k)]! < 0;
        if (v0 === v1) continue;
        quad(cellVert[cellId(i - 1, j, k - 1)]!, cellVert[cellId(i - 1, j, k)]!, cellVert[cellId(i, j, k)]!, cellVert[cellId(i, j, k - 1)]!, !v0);
      }
  for (let k = 0; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = vals[id(i, j, k)]! < 0, v1 = vals[id(i, j, k + 1)]! < 0;
        if (v0 === v1) continue;
        quad(cellVert[cellId(i - 1, j - 1, k)]!, cellVert[cellId(i, j - 1, k)]!, cellVert[cellId(i, j, k)]!, cellVert[cellId(i - 1, j, k)]!, !v0);
      }

  // pull vertices onto the true surface and shade with the field gradient
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v]!, y = pos[v + 1]!, z = pos[v + 2]!;
    for (let s = 0; s < 2; s++) {
      const d = f(x, y, z);
      const [gx, gy, gz] = gradient(f, x, y, z, h * 0.25);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      const sx = (d * gx) / g2, sy = (d * gy) / g2, sz = (d * gz) / g2;
      // never move further than half a cell, so thin parts don't collapse
      const m = Math.hypot(sx, sy, sz);
      const lim = m > h * 0.5 ? (h * 0.5) / m : 1;
      x -= sx * lim;
      y -= sy * lim;
      z -= sz * lim;
    }
    pos[v] = x;
    pos[v + 1] = y;
    pos[v + 2] = z;
    const [gx, gy, gz] = gradient(f, x, y, z, h * 0.35);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / l;
    nrm[v + 1] = gy / l;
    nrm[v + 2] = gz / l;
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setIndex(new Uint32BufferAttribute(idx, 1));
  return g;
}
