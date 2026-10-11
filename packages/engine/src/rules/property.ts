import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { GameState, PlayerId, TileId } from "../types";

/** Unowned: opens a buy decision. Owned by someone else and not mortgaged: charges rent. */
export function landOnProperty(ctx: Ctx, playerId: PlayerId, tileId: TileId, diceTotal: number): void {
  todo("landOnProperty");
}

/** Rent a visitor owes on `tileId` right now (0 if unowned or mortgaged). */
export function rentFor(state: GameState, tileId: TileId, diceTotal: number): number {
  return todo("rentFor");
}

export function handleBuy(ctx: Ctx, playerId: PlayerId): void {
  todo("handleBuy");
}

export function handleDeclineBuy(ctx: Ctx, playerId: PlayerId): void {
  todo("handleDeclineBuy");
}
