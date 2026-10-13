import { useMemo } from "react";
import { ExtrudeGeometry, MeshStandardMaterial, Shape } from "three";
import "../r3f-jsx";
import { CARD_THICKNESS } from "../cards/cardMesh";
import { EventCard } from "../cards/EventCard";
import { BOARD_THICKNESS } from "./layout";
import { DECK_INSET, DECK_SPOTS } from "./paint";

// Card decks on the four inner corners of the board, sitting on their printed borders.

const TOP = BOARD_THICKNESS + 0.003;
const STACK = 7; // cards per deck
const CARD_T = CARD_THICKNESS + 0.001;

const DECK_W = 1.45;
const DECK_H = 1.0;
const DECK_T = STACK * CARD_T;

/** The deck body: one solid rounded block (no stacked faces to fight over depth). */
function deckBlockGeometry(): ExtrudeGeometry {
  const r = 0.09;
  const hw = DECK_W / 2 - 0.01;
  const hh = DECK_H / 2 - 0.01;
  const s = new Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const g = new ExtrudeGeometry(s, { depth: DECK_T, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // extrude along +y
  return g;
}

const deckMaterial = new MeshStandardMaterial({ color: "#f6f4ee", roughness: 0.85, metalness: 0 });

/** A deck: a solid block of cards with the top card's back showing. */
function Deck({ cardId, x, z, angle, block }: { cardId: string; x: number; z: number; angle: number; block: ExtrudeGeometry }) {
  return (
    <group position={[x, TOP + 0.002, z]} rotation={[0, angle, 0]}>
      <mesh geometry={block} material={deckMaterial} castShadow receiveShadow />
      <group position={[0, DECK_T + 0.002, 0]}>
        <EventCard cardId={cardId} faceUp={false} />
      </group>
    </group>
  );
}

export function BoardCenter() {
  const block = useMemo(() => deckBlockGeometry(), []);
  // The RollBiz logo, centre art and deck borders are printed into the board face (paint.ts).
  return (
    <group>
      {DECK_SPOTS.map((spot, i) => (
        <Deck
          key={i}
          block={block}
          cardId={spot.deck === "chance" ? "CH01" : "CC01"}
          x={spot.sx * DECK_INSET}
          z={spot.sz * DECK_INSET}
          angle={spot.angle}
        />
      ))}
    </group>
  );
}
