# 3D Board, Island and Tokens: Plan

Status: decisions settled (see below). Nothing here is built yet beyond installing three.js, @react-three/fiber and @react-three/drei in `apps/web`.

## What we're making

A premium 3D game table on a phone, wrapped in a modern Nintendo-system-style UI:
- **The board** is a flat ring of 40 tiles, drawn from engine data (names, prices, group colours, owners, houses).
- **The centre** is a stylised island city: a mash-up of famous Indian landmarks with warm lighting and gentle motion.
- **Water** surrounds the island, with tiny life: jet skis carving wakes, dolphins arcing, a ferry.
- **Tokens** come in two themes:
  - **Indian:** pewter auto-rickshaw, scooter, elephant and steam train. Reference: `docs/art/reference/tokens.png`.
  - **Classic:** glossy red, green, blue and yellow pawns.
- **Micro-animations** for every game moment: token hops, dice rolls, card flips, jail, club, auction, buying, rent.

## Architecture

- **One fullscreen `<Canvas>`** (react-three-fiber) under the HTML UI.
  - Buttons, panels and text stay in HTML (React, Tailwind, motion), so text is crisp, tap targets are accessible and layout is easy.
  - The 3D scene is the playfield. The HTML layer floats on top with chunky, bouncy buttons.
  - Recommendation: don't build the UI itself in 3D. Small 3D flourishes are fine (a 3D coin on the cash counter, a 3D card during a reveal).
- **The scene reads `PublicGameView`** and plays **engine `GameEvent`s** through an animation queue.
  - `moved` hops the token tile by tile, `rolled` tumbles the dice, `cardDrawn` flips the card.
  - When the queue is empty, the scene snaps to the authoritative state, so it can never drift from the server.
- **Dice must land on the server's numbers.** The dice tumble is scripted (or physics with a final ease into the known face), never free physics deciding the result.
- **Camera (decided):** a fixed top-down view of the whole board while nothing is moving. When a token moves (or a dice or card moment plays), a cinematic shot eases in, follows the action at a low angle, then eases back to the top view. No free orbit.

```
apps/web/src/scene/
  GameCanvas.tsx       # Canvas, renderer settings, quality tier, frameloop
  board/               # board ring mesh + tile textures from engine tiles
  island/              # island diorama, landmarks, props, lighting rig
  water/               # stylised water shader, wake trails, critters on paths
  tokens/              # code-built tokens: Indian (pewter) + classic (pawns), token picker
  dice/                # 3D dice, scripted roll to a given result
  fx/                  # coins, confetti, stamp, gavel, jail bars, card flip
  anim/                # event queue: GameEvent -> timeline -> done
  assets.ts            # manifest: game ids -> files
```

## Look and feel (clarified by owner, 2026-10-12)

- **App UI = modern Nintendo system UI**, not Nintendo game art. Think of the Switch home and settings screens:
  - A clean light (or dark) canvas, white rounded tiles, and a cyan selection ring that pops with a springy scale.
  - Bold rounded sans type, generous spacing, short snappy transitions, and satisfying click and select feedback.
  - The gallery site (`apps/gallery`) already uses this style and is the reference for the game UI.
- **Game pieces are realistic and premium**, accurate to the reference art:
  - Brushed-pewter Indian tokens and glossy plastic pawns.
  - The board and cards look like a high-end printed set.
- **Lighting:** studio-style, with a soft key from the top left (as in the reference photo), a runtime environment map for metal reflections, and contact shadows.
- **Motion:** springy and short (150–400 ms). `prefers-reduced-motion` disables most of it.

## The island city (board centre)

- **Landmarks (stylised, low-poly):** Taj Mahal, India Gate, Gateway of India, Charminar, Howrah Bridge, Lotus Temple, Qutub Minar, Mysore Palace, Victoria Memorial. Add a cricket ground or a Bengaluru tech tower for fun.
- **Life:** palms, tiny buses and autos on a loop road, a train crossing the bridge, kites in the sky, lights that come on at dusk (an optional slow day-night cycle).
- **Water:** a toon shader with animated foam at the shoreline. Instanced tiny jet skis on spline paths with wake trails, dolphins on arc paths at random intervals, a ferry between two piers.
- **Kept cheap:** instancing, merged static meshes, and simple path animations (no physics).

