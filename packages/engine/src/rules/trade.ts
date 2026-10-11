import type { ActionOf } from "../actions";
import type { Ctx } from "../core/context";
import { todo } from "../core/todo";
import type { PlayerId } from "../types";

export function handleProposeTrade(ctx: Ctx, playerId: PlayerId, action: ActionOf<"proposeTrade">): void {
  todo("handleProposeTrade");
}

export function handleAcceptTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  todo("handleAcceptTrade");
}

export function handleRejectTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  todo("handleRejectTrade");
}

export function handleCancelTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  todo("handleCancelTrade");
}

/** Drops every open trade involving the player (bankruptcy / forfeit). */
export function dropTradesFor(ctx: Ctx, playerId: PlayerId): void {
  todo("dropTradesFor");
}
