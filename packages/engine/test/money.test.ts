import { describe, expect, test } from "bun:test";
import { pay, payEachOther } from "../src/core/money";
import { activePlayers, getPlayer, getProperty, nextId, ownedBy, requireNoPending, requireTurn, tileAt } from "../src/core/state";
import { RuleError } from "../src/core/context";
import { makeCtx, newGame } from "./helpers";

function setup(players = 2) {
  const state = newGame({ players });
  return { state, ctx: makeCtx(state) };
}

describe("pay", () => {
  test("player to player moves cash and writes a ledger row", () => {
    const { state, ctx } = setup();
    const ledgerBefore = state.ledger.length;
    expect(pay(ctx, "p1", "p2", 700, "rent")).toBe(true);
    expect(state.players[0]?.cash).toBe(19_300);
    expect(state.players[1]?.cash).toBe(20_700);
    expect(state.ledger).toHaveLength(ledgerBefore + 1);
    expect(state.ledger.at(-1)).toMatchObject({ from: "p1", to: "p2", amount: 700, reason: "rent" });
    expect(ctx.events).toEqual([{ type: "paid", from: "p1", to: "p2", amount: 700, reason: "rent" }]);
  });

  test("ledger seq values are unique and increasing", () => {
    const { state, ctx } = setup();
    pay(ctx, "p1", "p2", 100, "a");
    pay(ctx, "p2", "bank", 100, "b");
    const seqs = state.ledger.map((l) => l.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test("paying the bank and being paid by the bank", () => {
    const { state, ctx } = setup();
    const bankBefore = state.bank.cash;
    expect(pay(ctx, "p1", "bank", 500, "income tax")).toBe(true);
    expect(state.bank.cash).toBe(bankBefore + 500);
    expect(pay(ctx, "bank", "p1", 2000, "start")).toBe(true);
    expect(state.bank.cash).toBe(bankBefore - 1500);
    expect(state.players[0]?.cash).toBe(21_500);
  });

  test("a shortfall moves nothing, queues a debt and returns false", () => {
    const { state, ctx } = setup();
    expect(pay(ctx, "p1", "p2", 25_000, "rent")).toBe(false);
    expect(state.players[0]?.cash).toBe(20_000);
    expect(state.players[1]?.cash).toBe(20_000);
    expect(state.debts).toHaveLength(1);
    const debt = state.debts[0]!;
    expect(debt).toMatchObject({ debtor: "p1", creditor: "p2", amount: 25_000, reason: "rent" });
    expect(ctx.events).toEqual([{ type: "debtCreated", debt }]);
    const ledgerBefore = state.ledger.length;
    pay(ctx, "p1", "p2", 25_000, "again");
    expect(state.ledger).toHaveLength(ledgerBefore);
    expect(state.debts.map((d) => d.id)).toEqual([debt.id, debt.id + 1]);
  });

  test("the debtCreated event carries a copy, not the queued debt", () => {
    const { state, ctx } = setup();
    pay(ctx, "p1", "p2", 25_000, "rent");
    const event = ctx.events[0];
    expect(event?.type === "debtCreated" && event.debt).toEqual(state.debts[0]!);
    expect(event?.type === "debtCreated" && event.debt).not.toBe(state.debts[0]!);
  });

  test("an unknown recipient throws before anything moves", () => {
    const { state, ctx } = setup();
    const ledgerBefore = state.ledger.length;
    expect(() => pay(ctx, "p1", "nobody", 100, "x")).toThrow();
    expect(state.players[0]?.cash).toBe(20_000);
    expect(state.ledger).toHaveLength(ledgerBefore);
    expect(() => pay(ctx, "bank", "nobody", 100, "x")).toThrow();
    expect(state.bank.cash).toBe(1_000_000 - 40_000);
  });

  test("an exact balance is payable", () => {
    const { state, ctx } = setup();
    expect(pay(ctx, "p1", "bank", 20_000, "all in")).toBe(true);
    expect(state.players[0]?.cash).toBe(0);
  });

  test("a short bank is replenished by exactly the shortfall and logged first", () => {
    const { state, ctx } = setup();
    state.bank.cash = 300;
    expect(pay(ctx, "bank", "p1", 1000, "start")).toBe(true);
    expect(state.bank.cash).toBe(0);
    expect(state.players[0]?.cash).toBe(21_000);
    const [replenish, payment] = state.ledger.slice(-2);
    expect(replenish).toMatchObject({ from: "bank", to: "bank", amount: 700, reason: "bank replenishment" });
    expect(payment).toMatchObject({ from: "bank", to: "p1", amount: 1000 });
    expect(ctx.events[0]).toEqual({ type: "bankReplenished", amount: 700 });
    expect(ctx.events[1]).toMatchObject({ type: "paid", from: "bank", to: "p1", amount: 1000 });
  });

  test("a bank with enough cash is not replenished", () => {
    const { state, ctx } = setup();
    state.bank.cash = 1000;
    pay(ctx, "bank", "p1", 1000, "x");
    expect(ctx.events.some((e) => e.type === "bankReplenished")).toBe(false);
  });

  test("amount 0 is a no-op", () => {
    const { state, ctx } = setup();
    const ledgerBefore = state.ledger.length;
    expect(pay(ctx, "p1", "p2", 0, "nothing")).toBe(true);
    expect(state.ledger).toHaveLength(ledgerBefore);
    expect(ctx.events).toHaveLength(0);
    expect(state.debts).toHaveLength(0);
  });
});

describe("payEachOther", () => {
  test("collect: every other active player pays", () => {
    const { state, ctx } = setup(3);
    payEachOther(ctx, "p1", 300, "collect", "festival");
    expect(state.players.map((p) => p.cash)).toEqual([20_600, 19_700, 19_700]);
  });

  test("pay: the player pays every other active player", () => {
    const { state, ctx } = setup(3);
    payEachOther(ctx, "p1", 300, "pay", "donation");
    expect(state.players.map((p) => p.cash)).toEqual([19_400, 20_300, 20_300]);
  });

  test("bankrupt players are skipped", () => {
    const { state, ctx } = setup(3);
    state.players[2]!.bankrupt = true;
    payEachOther(ctx, "p1", 300, "collect", "x");
    expect(state.players.map((p) => p.cash)).toEqual([20_300, 19_700, 20_000]);
    payEachOther(ctx, "p1", 300, "pay", "x");
    expect(state.players.map((p) => p.cash)).toEqual([20_000, 20_000, 20_000]);
  });

  test("shortfalls become separate debts", () => {
    const { state, ctx } = setup(4);
    state.players[1]!.cash = 0;
    state.players[2]!.cash = 0;
    payEachOther(ctx, "p1", 300, "collect", "x");
    expect(state.debts.map((d) => d.debtor)).toEqual(["p2", "p3"]);
    expect(state.players[0]?.cash).toBe(20_300);
  });
});

describe("state helpers", () => {
  test("getPlayer / activePlayers", () => {
    const { state } = setup(3);
    expect(getPlayer(state, "p2").id).toBe("p2");
    expect(() => getPlayer(state, "nobody")).toThrow(RuleError);
    state.players[1]!.bankrupt = true;
    expect(activePlayers(state).map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  test("getProperty / tileAt", () => {
    const { state } = setup();
    const { def, state: ps } = getProperty(state, "patna");
    expect(def.price).toBe(2000);
    expect(ps.owner).toBeNull();
    expect(() => getProperty(state, "start")).toThrow(RuleError);
    expect(() => getProperty(state, "nowhere")).toThrow(RuleError);
    expect(tileAt(state, 9).id).toBe("jail");
  });

  test("ownedBy returns property ids in board order", () => {
    const { state } = setup();
    state.properties["mumbai"]!.owner = "p1";
    state.properties["patna"]!.owner = "p1";
    state.properties["pune"]!.owner = "p2";
    expect(ownedBy(state, "p1")).toEqual(["patna", "mumbai"]);
  });

  test("requireTurn", () => {
    const { state } = setup();
    expect(() => requireTurn(state, "p1")).not.toThrow();
    expect(() => requireTurn(state, "p2")).toThrow(RuleError);
    state.status = "finished";
    expect(() => requireTurn(state, "p1")).toThrow(RuleError);
  });

  test("requireNoPending", () => {
    const { state } = setup();
    expect(() => requireNoPending(state)).not.toThrow();
    state.pending = { kind: "buy", tileId: "patna" };
    expect(() => requireNoPending(state)).toThrow(RuleError);
  });

  test("nextId increments", () => {
    const { state } = setup();
    const a = nextId(state);
    expect(nextId(state)).toBe(a + 1);
  });
});
