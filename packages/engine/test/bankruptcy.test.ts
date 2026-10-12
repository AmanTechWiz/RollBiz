import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { applyAction, applySystemAction } from "../src/engine";
import { netWorth } from "../src/rules/bankruptcy";
import type { Debt, GameState, Party, PlayerId } from "../src/types";
import { newGame, seededRng } from "./helpers";

function own(state: GameState, tileId: string, owner: PlayerId, extra: Partial<GameState["properties"][string]> = {}) {
  state.properties[tileId] = { owner, mortgaged: false, houses: 0, hotel: false, ...extra };
}

function cash(state: GameState, playerId: PlayerId, amount: number) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error("no such player");
  p.cash = amount;
}

function player(state: GameState, playerId: PlayerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error("no such player");
  return p;
}

/** Adds an outstanding debt the way `pay` would. */
function addDebt(state: GameState, debtor: PlayerId, creditor: Party, amount: number, reason = "rent"): Debt {
  const debt: Debt = { id: state.nextId++, debtor, creditor, amount, reason };
  state.debts.push(debt);
  return debt;
}

function ok(state: GameState, playerId: PlayerId, action: Action) {
  const result = applyAction(state, playerId, action, seededRng(5));
  if (!result.ok) throw new Error(`rejected: ${result.error}`);
  return result;
}

function err(state: GameState, playerId: PlayerId, action: Action): string {
  const result = applyAction(state, playerId, action, seededRng(5));
  if (result.ok) throw new Error("expected a rejection");
  return result.error;
}

function forfeit(state: GameState, playerId: PlayerId) {
  const result = applySystemAction(state, { type: "forfeit", playerId }, seededRng(5));
  if (!result.ok) throw new Error(`rejected: ${result.error}`);
  return result;
}

describe("netWorth", () => {
  test("exact value for a mixed portfolio", () => {
    const state = newGame();
    cash(state, "p1", 5_000);
    own(state, "patna", "p1", { houses: 2 }); // 2000 + 2 x 1000
    own(state, "ranchi", "p1", { mortgaged: true }); // mortgage value 1200
    own(state, "raipur", "p1", { hotel: true }); // 2800 + hotel 1000 + 3 x house 1000
    own(state, "indian-railways", "p1"); // 7000
    own(state, "power-grid", "p1", { mortgaged: true }); // mortgage value 2500
    own(state, "national-highways", "p2"); // not counted
    expect(netWorth(state, "p1")).toBe(5_000 + 4_000 + 1_200 + 6_800 + 7_000 + 2_500);
    expect(netWorth(state, "p1")).toBe(26_500);
  });

  test("a player with only cash is worth their cash", () => {
    expect(netWorth(newGame(), "p2")).toBe(20_000);
  });
});

describe("payDebt", () => {
  test("pays the debt once the player has the cash (e.g. after mortgaging), emits debtPaid", () => {
    const state = newGame();
    cash(state, "p1", 300);
    const debt = addDebt(state, "p1", "p2", 1_000);
    expect(err(state, "p1", { type: "payDebt" })).toBe("not enough cash to pay this debt");
    expect(state.debts).toHaveLength(1);

    cash(state, "p1", 300 + 1_000); // proceeds of a mortgage
    const { state: next, events } = ok(state, "p1", { type: "payDebt" });
    expect(next.debts).toEqual([]);
    expect(player(next, "p1").cash).toBe(300);
    expect(player(next, "p2").cash).toBe(21_000);
    expect(events).toEqual([
      { type: "paid", from: "p1", to: "p2", amount: 1_000, reason: "rent" },
      { type: "debtPaid", debtId: debt.id },
    ]);
  });

  test("pays the oldest debt first, to the bank when the bank is the creditor", () => {
    const state = newGame();
    cash(state, "p1", 1_500);
    const first = addDebt(state, "p1", "bank", 900, "tax");
    const second = addDebt(state, "p1", "p2", 900, "rent");
    const { state: next } = ok(state, "p1", { type: "payDebt" });
    expect(next.debts.map((d) => d.id)).toEqual([second.id]);
    expect(first.id).toBeLessThan(second.id);
    expect(player(next, "p1").cash).toBe(600);
    expect(next.bank.cash).toBe(state.bank.cash + 900);
    // the second is still unaffordable
    expect(err(next, "p1", { type: "payDebt" })).toBe("not enough cash to pay this debt");
  });

  test("only a debtor can pay, and debts block everyone else", () => {
    const state = newGame({ players: 3 });
    addDebt(state, "p1", "p2", 500);
    expect(err(state, "p2", { type: "payDebt" })).toBe("waiting for debts to be settled");
    expect(err(state, "p2", { type: "endTurn" })).toBe("outstanding debts must be settled first");
  });

  test("with no debt there is nothing to pay", () => {
    expect(err(newGame(), "p1", { type: "payDebt" })).toBe("you have no debt to pay");
  });
});

