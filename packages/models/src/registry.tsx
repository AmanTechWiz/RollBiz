import { Board } from "./board/Board";
import { EventCard } from "./cards/EventCard";
import { PropertyCard } from "./cards/PropertyCard";
import { AutoRickshaw } from "./tokens/AutoRickshaw";
import { ClassicPawn, type PawnColor } from "./tokens/ClassicPawn";
import { Elephant } from "./tokens/Elephant";
import { Scooter } from "./tokens/Scooter";
import { SteamTrain } from "./tokens/SteamTrain";
import type { ModelEntry } from "./types";

const pawn = (color: PawnColor): ModelEntry => ({
  id: `pawn-${color}`,
  name: `Pawn (${color})`,
  category: "token",
  Component: () => <ClassicPawn color={color} />,
  viewDistance: 2.8,
});

/** Everything the gallery shows, in display order. */
export const MODELS: readonly ModelEntry[] = [
  { id: "auto-rickshaw", name: "Auto-rickshaw", category: "token", Component: AutoRickshaw, viewDistance: 2.2 },
  { id: "scooter", name: "Scooter", category: "token", Component: Scooter, viewDistance: 1.8 },
  { id: "elephant", name: "Elephant", category: "token", Component: Elephant, viewDistance: 1.8 },
  { id: "steam-train", name: "Steam train", category: "token", Component: SteamTrain, viewDistance: 1.9 },
  pawn("red"),
  pawn("green"),
  pawn("blue"),
  pawn("yellow"),
  { id: "board", name: "Board", category: "board", Component: Board, viewDistance: 22 },
  { id: "card-chance", name: "Chance card", category: "card", Component: () => <EventCard cardId="CH05" faceUp />, viewDistance: 2.8 },
  { id: "card-chance-back", name: "Chance card (back)", category: "card", Component: () => <EventCard cardId="CH05" faceUp={false} />, viewDistance: 2.8 },
  { id: "card-community-chest", name: "Community Chest card", category: "card", Component: () => <EventCard cardId="CC10" faceUp />, viewDistance: 2.8 },
  { id: "card-community-chest-back", name: "Community Chest card (back)", category: "card", Component: () => <EventCard cardId="CC10" faceUp={false} />, viewDistance: 2.8 },
  { id: "card-property", name: "Property card (Mumbai)", category: "card", Component: () => <PropertyCard tileId="mumbai" />, viewDistance: 2.8 },
  { id: "card-transport", name: "Property card (Indian Railways)", category: "card", Component: () => <PropertyCard tileId="indian-railways" />, viewDistance: 2.8 },
  { id: "card-utility", name: "Property card (Power Grid)", category: "card", Component: () => <PropertyCard tileId="power-grid" />, viewDistance: 2.8 },
];
