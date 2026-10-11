import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { applyAction } from "../src/engine";
import type { GameState, PlayerId, TileId } from "../src/types";
import { act, newGame, seededRng } from "./helpers";

function own(state: GameState, playerId: PlayerId, tiles: TileId[]): void {
  for (const t of tiles) {
    const p = state.properties[t];
    if (!p) throw new Error(`no property ${t}`);
    p.owner = playerId;
  }
}

function setup(): GameState {
  const state = newGame({ players: 2 });
  state.turn.playerId = "p1";
  own(state, "p1", ["patna", "ranchi", "raipur", "indian-railways", "power-grid"]);
  return state;
}

function cash(state: GameState, id: PlayerId): number {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error("no player");
  return p.cash;
}

function reject(state: GameState, playerId: PlayerId, action: Action): string {
  const r = applyAction(state, playerId, action, seededRng());
  if (r.ok) throw new Error(`expected ${action.type} to be rejected`);
  return r.error;
}

describe("mortgage", () => {
  test("pays the mortgage value from the bank and marks the property mortgaged", () => {
    const state = setup();
    const before = cash(state, "p1");
    const bankBefore = state.bank.cash;
    const r = act(state, "p1", { type: "mortgage", tileId: "patna" });
    expect(r.state.properties.patna?.mortgaged).toBe(true);
    expect(cash(r.state, "p1")).toBe(before + 1000);
    expect(r.state.bank.cash).toBe(bankBefore - 1000);
    expect(r.events).toContainEqual({ type: "mortgaged", playerId: "p1", tileId: "patna", amount: 1000 });
    expect(r.state.ledger.at(-1)).toMatchObject({ from: "bank", to: "p1", amount: 1000 });
  });

  test("works for transports and utilities", () => {
    const state = setup();
    const r1 = act(state, "p1", { type: "mortgage", tileId: "indian-railways" });
    expect(cash(r1.state, "p1")).toBe(cash(state, "p1") + (state.economy.properties["indian-railways"]?.mortgage ?? -1));
    const r2 = act(r1.state, "p1", { type: "mortgage", tileId: "power-grid" });
    expect(r2.state.properties["power-grid"]?.mortgaged).toBe(true);
  });

  test("blocked when the group has buildings, including on another property of the group", () => {
    const state = setup();
    const ranchi = state.properties.ranchi;
    if (!ranchi) throw new Error("setup");
    ranchi.houses = 1;
    expect(reject(state, "p1", { type: "mortgage", tileId: "patna" })).toBe("sell the buildings in this group first");
    expect(reject(state, "p1", { type: "mortgage", tileId: "ranchi" })).toBe("sell the buildings in this group first");
  });

  test("allowed once the buildings are sold", () => {
    let state = setup();
    const patna = state.properties.patna;
    if (!patna) throw new Error("setup");
    patna.houses = 1;
    state.bank.houses -= 1;
    state = act(state, "p1", { type: "sellGroupBuildings", group: "brown" }).state;
    expect(act(state, "p1", { type: "mortgage", tileId: "ranchi" }).state.properties.ranchi?.mortgaged).toBe(true);
  });

  test("already mortgaged", () => {
    const state = setup();
    const patna = state.properties.patna;
    if (!patna) throw new Error("setup");
    patna.mortgaged = true;
    expect(reject(state, "p1", { type: "mortgage", tileId: "patna" })).toBe("that property is already mortgaged");
  });

  test("must own it", () => {
    const state = setup();
    own(state, "p2", ["lucknow"]);
    expect(reject(state, "p1", { type: "mortgage", tileId: "lucknow" })).toBe("you do not own that property");
    expect(reject(state, "p1", { type: "mortgage", tileId: "jaipur" })).toBe("you do not own that property");
  });

  test("rejects a tile that is not a property", () => {
    const state = setup();
    expect(reject(state, "p1", { type: "mortgage", tileId: "start" })).toBe("that tile is not a property");
  });

  test("not on another player's turn, not during a pending decision", () => {
    const state = setup();
    own(state, "p2", ["lucknow"]);
    expect(reject(state, "p2", { type: "mortgage", tileId: "lucknow" })).toBe("it is not your turn");
    state.pending = { kind: "buy", tileId: "jaipur" };
    expect(reject(state, "p1", { type: "mortgage", tileId: "patna" })).toBe("finish the open buy decision or auction first");
  });

  test("a debtor can mortgage while in debt, even off-turn", () => {
    const state = setup();
    state.turn.playerId = "p2";
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 5000, reason: "rent" });
    const r = act(state, "p1", { type: "mortgage", tileId: "patna" });
    expect(r.state.properties.patna?.mortgaged).toBe(true);
    expect(r.state.debts).toHaveLength(1); // paying the debt is a separate action
  });

  test("a non-debtor cannot mortgage while someone else owes", () => {
    const state = setup();
    own(state, "p2", ["lucknow"]);
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 5000, reason: "rent" });
    expect(reject(state, "p2", { type: "mortgage", tileId: "lucknow" })).toBe("waiting for debts to be settled");
  });

  test("bank pays even when it is short on cash (replenishes)", () => {
    const state = setup();
    state.bank.cash = 100;
    const r = act(state, "p1", { type: "mortgage", tileId: "patna" });
    expect(r.state.bank.cash).toBe(0);
    expect(r.events.some((e) => e.type === "bankReplenished")).toBe(true);
  });
});