describe("declareBankruptcy to a player", () => {
  function setup() {
    const state = newGame({ players: 3 });
    // p2 (not holding the turn) owes p3 more than they have
    cash(state, "p2", 400);
    own(state, "indian-railways", "p2");
    own(state, "national-highways", "p2", { mortgaged: true });
    player(state, "p2").jailFreeCards.push("CH15");
    addDebt(state, "p2", "p3", 5_000);
    return state;
  }

  test("cash, properties (mortgage kept) and jail cards go to the creditor", () => {
    const state = setup();
    const p3Before = player(state, "p3").cash;
    const { state: next, events } = ok(state, "p2", { type: "declareBankruptcy" });
    const p2 = player(next, "p2");
    expect(p2.bankrupt).toBe(true);
    expect(p2.cash).toBe(0);
    expect(p2.jailFreeCards).toEqual([]);
    expect(player(next, "p3").cash).toBe(p3Before + 400);
    expect(player(next, "p3").jailFreeCards).toEqual(["CH15"]);
    expect(next.properties["indian-railways"]).toEqual({ owner: "p3", mortgaged: false, houses: 0, hotel: false });
    expect(next.properties["national-highways"]).toEqual({ owner: "p3", mortgaged: true, houses: 0, hotel: false });
    expect(next.debts).toEqual([]);
    expect(next.status).toBe("playing");
    expect(next.turn.playerId).toBe("p1");
    expect(events).toContainEqual({ type: "bankrupt", playerId: "p2", creditor: "p3" });
  });

  test("buildings are sold to the bank first and the refund goes to the creditor", () => {
    const state = setup();
    own(state, "patna", "p2", { houses: 2 });
    own(state, "ranchi", "p2", { houses: 3 });
    own(state, "raipur", "p2", { hotel: true });
    // inventory as if those buildings had been built: 5 houses and 1 hotel out
    state.bank.houses -= 5;
    state.bank.hotels -= 1;
    const housesBefore = state.bank.houses;
    const hotelsBefore = state.bank.hotels;
    const p3Before = player(state, "p3").cash;

    const { state: next } = ok(state, "p2", { type: "declareBankruptcy" });
    for (const id of ["patna", "ranchi", "raipur"]) {
      expect(next.properties[id]).toMatchObject({ owner: "p3", houses: 0, hotel: false });
    }
    // 50% of the cost refunded: 5 houses + a hotel (hotel sale refunds its own cost and 3 houses via downgrade)
    expect(next.bank.houses).toBeGreaterThan(housesBefore);
    expect(next.bank.hotels).toBe(hotelsBefore + 1);
    expect(player(next, "p3").cash).toBeGreaterThan(p3Before + 400);
    expect(player(next, "p2").cash).toBe(0);
  });

  test("cannot declare bankruptcy without a debt", () => {
    const state = newGame();
    expect(err(state, "p1", { type: "declareBankruptcy" })).toBe("you can only declare bankruptcy while you owe a debt");
  });

  test("the creditor is the oldest debt's creditor; the debtor's other debts are deleted", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 100);
    addDebt(state, "p2", "p3", 2_000);
    addDebt(state, "p2", "p1", 3_000);
    const { state: next } = ok(state, "p2", { type: "declareBankruptcy" });
    expect(player(next, "p3").cash).toBe(20_100);
    expect(player(next, "p1").cash).toBe(20_000);
    expect(next.debts).toEqual([]);
  });
});

