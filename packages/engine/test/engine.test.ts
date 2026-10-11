import { describe, expect, test } from "bun:test";
import { applyAction, applySystemAction } from "../src/engine";
import { newGame, seededRng } from "./helpers";

// Handlers are implemented elsewhere; these tests only exercise the dispatcher's guards,
// which all run before any handler is reached.

describe("applyAction guards", () => {
  test("a duplicate actionId is acknowledged with the same state object", () => {
    const state = newGame();
    state.processedActionIds.push("abc");
    const result = applyAction(state, "p1", { type: "roll", actionId: "abc" }, seededRng());
    expect(result).toEqual({ ok: true, state, events: [], duplicate: true });
    if (result.ok) expect(result.state).toBe(state);
  });

  test("a wrong expectedVersion is rejected", () => {
    const state = newGame();
    const result = applyAction(state, "p1", { type: "roll", expectedVersion: 5 }, seededRng());
    expect(result).toEqual({ ok: false, error: "stale state, please retry" });
  });

  test("the duplicate check runs before the version check", () => {
    const state = newGame();
    state.processedActionIds.push("abc");
    const result = applyAction(state, "p1", { type: "roll", actionId: "abc", expectedVersion: 99 }, seededRng());
    expect(result.ok && result.duplicate).toBe(true);
  });

  test("a finished game rejects actions", () => {
    const state = newGame();
    state.status = "finished";
    expect(applyAction(state, "p1", { type: "roll" }, seededRng()).ok).toBe(false);
    expect(applySystemAction(state, { type: "timeUp" }, seededRng()).ok).toBe(false);
  });

  test("an unknown player is rejected", () => {
    const result = applyAction(newGame(), "ghost", { type: "roll" }, seededRng());
    expect(result).toEqual({ ok: false, error: "you are not in this game" });
  });

  test("a bankrupt actor is rejected", () => {
    const state = newGame({ players: 3 });
    state.players[1]!.bankrupt = true;
    const result = applyAction(state, "p2", { type: "roll" }, seededRng());
    expect(result).toEqual({ ok: false, error: "you are bankrupt" });
  });

  test("a non-debt action while debts exist is rejected, even by the debtor", () => {
    const state = newGame();
    state.debts.push({ id: 100, debtor: "p2", creditor: "p1", amount: 500, reason: "rent" });
    for (const player of ["p1", "p2"]) {
      const result = applyAction(state, player, { type: "endTurn" }, seededRng());
      expect(result).toEqual({ ok: false, error: "outstanding debts must be settled first" });
    }
  });

  test("a debt action by a non-debtor is rejected while debts exist", () => {
    const state = newGame();
    state.debts.push({ id: 100, debtor: "p2", creditor: "p1", amount: 500, reason: "rent" });
    const result = applyAction(state, "p1", { type: "payDebt" }, seededRng());
    expect(result).toEqual({ ok: false, error: "waiting for debts to be settled" });
  });

  test("rejected actions never mutate the input state", () => {
    const state = newGame();
    const snapshot = structuredClone(state);
    applyAction(state, "p1", { type: "roll", expectedVersion: 9 }, seededRng());
    expect(state).toEqual(snapshot);
  });
});
