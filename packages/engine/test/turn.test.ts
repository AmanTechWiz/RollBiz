import { describe, expect, test } from "bun:test";
import { applyAction } from "../src/engine";
import { movePlayer, startNextTurn } from "../src/rules/turn";
import type { GameEvent, GameState, PlayerId } from "../src/types";
import { act, diceRng, makeCtx, newGame } from "./helpers";

/**
 * A game where p2 owns every property, all mortgaged: landing on a property costs nothing and
 * opens no buy decision, so tests about movement and special spaces stay free of side effects.
 */
function setup(players = 2, settings = {}): GameState {
  const state = newGame({ players, settings });
  for (const prop of Object.values(state.properties)) Object.assign(prop, { owner: "p2", mortgaged: true });
  return state;
}

function roll(state: GameState, ...pairs: [number, number][]) {
  return act(state, state.turn.playerId, { type: "roll" }, diceRng(...pairs));
}

function player(state: GameState, id: PlayerId) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

function types(events: GameEvent[]) {
  return events.map((e) => e.type);
}

function reject(
  state: GameState,
  playerId: PlayerId,
  type: "roll" | "endTurn" | "payJailFine" | "useJailCard",
  rng = diceRng([1, 2]),
) {
  const result = applyAction(state, playerId, { type }, rng);
  if (result.ok) throw new Error(`expected ${type} to be rejected`);
  return result.error;
}

const START_BONUS = 2000;

describe("roll and move", () => {
  test("a plain move lands on the tile and resolves it", () => {
    const s = setup();
    const { state, events } = roll(s, [1, 3]);
    expect(player(state, "p1").position).toBe(4);
    expect(state.turn).toEqual({ playerId: "p1", hasRolled: true, doublesCount: 0, rollAgain: false, lastRoll: [1, 3] });
    expect(types(events)).toEqual(["rolled", "moved"]);
    expect(events[1]).toEqual({ type: "moved", playerId: "p1", from: 0, to: 4, passedStart: false });
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney);
  });

  test("landing on an unowned property opens a buy decision", () => {
    const s = setup();
    Object.assign(s.properties.raipur as object, { owner: null, mortgaged: false });
    const { state } = roll(s, [1, 3]);
    expect(state.pending).toEqual({ kind: "buy", tileId: "raipur" });
  });

  test("landing on an owned property charges rent, using the dice total for utilities", () => {
    const s = setup();
    Object.assign(s.properties["power-grid"] as object, { mortgaged: false });
    Object.assign(s.properties["digital-bharat-network"] as object, { owner: null });
    player(s, "p1").position = 8;
    const { state } = roll(s, [1, 3]);
    expect(player(state, "p1").position).toBe(12);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney - 16); // 4x the total of 4
    expect(player(state, "p2").cash).toBe(s.economy.startingMoney + 16);
  });

  test("passing Start pays the bonus once", () => {
    const s = setup();
    player(s, "p1").position = 38;
    const { state, events } = roll(s, [1, 2]);
    expect(player(state, "p1").position).toBe(1);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney + START_BONUS);
    expect(state.ledger.filter((l) => l.reason === "passed Start")).toHaveLength(1);
    expect(events.find((e) => e.type === "moved")).toMatchObject({ passedStart: true });
  });

  test("landing exactly on Start pays the bonus once", () => {
    const s = setup();
    player(s, "p1").position = 36;
    const { state } = roll(s, [1, 3]);
    expect(player(state, "p1").position).toBe(0);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney + START_BONUS);
    expect(state.ledger.filter((l) => l.reason === "passed Start")).toHaveLength(1);
  });

  test("doubles force another roll, and a non-double ends the chain", () => {
    const s = setup();
    const first = roll(s, [2, 2]);
    expect(first.state.turn).toMatchObject({ hasRolled: true, doublesCount: 1, rollAgain: true });
    expect(reject(first.state, "p1", "endTurn")).toBe("you rolled doubles: roll again");
    const second = roll(first.state, [1, 2]);
    expect(player(second.state, "p1").position).toBe(7);
    expect(second.state.turn).toMatchObject({ doublesCount: 0, rollAgain: false });
    expect(reject(second.state, "p1", "roll")).toBe("you have already rolled this turn");
    expect(act(second.state, "p1", { type: "endTurn" }).state.turn.playerId).toBe("p2");
  });

  test("doubles do not grant another roll when the setting is off", () => {
    const s = setup(2, { doublesRollAgain: false });
    const { state } = roll(s, [2, 2]);
    expect(state.turn.rollAgain).toBe(false);
    act(state, "p1", { type: "endTurn" });
  });

  test("three doubles in a row send the player to jail and end the turn", () => {
    const s = setup();
    player(s, "p1").position = 3;
    const a = roll(s, [1, 1]);
    const b = roll(a.state, [2, 2]);
    expect(player(b.state, "p1").position).toBe(9);
    const c = roll(b.state, [3, 3]);
    expect(player(c.state, "p1")).toMatchObject({ position: 10, inJail: true, jailAttempts: 0 });
    expect(c.state.turn).toMatchObject({ hasRolled: true, rollAgain: false, doublesCount: 3 });
    expect(types(c.events)).toEqual(["rolled", "sentToJail"]); // the third roll never moved
    expect(act(c.state, "p1", { type: "endTurn" }).state.turn.playerId).toBe("p2");
  });

  test("three doubles are an ordinary roll when threeDoublesToJail is off", () => {
    const s = setup(2, { threeDoublesToJail: false });
    player(s, "p1").position = 3;
    const c = roll(roll(roll(s, [1, 1]).state, [2, 2]).state, [3, 3]);
    expect(player(c.state, "p1")).toMatchObject({ position: 15, inJail: false });
    expect(c.state.turn.rollAgain).toBe(true);
  });

  test("rolling is rejected out of turn and with a pending decision", () => {
    const s = setup();
    expect(reject(s, "p2", "roll")).toBe("it is not your turn");
    s.pending = { kind: "buy", tileId: "patna" };
    expect(reject(s, "p1", "roll")).toBe("finish the open buy decision or auction first");
  });

  test("rolling is rejected while a debt is outstanding", () => {
    const s = setup();
    s.debts.push({ id: 99, debtor: "p1", creditor: "bank", amount: 100, reason: "test" });
    expect(reject(s, "p1", "roll")).toBe("outstanding debts must be settled first");
  });
});

