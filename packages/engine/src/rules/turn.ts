import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { PlayerId } from "../types";

export function handleRoll(ctx: Ctx, playerId: PlayerId): void {
  todo("handleRoll");
}

export function handleEndTurn(ctx: Ctx, playerId: PlayerId): void {
  todo("handleEndTurn");
}

export function handlePayJailFine(ctx: Ctx, playerId: PlayerId): void {
  todo("handlePayJailFine");
}

export function handleUseJailCard(ctx: Ctx, playerId: PlayerId): void {
  todo("handleUseJailCard");
}

/**
 * Moves a player forward (clockwise) by steps, or forward to a tile index.
 * Awards the Start bonus once if the move passes or lands on Start. Emits `moved`.
 * Does not resolve the landing.
 */
export function movePlayer(ctx: Ctx, playerId: PlayerId, target: { steps: number } | { to: number }): void {
  todo("movePlayer");
}

/** Resolves the tile the player is standing on. `diceTotal` is used for utility rent. */
export function resolveLanding(ctx: Ctx, playerId: PlayerId, diceTotal: number): void {
  todo("resolveLanding");
}

export function sendToJail(ctx: Ctx, playerId: PlayerId): void {
  todo("sendToJail");
}

/** Passes the turn to the next non-bankrupt player in order and emits `turnStarted`. */
export function startNextTurn(ctx: Ctx): void {
  todo("startNextTurn");
}
