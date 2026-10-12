import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ModelEntry } from "@rollbiz/models";
import { useEffect, useState } from "react";
import { Stage } from "./Stage";

type Props = { model: ModelEntry; onClose?: () => void; shotMode?: boolean };

/** Full-size view of one model: orbit, wireframe, auto-rotate, light/dark backdrop, render stats. */
export function Inspector({ model, onClose, shotMode = false }: Props) {
  const [wireframe, setWireframe] = useState(false);
  const [spin, setSpin] = useState(false);
  const [dark, setDark] = useState(false);
  const [stats, setStats] = useState({ triangles: 0, calls: 0 });
  const angle = new URLSearchParams(location.search).get("angle") ?? "front";
  const d = model.viewDistance;
  const camera: [number, number, number] =
    angle === "side" ? [d, d * 0.35, 0] : angle === "top" ? [0, d, 0.001] : angle === "back" ? [-d * 0.6, d * 0.45, -d * 0.7] : [d * 0.6, d * 0.45, d * 0.75];

  return (
    <div className={`inspector ${dark ? "dark" : ""} ${shotMode ? "shot" : ""}`}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: camera, fov: 35 }} gl={{ preserveDrawingBuffer: shotMode }}>
        <color attach="background" args={[dark ? "#1d1f24" : "#eceef1"]} />
        <Stage>
          <Wireframe enabled={wireframe}>
            <model.Component />
          </Wireframe>
        </Stage>
        <OrbitControls makeDefault autoRotate={spin} target={[0, model.category === "board" ? 0 : d * 0.12, 0]} />
        <Stats onStats={setStats} />
        {shotMode && <ReadySignal />}
      </Canvas>

      {!shotMode && (
        <div className="inspector-bar">
          <button className="pill" onClick={onClose}>‹ Back</button>
          <h2>{model.name}</h2>
          <div className="toggles">
            <Toggle on={wireframe} set={setWireframe} label="Wireframe" />
            <Toggle on={spin} set={setSpin} label="Spin" />
            <Toggle on={dark} set={setDark} label="Dark" />
          </div>
          <p className="stats">
            {stats.triangles.toLocaleString()} triangles · {stats.calls} draw calls
          </p>
        </div>
      )}
      {!shotMode && model.category === "token" && model.id.startsWith("pawn") === false && (
        <img className="reference" src="/reference/tokens.png" alt="Reference" />
      )}
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button className={`pill ${on ? "on" : ""}`} onClick={() => set(!on)}>
      {label}
    </button>
  );
}

function Wireframe({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.traverse((o) => {
      const m = (o as { material?: { wireframe?: boolean } | { wireframe?: boolean }[] }).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) if ("wireframe" in mat) mat.wireframe = enabled;
    });
  }, [enabled, scene]);
  return <>{children}</>;
}

function Stats({ onStats }: { onStats: (s: { triangles: number; calls: number }) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = setInterval(() => onStats({ triangles: gl.info.render.triangles, calls: gl.info.render.calls }), 500);
    return () => clearInterval(id);
  }, [gl, onStats]);
  return null;
}

/** Tells the screenshot script the scene has rendered a few frames. */
function ReadySignal() {
  useEffect(() => {
    const id = setTimeout(() => ((window as { __ready?: boolean }).__ready = true), 1200);
    return () => clearTimeout(id);
  }, []);
  return null;
}
