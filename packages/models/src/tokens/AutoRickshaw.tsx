import { useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { buildRickshaw } from "./auto-rickshaw/geometry";

// Satin pewter matching the reference photo: light, softly reflective, not mirror chrome.
const shell = new MeshStandardMaterial({ color: "#c9ccd0", metalness: 0.78, roughness: 0.3, envMapIntensity: 1.1 });
const recess = new MeshStandardMaterial({ color: "#8d9196", metalness: 0.7, roughness: 0.42 });
const pane = new MeshStandardMaterial({ color: "#a4a9af", metalness: 0.6, roughness: 0.12 });

/** Three-wheeled auto-rickshaw token. Faces +X, rests on y = 0, about 0.8 units long. */
export function AutoRickshaw() {
  const geo = useMemo(() => buildRickshaw(), []);
  return (
    <group scale={0.78}>
      <mesh geometry={geo.body} material={shell} castShadow receiveShadow />
      <mesh geometry={geo.dark} material={recess} castShadow receiveShadow />
      <mesh geometry={geo.glass} material={pane} />
    </group>
  );
}
