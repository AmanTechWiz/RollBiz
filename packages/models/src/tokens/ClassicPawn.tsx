import { useMemo } from "react";
import { LatheGeometry, Vector2 } from "three";
import { glossyPlastic } from "../materials";

export const PAWN_COLORS = { red: "#e0262b", green: "#1e9e3a", blue: "#1f6fe0", yellow: "#f5c518" } as const;
export type PawnColor = keyof typeof PAWN_COLORS;

// Profile traced from the reference pawns: wide stepped base, flared cone, collar, round head.
const PROFILE: [number, number][] = [
  [0, 0], [0.3, 0], [0.31, 0.02], [0.31, 0.07], [0.27, 0.09], [0.25, 0.11],
  [0.17, 0.2], [0.12, 0.38], [0.09, 0.52], [0.08, 0.58], [0.12, 0.6], [0.12, 0.63],
  [0.07, 0.65], [0.13, 0.69], [0.16, 0.76], [0.16, 0.82], [0.13, 0.89], [0.07, 0.93], [0, 0.94],
];

export function ClassicPawn({ color = "red" }: { color?: PawnColor }) {
  const geometry = useMemo(
    () => new LatheGeometry(PROFILE.map(([x, y]) => new Vector2(x, y)), 64),
    [],
  );
  const material = useMemo(() => glossyPlastic(PAWN_COLORS[color]), [color]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}
