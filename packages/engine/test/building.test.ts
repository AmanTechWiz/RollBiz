import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { applyAction } from "../src/engine";
import {
  countBuildings,
  groupHasBuildings,
  handleBuild,
  handleSellBuilding,
  liquidateAllBuildings,
} from "../src/rules/building";
import type { GameState, PlayerId, TileId } from "../src/types";
import { act, makeCtx, newGame, seededRng } from "./helpers";

const BROWN = ["patna", "ranchi", "raipur"];
const LIGHT_BLUE = ["bhopal", "nagpur", "indore"];

function own(state: GameState, playerId: PlayerId, tiles: TileId[]): void {
  for (const t of tiles) {
    const p = state.properties[t];
    if (!p) throw new Error(`no property ${t}`);
    p.owner = playerId;
  }
}

/** Level 0..3 = houses, 4 = hotel. Adjusts the bank inventory to match, so totals stay conserved. */
function setLevel(state: GameState, tile: TileId, level: number): void {
  const p = state.properties[tile];
  if (!p) throw new Error(`no property ${tile}`);
  state.bank.houses += p.houses;
  if (p.hotel) state.bank.hotels += 1;
  p.houses = level === 4 ? 0 : level;
  p.hotel = level === 4;
  state.bank.houses -= p.houses;
  if (p.hotel) state.bank.hotels -= 1;
}

/** The resolved economy is frozen, so replace it with a modified copy. */
function setRefundRate(state: GameState, rate: number): void {
  state.economy = { ...state.economy, rules: { ...state.economy.rules, buildingRefundRate: rate } };
}

function level(state: GameState, tile: TileId): number {
  const p = state.properties[tile];
  if (!p) throw new Error(`no property ${tile}`);
  return p.hotel ? 4 : p.houses;
}

/** p1's turn, p1 owns the brown set. */
function setup(): GameState {
  const state = newGame({ players: 2 });
  state.turn.playerId = "p1";
  own(state, "p1", BROWN);
  return state;
}

