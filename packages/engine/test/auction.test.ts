import { describe, expect, test } from "bun:test";
import { applyAction } from "../src/engine";
import { startAuction, removeFromAuction } from "../src/rules/auction";
import type { GameState, PlayerId } from "../src/types";
import { act, makeCtx, newGame } from "./helpers";

const rng = () => 0.5;

/** A game with an open auction on patna, as it looks after the roller declines. */
function auctionGame(players = 3, settings = {}): GameState {
  const state = newGame({ players, settings });
  startAuction(makeCtx(state), "patna");
  return state;
}

const bid = (state: GameState, who: PlayerId, amount: number) => act(state, who, { type: "bid", amount });
const pass = (state: GameState, who: PlayerId) => act(state, who, { type: "passAuction" });
const auctionOf = (state: GameState) => {
  if (state.pending?.kind !== "auction") throw new Error("no auction open");
  return state.pending.auction;
};

describe("startAuction", () => {
  test("opens an auction among active players in turn order and emits auctionStarted", () => {
    const state = newGame({ players: 4 });
    state.players[2]!.bankrupt = true;
    const ctx = makeCtx(state);
    startAuction(ctx, "patna");
    expect(state.pending).toEqual({
      kind: "auction",
      auction: { tileId: "patna", highBid: 0, highBidder: null, bidders: ["p1", "p2", "p4"] },
    });
    expect(ctx.events).toEqual([{ type: "auctionStarted", tileId: "patna" }]);
  });
});

describe("full auction", () => {
  test("bids, passes, and the winner pays the bank and takes the property", () => {
    let state = auctionGame();
    ({ state } = bid(state, "p2", 500));
    expect(auctionOf(state)).toMatchObject({ highBid: 500, highBidder: "p2" });
    ({ state } = bid(state, "p3", 700));
    ({ state } = bid(state, "p2", 1200));
    ({ state } = pass(state, "p1"));
    expect(auctionOf(state).bidders).toEqual(["p2", "p3"]);

    const bankBefore = state.bank.cash;
    const result = pass(state, "p3");
    state = result.state;
    expect(state.pending).toBeNull();
    expect(state.properties.patna!.owner).toBe("p2");
    expect(state.players[1]!.cash).toBe(20_000 - 1200);
    expect(state.bank.cash).toBe(bankBefore + 1200);
    expect(state.ledger.at(-1)).toMatchObject({ from: "p2", to: "bank", amount: 1200 });
    expect(result.events).toContainEqual({ type: "auctionPassed", playerId: "p3" });
    expect(result.events).toContainEqual({ type: "auctionEnded", tileId: "patna", winnerId: "p2", amount: 1200 });
  });

  test("bid events are emitted", () => {
    const { events } = bid(auctionGame(), "p1", 300);
    expect(events).toEqual([{ type: "bid", playerId: "p1", amount: 300 }]);
  });

  test("bidding is not tied to whose turn it is", () => {
    const state = auctionGame();
    expect(state.turn.playerId).toBe("p1");
    expect(bid(state, "p3", 100).state.pending).not.toBeNull();
  });

  test("the last remaining bidder wins as soon as they bid", () => {
    let state = auctionGame();
    ({ state } = pass(state, "p1"));
    ({ state } = pass(state, "p2"));
    expect(state.pending).not.toBeNull(); // p3 hasn't bid yet
    const result = bid(state, "p3", 100);
    expect(result.state.pending).toBeNull();
    expect(result.state.properties.patna!.owner).toBe("p3");
    expect(result.state.players[2]!.cash).toBe(19_900);
    expect(result.events.at(-1)).toEqual({ type: "auctionEnded", tileId: "patna", winnerId: "p3", amount: 100 });
  });

  test("two players: one bid and a pass ends it", () => {
    let state = auctionGame(2);
    ({ state } = bid(state, "p1", 2000));
    ({ state } = pass(state, "p2"));
    expect(state.properties.patna!.owner).toBe("p1");
    expect(state.players[0]!.cash).toBe(18_000);
  });

  test("a bid equal to all of the bidder's cash is allowed", () => {
    let state = auctionGame(2);
    ({ state } = bid(state, "p1", 20_000));
    ({ state } = pass(state, "p2"));
    expect(state.players[0]!.cash).toBe(0);
    expect(state.properties.patna!.owner).toBe("p1");
    expect(state.debts).toEqual([]);
  });
});

