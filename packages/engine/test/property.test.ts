import { describe, expect, test } from "bun:test";
import { RuleError } from "../src/core/context";
import { handleBuy, landOnProperty, rentFor } from "../src/rules/property";
import { applyAction } from "../src/engine";
import type { GameState, GroupId, TileId } from "../src/types";
import { act, makeCtx, newGame } from "./helpers";

// One city per group: [tile, group, base, 1H, 2H, 3H, hotel] straight from the spec table (§5).
const CITIES: [TileId, GroupId, number[]][] = [
  ["patna", "brown", [200, 600, 1000, 1600, 2400]],
  ["bhopal", "lightBlue", [320, 960, 1600, 2560, 3840]],
  ["lucknow", "pink", [440, 1320, 2200, 3520, 5280]],
  ["chandigarh", "orange", [560, 1680, 2800, 4480, 6720]],
  ["darjeeling", "red", [680, 2040, 3400, 5440, 8160]],
  ["noida", "yellow", [800, 2400, 4000, 6400, 9600]],
  ["hyderabad", "green", [920, 2760, 4600, 7360, 11040]],
  ["bengaluru", "darkBlue", [1100, 3300, 5500, 8800, 13200]],
];

/** 1.5x rounds every scaled amount to the nearest 100 (spec decision 3). */
const scaled = (n: number) => Math.max(100, Math.round((n * 1.5) / 100) * 100);

function own(state: GameState, tileId: TileId, owner: string, extra: Partial<GameState["properties"][string]> = {}) {
  Object.assign(state.properties[tileId]!, { owner, ...extra });
}

describe("rentFor: cities", () => {
  for (const multiplier of [1, 1.5]) {
    describe(`at ${multiplier}x`, () => {
      for (const [tileId, group, rents] of CITIES) {
        test(`${group} (${tileId}) charges every tier`, () => {
          const state = newGame({ settings: { priceMultiplier: multiplier } });
          const expected = multiplier === 1 ? rents : rents.map(scaled);
          own(state, tileId, "p1");
          for (let houses = 0; houses <= 3; houses++) {
            state.properties[tileId]!.houses = houses;
            expect(rentFor(state, tileId, 7)).toBe(expected[houses]!);
          }
          state.properties[tileId]!.houses = 0;
          state.properties[tileId]!.hotel = true;
          expect(rentFor(state, tileId, 7)).toBe(expected[4]!);
        });
      }
    });
  }

  test("known 1.5x values", () => {
    const state = newGame({ settings: { priceMultiplier: 1.5 } });
    own(state, "patna", "p1");
    expect(rentFor(state, "patna", 7)).toBe(300);
    state.properties.patna!.hotel = true;
    expect(rentFor(state, "patna", 7)).toBe(3600);
  });

  test("an unowned property charges nothing", () => {
    expect(rentFor(newGame(), "patna", 7)).toBe(0);
  });

  test("houses count even when the owner lacks the full group", () => {
    const state = newGame();
    own(state, "patna", "p1", { houses: 2 });
    expect(rentFor(state, "patna", 7)).toBe(1000);
  });

  test("a non-property tile is rejected", () => {
    expect(() => rentFor(newGame(), "start", 7)).toThrow(RuleError);
  });
});

describe("rentFor: transports", () => {
  const transports = ["indian-railways", "national-highways", "indian-airways", "coastal-shipping"];
  const expected = [500, 1000, 2000, 4000];

  test("rent follows how many transports the owner holds", () => {
    const state = newGame();
    transports.forEach((id, i) => {
      own(state, id, "p1");
      expect(rentFor(state, id, 7)).toBe(expected[i]!);
      // any of the owner's transports charges the same tier
      expect(rentFor(state, transports[0]!, 7)).toBe(expected[i]!);
    });
  });

  test("scales with the price multiplier", () => {
    const state = newGame({ settings: { priceMultiplier: 1.5 } });
    own(state, "indian-railways", "p1");
    own(state, "national-highways", "p1");
    expect(rentFor(state, "indian-railways", 7)).toBe(1500);
  });

  test("another player's transports do not count", () => {
    const state = newGame();
    own(state, "indian-railways", "p1");
    own(state, "national-highways", "p2");
    expect(rentFor(state, "indian-railways", 7)).toBe(500);
  });

  test("mortgaged transports still count toward the total", () => {
    const state = newGame();
    own(state, "indian-railways", "p1");
    own(state, "national-highways", "p1", { mortgaged: true });
    expect(rentFor(state, "indian-railways", 7)).toBe(1000);
    expect(rentFor(state, "national-highways", 7)).toBe(0);
  });
});

