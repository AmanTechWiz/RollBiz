import { pewter } from "../materials";

/** TODO(token agent): model to match docs/art/reference/tokens.png. Placeholder box until then. */
export function SteamTrain() {
  return (
    <mesh material={pewter} position={[0, 0.3, 0]} castShadow>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
    </mesh>
  );
}