describe("unmortgage", () => {
  function mortgaged(): GameState {
    const state = setup();
    const patna = state.properties.patna;
    if (!patna) throw new Error("setup");
    patna.mortgaged = true;
    return state;
  }

  test("costs 1100 for Patna, paid to the bank", () => {
    const state = mortgaged();
    expect(state.economy.properties.patna?.unmortgageCost).toBe(1100);
    const before = cash(state, "p1");
    const bankBefore = state.bank.cash;
    const r = act(state, "p1", { type: "unmortgage", tileId: "patna" });
    expect(r.state.properties.patna?.mortgaged).toBe(false);
    expect(cash(r.state, "p1")).toBe(before - 1100);
    expect(r.state.bank.cash).toBe(bankBefore + 1100);
    expect(r.events).toContainEqual({ type: "unmortgaged", playerId: "p1", tileId: "patna", amount: 1100 });
  });

  test("not enough cash is rejected and creates no debt", () => {
    const state = mortgaged();
    const p1 = state.players.find((p) => p.id === "p1");
    if (!p1) throw new Error("setup");
    p1.cash = 1099;
    expect(reject(state, "p1", { type: "unmortgage", tileId: "patna" })).toBe("not enough cash");
    expect(state.debts).toHaveLength(0);
  });

  test("exactly enough cash works", () => {
    const state = mortgaged();
    const p1 = state.players.find((p) => p.id === "p1");
    if (!p1) throw new Error("setup");
    p1.cash = 1100;
    expect(cash(act(state, "p1", { type: "unmortgage", tileId: "patna" }).state, "p1")).toBe(0);
  });

  test("property must be mortgaged and owned", () => {
    const state = mortgaged();
    expect(reject(state, "p1", { type: "unmortgage", tileId: "ranchi" })).toBe("that property is not mortgaged");
    own(state, "p2", ["patna"]);
    expect(reject(state, "p1", { type: "unmortgage", tileId: "patna" })).toBe("you do not own that property");
  });

  test("only on your own turn with no pending decision", () => {
    const state = mortgaged();
    state.turn.playerId = "p2";
    expect(reject(state, "p1", { type: "unmortgage", tileId: "patna" })).toBe("it is not your turn");
    state.turn.playerId = "p1";
    state.pending = { kind: "buy", tileId: "jaipur" };
    expect(reject(state, "p1", { type: "unmortgage", tileId: "patna" })).toBe("finish the open buy decision or auction first");
  });

  test("blocked while in debt", () => {
    const state = mortgaged();
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 5000, reason: "rent" });
    expect(reject(state, "p1", { type: "unmortgage", tileId: "patna" })).toBe("outstanding debts must be settled first");
  });

  test("mortgage then unmortgage is a net cost of the interest", () => {
    const state = setup();
    const before = cash(state, "p1");
    let s = act(state, "p1", { type: "mortgage", tileId: "patna" }).state;
    s = act(s, "p1", { type: "unmortgage", tileId: "patna" }).state;
    expect(cash(s, "p1")).toBe(before - 100);
  });
});
