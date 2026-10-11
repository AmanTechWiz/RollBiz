import { RuleError, type Ctx } from "../core/context";
import { pay } from "../core/money";
import { getPlayer, getProperty, requireNoPending, requireTurn } from "../core/state";
import type { GameState, GroupId, PlayerId, PropertyState, ResolvedCity, ResolvedGroup, TileId } from "../types";

/** Houses on a property that has just been upgraded to, or is about to drop from, a hotel. */
const HOUSES_PER_HOTEL = 3;
const HOTEL_LEVEL = 4;

/** 0..3 = houses, 4 = hotel. */
function levelOf(prop: PropertyState): number {
  return prop.hotel ? HOTEL_LEVEL : prop.houses;
}

function setLevel(prop: PropertyState, level: number): void {
  prop.hotel = level === HOTEL_LEVEL;
  prop.houses = prop.hotel ? 0 : level;
}

/** Throws unless `tileId` is a city; returns its definition and group. */
function getCity(state: GameState, tileId: TileId): { city: ResolvedCity; group: ResolvedGroup; prop: PropertyState } {
  const { def, state: prop } = getProperty(state, tileId);
  if (def.kind !== "city") throw new RuleError("you can only build on cities");
  return { city: def, group: state.economy.groups[def.group], prop };
}

function requireOwner(prop: PropertyState, playerId: PlayerId): void {
  if (prop.owner !== playerId) throw new RuleError("you do not own that property");
}

function groupLevels(state: GameState, group: ResolvedGroup): number[] {
  return group.propertyIds.map((id) => levelOf(getProperty(state, id).state));
}

function ownsWholeGroup(state: GameState, group: ResolvedGroup, playerId: PlayerId): boolean {
  return group.propertyIds.every((id) => getProperty(state, id).state.owner === playerId);
}

/**
 * Selling and mortgaging: a debtor may act any time debts exist; otherwise it must be
 * the player's turn with no open buy decision or auction.
 */
export function requireSellAccess(state: GameState, playerId: PlayerId): void {
  if (state.debts.some((d) => d.debtor === playerId)) return;
  requireTurn(state, playerId);
  requireNoPending(state);
}

/** Building and unmortgaging: the player's turn, nothing pending, and no debts at all. */
export function requireBuildAccess(state: GameState, playerId: PlayerId): void {
  requireTurn(state, playerId);
  requireNoPending(state);
  if (state.debts.length > 0) throw new RuleError("settle outstanding debts first");
}

export function handleBuild(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  const { state } = ctx;
  requireBuildAccess(state, playerId);
  const { group, prop } = getCity(state, tileId);
  requireOwner(prop, playerId);
  if (!ownsWholeGroup(state, group, playerId)) {
    throw new RuleError(`you must own the whole ${group.name} group to build`);
  }
  if (group.propertyIds.some((id) => getProperty(state, id).state.mortgaged)) {
    throw new RuleError("unmortgage the whole group before building");
  }

  const current = levelOf(prop);
  if (current === HOTEL_LEVEL) throw new RuleError("that property already has a hotel");
  if (current > Math.min(...groupLevels(state, group))) {
    throw new RuleError("build evenly: build on another property first");
  }

  const upgradingToHotel = current === HOUSES_PER_HOTEL;
  if (upgradingToHotel) {
    if (state.bank.hotels < 1) throw new RuleError("the bank has no hotels left");
  } else if (state.bank.houses < 1) {
    throw new RuleError("the bank has no houses left");
  }

  const cost = upgradingToHotel ? group.hotelCost : group.houseCost;
  if (getPlayer(state, playerId).cash < cost) throw new RuleError("not enough cash");
  pay(ctx, playerId, "bank", cost, upgradingToHotel ? `hotel on ${tileId}` : `house on ${tileId}`);

  if (upgradingToHotel) {
    state.bank.hotels -= 1;
    state.bank.houses += HOUSES_PER_HOTEL;
  } else {
    state.bank.houses -= 1;
  }
  setLevel(prop, current + 1);
  ctx.emit({ type: "built", playerId, tileId, houses: prop.houses, hotel: prop.hotel });
}