describe("special spaces", () => {
  test("Jail tile is just visiting", () => {
    const s = setup();
    player(s, "p1").position = 4;
    const { state } = roll(s, [4, 2]);
    expect(player(state, "p1")).toMatchObject({ position: 10, inJail: false, cash: s.economy.startingMoney });
  });

  test("Income Tax pays the bank", () => {
    const s = setup();
    const { state } = roll(s, [3, 4]);
    expect(player(state, "p1").position).toBe(7);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney - 500);
    expect(state.bank.cash).toBe(s.bank.cash + 500);
  });

  test("Start tile adds nothing beyond the bonus", () => {
    const s = setup();
    player(s, "p1").position = 30;
    const { state } = roll(s, [4, 6]);
    expect(player(state, "p1").position).toBe(0);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney + START_BONUS);
  });

  describe("Wealth Tax", () => {
    const run = (houses: number, hotels: number) => {
      const s = setup();
      // Spread over properties so per-tile limits don't matter: 3 houses each first, then hotels.
      const ids = Object.keys(s.properties);
      let i = 0;
      for (let left = houses; left > 0; left -= 3) {
        Object.assign(s.properties[ids[i++] as string] as object, { owner: "p1", houses: Math.min(3, left) });
      }
      for (let k = 0; k < hotels; k++) Object.assign(s.properties[ids[i++] as string] as object, { owner: "p1", hotel: true });
      player(s, "p1").position = 31;
      const { state } = roll(s, [2, 4]);
      expect(player(state, "p1").position).toBe(37);
      return s.economy.startingMoney - player(state, "p1").cash;
    };
    test("0 buildings pays nothing", () => expect(run(0, 0)).toBe(0));
    test("3 buildings pays 100 each", () => expect(run(2, 1)).toBe(300));
    test("10 buildings is capped at 500", () => expect(run(7, 3)).toBe(500));
    test("other players' buildings are not counted", () => {
      const s = setup();
      Object.assign(s.properties.patna as object, { owner: "p2", houses: 3, mortgaged: false });
      player(s, "p1").position = 31;
      const { state } = roll(s, [2, 4]);
      expect(player(state, "p1").cash).toBe(s.economy.startingMoney);
    });
  });

  test("Rest House collects from each other active player", () => {
    const s = setup(3);
    player(s, "p1").position = 14;
    const { state } = roll(s, [2, 4]);
    expect(player(state, "p1").position).toBe(20);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney + 200);
    expect(player(state, "p2").cash).toBe(s.economy.startingMoney - 100);
    expect(player(state, "p3").cash).toBe(s.economy.startingMoney - 100);
  });

  test("Rest House skips bankrupt players and queues a debt for one who cannot pay", () => {
    const s = setup(4);
    player(s, "p1").position = 14;
    player(s, "p2").bankrupt = true;
    player(s, "p3").cash = 50;
    const { state } = roll(s, [2, 4]);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney + 100); // only p4 paid
    expect(player(state, "p3").cash).toBe(50);
    expect(state.debts).toMatchObject([{ debtor: "p3", creditor: "p1", amount: 100 }]);
  });

  test("Club pays each other active player", () => {
    const s = setup(3);
    player(s, "p1").position = 24;
    const { state } = roll(s, [2, 4]);
    expect(player(state, "p1").position).toBe(30);
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney - 200);
    expect(player(state, "p2").cash).toBe(s.economy.startingMoney + 100);
    expect(player(state, "p3").cash).toBe(s.economy.startingMoney + 100);
  });

  test("Club with too little cash pays who it can and queues the rest as a debt", () => {
    const s = setup(3);
    player(s, "p1").position = 24;
    player(s, "p1").cash = 150;
    const { state } = roll(s, [2, 4]);
    expect(player(state, "p1").cash).toBe(50);
    expect(state.debts).toMatchObject([{ debtor: "p1", creditor: "p3", amount: 100 }]);
  });

  test("Chance and Community Chest draw a card", () => {
    const s = setup();
    player(s, "p1").position = 14;
    s.decks.chance = ["CH01", ...s.decks.chance.filter((c) => c !== "CH01")];
    const { state, events } = roll(s, [1, 2]);
    expect(player(state, "p1")).toMatchObject({ position: 17, cash: s.economy.startingMoney + 2000 });
    expect(events.find((e) => e.type === "cardDrawn")).toMatchObject({ cardId: "CH01" });

    const t = setup();
    t.decks.communityChest = ["CC01", ...t.decks.communityChest.filter((c) => c !== "CC01")];
    const second = roll(t, [1, 1]);
    expect(player(second.state, "p1")).toMatchObject({ position: 2, cash: t.economy.startingMoney + 1000 });
  });
});

