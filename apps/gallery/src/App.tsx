import { PerspectiveCamera, View } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { MODELS, type ModelCategory, type ModelEntry } from "@rollbiz/models";
import { useRef, useState } from "react";
import { Inspector } from "./Inspector";
import { Stage } from "./Stage";

const SECTIONS: { category: ModelCategory; title: string }[] = [
  { category: "token", title: "Tokens" },
  { category: "board", title: "Board" },
  { category: "card", title: "Cards" },
];

export function App() {
  const params = new URLSearchParams(location.search);
  const [selected, setSelected] = useState<string | null>(params.get("model"));
  const container = useRef<HTMLDivElement>(null!);
  const model = MODELS.find((m) => m.id === selected);

  if (model) {
    const shotMode = params.has("shot");
    const close = () => {
      history.replaceState(null, "", location.pathname);
      setSelected(null);
    };
    return <Inspector model={model} onClose={close} shotMode={shotMode} />;
  }

  return (
    <div ref={container} className="home">
      <header className="home-header">
        <h1>Model Gallery</h1>
        <p>{MODELS.length} models · tap one to inspect</p>
      </header>
      {SECTIONS.map(({ category, title }) => (
        <section key={category}>
          <h2>{title}</h2>
          <div className="grid">
            {MODELS.filter((m) => m.category === category).map((m) => (
              <Tile
                key={m.id}
                model={m}
                onOpen={() => {
                  history.replaceState(null, "", `?model=${m.id}`);
                  setSelected(m.id);
                }}
              />
            ))}
          </div>
        </section>
      ))}
      {/* One WebGL context renders every thumbnail into its tile. */}
      <Canvas className="views-canvas" shadows dpr={[1, 2]} eventSource={container}>
        <View.Port />
      </Canvas>
    </div>
  );
}

function Tile({ model, onOpen }: { model: ModelEntry; onOpen: () => void }) {
  const d = model.viewDistance;
  return (
    <button className="tile" onClick={onOpen}>
      <View className="tile-view">
        <color attach="background" args={["#ffffff"]} />
        <PerspectiveCamera makeDefault position={[d * 0.6, d * 0.45, d * 0.75]} fov={35} onUpdate={(c) => c.lookAt(0, model.category === "board" ? 0 : d * 0.12, 0)} />
        <Stage>
          <model.Component />
        </Stage>
      </View>
      <span className="tile-label">{model.name}</span>
    </button>
  );
}