## Tokens (decided)

Four players max, so each theme has exactly four tokens. Each player picks any token from either theme (no duplicates in a room), so a table can mix them.

| Theme | Pieces | How |
|---|---|---|
| Indian | auto-rickshaw, scooter, elephant, steam train | Modelled in code with three.js (see below), pewter material |
| Classic | red, green, blue, yellow pawns | Modelled in code: a lathe pawn profile, glossy plastic |

The token choice is cosmetic: it lives in the room (a `token` field on the room player, picked in the lobby), not in the rules engine.

## Modelling approach (decided): built in three.js, no external 3D files

Tokens, landmarks, props and critters are built from code: rounded boxes, cylinders, lathe profiles (domes, pawns, minarets), extruded shapes (arches, jaalis), tubes (trunks, rails) and merged geometry. This fits the chunky, toy-like Nintendo style better than scanned detail, needs no asset pipeline, and keeps downloads tiny.

- **Each model is a small React component** (`<AutoRickshaw />`, `<TajMahal />`) built from primitives. Geometry is memoised and merged so each model costs one or two draw calls.
- **Shared materials:** pewter, glossy plastic, painted stone, water, glass. An HDR environment map is generated at runtime (drei `<Environment>` with lightformers), so there are no image files.
- **Detail budget:** the engraved pewter look from the reference comes from normal maps and bevels, not geometry. The elephant is the hardest piece and will be a stylised, cute elephant, not a realistic one.
- **Escape hatch:** any component can later be swapped for a GLB without touching the scene, if a piece needs more detail than primitives give.

Budgets on mid-range phones:
- Under about 120 draw calls and 60 fps on the board.
- Device pixel ratio capped at 1.5–2.
- `frameloop="demand"` while idle, with only the water and critters ticking.

There are three quality tiers: high (shadows, bloom, critters), medium, and low (no post-processing, fewer critters). They are picked automatically and can be overridden in settings.

## Build order (each part small and shippable)

0. **Model gallery (in progress):** tokens, board and cards are built in `packages/models` and inspected at http://localhost:5174 (`apps/gallery`) before going into the game.

1. **Scene scaffold:** the Canvas behind the game UI, the camera, lights, quality tier, and reduced-motion support.
2. **Board ring:** 40 tiles from engine data, with group colours, names and prices on canvas textures, and tap-to-select.
3. **Tokens:** classic pawns and the four Indian tokens modelled in code; placement on tiles, several tokens sharing a tile; the lobby token picker.
4. **Token movement and camera:** the event queue, then `moved` as a tile-by-tile hop with squash and stretch; the cinematic follow camera and the return to top view.
5. **Dice:** a 3D dice roll scripted to land on the server result.
6. **Ownership and buildings:** owner flags on tiles, 3D houses and hotels, a mortgaged look.
7. **Island v1:** island terrain, placeholder landmark blocks, the lighting rig, and a toon water shader.
8. **Water life:** jet skis, dolphins and the ferry on paths, instanced.
9. **Event effects:** card flip, jail bars, club confetti, Rest House coins, auction gavel, buy stamp, rent coin burst.
10. **Landmarks:** the placeholder blocks are replaced one by one with proper code-built landmarks.
11. **Performance pass:** draw-call audit and phone testing.

## Decisions (owner, 2026-10-12)

1. **Board shape:** a square track, nine tiles per side, laid out like classic Indian business boards. Done in the engine (`packages/engine/src/config/base.ts`).
2. **Players:** 4 max, so 4 tokens per theme.
3. **Tokens:** each player picks any token from either theme.
4. **Models:** built in three.js code, with no external 3D files.
5. **Camera:** a fixed top view when nothing is moving; a cinematic zoom while a token moves.

## Not in scope yet

Sound, haptics, a day-night cycle beyond a simple option, custom board skins, and replays.
