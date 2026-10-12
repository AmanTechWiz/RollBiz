import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import type { ReactNode } from "react";

/**
 * Studio lighting shared by thumbnails, the inspector and screenshots: a soft key from the
 * top left, like the reference photo, and a runtime-built environment map (no network HDRs).
 */
export function Stage({ children, shadows = true }: { children: ReactNode; shadows?: boolean }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[-3, 5, 3]} intensity={2.2} castShadow={shadows} shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[3, 2, -2]} intensity={0.6} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[-3, 4, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[4, 2, 2]} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1} position={[0, 6, -4]} scale={3} />
        <Lightformer form="rect" intensity={0.6} position={[0, -2, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      {children}
      {shadows && <ContactShadows position={[0, 0.001, 0]} opacity={0.45} scale={8} blur={2.2} far={2} />}
    </>
  );
}
