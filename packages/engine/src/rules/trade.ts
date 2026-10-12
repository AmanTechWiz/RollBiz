import type { ActionOf } from "../actions";
import { RuleError, type Ctx } from "../core/context";
import { pay } from "../core/money";
import { getPlayer, getProperty, nextId, requireNoPending } from "../core/state";
import type { PlayerId, TradeBundle, TradeOffer } from "../types";
import { groupHasBuildings } from "./building";

function requireTradingEnabled(ctx: Ctx): void {
  if (!ctx.state.economy.rules.tradingEnabled) throw new RuleError("trading is turned off in this room");
}

function isEmpty(bundle: TradeBundle): boolean {
  return bundle.cash === 0 && bundle.properties.length === 0 && bundle.jailFreeCards.length === 0;
}

function requireBothActive(ctx: Ctx, a: PlayerId, b: PlayerId): void {
  if (getPlayer(ctx.state, a).bankrupt || getPlayer(ctx.state, b).bankrupt) {
    throw new RuleError("both players must still be in the game");
  }
}

/** Checks that `ownerId` really can give everything in `bundle`. Throws RuleError otherwise. */
function validateSide(ctx: Ctx, ownerId: PlayerId, bundle: TradeBundle): void {
  const { state } = ctx;
  const owner = getPlayer(state, ownerId);

  if (bundle.cash > owner.cash) throw new RuleError(`${owner.name} does not have enough cash for this trade`);

  if (new Set(bundle.properties).size !== bundle.properties.length) {
    throw new RuleError("a property is listed twice");
  }
  for (const tileId of bundle.properties) {
    const { def, state: prop } = getProperty(state, tileId);
    if (prop.owner !== ownerId) throw new RuleError(`${def.name} is not owned by ${owner.name}`);
    if (def.kind === "city" && groupHasBuildings(state, def.group)) {
      throw new RuleError(`${def.name} cannot be traded while its colour group has buildings`);
    }
  }

  if (new Set(bundle.jailFreeCards).size !== bundle.jailFreeCards.length) {
    throw new RuleError("a card is listed twice");
  }
  for (const cardId of bundle.jailFreeCards) {
    if (!owner.jailFreeCards.includes(cardId)) {
      throw new RuleError(`${owner.name} does not hold that Get Out of Jail Free card`);
    }
  }
}

function validateTrade(ctx: Ctx, trade: Pick<TradeOffer, "from" | "to" | "give" | "get">): void {
  requireBothActive(ctx, trade.from, trade.to);
  validateSide(ctx, trade.from, trade.give);
  validateSide(ctx, trade.to, trade.get);
}

function findTrade(ctx: Ctx, tradeId: number): TradeOffer {
  const trade = ctx.state.trades.find((t) => t.id === tradeId);
  if (!trade) throw new RuleError("that trade is no longer open");
  return trade;
}

function removeTrade(ctx: Ctx, tradeId: number): void {
  ctx.state.trades = ctx.state.trades.filter((t) => t.id !== tradeId);
}

function cloneBundle(bundle: TradeBundle): TradeBundle {
  return { cash: bundle.cash, properties: [...bundle.properties], jailFreeCards: [...bundle.jailFreeCards] };
}

export function handleProposeTrade(ctx: Ctx, playerId: PlayerId, action: ActionOf<"proposeTrade">): void {
  const { state } = ctx;
  requireTradingEnabled(ctx);
  requireNoPending(state);
  if (action.to === playerId) throw new RuleError("you cannot trade with yourself");
  if (isEmpty(action.give) && isEmpty(action.get)) throw new RuleError("a trade cannot be empty");
  getPlayer(state, action.to);

  const offer = { from: playerId, to: action.to, give: cloneBundle(action.give), get: cloneBundle(action.get) };
  validateTrade(ctx, offer);

  const trade: TradeOffer = { id: nextId(state), ...offer };
  state.trades.push(trade);
  ctx.emit({ type: "tradeProposed", tradeId: trade.id, from: trade.from, to: trade.to });
}

export function handleAcceptTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  const { state } = ctx;
  const trade = findTrade(ctx, tradeId);
  if (trade.to !== playerId) throw new RuleError("only the player the trade was offered to can accept it");
  requireTradingEnabled(ctx);
  requireNoPending(state);
  validateTrade(ctx, trade); // throws before anything changes, leaving the trade open

  const from = getPlayer(state, trade.from);
  const to = getPlayer(state, trade.to);

  // Both sides were validated against the current balances, so neither payment can become a debt.
  pay(ctx, trade.from, trade.to, trade.give.cash, "trade");
  pay(ctx, trade.to, trade.from, trade.get.cash, "trade");

  for (const tileId of trade.give.properties) getProperty(state, tileId).state.owner = trade.to;
  for (const tileId of trade.get.properties) getProperty(state, tileId).state.owner = trade.from;

  from.jailFreeCards = [...from.jailFreeCards.filter((c) => !trade.give.jailFreeCards.includes(c)), ...trade.get.jailFreeCards];
  to.jailFreeCards = [...to.jailFreeCards.filter((c) => !trade.get.jailFreeCards.includes(c)), ...trade.give.jailFreeCards];

  removeTrade(ctx, tradeId);
  ctx.emit({ type: "tradeAccepted", tradeId });
}

export function handleRejectTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  const trade = findTrade(ctx, tradeId);
  if (trade.to !== playerId) throw new RuleError("only the player the trade was offered to can reject it");
  removeTrade(ctx, tradeId);
  ctx.emit({ type: "tradeRejected", tradeId });
}

export function handleCancelTrade(ctx: Ctx, playerId: PlayerId, tradeId: number): void {
  const trade = findTrade(ctx, tradeId);
  if (trade.from !== playerId) throw new RuleError("only the player who proposed the trade can cancel it");
  removeTrade(ctx, tradeId);
  ctx.emit({ type: "tradeCancelled", tradeId });
}

/** Drops every open trade involving the player (bankruptcy / forfeit). */
export function dropTradesFor(ctx: Ctx, playerId: PlayerId): void {
  const dropped = ctx.state.trades.filter((t) => t.from === playerId || t.to === playerId);
  ctx.state.trades = ctx.state.trades.filter((t) => t.from !== playerId && t.to !== playerId);
  for (const trade of dropped) ctx.emit({ type: "tradeCancelled", tradeId: trade.id });
}
