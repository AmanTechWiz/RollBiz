import { useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { pewterDark } from "../materials";
import { buildScooter } from "./scooter/geometry";

// Satin pewter like the reference photo: light, softly reflective, not mirror chrome.
const shell = new MeshStandardMaterial({ color: "#c9ccd0", metalness: 0.78, roughness: 0.3, envMapIntensity: 1.1 });
// Polished parts: lamp lenses, indicator lenses, mirror balls.
const polished = new MeshStandardMaterial({ color: "#e4e7ea", metalness: 0.95, roughness: 0.12, envMapIntensity: 1.3 });

/** Vespa-style scooter token. Faces +X, rests on y = 0, about 0.78 units long. */
export function Scooter() {
  const g = useMemo(buildScooter, []);
  return (
    <group>
      <mesh geometry={g.body} material={shell} castShadow receiveShadow />
      <mesh geometry={g.dark} material={pewterDark} castShadow receiveShadow />
      <mesh geometry={g.bright} material={polished} castShadow />
    </group>
  );
}