describe("bid validation", () => {
  test("the first bid must reach the minimum increment", () => {
    const state = auctionGame();
    expect(applyAction(state, "p1", { type: "bid", amount: 99 }, rng)).toMatchObject({ ok: false });
    expect(bid(state, "p1", 100).state.pending).not.toBeNull();
  });

  test("a bid below high bid + increment is rejected", () => {
    const { state } = bid(auctionGame(), "p1", 500);
    const result = applyAction(state, "p2", { type: "bid", amount: 599 }, rng);
    expect(result).toMatchObject({ ok: false, error: "bid at least ₹600" });
    expect(applyAction(state, "p2", { type: "bid", amount: 500 }, rng).ok).toBe(false);
    expect(bid(state, "p2", 600).state.pending).not.toBeNull();
  });

  test("the minimum increment scales with the price multiplier", () => {
    const state = auctionGame(3, { priceMultiplier: 1.5 });
    expect(state.economy.rules.minBidIncrement).toBe(200); // 100 * 1.5 -> 150 -> rounded to nearest 100
    expect(applyAction(state, "p1", { type: "bid", amount: 100 }, rng).ok).toBe(false);
    expect(bid(state, "p1", 200).state.pending).not.toBeNull();
  });

  test("a bid above the bidder's cash is rejected", () => {
    const state = auctionGame();
    const result = applyAction(state, "p1", { type: "bid", amount: 20_100 }, rng);
    expect(result).toMatchObject({ ok: false, error: "not enough cash" });
    expect(auctionOf(state).highBidder).toBeNull();
  });

  test("a player who passed cannot bid or pass again", () => {
    const { state } = pass(auctionGame(), "p3");
    expect(applyAction(state, "p3", { type: "bid", amount: 100 }, rng)).toMatchObject({
      ok: false,
      error: "you are not in this auction",
    });
    expect(applyAction(state, "p3", { type: "passAuction" }, rng).ok).toBe(false);
  });

  test("the high bidder cannot pass", () => {
    const { state } = bid(auctionGame(), "p1", 300);
    expect(applyAction(state, "p1", { type: "passAuction" }, rng)).toMatchObject({
      ok: false,
      error: "the high bidder cannot pass",
    });
  });

  test("bid and pass need an open auction", () => {
    const state = newGame();
    expect(applyAction(state, "p1", { type: "bid", amount: 100 }, rng)).toMatchObject({ ok: false });
    expect(applyAction(state, "p1", { type: "passAuction" }, rng)).toMatchObject({ ok: false });
  });

  test("a buy decision is not an auction", () => {
    const state = newGame();
    state.pending = { kind: "buy", tileId: "patna" };
    expect(applyAction(state, "p1", { type: "bid", amount: 100 }, rng).ok).toBe(false);
  });
});

describe("everyone passes", () => {
  test("the property stays unowned and the auction ends with no winner", () => {
    let state = auctionGame();
    ({ state } = pass(state, "p1"));
    ({ state } = pass(state, "p2"));
    const result = pass(state, "p3");
    expect(result.state.pending).toBeNull();
    expect(result.state.properties.patna!.owner).toBeNull();
    expect(result.state.players.map((p) => p.cash)).toEqual([20_000, 20_000, 20_000]);
    expect(result.events.at(-1)).toEqual({ type: "auctionEnded", tileId: "patna", winnerId: null, amount: 0 });
  });
});

describe("removeFromAuction", () => {
  test("removing the high bidder voids the bid and the auction continues", () => {
    const { state } = bid(auctionGame(), "p2", 800);
    const ctx = makeCtx(state);
    removeFromAuction(ctx, "p2");
    expect(state.pending).toEqual({
      kind: "auction",
      auction: { tileId: "patna", highBid: 0, highBidder: null, bidders: ["p1", "p3"] },
    });
    expect(ctx.events).toEqual([]);
    // the rest carry on from the minimum again
    const next = bid(state, "p1", 100);
    expect(auctionOf(next.state)).toMatchObject({ highBid: 100, highBidder: "p1" });
  });

  test("removing a passive bidder leaves the high bid in place", () => {
    const { state } = bid(auctionGame(), "p2", 800);
    removeFromAuction(makeCtx(state), "p3");
    expect(auctionOf(state)).toMatchObject({ highBid: 800, highBidder: "p2", bidders: ["p1", "p2"] });
  });

  test("removing the last other bidder hands the win to the high bidder", () => {
    const { state } = bid(auctionGame(2), "p1", 800);
    const ctx = makeCtx(state);
    removeFromAuction(ctx, "p2");
    expect(state.pending).toBeNull();
    expect(state.properties.patna!.owner).toBe("p1");
    expect(state.players[0]!.cash).toBe(19_200);
    expect(ctx.events.at(-1)).toEqual({ type: "auctionEnded", tileId: "patna", winnerId: "p1", amount: 800 });
  });

  test("removing the high bidder from a two-player auction leaves the other free to bid or pass", () => {
    const { state } = bid(auctionGame(2), "p1", 800);
    const ctx = makeCtx(state);
    removeFromAuction(ctx, "p1");
    expect(auctionOf(state)).toMatchObject({ highBid: 0, highBidder: null, bidders: ["p2"] });
    const done = act(state, "p2", { type: "passAuction" });
    expect(done.state.pending).toBeNull();
    expect(done.state.properties.patna!.owner).toBeNull();
  });

  test("removing the only remaining bidder ends the auction with no winner", () => {
    let state = auctionGame(2);
    ({ state } = pass(state, "p2"));
    const ctx = makeCtx(state);
    removeFromAuction(ctx, "p1");
    expect(state.pending).toBeNull();
    expect(state.properties.patna!.owner).toBeNull();
    expect(ctx.events).toEqual([{ type: "auctionEnded", tileId: "patna", winnerId: null, amount: 0 }]);
  });

  test("it is a no-op when there is no auction or the player is not in it", () => {
    const idle = newGame();
    removeFromAuction(makeCtx(idle), "p1");
    expect(idle.pending).toBeNull();

    const { state } = pass(auctionGame(), "p3");
    const before = JSON.stringify(state);
    const ctx = makeCtx(state);
    removeFromAuction(ctx, "p3");
    expect(JSON.stringify(state)).toBe(before);
    expect(ctx.events).toEqual([]);
  });
});