describe("jail", () => {
  function jailed(settings = {}) {
    const s = setup(2, settings);
    Object.assign(player(s, "p1"), { position: 10, inJail: true });
    return s;
  }

  test("rolling doubles escapes, moves, and grants no extra roll", () => {
    const s = jailed();
    const { state, events } = roll(s, [3, 3]);
    expect(player(state, "p1")).toMatchObject({ inJail: false, position: 16, jailAttempts: 0, cash: s.economy.startingMoney });
    expect(state.turn).toMatchObject({ hasRolled: true, rollAgain: false, doublesCount: 0 });
    expect(events.find((e) => e.type === "leftJail")).toEqual({ type: "leftJail", playerId: "p1", via: "doubles" });
    expect(types(events)).toEqual(["rolled", "leftJail", "moved"]);
  });

  test("a failed attempt keeps the player in jail and ends the turn", () => {
    const s = jailed();
    const { state } = roll(s, [1, 2]);
    expect(player(state, "p1")).toMatchObject({ inJail: true, position: 10, jailAttempts: 1 });
    expect(state.turn).toMatchObject({ hasRolled: true, rollAgain: false });
    expect(act(state, "p1", { type: "endTurn" }).state.turn.playerId).toBe("p2");
  });

  test("the third failure forces the fine, then moves with that roll", () => {
    const s = jailed();
    player(s, "p1").jailAttempts = 2;
    const { state, events } = roll(s, [1, 3]);
    expect(player(state, "p1")).toMatchObject({ inJail: false, position: 14, jailAttempts: 0 });
    expect(player(state, "p1").cash).toBe(s.economy.startingMoney - 500);
    expect(state.bank.cash).toBe(s.bank.cash + 500);
    expect(events.find((e) => e.type === "leftJail")).toMatchObject({ via: "fine" });
    expect(state.turn.rollAgain).toBe(false);
  });

  test("a third failure the player cannot afford still frees and moves them, leaving a debt", () => {
    const s = jailed();
    Object.assign(player(s, "p1"), { jailAttempts: 2, cash: 100 });
    const { state } = roll(s, [1, 3]);
    expect(player(state, "p1")).toMatchObject({ inJail: false, position: 14, cash: 100 });
    expect(state.debts).toMatchObject([{ debtor: "p1", creditor: "bank", amount: 500 }]);
    expect(reject(state, "p1", "endTurn")).toBe("outstanding debts must be settled first");
  });

  test("payJailFine frees the player before rolling, who can then roll normally", () => {
    const s = jailed();
    const paid = act(s, "p1", { type: "payJailFine" });
    expect(player(paid.state, "p1")).toMatchObject({ inJail: false, cash: s.economy.startingMoney - 500, position: 10 });
    expect(paid.state.turn.hasRolled).toBe(false);
    expect(paid.events.find((e) => e.type === "leftJail")).toMatchObject({ via: "fine" });
    const { state } = roll(paid.state, [2, 2]);
    expect(player(state, "p1").position).toBe(14);
    expect(state.turn.rollAgain).toBe(true);
  });

  test("payJailFine rules: needs jail, needs cash, only before rolling", () => {
    const free = setup();
    expect(reject(free, "p1", "payJailFine")).toBe("you are not in jail");
    const poor = jailed();
    player(poor, "p1").cash = 499;
    expect(reject(poor, "p1", "payJailFine")).toBe("you cannot afford the jail fine");
    const attempted = roll(jailed(), [1, 2]).state;
    expect(reject(attempted, "p1", "payJailFine")).toBe("you can only do that before rolling");
    expect(reject(jailed(), "p2", "payJailFine")).toBe("it is not your turn");
  });

  test.each([
    ["CH15", "chance"],
    ["CC15", "communityChest"],
  ] as const)("useJailCard with %s frees the player and returns the card to the bottom of its deck", (cardId, deck) => {
    const s = jailed();
    s.decks[deck] = s.decks[deck].filter((c) => c !== cardId); // the player is holding it
    player(s, "p1").jailFreeCards = [cardId];
    const { state, events } = act(s, "p1", { type: "useJailCard" });
    expect(player(state, "p1")).toMatchObject({ inJail: false, jailFreeCards: [], cash: s.economy.startingMoney });
    expect(state.decks[deck].at(-1)).toBe(cardId);
    expect(state.decks[deck]).toHaveLength(16);
    expect(events.find((e) => e.type === "leftJail")).toMatchObject({ via: "card" });
    expect(state.turn.hasRolled).toBe(false);
  });

  test("useJailCard rules: needs a card, needs jail, only before rolling", () => {
    expect(reject(jailed(), "p1", "useJailCard")).toBe("you have no Get Out of Jail Free card");
    const free = setup();
    player(free, "p1").jailFreeCards = ["CH15"];
    expect(reject(free, "p1", "useJailCard")).toBe("you are not in jail");
    const attempted = roll(jailed(), [1, 2]).state;
    player(attempted, "p1").jailFreeCards = ["CH15"];
    expect(reject(attempted, "p1", "useJailCard")).toBe("you can only do that before rolling");
  });
});

