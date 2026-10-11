import { RuleError, type Ctx } from "../core/context";
import { pay } from "../core/money";
import { getPlayer, getProperty } from "../core/state";
import type { PlayerId, TileId } from "../types";
import { groupHasBuildings, requireBuildAccess, requireSellAccess } from "./building";

export function handleMortgage(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  const { state } = ctx;
  requireSellAccess(state, playerId);
  const { def, state: prop } = getProperty(state, tileId);
  if (prop.owner !== playerId) throw new RuleError("you do not own that property");
  if (prop.mortgaged) throw new RuleError("that property is already mortgaged");
  if (def.kind === "city" && groupHasBuildings(state, def.group)) {
    throw new RuleError("sell the buildings in this group first");
  }
  prop.mortgaged = true;
  pay(ctx, "bank", playerId, def.mortgage, `mortgage ${tileId}`);
  ctx.emit({ type: "mortgaged", playerId, tileId, amount: def.mortgage });
}

export function handleUnmortgage(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  const { state } = ctx;
  requireBuildAccess(state, playerId);
  const { def, state: prop } = getProperty(state, tileId);
  if (prop.owner !== playerId) throw new RuleError("you do not own that property");
  if (!prop.mortgaged) throw new RuleError("that property is not mortgaged");
  if (getPlayer(state, playerId).cash < def.unmortgageCost) throw new RuleError("not enough cash");
  pay(ctx, playerId, "bank", def.unmortgageCost, `unmortgage ${tileId}`);
  prop.mortgaged = false;
  ctx.emit({ type: "unmortgaged", playerId, tileId, amount: def.unmortgageCost });
}
