import type { BaseTile, GameState, PlayerId, PlayerState, PropertyState, ResolvedProperty, TileId } from "../types";
import { RuleError } from "./context";

/** Throws RuleError for an unknown player. */
export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new RuleError("unknown player");
  return player;
}

/** Players not bankrupt, in turn order. */
export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.bankrupt);
}

/** Throws RuleError if `tileId` is not a city, transport or utility. */
export function getProperty(state: GameState, tileId: TileId): { def: ResolvedProperty; state: PropertyState } {
  const def = state.economy.properties[tileId];
  const propState = state.properties[tileId];
  if (!def || !propState) throw new RuleError("that tile is not a property");
  return { def, state: propState };
}

export function tileAt(state: GameState, index: number): BaseTile {
  const tile = state.economy.tiles[index];
  if (!tile) throw new Error(`no tile at index ${index}`);
  return tile;
}

/** Property ids owned by the player, in board order. */
export function ownedBy(state: GameState, playerId: PlayerId): TileId[] {
  return state.economy.tiles.filter((t) => state.properties[t.id]?.owner === playerId).map((t) => t.id);
}

/** Throws RuleError unless the game is playing and it is `playerId`'s turn. */
export function requireTurn(state: GameState, playerId: PlayerId): void {
  if (state.status !== "playing") throw new RuleError("the game is over");
  if (state.turn.playerId !== playerId) throw new RuleError("it is not your turn");
}

/** Throws RuleError if a buy decision or auction is open. */
export function requireNoPending(state: GameState): void {
  if (state.pending) throw new RuleError("finish the open buy decision or auction first");
}

/** Returns the next id from state.nextId and increments it. */
export function nextId(state: GameState): number {
  return state.nextId++;
}