describe("end turn", () => {
  test("is rejected before rolling, out of turn, and with a pending decision", () => {
    const s = setup();
    expect(reject(s, "p1", "endTurn")).toBe("roll the dice before ending your turn");
    expect(reject(s, "p2", "endTurn")).toBe("it is not your turn");
    const rolled = roll(s, [1, 2]).state;
    rolled.pending = { kind: "buy", tileId: "patna" };
    expect(reject(rolled, "p1", "endTurn")).toBe("finish the open buy decision or auction first");
  });

  test("passes the turn on with a fresh turn state and emits turnStarted", () => {
    const s = setup(3);
    const rolled = roll(s, [1, 2]).state;
    const { state, events } = act(rolled, "p1", { type: "endTurn" });
    expect(state.turn).toEqual({ playerId: "p2", hasRolled: false, doublesCount: 0, rollAgain: false, lastRoll: null });
    expect(events).toEqual([{ type: "turnStarted", playerId: "p2" }]);
  });

  test("skips bankrupt players and wraps around", () => {
    const s = setup(3);
    player(s, "p2").bankrupt = true;
    const ctx = makeCtx(s);
    startNextTurn(ctx);
    expect(s.turn.playerId).toBe("p3");
    startNextTurn(ctx);
    expect(s.turn.playerId).toBe("p1");
    expect(ctx.events).toEqual([
      { type: "turnStarted", playerId: "p3" },
      { type: "turnStarted", playerId: "p1" },
    ]);
  });

  test("startNextTurn works when the current player has just gone bankrupt", () => {
    const s = setup(3);
    s.turn.playerId = "p3";
    player(s, "p3").bankrupt = true;
    startNextTurn(makeCtx(s));
    expect(s.turn.playerId).toBe("p1");
  });
});

describe("movePlayer", () => {
  test("a forward move to an earlier index wraps and pays the bonus", () => {
    const s = setup();
    player(s, "p1").position = 34;
    const ctx = makeCtx(s);
    movePlayer(ctx, "p1", { to: 17 });
    expect(player(s, "p1")).toMatchObject({ position: 17, cash: s.economy.startingMoney + START_BONUS });
    expect(ctx.events.find((e) => e.type === "moved")).toEqual({
      type: "moved",
      playerId: "p1",
      from: 34,
      to: 17,
      passedStart: true,
    });
  });

  test("moving to the current tile stays put and pays nothing", () => {
    const s = setup();
    player(s, "p1").position = 17;
    movePlayer(makeCtx(s), "p1", { to: 17 });
    expect(player(s, "p1")).toMatchObject({ position: 17, cash: s.economy.startingMoney });
  });
});
