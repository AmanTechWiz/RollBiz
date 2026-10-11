import type { Ctx } from "../core/context";
import { RuleError } from "../core/context";
import { pay } from "../core/money";
import { getPlayer, getProperty, requireTurn } from "../core/state";
import type { GameState, PlayerId, TileId } from "../types";
import { startAuction } from "./auction";

/** Number of properties of `kind` the player owns, mortgaged ones included. */
function countOwned(state: GameState, playerId: PlayerId, kind: "transport" | "utility"): number {
  return Object.values(state.economy.properties).filter(
    (def) => def.kind === kind && state.properties[def.id]?.owner === playerId,
  ).length;
}

/** Unowned: opens a buy decision. Owned by someone else and not mortgaged: charges rent. */
export function landOnProperty(ctx: Ctx, playerId: PlayerId, tileId: TileId, diceTotal: number): void {
  const { state } = ctx;
  const { def, state: prop } = getProperty(state, tileId);
  if (prop.owner === null) {
    state.pending = { kind: "buy", tileId };
    return;
  }
  if (prop.owner === playerId) return;
  const rent = rentFor(state, tileId, diceTotal);
  if (rent > 0) pay(ctx, playerId, prop.owner, rent, `rent: ${def.name}`);
}

/** Rent a visitor owes on `tileId` right now (0 if unowned or mortgaged). */
export function rentFor(state: GameState, tileId: TileId, diceTotal: number): number {
  const { def, state: prop } = getProperty(state, tileId);
  if (prop.owner === null || prop.mortgaged) return 0;
  switch (def.kind) {
    case "city":
      return prop.hotel ? def.rents[4] : (def.rents[prop.houses] ?? 0);
    case "transport": {
      const count = countOwned(state, prop.owner, "transport");
      return def.rents[count - 1] ?? 0;
    }
    case "utility": {
      const count = countOwned(state, prop.owner, "utility");
      const multiplier = state.economy.rules.utilityMultipliers[count >= 2 ? 1 : 0];
      return multiplier * diceTotal;
    }
  }
}

export function handleBuy(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  requireTurn(state, playerId);
  const pending = state.pending;
  if (pending?.kind !== "buy") throw new RuleError("there is nothing to buy");
  const { def, state: prop } = getProperty(state, pending.tileId);
  const player = getPlayer(state, playerId);
  if (player.cash < def.price) throw new RuleError("not enough cash");
  pay(ctx, playerId, "bank", def.price, `bought ${def.name}`);
  prop.owner = playerId;
  state.pending = null;
  ctx.emit({ type: "bought", playerId, tileId: pending.tileId, price: def.price });
}

export function handleDeclineBuy(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  requireTurn(state, playerId);
  const pending = state.pending;
  if (pending?.kind !== "buy") throw new RuleError("there is nothing to decline");
  if (state.economy.rules.auctionsEnabled) {
    startAuction(ctx, pending.tileId);
  } else {
    state.pending = null;
  }
}
