import type { TileId } from "@rollbiz/engine";

/** TODO(card agent): title-deed card for a city / transport / utility. */
export function PropertyCard(_props: { tileId: TileId }) {
  return (
    <mesh position={[0, 0.01, 0]}>
      <boxGeometry args={[1, 0.02, 1.4]} />
      <meshStandardMaterial color="#ffffff" />
    </mesh>
  );
}