function refundOf(ctx: Ctx, cost: number): number {
  return Math.floor(cost * ctx.state.economy.rules.buildingRefundRate);
}

export function handleSellBuilding(ctx: Ctx, playerId: PlayerId, tileId: TileId): void {
  const { state } = ctx;
  requireSellAccess(state, playerId);
  const { group, prop } = getCity(state, tileId);
  requireOwner(prop, playerId);

  const current = levelOf(prop);
  if (current === 0) throw new RuleError("there is nothing to sell on that property");
  if (current < Math.max(...groupLevels(state, group))) {
    throw new RuleError("sell evenly: sell from a more built-up property first");
  }

  const sellingHotel = current === HOTEL_LEVEL;
  if (sellingHotel && state.bank.houses < HOUSES_PER_HOTEL) {
    throw new RuleError("the bank needs 3 houses to replace the hotel; sell the whole group instead");
  }

  const refund = refundOf(ctx, sellingHotel ? group.hotelCost : group.houseCost);
  if (sellingHotel) {
    state.bank.hotels += 1;
    state.bank.houses -= HOUSES_PER_HOTEL;
  } else {
    state.bank.houses += 1;
  }
  setLevel(prop, current - 1);
  pay(ctx, "bank", playerId, refund, `sold ${sellingHotel ? "hotel" : "house"} on ${tileId}`);
  ctx.emit({ type: "buildingSold", playerId, tileId, houses: prop.houses, hotel: prop.hotel, refund });
}

/** Sells every building on the player's properties in `group`. Returns the total refund. */
function sellAllInGroup(ctx: Ctx, playerId: PlayerId, group: ResolvedGroup): number {
  const { state } = ctx;
  let total = 0;
  for (const tileId of group.propertyIds) {
    const prop = getProperty(state, tileId).state;
    if (prop.owner !== playerId || levelOf(prop) === 0) continue;
    let refund: number;
    if (prop.hotel) {
      refund = refundOf(ctx, group.hotelCost + HOUSES_PER_HOTEL * group.houseCost);
      state.bank.hotels += 1;
    } else {
      refund = prop.houses * refundOf(ctx, group.houseCost);
      state.bank.houses += prop.houses;
    }
    setLevel(prop, 0);
    pay(ctx, "bank", playerId, refund, `sold buildings on ${tileId}`);
    ctx.emit({ type: "buildingSold", playerId, tileId, houses: 0, hotel: false, refund });
    total += refund;
  }
  return total;
}

export function handleSellGroupBuildings(ctx: Ctx, playerId: PlayerId, groupId: GroupId): void {
  const { state } = ctx;
  requireSellAccess(state, playerId);
  const group = state.economy.groups[groupId];
  if (!ownsWholeGroup(state, group, playerId)) throw new RuleError("you do not own that whole group");
  if (!groupHasBuildings(state, groupId)) throw new RuleError("there are no buildings to sell in that group");
  sellAllInGroup(ctx, playerId, group);
}

/** Sells every building the player owns back to the bank; refunds go to the player. Returns the total refund. */
export function liquidateAllBuildings(ctx: Ctx, playerId: PlayerId): number {
  let total = 0;
  for (const group of Object.values(ctx.state.economy.groups)) {
    total += sellAllInGroup(ctx, playerId, group);
  }
  return total;
}

export function countBuildings(state: GameState, playerId: PlayerId): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const prop of Object.values(state.properties)) {
    if (prop.owner !== playerId) continue;
    houses += prop.houses;
    if (prop.hotel) hotels += 1;
  }
  return { houses, hotels };
}

export function groupHasBuildings(state: GameState, group: GroupId): boolean {
  return state.economy.groups[group].propertyIds.some((id) => levelOf(getProperty(state, id).state) > 0);
}
