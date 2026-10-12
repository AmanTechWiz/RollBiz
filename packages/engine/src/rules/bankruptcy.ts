import { RuleError, type Ctx } from "../core/context";
import { pay } from "../core/money";
import { activePlayers, getPlayer, getProperty, ownedBy } from "../core/state";
import type { DeckId, GameState, Party, PlayerId } from "../types";
import { removeFromAuction } from "./auction";
import { liquidateAllBuildings } from "./building";
import { dropTradesFor } from "./trade";
import { startNextTurn } from "./turn";

/** Pays the player's oldest outstanding debt in full, if they now have the cash. */
export function handlePayDebt(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  const player = getPlayer(state, playerId);
  const debt = state.debts.find((d) => d.debtor === playerId);
  if (!debt) throw new RuleError("you have no debt to pay");
  if (player.cash < debt.amount) throw new RuleError("not enough cash to pay this debt");

  // Remove first so `pay` (which cannot fail now) does not see a stale debt.
  state.debts = state.debts.filter((d) => d.id !== debt.id);
  pay(ctx, playerId, debt.creditor, debt.amount, debt.reason);
  ctx.emit({ type: "debtPaid", debtId: debt.id });
}

/** Only allowed while the player has an outstanding debt. */
export function handleDeclareBankruptcy(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  const oldest = state.debts.find((d) => d.debtor === playerId);
  if (!oldest) throw new RuleError("you can only declare bankruptcy while you owe a debt");
  bankrupt(ctx, playerId, oldest.creditor);
}

/** Player left the game for good: bankrupt to the bank. */
export function handleForfeit(ctx: Ctx, playerId: PlayerId): void {
  bankrupt(ctx, playerId, "bank");
}

/** Timed mode: ends the game, highest net worth wins. */
export function handleTimeUp(ctx: Ctx): void {
  const { state } = ctx;
  let winnerId: PlayerId | null = null;
  let best = -Infinity;
  for (const player of activePlayers(state)) {
    const worth = netWorth(state, player.id);
    if (worth > best) {
      best = worth;
      winnerId = player.id; // strict ">" keeps the earliest player in turn order on ties
    }
  }
  state.status = "finished";
  state.winnerId = winnerId;
  ctx.emit({ type: "gameOver", winnerId, reason: "timeUp" });
}

/** cash + price of unmortgaged properties + mortgage value of mortgaged ones + cost of buildings. */
export function netWorth(state: GameState, playerId: PlayerId): number {
  let total = getPlayer(state, playerId).cash;
  for (const tileId of ownedBy(state, playerId)) {
    const { def, state: prop } = getProperty(state, tileId);
    total += prop.mortgaged ? def.mortgage : def.price;
    if (def.kind === "city") {
      total += prop.houses * def.houseCost;
      if (prop.hotel) total += def.hotelCost + 3 * def.houseCost;
    }
  }
  return total;
}

/** Takes the player out of the game, handing their assets to `creditor`. */
function bankrupt(ctx: Ctx, playerId: PlayerId, creditor: Party): void {
  const { state } = ctx;
  const player = getPlayer(state, playerId);
  if (player.bankrupt) throw new RuleError("that player is already bankrupt");

  removeFromAuction(ctx, playerId);
  dropTradesFor(ctx, playerId);

  // Selling buildings first: their refund is part of what the creditor receives.
  liquidateAllBuildings(ctx, playerId);

  pay(ctx, playerId, creditor, player.cash, "bankruptcy");

  for (const tileId of ownedBy(state, playerId)) {
    const prop = getProperty(state, tileId).state;
    if (creditor === "bank") {
      prop.owner = null;
      prop.mortgaged = false;
      prop.houses = 0;
      prop.hotel = false;
    } else {
      prop.owner = creditor;
    }
  }

  if (creditor === "bank") {
    for (const cardId of player.jailFreeCards) {
      state.decks[deckOf(state, cardId)].push(cardId);
    }
  } else {
    getPlayer(state, creditor).jailFreeCards.push(...player.jailFreeCards);
  }
  player.jailFreeCards = [];

  player.cash = 0;
  player.bankrupt = true;

  // Debts they owed vanish with them; debts owed to them now go to the bank.
  state.debts = state.debts.filter((d) => d.debtor !== playerId);
  for (const debt of state.debts) {
    if (debt.creditor === playerId) debt.creditor = "bank";
  }

  ctx.emit({ type: "bankrupt", playerId, creditor });

  if (state.pending?.kind === "buy" && state.turn.playerId === playerId) state.pending = null;

  const remaining = activePlayers(state);
  if (remaining.length <= 1) {
    const winner = remaining[0]?.id ?? null;
    state.status = "finished";
    state.winnerId = winner;
    ctx.emit({ type: "gameOver", winnerId: winner, reason: "elimination" });
    return;
  }

  if (state.turn.playerId === playerId) startNextTurn(ctx);
}

function deckOf(state: GameState, cardId: string): DeckId {
  return state.economy.cards[cardId]?.deck ?? (cardId.startsWith("CC") ? "communityChest" : "chance");
}
