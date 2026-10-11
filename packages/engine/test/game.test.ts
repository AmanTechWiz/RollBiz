import { describe, expect, test } from "bun:test";
import { createGame } from "../src/game";
import { resolveEconomy } from "../src/economy/resolve";
import { toPublicView } from "../src/view";
import { newGame, seededRng, seqRng, diceRng } from "./helpers";
import { rollDie } from "../src/core/context";

const two = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];

describe("createGame", () => {
  test("pays starting money out of the bank and logs it", () => {
    const state = newGame({ players: 3 });
    expect(state.players.map((p) => p.cash)).toEqual([20_000, 20_000, 20_000]);
    expect(state.bank.cash).toBe(1_000_000 - 60_000);
    expect(state.ledger).toHaveLength(3);
    expect(state.ledger[0]).toMatchObject({ from: "bank", to: "p1", amount: 20_000 });
    expect(state.bank.houses).toBe(32);
    expect(state.bank.hotels).toBe(12);
  });

  test("initial turn and state", () => {
    const { state, events } = createGame(resolveEconomy(), two, seededRng(), 1000);
    expect(state.turn).toEqual({ playerId: "a", hasRolled: false, doublesCount: 0, rollAgain: false, lastRoll: null });
    expect(state).toMatchObject({ version: 0, pending: null, debts: [], trades: [], status: "playing", winnerId: null, endsAt: null });
    expect(state.processedActionIds).toEqual([]);
    expect(state.players[0]).toMatchObject({ position: 0, inJail: false, jailAttempts: 0, jailFreeCards: [], bankrupt: false });
    expect(events).toContainEqual({ type: "turnStarted", playerId: "a" });
  });

  test("properties has an unowned entry for every property tile", () => {
    const state = newGame();
    expect(Object.keys(state.properties)).toHaveLength(30);
    for (const ps of Object.values(state.properties)) {
      expect(ps).toEqual({ owner: null, mortgaged: false, houses: 0, hotel: false });
    }
    expect(state.properties["start"]).toBeUndefined();
  });

  test("decks hold 16 cards each, with the same cards as the economy", () => {
    const state = newGame();
    expect(state.decks.chance).toHaveLength(16);
    expect(state.decks.communityChest).toHaveLength(16);
    expect([...state.decks.chance].sort()).toEqual([...state.economy.decks.chance].sort());
  });

  test("the same rng gives the same shuffle, and the deck is actually shuffled", () => {
    const eco = resolveEconomy();
    const a = createGame(eco, two, seededRng(3), 0).state;
    const b = createGame(eco, two, seededRng(3), 0).state;
    const c = createGame(eco, two, seededRng(4), 0).state;
    expect(a.decks).toEqual(b.decks);
    expect(a.decks.chance).not.toEqual(eco.decks.chance);
    expect(a.decks).not.toEqual(c.decks);
  });

  test("does not reshuffle the economy's deck order", () => {
    const eco = resolveEconomy();
    const before = [...eco.decks.chance];
    createGame(eco, two, seededRng(), 0);
    expect([...eco.decks.chance]).toEqual(before);
  });

  test("stores a reference to the frozen economy", () => {
    const eco = resolveEconomy();
    const { state } = createGame(eco, two, seededRng(), 0);
    expect(state.economy).toBe(eco);
  });

  test("timed mode sets endsAt", () => {
    const state = newGame({ settings: { gameMode: "timed", durationMinutes: 30 }, now: 5_000 });
    expect(state.endsAt).toBe(5_000 + 30 * 60_000);
    expect(newGame().endsAt).toBeNull();
  });

  test("a small bank is replenished (and logged) to cover starting money", () => {
    const state = newGame({ settings: { bankCash: 10_000 } });
    expect(state.players.map((p) => p.cash)).toEqual([20_000, 20_000]);
    expect(state.bank.cash).toBe(0);
    expect(state.ledger.some((l) => l.reason === "bank replenishment")).toBe(true);
  });

  test("player count and id validation", () => {
    const eco = resolveEconomy();
    expect(() => createGame(eco, [{ id: "a", name: "A" }], seededRng(), 0)).toThrow();
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: "x" }));
    expect(() => createGame(eco, seven, seededRng(), 0)).toThrow();
    expect(() => createGame(eco, [{ id: "a", name: "A" }, { id: "a", name: "B" }], seededRng(), 0)).toThrow();
    const six = seven.slice(0, 6);
    expect(createGame(eco, six, seededRng(), 0).state.players).toHaveLength(6);
  });
});

describe("test helpers", () => {
  test("diceRng round-trips through rollDie", () => {
    const rng = diceRng([1, 6], [3, 3]);
    expect([rollDie(rng), rollDie(rng), rollDie(rng), rollDie(rng)]).toEqual([1, 6, 3, 3]);
  });

  test("seqRng throws when exhausted", () => {
    const rng = seqRng([0.1]);
    rng();
    expect(() => rng()).toThrow();
  });
});

describe("toPublicView", () => {
  test("hides decks, action ids and economy; exposes deck sizes", () => {
    const state = newGame();
    state.processedActionIds.push("x");
    const view = toPublicView(state) as Record<string, unknown>;
    expect(view.decks).toBeUndefined();
    expect(view.processedActionIds).toBeUndefined();
    expect(view.economy).toBeUndefined();
    expect(view.deckSizes).toEqual({ chance: 16, communityChest: 16 });
    expect(view.players).toBe(state.players);
    expect(view.version).toBe(0);
  });
});
