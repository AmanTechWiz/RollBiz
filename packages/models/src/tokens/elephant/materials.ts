import { MeshStandardMaterial } from "three";

// Satin pewter, matching the auto-rickshaw and the other Indian tokens.
export const pewterBody = new MeshStandardMaterial({ color: "#c9ccd0", metalness: 0.78, roughness: 0.3, envMapIntensity: 1.1 });

/** Slightly brighter, more polished pewter for the tusks. */
export const pewterTusk = new MeshStandardMaterial({ color: "#dfe2e6", metalness: 0.8, roughness: 0.18, envMapIntensity: 1.15 });

/** Dark pewter eyes. */
export const pewterEye = new MeshStandardMaterial({ color: "#4a4e54", metalness: 0.7, roughness: 0.2 });
