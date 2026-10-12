import { useMemo } from "react";
import { LatheGeometry, SplineCurve, Vector2 } from "three";
import { glossyPlastic } from "../materials";

export const PAWN_COLORS = { red: "#e0262b", green: "#1e9e3a", blue: "#1f6fe0", yellow: "#f5c518" } as const;
export type PawnColor = keyof typeof PAWN_COLORS;

// Body traced from the reference pawns: rounded base rim, concave flared cone, slim neck and collar.
// Control points are smoothed with a spline so the silhouette has no visible kinks.
const BODY: [number, number][] = [
  [0.0, 0.0], [0.26, 0.0], [0.3, 0.012], [0.315, 0.035], [0.31, 0.065], [0.285, 0.088],
  [0.235, 0.115], [0.185, 0.17], [0.15, 0.25], [0.125, 0.35], [0.107, 0.45], [0.096, 0.53],
  [0.092, 0.575], [0.12, 0.588], [0.128, 0.603], [0.12, 0.618], [0.085, 0.63],
];
const HEAD_RADIUS = 0.155;
const HEAD_CENTER_Y = 0.625 + HEAD_RADIUS * 0.93;

function pawnProfile(): Vector2[] {
  const body = new SplineCurve(BODY.map(([x, y]) => new Vector2(x, y))).getPoints(120);
  // Round head: arc from where it meets the neck up to the pole.
  const start = Math.asin((0.085 - 0.001) / HEAD_RADIUS);
  const head: Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI - start - ((Math.PI - start) * i) / 48; // from lower neck joint to top
    head.push(new Vector2(Math.sin(a) * HEAD_RADIUS, HEAD_CENTER_Y + Math.cos(a) * HEAD_RADIUS));
  }
  head[head.length - 1]!.x = 0;
  return [...body, ...head];
}

export function ClassicPawn({ color = "red" }: { color?: PawnColor }) {
  const geometry = useMemo(() => new LatheGeometry(pawnProfile(), 96), []);
  const material = useMemo(() => glossyPlastic(PAWN_COLORS[color]), [color]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
