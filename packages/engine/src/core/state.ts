import type { BaseTile, GameState, PlayerId, PlayerState, PropertyState, ResolvedProperty, TileId } from "../types";
import { todo } from "./todo";

/** Throws RuleError for an unknown player. */
export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  return todo("getPlayer");
}

/** Players not bankrupt, in turn order. */
export function activePlayers(state: GameState): PlayerState[] {
  return todo("activePlayers");
}

/** Throws RuleError if `tileId` is not a city, transport or utility. */
export function getProperty(state: GameState, tileId: TileId): { def: ResolvedProperty; state: PropertyState } {
  return todo("getProperty");
}

export function tileAt(state: GameState, index: number): BaseTile {
  return todo("tileAt");
}

/** Property ids owned by the player, in board order. */
export function ownedBy(state: GameState, playerId: PlayerId): TileId[] {
  return todo("ownedBy");
}

/** Throws RuleError unless the game is playing and it is `playerId`'s turn. */
export function requireTurn(state: GameState, playerId: PlayerId): void {
  todo("requireTurn");
}

/** Throws RuleError if a buy decision or auction is open. */
export function requireNoPending(state: GameState): void {
  todo("requireNoPending");
}

/** Returns the next id from state.nextId and increments it. */
export function nextId(state: GameState): number {
  return todo("nextId");
}