function inventory(state: GameState): { houses: number; hotels: number } {
  let houses = state.bank.houses;
  let hotels = state.bank.hotels;
  for (const p of Object.values(state.properties)) {
    houses += p.houses;
    if (p.hotel) hotels += 1;
  }
  return { houses, hotels };
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

describe("build", () => {
  test("builds a house, charges the house cost, takes a house from the bank, emits built", () => {
    const state = setup();
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "build", tileId: "patna" });
    expect(r.state.properties.patna).toMatchObject({ houses: 1, hotel: false });
    expect(cash(r.state, "p1")).toBe(before - 1000);
    expect(r.state.bank.houses).toBe(31);
    expect(r.events).toContainEqual({ type: "built", playerId: "p1", tileId: "patna", houses: 1, hotel: false });
    expect(r.state.ledger.at(-1)).toMatchObject({ from: "p1", to: "bank", amount: 1000 });
  });

  test("requires owning the whole group", () => {
    const state = setup();
    own(state, "p2", ["raipur"]);
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("you must own the whole Orange group to build");
  });

  test("cannot build on a property you do not own", () => {
    const state = setup();
    own(state, "p2", LIGHT_BLUE);
    expect(reject(state, "p1", { type: "build", tileId: "bhopal" })).toBe("you do not own that property");
  });

  test("only city properties can be built on", () => {
    const state = setup();
    own(state, "p1", ["indian-railways"]);
    expect(reject(state, "p1", { type: "build", tileId: "indian-railways" })).toBe("you can only build on cities");
  });

  test("blocked when any property in the group is mortgaged", () => {
    const state = setup();
    const raipur = state.properties.raipur;
    if (!raipur) throw new Error("setup");
    raipur.mortgaged = true;
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("unmortgage the whole group before building");
    expect(reject(state, "p1", { type: "build", tileId: "ranchi" })).toBe("unmortgage the whole group before building");
  });

  test("even rule: cannot build ahead of the rest of the group", () => {
    let state = setup();
    state = act(state, "p1", { type: "build", tileId: "patna" }).state;
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("build evenly: build on another property first");
    state = act(state, "p1", { type: "build", tileId: "ranchi" }).state;
    state = act(state, "p1", { type: "build", tileId: "raipur" }).state;
    // everything is at level 1, so patna may go to 2
    state = act(state, "p1", { type: "build", tileId: "patna" }).state;
    expect(level(state, "patna")).toBe(2);
  });

  test("not enough cash is rejected and creates no debt", () => {
    const state = setup();
    const p1 = state.players.find((p) => p.id === "p1");
    if (!p1) throw new Error("setup");
    p1.cash = 999;
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("not enough cash");
    expect(state.debts).toHaveLength(0);
  });

  test("running out of houses", () => {
    const state = setup();
    state.bank.houses = 0;
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("the bank has no houses left");
  });

  test("hotel upgrade charges the hotel cost, takes 1 hotel, returns 3 houses", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 3);
    const houses = state.bank.houses;
    const hotels = state.bank.hotels;
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "build", tileId: "ranchi" });
    expect(r.state.properties.ranchi).toMatchObject({ houses: 0, hotel: true });
    expect(r.state.bank.houses).toBe(houses + 3);
    expect(r.state.bank.hotels).toBe(hotels - 1);
    expect(cash(r.state, "p1")).toBe(before - 1000);
    expect(r.events).toContainEqual({ type: "built", playerId: "p1", tileId: "ranchi", houses: 0, hotel: true });
  });

  test("hotel upgrade needs three houses on every property in the group (even rule)", () => {
    const state = setup();
    setLevel(state, "patna", 3);
    setLevel(state, "ranchi", 3);
    setLevel(state, "raipur", 2);
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("build evenly: build on another property first");
  });

  test("hotel limit: no hotels left in the bank", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 3);
    state.bank.hotels = 0;
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("the bank has no hotels left");
  });

  test("hotel upgrade is possible with zero houses in the bank (it returns 3)", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 3);
    state.bank.houses = 0;
    const r = act(state, "p1", { type: "build", tileId: "patna" });
    expect(r.state.bank.houses).toBe(3);
  });

  test("a property with a hotel cannot be built on again", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("that property already has a hotel");
  });

  test("scaled house cost is used", () => {
    const state = newGame({ settings: { priceMultiplier: 1.5 } });
    state.turn.playerId = "p1";
    own(state, "p1", BROWN);
    const cost = state.economy.groups.brown.houseCost;
    expect(cost).toBe(1500);
    const before = cash(state, "p1");
    expect(cash(act(state, "p1", { type: "build", tileId: "patna" }).state, "p1")).toBe(before - cost);
  });

  test("bank inventory is conserved across build and hotel upgrade", () => {
    let state = setup();
    const start = inventory(state);
    for (let round = 0; round < 4; round++) {
      for (const t of BROWN) state = act(state, "p1", { type: "build", tileId: t }).state;
      expect(inventory(state)).toEqual(start);
    }
    expect(BROWN.map((t) => level(state, t))).toEqual([4, 4, 4]);
  });

  test("not your turn, and not during a pending decision", () => {
    const state = setup();
    own(state, "p2", LIGHT_BLUE);
    expect(reject(state, "p2", { type: "build", tileId: "bhopal" })).toBe("it is not your turn");
    state.pending = { kind: "buy", tileId: "jaipur" };
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("finish the open buy decision or auction first");
  });

  test("building while in debt is blocked", () => {
    const state = setup();
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 500, reason: "rent" });
    expect(reject(state, "p1", { type: "build", tileId: "patna" })).toBe("outstanding debts must be settled first");
  });

  test("handler itself also refuses to build with a debt outstanding", () => {
    const state = setup();
    state.debts.push({ id: 99, debtor: "p2", creditor: "p1", amount: 500, reason: "rent" });
    // dispatcher would stop p1; call the rule through a context directly
    expect(() => handleBuild(makeCtx(state), "p1", "patna")).toThrow("settle outstanding debts first");
  });
});

