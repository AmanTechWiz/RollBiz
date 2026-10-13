// Signed-distance primitives and a smooth-union combinator, scalar-only so the field stays fast.

export type Field = (x: number, y: number, z: number) => number;

/** Polynomial smooth minimum (IQ). k is the blend radius. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth subtraction: carve b out of a. */
export function ssub(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(-b - a), 0) / k;
  return Math.max(a, -b) + h * h * k * 0.25;
}

/** Ellipsoid (IQ's bound-corrected approximation). */
export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Field {
  return (x, y, z) => {
    const px = (x - cx) / rx;
    const py = (y - cy) / ry;
    const pz = (z - cz) / rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / rx;
    const qy = py / ry;
    const qz = pz / rz;
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
}

/** Cone with spherical caps of radius r1 at a and r2 at b (IQ). */
export function roundCone(a: [number, number, number], b: [number, number, number], r1: number, r2: number): Field {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0];
    const pay = y - a[1];
    const paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const wx = pax * l2 - bax * yy;
    const wy = pay * l2 - bay * yy;
    const wz = paz * l2 - baz * yy;
    const x2 = wx * wx + wy * wy + wz * wz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** Vertical cylinder with rounded edges, centred at c, radius r, half-height h, edge radius e. */
export function roundCylinder(cx: number, cy: number, cz: number, r: number, h: number, e: number): Field {
  return (x, y, z) => {
    const dx = Math.hypot(x - cx, z - cz) - r + e;
    const dy = Math.abs(y - cy) - h + e;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - e;
  };
}

/** Smooth union of a list of fields with one blend radius. */
export function unionAll(fields: Field[], k: number): Field {
  return (x, y, z) => {
    let d = fields[0]!(x, y, z);
    for (let i = 1; i < fields.length; i++) d = smin(d, fields[i]!(x, y, z), k);
    return d;
  };
}

/** Field gradient by central differences (unnormalised). */
export function gradient(f: Field, x: number, y: number, z: number, e = 0.0007): [number, number, number] {
  return [
    (f(x + e, y, z) - f(x - e, y, z)) / (2 * e),
    (f(x, y + e, z) - f(x, y - e, z)) / (2 * e),
    (f(x, y, z + e) - f(x, y, z - e)) / (2 * e),
  ];
}

/** Pull a point onto the zero level set with a few Newton steps. */
export function project(f: Field, p: [number, number, number], steps = 3): [number, number, number] {
  let [x, y, z] = p;
  for (let i = 0; i < steps; i++) {
    const d = f(x, y, z);
    const [gx, gy, gz] = gradient(f, x, y, z);
    const g2 = gx * gx + gy * gy + gz * gz || 1;
    x -= (d * gx) / g2;
    y -= (d * gy) / g2;
    z -= (d * gz) / g2;
  }
  return [x, y, z];
}

export function normalAt(f: Field, x: number, y: number, z: number): [number, number, number] {
  const [gx, gy, gz] = gradient(f, x, y, z);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

/** First zero crossing along a ray from an inside point o in direction d (bisection). */
export function rayHit(f: Field, o: [number, number, number], d: [number, number, number], maxT = 0.5): [number, number, number] {
  // march out until outside, then bisect
  let t0 = 0;
  let t1 = 0;
  const step = 0.01;
  while (t1 < maxT && f(o[0] + d[0] * t1, o[1] + d[1] * t1, o[2] + d[2] * t1) < 0) {
    t0 = t1;
    t1 += step;
  }
  for (let i = 0; i < 22; i++) {
    const m = (t0 + t1) / 2;
    if (f(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m) < 0) t0 = m;
    else t1 = m;
  }
  const t = (t0 + t1) / 2;
  return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
}
