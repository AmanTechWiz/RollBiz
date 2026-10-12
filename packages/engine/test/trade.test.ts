import { describe, expect, test } from "bun:test";
import { applyAction } from "../src/engine";
import { makeCtx, newGame, seededRng } from "./helpers";
import { dropTradesFor } from "../src/rules/trade";
import type { Action } from "../src/actions";
import type { GameState, PlayerId, TradeBundle } from "../src/types";

const none: TradeBundle = { cash: 0, properties: [], jailFreeCards: [] };
const bundle = (b: Partial<TradeBundle>): TradeBundle => ({ ...none, ...b });

function own(state: GameState, tileId: string, owner: PlayerId, extra: Partial<GameState["properties"][string]> = {}) {
  state.properties[tileId] = { owner, mortgaged: false, houses: 0, hotel: false, ...extra };
}

/** Runs one action and returns the raw ApplyResult. */
function run(state: GameState, playerId: PlayerId, action: Action) {
  return applyAction(state, playerId, action, seededRng(3));
}

function ok(state: GameState, playerId: PlayerId, action: Action) {
  const result = run(state, playerId, action);
  if (!result.ok) throw new Error(`rejected: ${result.error}`);
  return result;
}

function err(state: GameState, playerId: PlayerId, action: Action): string {
  const result = run(state, playerId, action);
  if (result.ok) throw new Error("expected a rejection");
  return result.error;
}

function propose(state: GameState, from: PlayerId, to: PlayerId, give: Partial<TradeBundle>, get: Partial<TradeBundle>) {
  return { type: "proposeTrade", to, give: bundle(give), get: bundle(get) } as const satisfies Action;
}

/** p1 owns indian-railways, p2 owns national-highways. */
function railGame() {
  const state = newGame();
  own(state, "indian-railways", "p1");
  own(state, "national-highways", "p2");
  return state;
}

describe("proposeTrade", () => {
  test("stores the offer with an id from nextId and emits tradeProposed", () => {
    const state = railGame();
    const nextBefore = state.nextId;
    const { state: next, events } = ok(
      state,
      "p1",
      propose(state, "p1", "p2", { cash: 500, properties: ["indian-railways"] }, { properties: ["national-highways"] }),
    );
    expect(next.trades).toEqual([
      {
        id: nextBefore,
        from: "p1",
        to: "p2",
        give: { cash: 500, properties: ["indian-railways"], jailFreeCards: [] },
        get: { cash: 0, properties: ["national-highways"], jailFreeCards: [] },
      },
    ]);
    expect(next.nextId).toBe(nextBefore + 1);
    expect(events).toEqual([{ type: "tradeProposed", tradeId: nextBefore, from: "p1", to: "p2" }]);
    // nothing moves until accepted
    expect(next.properties["indian-railways"]?.owner).toBe("p1");
    expect(next.players[0]?.cash).toBe(20_000);
  });

  test("rejected when trading is disabled", () => {
    const state = newGame({ settings: { tradingEnabled: false } });
    own(state, "indian-railways", "p1");
    expect(err(state, "p1", propose(state, "p1", "p2", { properties: ["indian-railways"] }, {}))).toBe(
      "trading is turned off in this room",
    );
  });

  test("works for a player whose turn it is not", () => {
    const state = railGame();
    expect(state.turn.playerId).toBe("p1");
    ok(state, "p2", propose(state, "p2", "p1", { properties: ["national-highways"] }, {}));
  });

  test("rejected while a buy decision or auction is open", () => {
    const state = railGame();
    state.pending = { kind: "buy", tileId: "patna" };
    expect(err(state, "p1", propose(state, "p1", "p2", { cash: 100 }, {}))).toBe(
      "finish the open buy decision or auction first",
    );
  });

  test("rejects an empty trade, a self trade and an unknown recipient", () => {
    const state = railGame();
    expect(err(state, "p1", propose(state, "p1", "p2", {}, {}))).toBe("a trade cannot be empty");
    expect(err(state, "p1", propose(state, "p1", "p1", { cash: 100 }, {}))).toBe("you cannot trade with yourself");
    expect(err(state, "p1", propose(state, "p1", "nobody", { cash: 100 }, {}))).toBe("unknown player");
  });

  test("rejects a bankrupt recipient", () => {
    const state = newGame({ players: 3 });
    const p3 = state.players[2];
    if (p3) p3.bankrupt = true;
    expect(err(state, "p1", propose(state, "p1", "p3", { cash: 100 }, {}))).toBe("both players must still be in the game");
  });

  test("rejects cash above either balance", () => {
    const state = railGame();
    expect(err(state, "p1", propose(state, "p1", "p2", { cash: 20_001 }, {}))).toBe(
      "Player 1 does not have enough cash for this trade",
    );
    expect(err(state, "p1", propose(state, "p1", "p2", {}, { cash: 20_001 }))).toBe(
      "Player 2 does not have enough cash for this trade",
    );
  });

  test("rejects a property the named side does not own, and duplicates", () => {
    const state = railGame();
    expect(err(state, "p1", propose(state, "p1", "p2", { properties: ["national-highways"] }, {}))).toBe(
      "National Highways is not owned by Player 1",
    );
    expect(err(state, "p1", propose(state, "p1", "p2", {}, { properties: ["indian-railways"] }))).toBe(
      "Indian Railways is not owned by Player 2",
    );
    expect(err(state, "p1", propose(state, "p1", "p2", { properties: ["indian-railways", "indian-railways"] }, {}))).toBe(
      "a property is listed twice",
    );
    expect(err(state, "p1", propose(state, "p1", "p2", { properties: ["nowhere"] }, {}))).toBe("that tile is not a property");
  });

  test("rejects a jail card the side does not hold", () => {
    const state = railGame();
    expect(err(state, "p1", propose(state, "p1", "p2", { jailFreeCards: ["CH15"] }, {}))).toBe(
      "Player 1 does not hold that Get Out of Jail Free card",
    );
  });

  test("rejects a city whose group has buildings", () => {
    const state = newGame();
    own(state, "patna", "p1");
    own(state, "ranchi", "p1", { houses: 1 });
    own(state, "raipur", "p1");
    expect(err(state, "p1", propose(state, "p1", "p2", { properties: ["patna"] }, {}))).toBe(
      "Patna cannot be traded while its colour group has buildings",
    );
  });

  test("allows a city whose group has no buildings", () => {
    const state = newGame();
    own(state, "patna", "p1");
    ok(state, "p1", propose(state, "p1", "p2", { properties: ["patna"] }, { cash: 1000 }));
  });
});