describe("sellBuilding", () => {
  test("selling a house refunds half the house cost and returns the house", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 1);
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "sellBuilding", tileId: "patna" });
    expect(level(r.state, "patna")).toBe(0);
    expect(cash(r.state, "p1")).toBe(before + 500);
    expect(r.state.bank.houses).toBe(state.bank.houses + 1);
    expect(r.events).toContainEqual({
      type: "buildingSold",
      playerId: "p1",
      tileId: "patna",
      houses: 0,
      hotel: false,
      refund: 500,
    });
  });

  test("refund at 1x rate is the full house cost", () => {
    const state = setup();
    setRefundRate(state, 1);
    setLevel(state, "patna", 1);
    setLevel(state, "ranchi", 1);
    setLevel(state, "raipur", 1);
    const before = cash(state, "p1");
    expect(cash(act(state, "p1", { type: "sellBuilding", tileId: "ranchi" }).state, "p1")).toBe(before + 1000);
  });

  test("refund rounds down", () => {
    const state = setup();
    setRefundRate(state, 0.5);
    const groups = { ...state.economy.groups, brown: { ...state.economy.groups.brown, houseCost: 1001 } };
    state.economy = { ...state.economy, groups };
    setLevel(state, "patna", 1);
    const before = cash(state, "p1");
    expect(cash(act(state, "p1", { type: "sellBuilding", tileId: "patna" }).state, "p1")).toBe(before + 500);
  });

  test("even rule: can only sell from the most-built property", () => {
    const state = setup();
    setLevel(state, "patna", 2);
    setLevel(state, "ranchi", 1);
    setLevel(state, "raipur", 1);
    expect(reject(state, "p1", { type: "sellBuilding", tileId: "ranchi" })).toBe("sell evenly: sell from a more built-up property first");
    const r = act(state, "p1", { type: "sellBuilding", tileId: "patna" });
    expect(level(r.state, "patna")).toBe(1);
  });

  test("nothing to sell", () => {
    const state = setup();
    expect(reject(state, "p1", { type: "sellBuilding", tileId: "patna" })).toBe("there is nothing to sell on that property");
  });

  test("selling a hotel drops to 3 houses, takes 3 houses from the bank, refunds half the hotel cost", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    const houses = state.bank.houses;
    const hotels = state.bank.hotels;
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "sellBuilding", tileId: "patna" });
    expect(r.state.properties.patna).toMatchObject({ houses: 3, hotel: false });
    expect(r.state.bank.houses).toBe(houses - 3);
    expect(r.state.bank.hotels).toBe(hotels + 1);
    expect(cash(r.state, "p1")).toBe(before + 500);
    expect(r.events).toContainEqual({
      type: "buildingSold",
      playerId: "p1",
      tileId: "patna",
      houses: 3,
      hotel: false,
      refund: 500,
    });
  });

  test("selling a hotel is rejected when the bank has fewer than 3 houses, with a clear message", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    state.bank.houses = 2;
    const error = reject(state, "p1", { type: "sellBuilding", tileId: "patna" });
    expect(error).toBe("the bank needs 3 houses to replace the hotel; sell the whole group instead");
  });

  test("cannot sell on someone else's property", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 1);
    expect(reject(state, "p2", { type: "sellBuilding", tileId: "patna" })).toBe("it is not your turn");
    state.turn.playerId = "p2";
    expect(reject(state, "p2", { type: "sellBuilding", tileId: "patna" })).toBe("you do not own that property");
  });

  test("not during a pending decision", () => {
    const state = setup();
    setLevel(state, "patna", 1);
    state.pending = { kind: "buy", tileId: "jaipur" };
    expect(reject(state, "p1", { type: "sellBuilding", tileId: "patna" })).toBe("finish the open buy decision or auction first");
  });

  test("a debtor may sell even when it is not their turn", () => {
    const state = setup();
    state.turn.playerId = "p2";
    for (const t of BROWN) setLevel(state, t, 1);
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 5000, reason: "rent" });
    const r = act(state, "p1", { type: "sellBuilding", tileId: "patna" });
    expect(level(r.state, "patna")).toBe(0);
  });

  test("selling in debt works for the current player too, even with a pending decision open", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 1);
    state.pending = { kind: "buy", tileId: "jaipur" };
    state.debts.push({ id: 99, debtor: "p1", creditor: "bank", amount: 5000, reason: "tax" });
    expect(level(act(state, "p1", { type: "sellBuilding", tileId: "patna" }).state, "patna")).toBe(0);
  });

  test("a non-debtor cannot sell on another player's turn while debts exist (handler level)", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 1);
    state.debts.push({ id: 99, debtor: "p2", creditor: "p1", amount: 5000, reason: "rent" });
    state.turn.playerId = "p2";
    expect(() => handleSellBuilding(makeCtx(state), "p1", "patna")).toThrow("it is not your turn");
  });

  test("bank inventory is conserved when selling down from hotels", () => {
    let state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    const start = inventory(state);
    for (let i = 0; i < 12; i++) {
      const target = BROWN.find((t) => level(state, t) === Math.max(...BROWN.map((x) => level(state, x))));
      if (!target) throw new Error("none");
      state = act(state, "p1", { type: "sellBuilding", tileId: target }).state;
      expect(inventory(state)).toEqual(start);
    }
    expect(BROWN.map((t) => level(state, t))).toEqual([0, 0, 0]);
  });
});

