import type { CardId } from "@rollbiz/engine";

/** TODO(card agent): Chance / Community Chest card, showing a given card's face. */
export function EventCard(_props: { cardId: CardId; faceUp?: boolean }) {
  return (
    <mesh position={[0, 0.01, 0]}>
      <boxGeometry args={[1.6, 0.02, 1]} />
      <meshStandardMaterial color="#f4a340" />
    </mesh>
  );
}
