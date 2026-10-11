import type { Party, PlayerId } from "../types";
import type { Ctx } from "./context";
import { activePlayers, getPlayer, nextId } from "./state";

function record(ctx: Ctx, from: Party, to: Party, amount: number, reason: string): void {
  ctx.state.ledger.push({ seq: nextId(ctx.state), from, to, amount, reason });
}

/**
 * Moves `amount` from one party to another and records it in the ledger.
 * Returns true if paid. If a player can't cover it, nothing moves: a Debt is queued
 * (and `debtCreated` emitted) and false is returned. The bank never fails: it
 * replenishes itself via a logged `bankReplenished` entry when short. amount <= 0 is a no-op.
 */
export function pay(ctx: Ctx, from: Party, to: Party, amount: number, reason: string): boolean {
  if (amount <= 0) return true;
  const { state } = ctx;

  if (from === "bank") {
    const shortfall = amount - state.bank.cash;
    if (shortfall > 0) {
      state.bank.cash += shortfall;
      record(ctx, "bank", "bank", shortfall, "bank replenishment");
      ctx.emit({ type: "bankReplenished", amount: shortfall });
    }
    state.bank.cash -= amount;
  } else {
    const payer = getPlayer(state, from);
    if (payer.cash < amount) {
      const debt = { id: nextId(state), debtor: from, creditor: to, amount, reason };
      state.debts.push(debt);
      ctx.emit({ type: "debtCreated", debt });
      return false;
    }
    payer.cash -= amount;
  }

  if (to === "bank") state.bank.cash += amount;
  else getPlayer(state, to).cash += amount;

  record(ctx, from, to, amount, reason);
  ctx.emit({ type: "paid", from, to, amount, reason });
  return true;
}

/**
 * `direction: "collect"`: every other active player pays `playerId` `amount` each.
 * `direction: "pay"`: `playerId` pays every other active player `amount` each.
 * Each payment goes through `pay`, so shortfalls become separate debts.
 */
export function payEachOther(
  ctx: Ctx,
  playerId: PlayerId,
  amount: number,
  direction: "collect" | "pay",
  reason: string,
): void {
  for (const other of activePlayers(ctx.state)) {
    if (other.id === playerId) continue;
    if (direction === "collect") pay(ctx, other.id, playerId, amount, reason);
    else pay(ctx, playerId, other.id, amount, reason);
  }
}
