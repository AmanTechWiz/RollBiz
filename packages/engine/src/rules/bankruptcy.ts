import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { GameState, PlayerId } from "../types";

/** Pays the player's oldest outstanding debt in full, if they now have the cash. */
export function handlePayDebt(ctx: Ctx, playerId: PlayerId): void {
  todo("handlePayDebt");
}

/** Only allowed while the player has an outstanding debt. */
export function handleDeclareBankruptcy(ctx: Ctx, playerId: PlayerId): void {
  todo("handleDeclareBankruptcy");
}

/** Player left the game for good: bankrupt to the bank. */
export function handleForfeit(ctx: Ctx, playerId: PlayerId): void {
  todo("handleForfeit");
}

/** Timed mode: ends the game, highest net worth wins. */
export function handleTimeUp(ctx: Ctx): void {
  todo("handleTimeUp");
}

/** cash + price of unmortgaged properties + mortgage value of mortgaged ones + cost of buildings. */
export function netWorth(state: GameState, playerId: PlayerId): number {
  return todo("netWorth");
}
