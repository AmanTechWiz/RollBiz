import type { Debt, GroupId, PropertyState, ResolvedProperty } from "@rollbiz/engine";
import type { GameCtx } from "./types";

/**
 * Cheap client-side legality checks that only decide which buttons are enabled.
 * The server stays the authority and re-validates everything.
 */
export interface Legal {
  alive: boolean;
  playing: boolean;
  myTurn: boolean;
  /** My oldest outstanding debt. */
  myDebt: Debt | undefined;
  /** Nothing else progresses while any debt exists. */
  anyDebt: boolean;
  canRoll: boolean;
  canEndTurn: boolean;
  canBuy: boolean;
  canDecline: boolean;
  canPayFine: boolean;
  canUseCard: boolean;
  canPayDebt: boolean;
  canManage: boolean;
  canTrade: boolean;
}

export function computeLegal({ view, economy, me }: GameCtx): Legal {
  const playing = view.status === "playing";
  const alive = !!me && !me.bankrupt;
  const myTurn = alive && view.turn.playerId === me.id;
  const anyDebt = view.debts.length > 0;
  const myDebt = me ? view.debts.find((d) => d.debtor === me.id) : undefined;
  const { pending, turn } = view;

  const idle = playing && myTurn && !pending && !anyDebt;
  const beforeRoll = idle && !turn.hasRolled;
  const buyPrice = pending?.kind === "buy" ? economy.properties[pending.tileId]?.price : undefined;

  return {
    alive,
    playing,
    myTurn,
    myDebt,
    anyDebt,
    canRoll: idle && (!turn.hasRolled || turn.rollAgain),
    canEndTurn: idle && turn.hasRolled && !turn.rollAgain,
    canBuy: playing && myTurn && buyPrice !== undefined && !!me && me.cash >= buyPrice,
    canDecline: playing && myTurn && pending?.kind === "buy",
    canPayFine: beforeRoll && !!me?.inJail && me.cash >= economy.rules.jailFine,
    canUseCard: beforeRoll && !!me?.inJail && me.jailFreeCards.length > 0,
    canPayDebt: !!myDebt && !!me && me.cash >= myDebt.amount,
    canManage: playing && alive,
    canTrade: playing && alive && economy.rules.tradingEnabled,
  };
}

/** Building level used for even-building checks: hotel counts as 4. */
export function level(p: PropertyState | undefined): number {
  return p ? (p.hotel ? 4 : p.houses) : 0;
}

export function groupLevels(ctx: GameCtx, group: GroupId): number[] {
  return ctx.economy.groups[group].propertyIds.map((id) => level(ctx.view.properties[id]));
}

export function ownsWholeGroup(ctx: GameCtx, group: GroupId): boolean {
  return ctx.economy.groups[group].propertyIds.every((id) => ctx.view.properties[id]?.owner === ctx.meId);
}

export function groupHasBuildings(ctx: GameCtx, group: GroupId): boolean {
  return groupLevels(ctx, group).some((l) => l > 0);
}

export function groupAnyMortgaged(ctx: GameCtx, group: GroupId): boolean {
  return ctx.economy.groups[group].propertyIds.some((id) => ctx.view.properties[id]?.mortgaged);
}

/** Properties a player could put in a trade: nothing built on its colour group. */
export function tradable(ctx: GameCtx, playerId: string): ResolvedProperty[] {
  return ctx.economy.tiles.flatMap((tile) => {
    const prop = ctx.economy.properties[tile.id];
    if (!prop || ctx.view.properties[tile.id]?.owner !== playerId) return [];
    if (prop.kind === "city" && groupHasBuildings(ctx, prop.group)) return [];
    return [prop];
  });
}