describe("sellGroupBuildings", () => {
  test("sells every building in the group at half value", () => {
    const state = setup();
    setLevel(state, "patna", 2);
    setLevel(state, "ranchi", 1);
    setLevel(state, "raipur", 1);
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "sellGroupBuildings", group: "brown" });
    expect(BROWN.map((t) => level(r.state, t))).toEqual([0, 0, 0]);
    expect(cash(r.state, "p1")).toBe(before + 4 * 500);
    expect(r.state.bank.houses).toBe(state.bank.houses + 4);
    expect(r.events.filter((e) => e.type === "buildingSold")).toHaveLength(3);
  });

  test("a hotel is worth floor((hotelCost + 3 x houseCost) x rate) and goes back as a hotel", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    const houses = state.bank.houses;
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "sellGroupBuildings", group: "brown" });
    // (1000 + 3000) * 0.5 = 2000 per hotel
    expect(cash(r.state, "p1")).toBe(before + 3 * 2000);
    expect(r.state.bank.hotels).toBe(state.bank.hotels + 3);
    expect(r.state.bank.houses).toBe(houses); // no houses come back from hotels
    expect(BROWN.map((t) => level(r.state, t))).toEqual([0, 0, 0]);
  });

  test("refund at 1x for a hotel group", () => {
    const state = setup();
    setRefundRate(state, 1);
    setLevel(state, "patna", 4);
    setLevel(state, "ranchi", 4);
    setLevel(state, "raipur", 3);
    const before = cash(state, "p1");
    const r = act(state, "p1", { type: "sellGroupBuildings", group: "brown" });
    expect(cash(r.state, "p1")).toBe(before + 4000 + 4000 + 3000);
  });

  test("works with the bank at 0 houses, where selling a single hotel is rejected", () => {
    const state = setup();
    for (const t of BROWN) setLevel(state, t, 4);
    state.bank.houses = 0;
    expect(reject(state, "p1", { type: "sellBuilding", tileId: "patna" })).toContain("sell the whole group");
    const hotels = state.bank.hotels;
    const r = act(state, "p1", { type: "sellGroupBuildings", group: "brown" });
    expect(BROWN.map((t) => level(r.state, t))).toEqual([0, 0, 0]);
    expect(r.state.bank.hotels).toBe(hotels + 3);
  });

  test("a debtor with hotels and a low bank is not trapped", () => {
    const state = setup();
    state.turn.playerId = "p2";
    for (const t of BROWN) setLevel(state, t, 4);
    state.bank.houses = 1;
    state.debts.push({ id: 99, debtor: "p1", creditor: "p2", amount: 5000, reason: "rent" });
    const r = act(state, "p1", { type: "sellGroupBuildings", group: "brown" });
    expect(groupHasBuildings(r.state, "brown")).toBe(false);
  });

  test("bank inventory is conserved", () => {
    const state = setup();
    setLevel(state, "patna", 4);
    setLevel(state, "ranchi", 4);
    setLevel(state, "raipur", 3);
    const start = inventory(state);
    expect(inventory(act(state, "p1", { type: "sellGroupBuildings", group: "brown" }).state)).toEqual(start);
  });

  test("throws when the group has no buildings", () => {
    const state = setup();
    expect(reject(state, "p1", { type: "sellGroupBuildings", group: "brown" })).toBe("there are no buildings to sell in that group");
  });

  test("throws when you do not own the whole group", () => {
    const state = setup();
    own(state, "p2", ["raipur"]);
    setLevel(state, "patna", 1);
    expect(reject(state, "p1", { type: "sellGroupBuildings", group: "brown" })).toBe("you do not own that whole group");
  });

  test("not on another player's turn", () => {
    const state = setup();
    setLevel(state, "patna", 1);
    expect(reject(state, "p2", { type: "sellGroupBuildings", group: "brown" })).toBe("it is not your turn");
  });
});