describe("declareBankruptcy to the bank", () => {
  test("properties become unowned and unmortgaged, cash goes to the bank, jail card returns to its deck", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 700);
    own(state, "indian-railways", "p2", { mortgaged: true });
    own(state, "power-grid", "p2");
    player(state, "p2").jailFreeCards.push("CC15");
    state.decks.communityChest = state.decks.communityChest.filter((c) => c !== "CC15");
    const deckSize = state.decks.communityChest.length;
    addDebt(state, "p2", "bank", 9_000, "income tax");
    const bankBefore = state.bank.cash;

    const { state: next, events } = ok(state, "p2", { type: "declareBankruptcy" });
    expect(next.properties["indian-railways"]).toEqual({ owner: null, mortgaged: false, houses: 0, hotel: false });
    expect(next.properties["power-grid"]).toEqual({ owner: null, mortgaged: false, houses: 0, hotel: false });
    expect(next.bank.cash).toBe(bankBefore + 700);
    expect(player(next, "p2")).toMatchObject({ bankrupt: true, cash: 0, jailFreeCards: [] });
    expect(next.decks.communityChest).toHaveLength(deckSize + 1);
    expect(next.decks.communityChest.at(-1)).toBe("CC15");
    expect(events).toContainEqual({ type: "bankrupt", playerId: "p2", creditor: "bank" });
  });

  test("buildings return to the bank inventory", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 0);
    own(state, "patna", "p2", { houses: 3 });
    own(state, "ranchi", "p2", { houses: 1 });
    own(state, "raipur", "p2", { hotel: true });
    state.bank.houses -= 4;
    state.bank.hotels -= 1;
    addDebt(state, "p2", "bank", 9_000);
    const { state: next } = ok(state, "p2", { type: "declareBankruptcy" });
    expect(next.bank.houses).toBe(state.economy.bank.houses);
    expect(next.bank.hotels).toBe(state.economy.bank.hotels);
    for (const id of ["patna", "ranchi", "raipur"]) {
      expect(next.properties[id]).toEqual({ owner: null, mortgaged: false, houses: 0, hotel: false });
    }
  });
});

describe("cascading debts", () => {
  test("a creditor going bankrupt redirects the debts owed to them to the bank", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 100);
    cash(state, "p3", 50);
    addDebt(state, "p2", "p3", 500); // p2 owes p3
    const toP1 = addDebt(state, "p3", "p1", 9_000); // p3 owes p1 and cannot pay
    const { state: next } = ok(state, "p3", { type: "declareBankruptcy" });

    expect(next.debts).toHaveLength(1);
    expect(next.debts[0]).toMatchObject({ debtor: "p2", creditor: "bank", amount: 500 });
    expect(next.debts.some((d) => d.id === toP1.id)).toBe(false);
    expect(player(next, "p1").cash).toBe(20_050); // p3's remaining cash

    // p2 still has to settle; nobody else can progress until then
    expect(err(next, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
    cash(next, "p2", 600);
    const settled = ok(next, "p2", { type: "payDebt" }).state;
    expect(settled.debts).toEqual([]);
    expect(player(settled, "p2").cash).toBe(100);
    expect(settled.bank.cash).toBe(next.bank.cash + 500);
  });

  test("several debtors keep their own debts until each clears or goes bankrupt", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 0);
    cash(state, "p3", 0);
    addDebt(state, "p2", "p1", 700);
    addDebt(state, "p3", "p1", 800);
    const afterP2 = ok(state, "p2", { type: "declareBankruptcy" }).state;
    expect(afterP2.debts.map((d) => d.debtor)).toEqual(["p3"]);
    expect(err(afterP2, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
    expect(err(afterP2, "p2", { type: "payDebt" })).toBe("you are bankrupt");
  });
});

