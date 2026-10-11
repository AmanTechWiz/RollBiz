import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { PlayerId, TileId } from "../types";

export function handleMortgage(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  todo("handleMortgage");
}

export function handleUnmortgage(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  todo("handleUnmortgage");
}