describe("liquidateAllBuildings, countBuildings, groupHasBuildings", () => {
  test("liquidates every group, returns the total refund, no turn checks", () => {
    const state = setup();
    own(state, "p1", LIGHT_BLUE);
    state.turn.playerId = "p2";
    state.pending = { kind: "buy", tileId: "jaipur" };
    setLevel(state, "patna", 4);
    setLevel(state, "ranchi", 4);
    setLevel(state, "raipur", 4);
    setLevel(state, "bhopal", 2);
    setLevel(state, "nagpur", 1);
    setLevel(state, "indore", 1);
    const start = inventory(state);
    const before = cash(state, "p1");
    const ctx = makeCtx(state);
    const total = liquidateAllBuildings(ctx, "p1");
    // brown: 3 hotels x 2000, light blue: 4 houses x 500
    expect(total).toBe(6000 + 2000);
    expect(cash(state, "p1")).toBe(before + total);
    expect(countBuildings(state, "p1")).toEqual({ houses: 0, hotels: 0 });
    expect(inventory(state)).toEqual(start);
  });

  test("returns 0 when there is nothing to liquidate and ignores other players' buildings", () => {
    const state = setup();
    own(state, "p2", LIGHT_BLUE);
    setLevel(state, "bhopal", 2);
    const ctx = makeCtx(state);
    expect(liquidateAllBuildings(ctx, "p1")).toBe(0);
    expect(countBuildings(state, "p2")).toEqual({ houses: 2, hotels: 0 });
    expect(ctx.events).toHaveLength(0);
  });

  test("countBuildings counts houses and hotels separately", () => {
    const state = setup();
    own(state, "p1", LIGHT_BLUE);
    setLevel(state, "patna", 4);
    setLevel(state, "ranchi", 3);
    setLevel(state, "raipur", 3);
    setLevel(state, "bhopal", 1);
    expect(countBuildings(state, "p1")).toEqual({ houses: 7, hotels: 1 });
    expect(countBuildings(state, "p2")).toEqual({ houses: 0, hotels: 0 });
  });

  test("groupHasBuildings", () => {
    const state = setup();
    expect(groupHasBuildings(state, "brown")).toBe(false);
    setLevel(state, "raipur", 1);
    expect(groupHasBuildings(state, "brown")).toBe(true);
    expect(groupHasBuildings(state, "lightBlue")).toBe(false);
  });
});