describe("forfeit", () => {
  test("a player with no debt leaves to the bank; the game goes on", () => {
    const state = newGame({ players: 3 });
    own(state, "indian-railways", "p2", { mortgaged: true });
    cash(state, "p2", 1_234);
    const { state: next, events } = forfeit(state, "p2");
    expect(player(next, "p2")).toMatchObject({ bankrupt: true, cash: 0 });
    expect(next.properties["indian-railways"]).toEqual({ owner: null, mortgaged: false, houses: 0, hotel: false });
    expect(next.bank.cash).toBe(state.bank.cash + 1_234);
    expect(next.status).toBe("playing");
    expect(next.winnerId).toBeNull();
    expect(events).toContainEqual({ type: "bankrupt", playerId: "p2", creditor: "bank" });
  });

  test("assets go to the bank even when the leaver owes another player", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 300);
    addDebt(state, "p2", "p3", 5_000);
    const { state: next } = forfeit(state, "p2");
    expect(player(next, "p3").cash).toBe(20_000);
    expect(next.debts).toEqual([]);
  });

  test("a forfeited creditor's debts are redirected to the bank, the leaver's own are deleted", () => {
    const state = newGame({ players: 3 });
    addDebt(state, "p2", "p3", 500);
    addDebt(state, "p3", "p2", 600);
    cash(state, "p2", 0);
    cash(state, "p3", 0);
    const { state: next } = forfeit(state, "p3");
    expect(next.debts).toEqual([expect.objectContaining({ debtor: "p2", creditor: "bank", amount: 500 })]);
  });

  test("drops every open trade the leaver is party to", () => {
    const state = newGame({ players: 3 });
    state.trades.push(
      { id: state.nextId++, from: "p1", to: "p2", give: { cash: 100, properties: [], jailFreeCards: [] }, get: { cash: 0, properties: [], jailFreeCards: [] } },
      { id: state.nextId++, from: "p2", to: "p3", give: { cash: 100, properties: [], jailFreeCards: [] }, get: { cash: 0, properties: [], jailFreeCards: [] } },
      { id: state.nextId++, from: "p1", to: "p3", give: { cash: 100, properties: [], jailFreeCards: [] }, get: { cash: 0, properties: [], jailFreeCards: [] } },
    );
    const { state: next } = forfeit(state, "p2");
    expect(next.trades.map((t) => [t.from, t.to])).toEqual([["p1", "p3"]]);
  });

  test("cannot forfeit twice", () => {
    const state = newGame({ players: 3 });
    const next = forfeit(state, "p2").state;
    const again = applySystemAction(next, { type: "forfeit", playerId: "p2" }, seededRng(5));
    expect(again).toEqual({ ok: false, error: "that player is already bankrupt" });
  });

  test("a leaver who owed a debt leaves no debt behind, and the rest can act again", () => {
    const state = newGame({ players: 3 });
    cash(state, "p2", 0);
    addDebt(state, "p2", "bank", 900);
    const next = forfeit(state, "p2").state;
    expect(next.debts).toEqual([]);
    expect(next.trades).toEqual([]);
  });

  test("holding the turn: the turn passes to the next player and a pending buy is cleared", () => {
    const state = newGame({ players: 3 });
    state.turn.hasRolled = true;
    state.pending = { kind: "buy", tileId: "patna" };
    const { state: next, events } = forfeit(state, "p1");
    expect(player(next, "p1").bankrupt).toBe(true);
    expect(next.pending).toBeNull();
    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.hasRolled).toBe(false);
    expect(events).toContainEqual({ type: "turnStarted", playerId: "p2" });
  });

  test("a buy decision belonging to someone else is left alone", () => {
    const state = newGame({ players: 3 });
    state.pending = { kind: "buy", tileId: "patna" };
    const { state: next } = forfeit(state, "p3");
    expect(next.pending).toEqual({ kind: "buy", tileId: "patna" });
    expect(next.turn.playerId).toBe("p1");
  });

  test("as the high bidder: no dangling auction reference to the leaver", () => {
    const state = newGame({ players: 3 });
    state.pending = {
      kind: "auction",
      auction: { tileId: "patna", highBid: 500, highBidder: "p2", bidders: ["p1", "p2", "p3"] },
    };
    cash(state, "p2", 4_000);
    const { state: next } = forfeit(state, "p2");
    if (next.pending?.kind === "auction") {
      expect(next.pending.auction.highBidder).not.toBe("p2");
      expect(next.pending.auction.bidders).not.toContain("p2");
    } else {
      expect(next.pending).toBeNull();
    }
    expect(player(next, "p2").bankrupt).toBe(true);
  });

  test("holding the turn during a debt cascade: the new turn holder still waits for debts", () => {
    const state = newGame({ players: 3 });
    cash(state, "p3", 0);
    addDebt(state, "p3", "p1", 500);
    const { state: next } = forfeit(state, "p1");
    // p1 (the turn holder and creditor) left: p3's debt now belongs to the bank
    expect(next.debts).toEqual([expect.objectContaining({ debtor: "p3", creditor: "bank" })]);
    expect(next.turn.playerId).toBe("p2");
    expect(err(next, "p2", { type: "endTurn" })).toBe("outstanding debts must be settled first");
  });
});