describe("rentFor: utilities", () => {
  test("one utility is 4x the dice total", () => {
    const state = newGame();
    own(state, "power-grid", "p1");
    expect(rentFor(state, "power-grid", 9)).toBe(36);
  });

  test("both utilities are 10x the dice total", () => {
    const state = newGame();
    own(state, "power-grid", "p1");
    own(state, "digital-bharat-network", "p1");
    expect(rentFor(state, "power-grid", 9)).toBe(90);
    expect(rentFor(state, "digital-bharat-network", 5)).toBe(50);
  });

  test("utility multipliers are not scaled by the price multiplier", () => {
    const state = newGame({ settings: { priceMultiplier: 1.5 } });
    own(state, "power-grid", "p1");
    expect(rentFor(state, "power-grid", 9)).toBe(36);
  });

  test("a mortgaged utility still counts toward the total", () => {
    const state = newGame();
    own(state, "power-grid", "p1", { mortgaged: true });
    own(state, "digital-bharat-network", "p1");
    expect(rentFor(state, "digital-bharat-network", 6)).toBe(60);
    expect(rentFor(state, "power-grid", 6)).toBe(0);
  });
});

describe("landOnProperty", () => {
  test("an unowned property opens a buy decision", () => {
    const state = newGame();
    const ctx = makeCtx(state);
    landOnProperty(ctx, "p1", "patna", 7);
    expect(state.pending).toEqual({ kind: "buy", tileId: "patna" });
    expect(ctx.events).toEqual([]);
  });

  test("rent goes to the owner", () => {
    const state = newGame();
    own(state, "patna", "p2", { houses: 1 });
    const ctx = makeCtx(state);
    landOnProperty(ctx, "p1", "patna", 7);
    expect(state.players[0]!.cash).toBe(19_400);
    expect(state.players[1]!.cash).toBe(20_600);
    expect(state.pending).toBeNull();
    expect(ctx.events).toHaveLength(1);
    expect(ctx.events[0]).toMatchObject({ type: "paid", from: "p1", to: "p2", amount: 600 });
    expect(state.ledger.at(-1)).toMatchObject({ from: "p1", to: "p2", amount: 600 });
  });

  test("utility rent uses the dice total", () => {
    const state = newGame();
    own(state, "power-grid", "p2");
    landOnProperty(makeCtx(state), "p1", "power-grid", 8);
    expect(state.players[0]!.cash).toBe(20_000 - 32);
    expect(state.players[1]!.cash).toBe(20_000 + 32);
  });

  test("your own property charges nothing and emits nothing", () => {
    const state = newGame();
    own(state, "patna", "p1");
    const ctx = makeCtx(state);
    landOnProperty(ctx, "p1", "patna", 7);
    expect(state.players.map((p) => p.cash)).toEqual([20_000, 20_000]);
    expect(state.pending).toBeNull();
    expect(ctx.events).toEqual([]);
  });

  test("a mortgaged property charges nothing and emits nothing", () => {
    const state = newGame();
    own(state, "patna", "p2", { mortgaged: true });
    const ctx = makeCtx(state);
    landOnProperty(ctx, "p1", "patna", 7);
    expect(state.players.map((p) => p.cash)).toEqual([20_000, 20_000]);
    expect(state.pending).toBeNull();
    expect(ctx.events).toEqual([]);
  });

  test("rent you cannot afford becomes a debt", () => {
    const state = newGame();
    own(state, "bengaluru", "p2");
    state.properties["bengaluru"]!.hotel = true;
    state.players[0]!.cash = 1000;
    const ctx = makeCtx(state);
    landOnProperty(ctx, "p1", "bengaluru", 7);
    expect(state.players[0]!.cash).toBe(1000);
    expect(state.players[1]!.cash).toBe(20_000);
    expect(state.debts).toHaveLength(1);
    expect(state.debts[0]).toMatchObject({ debtor: "p1", creditor: "p2", amount: 13_200 });
    expect(ctx.events[0]).toMatchObject({ type: "debtCreated" });
  });
});

