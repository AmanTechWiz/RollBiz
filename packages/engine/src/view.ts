import { todo } from "./core/todo";
import type { DeckId, GameState } from "./types";

/** What clients see: no deck order, no action-id log, no economy (sent once separately). */
export type PublicGameView = Omit<GameState, "decks" | "processedActionIds" | "economy"> & {
  deckSizes: Record<DeckId, number>;
};

export function toPublicView(state: GameState): PublicGameView {
  return todo("toPublicView");
}