describe("game end", () => {
  test("elimination: the last active player wins", () => {
    const state = newGame();
    const { state: next, events } = forfeit(state, "p2");
    expect(next.status).toBe("finished");
    expect(next.winnerId).toBe("p1");
    expect(events).toContainEqual({ type: "gameOver", winnerId: "p1", reason: "elimination" });
  });

  test("elimination through declared bankruptcy", () => {
    const state = newGame();
    cash(state, "p2", 10);
    addDebt(state, "p2", "p1", 5_000);
    const { state: next, events } = ok(state, "p2", { type: "declareBankruptcy" });
    expect(next.status).toBe("finished");
    expect(next.winnerId).toBe("p1");
    expect(player(next, "p1").cash).toBe(20_010);
    expect(events.filter((e) => e.type === "gameOver")).toEqual([{ type: "gameOver", winnerId: "p1", reason: "elimination" }]);
    expect(err(next, "p1", { type: "endTurn" })).toBe("the game is over");
  });

  test("elimination does not end the game while two or more remain", () => {
    const state = newGame({ players: 3 });
    expect(forfeit(state, "p3").state.status).toBe("playing");
  });

  test("timeUp: the highest net worth wins", () => {
    const state = newGame({ players: 3 });
    own(state, "mumbai-bkc", "p3", { mortgaged: true }); // +6500
    own(state, "indian-railways", "p2"); // +7000
    cash(state, "p1", 20_000);
    const result = applySystemAction(state, { type: "timeUp" }, seededRng(5));
    if (!result.ok) throw new Error(result.error);
    expect(netWorth(state, "p1")).toBe(20_000);
    expect(netWorth(state, "p2")).toBe(27_000);
    expect(netWorth(state, "p3")).toBe(26_500);
    expect(result.state.status).toBe("finished");
    expect(result.state.winnerId).toBe("p2");
    expect(result.events).toEqual([{ type: "gameOver", winnerId: "p2", reason: "timeUp" }]);
  });

  test("timeUp: a tie goes to the earliest player in turn order", () => {
    const state = newGame({ players: 3 });
    const result = applySystemAction(state, { type: "timeUp" }, seededRng(5));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.winnerId).toBe("p1");
    // the same tie with a different leader of the tied group
    const second = newGame({ players: 3 });
    cash(second, "p1", 1_000);
    const result2 = applySystemAction(second, { type: "timeUp" }, seededRng(5));
    if (!result2.ok) throw new Error(result2.error);
    expect(result2.state.winnerId).toBe("p2");
  });

  test("timeUp ignores bankrupt players", () => {
    const state = newGame({ players: 3 });
    player(state, "p1").bankrupt = true;
    player(state, "p1").cash = 0;
    cash(state, "p3", 20_100);
    const result = applySystemAction(state, { type: "timeUp" }, seededRng(5));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.winnerId).toBe("p3");
  });

  test("system actions are refused once the game is over", () => {
    const state = forfeit(newGame(), "p2").state;
    expect(applySystemAction(state, { type: "timeUp" }, seededRng(5))).toEqual({ ok: false, error: "the game is over" });
  });
});