describe("buy and decline", () => {
  function atBuy(tileId: TileId = "patna", settings = {}) {
    const state = newGame({ settings });
    state.pending = { kind: "buy", tileId };
    return state;
  }

  test("buy happy path", () => {
    const { state, events } = act(atBuy(), "p1", { type: "buy" });
    expect(state.properties.patna!.owner).toBe("p1");
    expect(state.pending).toBeNull();
    expect(state.players[0]!.cash).toBe(18_000);
    expect(state.ledger.at(-1)).toMatchObject({ from: "p1", to: "bank", amount: 2000 });
    expect(events).toContainEqual({ type: "bought", playerId: "p1", tileId: "patna", price: 2000 });
  });

  test("buy at a scaled price", () => {
    const { state } = act(atBuy("patna", { priceMultiplier: 1.5 }), "p1", { type: "buy" });
    expect(state.players[0]!.cash).toBe(17_000);
  });

  test("buying with too little cash is rejected and the decision stays open", () => {
    const state = atBuy();
    state.players[0]!.cash = 1999;
    const result = applyAction(state, "p1", { type: "buy" }, () => 0.5);
    expect(result).toMatchObject({ ok: false, error: "not enough cash" });
    expect(state.pending).toEqual({ kind: "buy", tileId: "patna" });
    expect(state.properties.patna!.owner).toBeNull();
  });

  test("buying with exactly the price works", () => {
    const state = atBuy();
    state.players[0]!.cash = 2000;
    const { state: after } = act(state, "p1", { type: "buy" });
    expect(after.players[0]!.cash).toBe(0);
    expect(after.properties.patna!.owner).toBe("p1");
  });

  test("a duplicate buy fails because the decision is gone", () => {
    const { state } = act(atBuy(), "p1", { type: "buy" });
    const second = applyAction(state, "p1", { type: "buy" }, () => 0.5);
    expect(second.ok).toBe(false);
    expect(state.players[0]!.cash).toBe(18_000);
  });

  test("only the player whose turn it is can buy or decline", () => {
    const state = atBuy();
    expect(applyAction(state, "p2", { type: "buy" }, () => 0.5)).toMatchObject({
      ok: false,
      error: "it is not your turn",
    });
    expect(applyAction(state, "p2", { type: "declineBuy" }, () => 0.5)).toMatchObject({
      ok: false,
      error: "it is not your turn",
    });
  });

  test("buy and decline need an open buy decision", () => {
    const state = newGame();
    expect(() => handleBuy(makeCtx(state), "p1")).toThrow(RuleError);
    expect(applyAction(state, "p1", { type: "declineBuy" }, () => 0.5).ok).toBe(false);
  });

  test("buy is rejected during an auction", () => {
    const state = newGame();
    state.pending = { kind: "auction", auction: { tileId: "patna", highBid: 0, highBidder: null, bidders: ["p1", "p2"] } };
    expect(applyAction(state, "p1", { type: "buy" }, () => 0.5).ok).toBe(false);
  });

  test("decline with auctions off clears the decision and leaves the property unowned", () => {
    const { state, events } = act(atBuy("patna", { auctionsEnabled: false }), "p1", { type: "declineBuy" });
    expect(state.pending).toBeNull();
    expect(state.properties.patna!.owner).toBeNull();
    expect(events.some((e) => e.type === "auctionStarted")).toBe(false);
  });

  test("decline with auctions on starts an auction among all active players", () => {
    const state = newGame({ players: 3 });
    state.players[1]!.bankrupt = true;
    state.pending = { kind: "buy", tileId: "patna" };
    const { state: after, events } = act(state, "p1", { type: "declineBuy" });
    expect(after.pending).toEqual({
      kind: "auction",
      auction: { tileId: "patna", highBid: 0, highBidder: null, bidders: ["p1", "p3"] },
    });
    expect(events).toContainEqual({ type: "auctionStarted", tileId: "patna" });
  });
});
