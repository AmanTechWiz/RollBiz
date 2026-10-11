import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { PlayerId, TileId } from "../types";

/** Opens an auction among all active players for an unowned property. */
export function startAuction(ctx: Ctx, tileId: TileId): void {
  todo("startAuction");
}

export function handleBid(ctx: Ctx, playerId: PlayerId, amount: number): void {
  todo("handleBid");
}

export function handlePassAuction(ctx: Ctx, playerId: PlayerId): void {
  todo("handlePassAuction");
}

/** Removes a bankrupt/forfeiting player from an open auction, finishing it if needed. */
export function removeFromAuction(ctx: Ctx, playerId: PlayerId): void {
  todo("removeFromAuction");
}
