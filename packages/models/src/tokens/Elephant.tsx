import { useMemo } from "react";
import { buildElephant } from "./elephant/geometry";
import { pewterBody, pewterEye, pewterTusk } from "./elephant/materials";

/**
 * Indian elephant token in satin pewter, shaped after docs/art/reference/token-elephant-v2.png
 * (trunk pose after token-elephant.png).
 * Faces +X, stands on its round base at y = 0. Body is one smooth distance-field surface.
 */
export function Elephant() {
  const geo = useMemo(buildElephant, []);
  return (
    <group>
      <mesh geometry={geo.body} material={pewterBody} castShadow receiveShadow />
      <mesh geometry={geo.ivory} material={pewterTusk} castShadow />
      <mesh geometry={geo.eyes} material={pewterEye} />
    </group>
  );
}
