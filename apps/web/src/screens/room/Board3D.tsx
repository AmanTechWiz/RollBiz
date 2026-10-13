import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { AutoRickshaw, Board, Elephant, Scooter, SteamTrain, tileCenter, tileRect } from "@rollbiz/models";
import { useRef, type ComponentType } from "react";
import type { Group } from "three";
import type { GameCtx } from "./types";

/** Seat order decides each player's token and colour. */
export const SEAT_TOKENS: { name: string; Component: ComponentType }[] = [
  { name: "Auto", Component: AutoRickshaw },
  { name: "Scooter", Component: Scooter },
  { name: "Elephant", Component: Elephant },
  { name: "Train", Component: SteamTrain },
];
export const SEAT_COLORS = ["#ff5470", "#3ec46d", "#1ea4e8", "#ffc531"];

const TOKEN_SCALE = 0.62;
// Where each seat stands inside a shared tile (tile-local: across the track, radially).
const SEAT_OFFSETS: [number, number][] = [
  [-0.24, -0.3],
  [0.24, -0.3],
  [-0.24, 0.3],
  [0.24, 0.3],
];
// Tokens face the direction of travel along each side (bottom row runs toward -X).
const SIDE_HEADING = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

function seatPosition(tile: number, seat: number): [number, number, number] {
  const [x, y, z] = tileCenter(tile);
  const r = tileRect(tile);
  const [a, b] = SEAT_OFFSETS[seat % 4]!;
  const k = r.isCorner ? 1.6 : 1;
  // bottom/top rows: across = x, radial = z; left/right columns: swapped
  const [ox, oz] = r.side % 2 === 0 ? [a * k, b * k] : [b * k, a * k];
  return [x + ox, y, z + oz];
}

/** One token that glides and hops to its tile whenever the player's position changes. */
function Token({ seat, tile, active }: { seat: number; tile: number; active: boolean }) {
  const ref = useRef<Group>(null!);
  const ring = useRef<Group>(null!);
  const target = seatPosition(tile, seat);
  const heading = SIDE_HEADING[tileRect(tile).side]!;
  const { Component } = SEAT_TOKENS[seat % 4]!;

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 6);
    const dx = target[0] - g.position.x;
    const dz = target[2] - g.position.z;
    const far = Math.hypot(dx, dz);
    g.position.x += dx * k;
    g.position.z += dz * k;
    // hop while travelling, gentle bob while it's this player's turn
    const hop = far > 0.05 ? Math.abs(Math.sin(state.clock.elapsedTime * 12)) * Math.min(0.35, far * 0.3) : 0;
    const bob = active ? (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.04 : 0;
    g.position.y = target[1] + hop + bob;
    let dr = heading - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * k;
    if (ring.current) {
      ring.current.position.set(g.position.x, target[1] + 0.01, g.position.z);
      ring.current.rotation.z += dt * 1.5;
    }
  });

  return (
    <>
      <group ref={ref} position={target} scale={TOKEN_SCALE}>
        <Component />
      </group>
      {active && (
        <group ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[0.36, 0.44, 48]} />
            <meshBasicMaterial color="#1ea4e8" transparent opacity={0.85} toneMapped={false} />
          </mesh>
        </group>
      )}
    </>
  );
}

/** Owner marker and buildings for every owned property. */
function Ownership({ ctx }: { ctx: GameCtx }) {
  const { view, economy } = ctx;
  const seatOf = new Map(view.players.map((p, i) => [p.id, i]));
  return (
    <>
      {economy.tiles.map((tile, index) => {
        const prop = view.properties[tile.id];
        if (!prop?.owner) return null;
        const seat = seatOf.get(prop.owner) ?? 0;
        const r = tileRect(index);
        const [x, y, z] = tileCenter(index);
        // outward direction from the board centre, for the owner tab on the tile's outer edge
        const out = r.side === 0 ? [0, 1] : r.side === 1 ? [-1, 0] : r.side === 2 ? [0, -1] : [1, 0];
        const tab: [number, number, number] = [x + out[0]! * 0.62, y + 0.02, z + out[1]! * 0.62];
        const inward = (d: number): [number, number] => [x - out[0]! * d, z - out[1]! * d];
        const along = r.side % 2 === 0 ? [1, 0] : [0, 1];
        return (
          <group key={tile.id}>
            <mesh position={tab}>
              <cylinderGeometry args={[0.16, 0.16, 0.04, 24]} />
              <meshStandardMaterial color={SEAT_COLORS[seat]} roughness={0.3} transparent opacity={prop.mortgaged ? 0.4 : 1} />
            </mesh>
            {prop.hotel ? (
              <mesh position={[inward(0.55)[0], y + 0.09, inward(0.55)[1]]}>
                <boxGeometry args={[0.34, 0.16, 0.22]} />
                <meshStandardMaterial color="#ff5470" roughness={0.35} />
              </mesh>
            ) : (
              Array.from({ length: prop.houses }, (_, h) => {
                const [ix, iz] = inward(0.55);
                const s = (h - (prop.houses - 1) / 2) * 0.24;
                return (
                  <mesh key={h} position={[ix + along[0]! * s, y + 0.07, iz + along[1]! * s]}>
                    <boxGeometry args={[0.17, 0.13, 0.17]} />
                    <meshStandardMaterial color="#3ec46d" roughness={0.35} />
                  </mesh>
                );
              })
            )}
          </group>
        );
      })}
    </>
  );
}

/** The 3D board for the in-game screen: fixed top-down camera with a gentle tilt. */
export function Board3D({ ctx }: { ctx: GameCtx }) {
  const { view } = ctx;
  return (
    <div className="glass-card relative aspect-square w-full overflow-hidden rounded-[1.75rem]">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 17.5, 6.5], fov: 38 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0.6)}>
        <color attach="background" args={["#e8f5fd"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[-6, 12, 6]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={3} position={[-3, 6, 4]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={1.5} position={[5, 3, 2]} scale={[5, 5, 1]} />
          <Lightformer form="ring" intensity={1} position={[0, 8, -6]} scale={4} />
        </Environment>
        <Board />
        <Ownership ctx={ctx} />
        {view.players.map((p, seat) =>
          p.bankrupt ? null : <Token key={p.id} seat={seat} tile={p.position} active={view.turn.playerId === p.id && view.status === "playing"} />,
        )}
        <ContactShadows position={[0, -0.01, 0]} opacity={0.3} scale={18} blur={2.4} far={3} />
      </Canvas>
    </div>
  );
}
