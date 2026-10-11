import type { Party, PlayerId } from "../types";
import type { Ctx } from "./context";
import { todo } from "./todo";

/**
 * Moves `amount` from one party to another and records it in the ledger.
 * Returns true if paid. If a player can't cover it, nothing moves: a Debt is queued
 * (and `debtCreated` emitted) and false is returned. The bank never fails: it
 * replenishes itself via a logged `bankReplenished` entry when short. amount <= 0 is a no-op.
 */
export function pay(ctx: Ctx, from: Party, to: Party, amount: number, reason: string): boolean {
  return todo("pay");
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
  todo("payEachOther");
}
