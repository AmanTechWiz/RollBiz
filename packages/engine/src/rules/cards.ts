import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { DeckId, PlayerId } from "../types";

/** Draws the top card of `deck`, emits `cardDrawn` and applies its effect. */
export function drawCard(ctx: Ctx, playerId: PlayerId, deck: DeckId, diceTotal: number): void {
  todo("drawCard");
}
