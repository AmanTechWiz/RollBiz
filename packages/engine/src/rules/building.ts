import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { GameState, GroupId, PlayerId, TileId } from "../types";

export function handleBuild(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  todo("handleBuild");
}

export function handleSellBuilding(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  todo("handleSellBuilding");
}

export function handleSellGroupBuildings(ctx: Ctx, playerId: PlayerId, group: GroupId): void {
  todo("handleSellGroupBuildings");
}

/** Sells every building the player owns back to the bank; refunds go to the player. Returns the total refund. */
export function liquidateAllBuildings(ctx: Ctx, playerId: PlayerId): number {
  return todo("liquidateAllBuildings");
}

export function countBuildings(state: GameState, playerId: PlayerId): { houses: number; hotels: number } {
  return todo("countBuildings");
}

export function groupHasBuildings(state: GameState, group: GroupId): boolean {
  return todo("groupHasBuildings");
}
