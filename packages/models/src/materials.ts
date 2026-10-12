import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three";

// Shared materials so every model reads as one set. Reuse these instances; don't clone per mesh.

/** Brushed pewter, as on the Indian tokens in docs/art/reference/tokens.png. */
export const pewter = new MeshStandardMaterial({
  color: new Color("#b9bcc0"),
  metalness: 0.92,
  roughness: 0.32,
});

/** Darker pewter for recesses: seats, tyres, grilles, cut lines. */
export const pewterDark = new MeshStandardMaterial({
  color: new Color("#6f7378"),
  metalness: 0.85,
  roughness: 0.45,
});

/** Glossy injection-moulded plastic for the classic pawns. */
export function glossyPlastic(color: string): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    metalness: 0,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
}