describe("acceptTrade", () => {
  function offered() {
    const state = railGame();
    state.players[0]?.jailFreeCards.push("CH15");
    const proposed = ok(
      state,
      "p1",
      propose(
        state,
        "p1",
        "p2",
        { cash: 500, properties: ["indian-railways"], jailFreeCards: ["CH15"] },
        { cash: 200, properties: ["national-highways"] },
      ),
    ).state;
    return { state: proposed, tradeId: proposed.trades[0]?.id as number };
  }

  test("swaps cash, properties and a jail card atomically", () => {
    const { state, tradeId } = offered();
    const { state: next, events } = ok(state, "p2", { type: "acceptTrade", tradeId });
    expect(next.properties["indian-railways"]?.owner).toBe("p2");
    expect(next.properties["national-highways"]?.owner).toBe("p1");
    expect(next.players[0]?.cash).toBe(20_000 - 500 + 200);
    expect(next.players[1]?.cash).toBe(20_000 + 500 - 200);
    expect(next.players[0]?.jailFreeCards).toEqual([]);
    expect(next.players[1]?.jailFreeCards).toEqual(["CH15"]);
    expect(next.trades).toEqual([]);
    expect(next.debts).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "tradeAccepted", tradeId });
    expect(next.ledger.filter((l) => l.reason === "trade").map((l) => [l.from, l.to, l.amount])).toEqual([
      ["p1", "p2", 500],
      ["p2", "p1", 200],
    ]);
  });

  test("a jail card alone changes hands", () => {
    const state = newGame();
    state.players[1]?.jailFreeCards.push("CC15");
    const proposed = ok(state, "p1", propose(state, "p1", "p2", { cash: 300 }, { jailFreeCards: ["CC15"] })).state;
    const next = ok(proposed, "p2", { type: "acceptTrade", tradeId: proposed.trades[0]?.id as number }).state;
    expect(next.players[0]?.jailFreeCards).toEqual(["CC15"]);
    expect(next.players[1]?.jailFreeCards).toEqual([]);
  });

  test("keeps the mortgage flag on a traded property", () => {
    const state = railGame();
    own(state, "indian-railways", "p1", { mortgaged: true });
    const proposed = ok(state, "p1", propose(state, "p1", "p2", { properties: ["indian-railways"] }, {})).state;
    const next = ok(proposed, "p2", { type: "acceptTrade", tradeId: proposed.trades[0]?.id as number }).state;
    expect(next.properties["indian-railways"]).toEqual({ owner: "p2", mortgaged: true, houses: 0, hotel: false });
  });

  test("a city can be traded when its group is clear", () => {
    const state = newGame();
    own(state, "patna", "p1");
    const proposed = ok(state, "p1", propose(state, "p1", "p2", { properties: ["patna"] }, {})).state;
    const next = ok(proposed, "p2", { type: "acceptTrade", tradeId: proposed.trades[0]?.id as number }).state;
    expect(next.properties.patna?.owner).toBe("p2");
  });

  test("only the recipient may accept", () => {
    const { state, tradeId } = offered();
    expect(err(state, "p1", { type: "acceptTrade", tradeId })).toBe("only the player the trade was offered to can accept it");
  });

  test("an unknown or already-closed trade is rejected", () => {
    const { state, tradeId } = offered();
    expect(err(state, "p2", { type: "acceptTrade", tradeId: 999 })).toBe("that trade is no longer open");
    const accepted = ok(state, "p2", { type: "acceptTrade", tradeId }).state;
    expect(err(accepted, "p2", { type: "acceptTrade", tradeId })).toBe("that trade is no longer open");
  });

  test("a stale trade fails on accept, stays open, and the proposer can cancel it", () => {
    const { state, tradeId } = offered();
    // p1 loses the property by other means after proposing
    own(state, "indian-railways", "p2");
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("Indian Railways is not owned by Player 1");
    expect(state.trades).toHaveLength(1);
    const cancelled = ok(state, "p1", { type: "cancelTrade", tradeId });
    expect(cancelled.state.trades).toEqual([]);
    expect(cancelled.events).toEqual([{ type: "tradeCancelled", tradeId }]);
  });

  test("fails when cash is no longer available", () => {
    const { state, tradeId } = offered();
    const p1 = state.players[0];
    if (p1) p1.cash = 100;
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("Player 1 does not have enough cash for this trade");
  });

  test("fails when the jail card has been used", () => {
    const { state, tradeId } = offered();
    const p1 = state.players[0];
    if (p1) p1.jailFreeCards = [];
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("Player 1 does not hold that Get Out of Jail Free card");
  });

  test("fails when buildings appeared in a traded city's group", () => {
    const state = newGame();
    own(state, "patna", "p1");
    const proposed = ok(state, "p1", propose(state, "p1", "p2", { properties: ["patna"] }, {})).state;
    own(proposed, "ranchi", "p1", { houses: 2 });
    expect(err(proposed, "p2", { type: "acceptTrade", tradeId: proposed.trades[0]?.id as number })).toBe(
      "Patna cannot be traded while its colour group has buildings",
    );
  });

  test("rejected while a buy decision or auction is open, and the trade stays open", () => {
    const { state, tradeId } = offered();
    state.pending = {
      kind: "auction",
      auction: { tileId: "patna", highBid: 500, highBidder: "p1", bidders: ["p1", "p2"] },
    };
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("finish the open buy decision or auction first");
    expect(state.trades).toHaveLength(1);
    state.pending = { kind: "buy", tileId: "patna" };
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("finish the open buy decision or auction first");
  });

  test("fails when trading was turned off after the proposal", () => {
    const { state, tradeId } = offered();
    state.economy.rules.tradingEnabled = false;
    expect(err(state, "p2", { type: "acceptTrade", tradeId })).toBe("trading is turned off in this room");
  });
});

