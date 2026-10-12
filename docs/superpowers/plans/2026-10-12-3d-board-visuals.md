# 3D Board, Island and Tokens: Plan

Status: draft for review. Nothing here is built yet beyond installing three.js, @react-three/fiber and @react-three/drei in `apps/web`.

## What we're making

A playful, Nintendo-style 3D game table on a phone:
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
- **Camera:** a tilted 3/4 view of the whole board. Tap a tile to zoom to it; pinch or drag to orbit within limits; auto-focus on the moving token.

```
apps/web/src/scene/
  GameCanvas.tsx       # Canvas, renderer settings, quality tier, frameloop
  board/               # board ring mesh + tile textures from engine tiles
  island/              # island diorama, landmarks, props, lighting rig
  water/               # stylised water shader, wake trails, critters on paths
  tokens/              # token themes: Indian (GLB) + classic (procedural pawns)
  dice/                # 3D dice, scripted roll to a given result
  fx/                  # coins, confetti, stamp, gavel, jail bars, card flip
  anim/                # event queue: GameEvent -> timeline -> done
  assets.ts            # manifest: game ids -> files
```

## Look and feel ("Nintendo vibe")

- **Shapes:** chunky and rounded, with bevels everywhere and toy-like proportions. Saturated but soft colours.
- **Lighting:** a warm key light from the top left, a soft sky fill, and one shadow-casting light with baked contact shadows under props. Light bloom on highlights only.
- **Materials:**
  - Pewter tokens: metalness about 0.9, roughness about 0.35, with an HDR environment map for reflections.
  - Classic pawns: glossy plastic (roughness about 0.2) with a clearcoat.
- **Motion:** squash and stretch on hops, overshoot springs, short durations (150–400 ms) that never block play for long. `prefers-reduced-motion` turns most of it off.
- **Sound:** later, but plan for hooks on the same events.

## The island city (board centre)

- **Landmarks (stylised, low-poly):** Taj Mahal, India Gate, Gateway of India, Charminar, Howrah Bridge, Lotus Temple, Qutub Minar, Mysore Palace, Victoria Memorial. Add a cricket ground or a Bengaluru tech tower for fun.
- **Life:** palms, tiny buses and autos on a loop road, a train crossing the bridge, kites in the sky, lights that come on at dusk (an optional slow day-night cycle).
- **Water:** a toon shader with animated foam at the shoreline. Instanced tiny jet skis on spline paths with wake trails, dolphins on arc paths at random intervals, a ferry between two piers.
- **Kept cheap:** instancing, merged static meshes, and simple path animations (no physics).

## Tokens

| Theme | Pieces | How |
|---|---|---|
| Indian | auto-rickshaw, scooter, elephant, steam train, **+2 needed** | GLB models made from the reference art with an image-to-3D tool (Meshy, Tripo, Rodin or Hunyuan3D), then cleaned and compressed |
| Classic | red, green, blue, yellow pawns, **+2 needed** | Procedural: a lathe geometry pawn in code, so no asset files and any colour |

The game allows **6 players**, but the reference has 4 of each. We need 2 more Indian tokens (ideas: camel, cricket bat, tiger, sailing dhow) and 2 more pawn colours (ideas: purple, orange).

## Asset pipeline

1. Concept or reference image (GPT Image).
2. Image-to-3D, to get a GLB.
3. Clean up: centre it, scale it, set the pivot at the base, cap it at about 5–15k triangles. Blender, optionally via Blender MCP.
4. A `gltf-transform` script handles meshopt or Draco geometry, KTX2 or WebP textures, and texture resizing.
5. The result lands in `apps/web/public/models/`, registered in `scene/assets.ts` by game id.

Budgets on mid-range phones:
- Total first-load 3D assets under about 4 MB.
- Under about 120 draw calls and 60 fps on the board.
- Device pixel ratio capped at 1.5–2.
- `frameloop="demand"` while idle, with only the water and critters ticking.

There are three quality tiers: high (shadows, bloom, critters), medium, and low (no post-processing, fewer critters). They are picked automatically and can be overridden in settings.

## Build order (each part small and shippable)

1. **Scene scaffold:** the Canvas behind the game UI, the camera, lights, quality tier, and reduced-motion support.
2. **Board ring:** 40 tiles from engine data, with group colours, names and prices on canvas textures, and tap-to-select.
3. **Classic pawns:** the procedural pawn, placement on tiles, and several tokens sharing a tile.
4. **Token movement:** the event queue, then `moved` as a tile-by-tile hop with squash and stretch, plus camera follow.
5. **Dice:** a 3D dice roll scripted to land on the server result.
6. **Ownership and buildings:** owner flags on tiles, 3D houses and hotels, a mortgaged look.
7. **Island v1:** placeholder landmarks from primitives, the lighting rig, and a toon water shader.
8. **Water life:** jet skis, dolphins and the ferry on paths, instanced.
9. **Event effects:** card flip, jail bars, club confetti, Rest House coins, auction gavel, buy stamp, rent coin burst.
10. **Indian token theme:** the GLB loader and the theme setting, using the first real GLBs as they arrive.
11. **Real landmark models** replace the placeholders one by one.
12. **Performance pass:** draw-call audit, compression, and phone testing.

## Open questions for the owner

1. **Board shape.** The tile order puts corners at 0, 9, 18 and 30, so the sides have 8, 8, 11 and 9 tiles: not a square. Options:
   - (a) Move tiles so each side has 9 between corners (classic square). This changes some positions.
   - (b) Keep the order and draw a rectangle or rounded track.
   - Recommendation: (a). The engine only needs the order changed in one data file.
2. **Two more tokens per theme** for 5–6 player games (see above).
3. **Token theme scope.** Is it one theme for the whole room (the host picks), or does each player pick their own token from either set? Recommendation: each player picks any token, and the room shows a mix.
4. **Who makes the GLB models.** Will you run image-to-3D yourself and drop the GLBs in, or connect a Meshy or Tripo API key so I can generate them?
5. **Camera feel.** Fixed 3/4 view only, or free orbit with limits?

## Not in scope yet

Sound, haptics, a day-night cycle beyond a simple option, custom board skins, and replays.