describe("rejectTrade / cancelTrade", () => {
  function offered() {
    const state = railGame();
    const proposed = ok(state, "p1", propose(state, "p1", "p2", { cash: 100 }, {})).state;
    return { state: proposed, tradeId: proposed.trades[0]?.id as number };
  }

  test("the recipient rejects and the trade is removed", () => {
    const { state, tradeId } = offered();
    const { state: next, events } = ok(state, "p2", { type: "rejectTrade", tradeId });
    expect(next.trades).toEqual([]);
    expect(events).toEqual([{ type: "tradeRejected", tradeId }]);
    expect(next.players[0]?.cash).toBe(20_000);
  });

  test("the proposer cannot reject their own trade, and the recipient cannot cancel it", () => {
    const { state, tradeId } = offered();
    expect(err(state, "p1", { type: "rejectTrade", tradeId })).toBe("only the player the trade was offered to can reject it");
    expect(err(state, "p2", { type: "cancelTrade", tradeId })).toBe("only the player who proposed the trade can cancel it");
  });

  test("unknown trade ids are rejected", () => {
    const { state } = offered();
    expect(err(state, "p2", { type: "rejectTrade", tradeId: 999 })).toBe("that trade is no longer open");
    expect(err(state, "p1", { type: "cancelTrade", tradeId: 999 })).toBe("that trade is no longer open");
  });
});

describe("dropTradesFor", () => {
  test("removes every trade the player is party to, and only those", () => {
    const state = newGame({ players: 3 });
    const a = ok(state, "p1", propose(state, "p1", "p2", { cash: 100 }, {})).state;
    const b = ok(a, "p2", propose(a, "p2", "p3", { cash: 100 }, {})).state;
    const c = ok(b, "p3", propose(b, "p3", "p1", { cash: 100 }, {})).state;
    const ctx = makeCtx(structuredClone(c));
    dropTradesFor(ctx, "p1");
    expect(ctx.state.trades.map((t) => [t.from, t.to])).toEqual([["p2", "p3"]]);
    expect(ctx.events).toEqual([
      { type: "tradeCancelled", tradeId: c.trades[0]?.id as number },
      { type: "tradeCancelled", tradeId: c.trades[2]?.id as number },
    ]);
  });
});
