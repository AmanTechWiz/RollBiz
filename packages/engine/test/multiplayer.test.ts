import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { applyAction, applySystemAction } from "../src/engine";
import type { GameState, PlayerId, PlayerState, TileId } from "../src/types";
import { act, diceRng, newGame, seededRng } from "./helpers";

// Several players, one authoritative state. The server applies messages one at a time, so
// "simultaneous" means: both messages were built against the same version, and the second is
// applied to the state the first produced.

const noRandomness = diceRng(); // throws if the engine asks for a random number

function player(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

function own(s: GameState, id: PlayerId, tiles: TileId[]) {
  for (const t of tiles) {
    const prop = s.properties[t];
    if (!prop) throw new Error(`no property ${t}`);
    prop.owner = id;
  }
}

function reject(s: GameState, id: PlayerId, action: Action): string {
  const r = applyAction(s, id, action, seededRng(3));
  if (r.ok) throw new Error(`expected ${action.type} by ${id} to be rejected`);
  return r.error;
}

function forfeit(s: GameState, id: PlayerId): GameState {
  const r = applySystemAction(s, { type: "forfeit", playerId: id }, seededRng(4));
  if (!r.ok) throw new Error(`forfeit failed: ${r.error}`);
  return r.state;
}

/** p1 rolls a 3 from Start onto Ranchi (unowned): a buy decision is pending. */
function atRanchi(players = 3): GameState {
  return act(newGame({ players }), "p1", { type: "roll" }, diceRng([1, 2])).state;
}

/** p1 declines Ranchi: an auction is open among everyone. */
function inAuction(players = 3): GameState {
  return act(atRanchi(players), "p1", { type: "declineBuy" }).state;
}

/** Nothing dangling after a player leaves: every reference points at someone still playing. */
function expectNoDanglingState(s: GameState) {
  const live = new Set(s.players.filter((p) => !p.bankrupt).map((p) => p.id));
  if (s.status === "playing") expect(live.has(s.turn.playerId)).toBe(true);
  for (const d of s.debts) {
    expect(live.has(d.debtor)).toBe(true);
    expect(d.creditor === "bank" || live.has(d.creditor)).toBe(true);
  }
  for (const t of s.trades) {
    expect(live.has(t.from)).toBe(true);
    expect(live.has(t.to)).toBe(true);
  }
  if (s.pending?.kind === "auction") {
    expect(s.pending.auction.bidders.length).toBeGreaterThan(0);
    for (const b of s.pending.auction.bidders) expect(live.has(b)).toBe(true);
    const hb = s.pending.auction.highBidder;
    if (hb !== null) expect(s.pending.auction.bidders).toContain(hb);
  }
  for (const prop of Object.values(s.properties)) {
    if (prop.owner !== null) expect(live.has(prop.owner)).toBe(true);
  }
}

describe("simultaneous actions", () => {
  test("two buys built on the same version: the second is rejected", () => {
    const s = atRanchi();
    const v = s.version;
    const first = act(s, "p1", { type: "buy", expectedVersion: v });
    const cash = player(first.state, "p1").cash;
    // The same message arriving again (a double click, a second tab) against the new state.
    expect(reject(first.state, "p1", { type: "buy", expectedVersion: v })).toBe("stale state, please retry");
    // Even without a version it cannot buy twice.
    expect(reject(first.state, "p1", { type: "buy" })).toBe("there is nothing to buy");
    expect(player(first.state, "p1").cash).toBe(cash);
    expect(first.state.properties.ranchi?.owner).toBe("p1");
    expect(first.state.ledger.filter((e) => e.reason.startsWith("bought")).length).toBe(1);
  });

  test("buy then decline from the same version: the decline cannot undo the purchase", () => {
    const s = atRanchi();
    const v = s.version;
    const bought = act(s, "p1", { type: "buy", expectedVersion: v }).state;
    expect(reject(bought, "p1", { type: "declineBuy", expectedVersion: v })).toBe("stale state, please retry");
    expect(reject(bought, "p1", { type: "declineBuy" })).toBe("there is nothing to decline");
    expect(bought.pending).toBeNull();
    expect(bought.properties.ranchi?.owner).toBe("p1");
  });

  test("decline then buy from the same version: no purchase during the auction", () => {
    const s = atRanchi();
    const v = s.version;
    const declined = act(s, "p1", { type: "declineBuy", expectedVersion: v }).state;
    expect(declined.pending?.kind).toBe("auction");
    expect(reject(declined, "p1", { type: "buy", expectedVersion: v })).toBe("stale state, please retry");
    expect(reject(declined, "p1", { type: "buy" })).toBe("there is nothing to buy");
    expect(declined.properties.ranchi?.owner).toBeNull();
  });

  test("another player cannot buy the turn holder's property", () => {
    const s = atRanchi();
    expect(reject(s, "p2", { type: "buy" })).toBe("it is not your turn");
    expect(reject(s, "p2", { type: "declineBuy" })).toBe("it is not your turn");
  });

  test("two rolls from one version: only the turn holder, and only once", () => {
    const s = newGame({ players: 3 });
    const v = s.version;
    const rolled = act(s, "p1", { type: "roll", expectedVersion: v }, diceRng([1, 2])).state;
    expect(reject(rolled, "p2", { type: "roll", expectedVersion: v })).toBe("stale state, please retry");
    expect(reject(rolled, "p2", { type: "roll" })).toBe("it is not your turn");
    expect(reject(rolled, "p1", { type: "roll" })).toBe("finish the open buy decision or auction first");
  });

  test("concurrent bids at the same version: the second is re-validated against the first", () => {
    const s = inAuction();
    const v = s.version;
    const first = act(s, "p2", { type: "bid", amount: 500, expectedVersion: v }).state;
    // p3 built a bid for the same version.
    expect(reject(first, "p3", { type: "bid", amount: 500, expectedVersion: v })).toBe("stale state, please retry");
    // Without the version check the engine still refuses an equal or lower bid.
    expect(reject(first, "p3", { type: "bid", amount: 500 })).toContain("bid at least");
    expect(reject(first, "p3", { type: "bid", amount: 550 })).toContain("bid at least");
    const auction = first.pending?.kind === "auction" ? first.pending.auction : null;
    expect(auction?.highBid).toBe(500);
    expect(auction?.highBidder).toBe("p2");
    // A genuinely higher bid goes through.
    const second = act(first, "p3", { type: "bid", amount: 600 }).state;
    expect(second.pending?.kind === "auction" && second.pending.auction.highBidder).toBe("p3");
  });

  test("the high bidder cannot outbid or pass themselves out of their own bid", () => {
    const s = act(inAuction(), "p2", { type: "bid", amount: 500 }).state;
    expect(reject(s, "p2", { type: "passAuction" })).toBe("the high bidder cannot pass");
    expect(reject(s, "p2", { type: "bid", amount: 500 })).toContain("bid at least");
  });

  test("a bid that exceeds the bidder's cash is refused", () => {
    const s = inAuction();
    expect(reject(s, "p2", { type: "bid", amount: player(s, "p2").cash + 100 })).toBe("not enough cash");
  });

  test("the winning bid is charged exactly once when the last rival passes twice", () => {
    let s = act(inAuction(), "p2", { type: "bid", amount: 700 }).state;
    s = act(s, "p1", { type: "passAuction" }).state;
    const v = s.version;
    s = act(s, "p3", { type: "passAuction", expectedVersion: v }).state;
    expect(s.pending).toBeNull();
    expect(s.properties.ranchi?.owner).toBe("p2");
    expect(player(s, "p2").cash).toBe(20_000 - 700);
    // The same pass arriving a second time.
    expect(reject(s, "p3", { type: "passAuction", expectedVersion: v })).toBe("stale state, please retry");
    expect(reject(s, "p3", { type: "passAuction" })).toBe("there is no open auction");
    expect(player(s, "p2").cash).toBe(20_000 - 700);
  });

  test("two accepts of one trade: the second finds it closed", () => {
    let s = newGame({ players: 3 });
    own(s, "p1", ["patna"]);
    s = act(s, "p1", {
      type: "proposeTrade",
      to: "p2",
      give: { cash: 0, properties: ["patna"], jailFreeCards: [] },
      get: { cash: 1000, properties: [], jailFreeCards: [] },
    }).state;
    const trade = s.trades[0];
    if (!trade) throw new Error("no trade");
    const v = s.version;
    const accepted = act(s, "p2", { type: "acceptTrade", tradeId: trade.id, expectedVersion: v }).state;
    expect(reject(accepted, "p2", { type: "acceptTrade", tradeId: trade.id })).toBe("that trade is no longer open");
    expect(accepted.properties.patna?.owner).toBe("p2");
    expect(player(accepted, "p2").cash).toBe(19_000);
    expect(player(accepted, "p1").cash).toBe(21_000);
  });

  test("a trade whose property was traded away meanwhile cannot be accepted", () => {
    let s = newGame({ players: 3 });
    own(s, "p1", ["patna"]);
    const offer = (to: PlayerId): Action => ({
      type: "proposeTrade",
      to,
      give: { cash: 0, properties: ["patna"], jailFreeCards: [] },
      get: { cash: 500, properties: [], jailFreeCards: [] },
    });
    s = act(s, "p1", offer("p2")).state;
    s = act(s, "p1", offer("p3")).state;
    const [toP2, toP3] = s.trades;
    if (!toP2 || !toP3) throw new Error("expected two trades");
    s = act(s, "p3", { type: "acceptTrade", tradeId: toP3.id }).state;
    expect(reject(s, "p2", { type: "acceptTrade", tradeId: toP2.id })).toContain("is not owned by");
    expect(s.properties.patna?.owner).toBe("p3");
    expect(player(s, "p2").cash).toBe(20_000);
  });
});

describe("reconnect and retries", () => {
  test("a repeated actionId after a reconnect is acknowledged and changes nothing", () => {
    const s = newGame({ players: 2 });
    const rolled = act(s, "p1", { type: "roll", actionId: "client-roll-1" }, diceRng([1, 2]));
    const retry = applyAction(rolled.state, "p1", { type: "roll", actionId: "client-roll-1" }, noRandomness);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.duplicate).toBe(true);
    expect(retry.events).toEqual([]);
    expect(retry.state).toBe(rolled.state);
    expect(retry.state.version).toBe(rolled.state.version);
    expect(player(retry.state, "p1").position).toBe(3);
  });

  test("a retried buy charges once", () => {
    const s = atRanchi(2);
    const bought = act(s, "p1", { type: "buy", actionId: "buy-1" }).state;
    const retry = applyAction(bought, "p1", { type: "buy", actionId: "buy-1" }, noRandomness);
    expect(retry.ok && retry.duplicate).toBe(true);
    if (retry.ok) expect(retry.state).toBe(bought);
    expect(player(bought, "p1").cash).toBe(20_000 - 2400);
    expect(bought.ledger.filter((e) => e.reason === "bought Ranchi")).toHaveLength(1);
  });

  test("a retried roll onto a card tile draws the card once", () => {
    const s = newGame({ players: 2 });
    const before = [...s.decks.communityChest];
    // Dice 1+1 = index 2, Community Chest. Doubles, so the player may roll again.
    const rolled = act(s, "p1", { type: "roll", actionId: "roll-cc" }, diceRng([1, 1])).state;
    const after = [...rolled.decks.communityChest];
    expect(after).not.toEqual(before);
    const retry = applyAction(rolled, "p1", { type: "roll", actionId: "roll-cc" }, noRandomness);
    expect(retry.ok && retry.duplicate).toBe(true);
    if (retry.ok) expect(retry.state.decks.communityChest).toEqual(after);
    expect(rolled.ledger.length).toBe(retry.ok ? retry.state.ledger.length : -1);
  });

  test("a retried bid is not a second bid", () => {
    const s = inAuction();
    const bid = act(s, "p2", { type: "bid", amount: 400, actionId: "bid-1" }).state;
    const retry = applyAction(bid, "p2", { type: "bid", amount: 400, actionId: "bid-1" }, noRandomness);
    expect(retry.ok && retry.duplicate).toBe(true);
    if (retry.ok) expect(retry.state).toBe(bid);
  });

  test("a reused actionId from another player is also treated as a duplicate", () => {
    // Ids are expected to be unique per client message; the engine does not track who sent them.
    const s = act(newGame({ players: 2 }), "p1", { type: "roll", actionId: "same" }, diceRng([1, 2])).state;
    const r = applyAction(s, "p2", { type: "roll", actionId: "same" }, noRandomness);
    expect(r.ok && r.duplicate).toBe(true);
  });

  test("an actionId whose first attempt was rejected can be tried again", () => {
    const s = newGame({ players: 2 });
    expect(reject(s, "p1", { type: "buy", actionId: "x1" })).toBe("there is nothing to buy");
    expect(s.processedActionIds).toEqual([]);
    const ok = act(s, "p1", { type: "roll", actionId: "x1" }, diceRng([1, 2]));
    expect(ok.state.processedActionIds).toContain("x1");
  });

  test("only the most recent action ids are remembered", () => {
    let s = newGame({ players: 2 });
    s = act(s, "p1", { type: "roll", actionId: "first" }, diceRng([1, 2])).state;
    s = act(s, "p1", { type: "declineBuy" }).state;
    // Pad the memory directly rather than playing 200 actions.
    for (let i = 0; i < 250; i++) s.processedActionIds.push(`filler-${i}`);
    s = act(s, "p2", { type: "passAuction", actionId: "latest" }).state;
    expect(s.processedActionIds.length).toBeLessThanOrEqual(200);
    expect(s.processedActionIds).toContain("latest");
  });
});

describe("stale state", () => {
  test("an old expectedVersion is rejected and the state is untouched", () => {
    const s0 = newGame({ players: 2 });
    const s1 = act(s0, "p1", { type: "roll" }, diceRng([1, 2])).state;
    const before = JSON.stringify(s1);
    expect(reject(s1, "p1", { type: "buy", expectedVersion: s0.version })).toBe("stale state, please retry");
    expect(JSON.stringify(s1)).toBe(before);
  });

  test("a future expectedVersion is rejected too", () => {
    const s = newGame({ players: 2 });
    expect(reject(s, "p1", { type: "roll", expectedVersion: s.version + 1 })).toBe("stale state, please retry");
  });

  test("the current expectedVersion is accepted and the version advances by one", () => {
    const s = newGame({ players: 2 });
    const r = act(s, "p1", { type: "roll", expectedVersion: s.version }, diceRng([1, 2]));
    expect(r.state.version).toBe(s.version + 1);
  });

  test("the input state is never mutated by an accepted action", () => {
    const s = atRanchi(3);
    const before = JSON.stringify(s);
    act(s, "p1", { type: "buy" });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("leaving mid-action", () => {
  test("a bidder (not the high bidder) forfeits: the auction goes on without them", () => {
    let s = act(inAuction(), "p2", { type: "bid", amount: 500 }).state;
    s = forfeit(s, "p3");
    expectNoDanglingState(s);
    expect(s.pending?.kind === "auction" && s.pending.auction.bidders).toEqual(["p1", "p2"]);
    s = act(s, "p1", { type: "passAuction" }).state;
    // Only the high bidder is left: they win.
    expect(s.pending).toBeNull();
    expect(s.properties.ranchi?.owner).toBe("p2");
    expect(player(s, "p2").cash).toBe(19_500);
  });

  test("the high bidder forfeits: their bid is void and the rest can carry on", () => {
    let s = act(inAuction(), "p2", { type: "bid", amount: 500 }).state;
    s = forfeit(s, "p2");
    expectNoDanglingState(s);
    const auction = s.pending?.kind === "auction" ? s.pending.auction : null;
    expect(auction?.highBidder).toBeNull();
    expect(auction?.highBid).toBe(0);
    expect(auction?.bidders).toEqual(["p1", "p3"]);
    s = act(s, "p3", { type: "bid", amount: 200 }).state;
    s = act(s, "p1", { type: "passAuction" }).state;
    expect(s.properties.ranchi?.owner).toBe("p3");
  });

  test("the high bidder forfeits in a 2-player game: the game ends and the auction is gone", () => {
    let s = act(inAuction(2), "p2", { type: "bid", amount: 500 }).state;
    s = forfeit(s, "p2");
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe("p1");
    expect(s.pending).toBeNull();
    expect(s.properties.ranchi?.owner).toBeNull();
    expect(player(s, "p1").cash).toBe(20_000);
  });

  test("the player who declined (turn holder) forfeits mid-auction: turn moves on, auction stays consistent", () => {
    let s = inAuction();
    s = forfeit(s, "p1");
    expectNoDanglingState(s);
    expect(s.turn.playerId).toBe("p2");
    expect(s.pending?.kind === "auction" && s.pending.auction.bidders).toEqual(["p2", "p3"]);
    // The next player cannot roll until the auction is settled.
    expect(reject(s, "p2", { type: "roll" })).toBe("finish the open buy decision or auction first");
    s = act(s, "p2", { type: "passAuction" }).state;
    s = act(s, "p3", { type: "passAuction" }).state;
    expect(s.pending).toBeNull();
    expect(s.properties.ranchi?.owner).toBeNull();
    s = act(s, "p2", { type: "roll" }, diceRng([2, 3])).state;
    expect(s.turn.hasRolled).toBe(true);
  });

  test("the turn holder forfeits with a buy decision open: the decision disappears", () => {
    let s = atRanchi();
    s = forfeit(s, "p1");
    expectNoDanglingState(s);
    expect(s.pending).toBeNull();
    expect(s.turn.playerId).toBe("p2");
    expect(s.turn.hasRolled).toBe(false);
    expect(s.properties.ranchi?.owner).toBeNull();
  });

  test("players leaving one after another hand the turn on once each and end the game at one survivor", () => {
    let s = newGame({ players: 3 });
    s = forfeit(s, "p1");
    expect(s.turn.playerId).toBe("p2");
    s = forfeit(s, "p2");
    expect(s.status).toBe("finished");
    expect(s.winnerId).toBe("p3");
  });

  test("forfeiting twice is refused", () => {
    let s = newGame({ players: 3 });
    s = forfeit(s, "p3");
    const r = applySystemAction(s, { type: "forfeit", playerId: "p3" }, seededRng());
    expect(r.ok).toBe(false);
  });

  test("a trade proposer forfeits: their open offers disappear", () => {
    let s = newGame({ players: 3 });
    own(s, "p2", ["patna"]);
    s = act(s, "p2", {
      type: "proposeTrade",
      to: "p3",
      give: { cash: 100, properties: ["patna"], jailFreeCards: [] },
      get: { cash: 0, properties: [], jailFreeCards: [] },
    }).state;
    expect(s.trades).toHaveLength(1);
    s = forfeit(s, "p2");
    expectNoDanglingState(s);
    expect(s.trades).toEqual([]);
    expect(s.properties.patna?.owner).toBeNull();
  });

  test("a trade recipient forfeits: the offer is dropped and the proposer keeps their assets", () => {
    let s = newGame({ players: 3 });
    own(s, "p1", ["patna"]);
    s = act(s, "p1", {
      type: "proposeTrade",
      to: "p2",
      give: { cash: 0, properties: ["patna"], jailFreeCards: [] },
      get: { cash: 100, properties: [], jailFreeCards: [] },
    }).state;
    s = forfeit(s, "p2");
    expectNoDanglingState(s);
    expect(s.trades).toEqual([]);
    expect(s.properties.patna?.owner).toBe("p1");
  });

  test("a bystander forfeits while a trade between two others stays open", () => {
    let s = newGame({ players: 3 });
    own(s, "p1", ["patna"]);
    s = act(s, "p1", {
      type: "proposeTrade",
      to: "p2",
      give: { cash: 0, properties: ["patna"], jailFreeCards: [] },
      get: { cash: 100, properties: [], jailFreeCards: [] },
    }).state;
    s = forfeit(s, "p3");
    expect(s.trades).toHaveLength(1);
    const id = s.trades[0]?.id ?? -1;
    s = act(s, "p2", { type: "acceptTrade", tradeId: id }).state;
    expect(s.properties.patna?.owner).toBe("p2");
  });

  test("a debtor forfeits: the debt vanishes and the turn resumes", () => {
    // p1 lands on Rest House; p2 cannot pay the ₹100, p3 can.
    let s = newGame({ players: 3 });
    player(s, "p1").position = 17;
    player(s, "p2").cash = 50;
    s = act(s, "p1", { type: "roll" }, diceRng([1, 2])).state;
    expect(s.debts).toHaveLength(1);
    expect(s.debts[0]).toMatchObject({ debtor: "p2", creditor: "p1", amount: 100 });
    expect(reject(s, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
    s = forfeit(s, "p2");
    expectNoDanglingState(s);
    expect(s.debts).toEqual([]);
    s = act(s, "p1", { type: "endTurn" }).state;
    expect(s.turn.playerId).toBe("p3");
  });

  test("a creditor forfeits: the debts owed to them go to the bank", () => {
    let s = newGame({ players: 3 });
    player(s, "p1").position = 17;
    player(s, "p2").cash = 50;
    player(s, "p3").cash = 50;
    s = act(s, "p1", { type: "roll" }, diceRng([1, 2])).state;
    expect(s.debts.map((d) => d.creditor)).toEqual(["p1", "p1"]);
    s = forfeit(s, "p1");
    expectNoDanglingState(s);
    expect(s.debts.map((d) => d.creditor)).toEqual(["bank", "bank"]);
    // Still gated: both must clear before play resumes.
    expect(s.turn.playerId).toBe("p2");
    expect(reject(s, "p2", { type: "roll" })).toBe("outstanding debts must be settled first");
  });
});

describe("debt cascades", () => {
  /** p1 lands on Rest House; p2 and p3 cannot pay their ₹100 each, p4 can. */
  function cascade(): GameState {
    const s = newGame({ players: 4 });
    player(s, "p1").position = 17;
    player(s, "p2").cash = 50;
    player(s, "p3").cash = 50;
    own(s, "p2", ["patna"]);
    own(s, "p3", ["lucknow"]);
    return act(s, "p1", { type: "roll" }, diceRng([1, 2])).state;
  }

  test("one debt per payer; the creditor and the solvent payer are paid straight away", () => {
    const s = cascade();
    expect(s.debts.map((d) => d.debtor)).toEqual(["p2", "p3"]);
    expect(player(s, "p4").cash).toBe(19_900);
    expect(player(s, "p1").cash).toBe(20_100);
  });

  test("only debtors can act, and only with debt-clearing actions", () => {
    const s = cascade();
    expect(reject(s, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
    expect(reject(s, "p4", { type: "payDebt" })).toBe("waiting for debts to be settled");
    expect(reject(s, "p4", { type: "mortgage", tileId: "patna" })).toBe("waiting for debts to be settled");
    expect(reject(s, "p2", { type: "roll" })).toBe("outstanding debts must be settled first");
    expect(reject(s, "p2", { type: "payDebt" })).toBe("not enough cash to pay this debt");
    expect(reject(s, "p2", { type: "mortgage", tileId: "lucknow" })).toBe("you do not own that property");
  });

  test("the turn resumes only when every debt is cleared", () => {
    let s = cascade();
    s = act(s, "p2", { type: "mortgage", tileId: "patna" }).state;
    s = act(s, "p2", { type: "payDebt" }).state;
    expect(s.debts.map((d) => d.debtor)).toEqual(["p3"]);
    expect(reject(s, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
    s = act(s, "p3", { type: "mortgage", tileId: "lucknow" }).state;
    s = act(s, "p3", { type: "payDebt" }).state;
    expect(s.debts).toEqual([]);
    s = act(s, "p1", { type: "endTurn" }).state;
    expect(s.turn.playerId).toBe("p2");
  });

  test("a debtor who goes bankrupt to the creditor clears their debt; the other debt stays", () => {
    let s = cascade();
    s = act(s, "p2", { type: "declareBankruptcy" }).state;
    expectNoDanglingState(s);
    expect(s.debts.map((d) => d.debtor)).toEqual(["p3"]);
    expect(s.properties.patna?.owner).toBe("p1"); // the creditor inherits the property
    expect(player(s, "p1").cash).toBe(20_100 + 50);
    expect(reject(s, "p1", { type: "endTurn" })).toBe("outstanding debts must be settled first");
  });
});

describe("a pending buy together with a debt", () => {
  /**
   * p1 is in jail on the third failed attempt with ₹100 and cannot cover the ₹500 fine: the fine
   * becomes a debt, p1 still moves (Surat, unowned) and a buy decision opens at the same time.
   */
  function debtAndBuy(): GameState {
    const s = newGame({ players: 3 });
    const p1 = player(s, "p1");
    p1.inJail = true;
    p1.jailAttempts = 2;
    p1.position = 10;
    p1.cash = 100;
    own(s, "p1", ["mumbai"]); // mortgages for 6,500
    return act(s, "p1", { type: "roll" }, diceRng([1, 2])).state;
  }

  test("the failed escape leaves a debt and a buy decision together", () => {
    const s = debtAndBuy();
    expect(player(s, "p1")).toMatchObject({ inJail: false, position: 13, cash: 100 });
    expect(s.debts).toHaveLength(1);
    expect(s.debts[0]).toMatchObject({ debtor: "p1", creditor: "bank", amount: 500 });
    expect(s.pending).toEqual({ kind: "buy", tileId: "surat" });
  });

  test("the debt gate blocks buy and decline until the debt is cleared", () => {
    const s = debtAndBuy();
    const msg = "outstanding debts must be settled first";
    expect(reject(s, "p1", { type: "buy" })).toBe(msg);
    expect(reject(s, "p1", { type: "declineBuy" })).toBe(msg);
    expect(reject(s, "p1", { type: "endTurn" })).toBe(msg);
    expect(reject(s, "p2", { type: "buy" })).toBe(msg);
    expect(reject(s, "p2", { type: "declineBuy" })).toBe(msg);
    // Nothing moved while blocked.
    expect(s.pending).toEqual({ kind: "buy", tileId: "surat" });
    expect(s.properties.surat?.owner).toBeNull();
    expect(player(s, "p1").cash).toBe(100);
  });

  test("once the debt is cleared the player can buy", () => {
    let s = debtAndBuy();
    s = act(s, "p1", { type: "mortgage", tileId: "mumbai" }).state;
    s = act(s, "p1", { type: "payDebt" }).state;
    expect(s.debts).toEqual([]);
    expect(s.pending).toEqual({ kind: "buy", tileId: "surat" });
    expect(player(s, "p1").cash).toBe(100 + 6500 - 500);
    s = act(s, "p1", { type: "buy" }).state;
    expect(s.properties.surat?.owner).toBe("p1");
    expect(s.pending).toBeNull();
    expect(player(s, "p1").cash).toBe(6100 - 4800);
  });

  test("once the debt is cleared the player can decline, which opens the auction", () => {
    let s = debtAndBuy();
    s = act(s, "p1", { type: "mortgage", tileId: "mumbai" }).state;
    s = act(s, "p1", { type: "payDebt" }).state;
    s = act(s, "p1", { type: "declineBuy" }).state;
    expect(s.pending?.kind).toBe("auction");
    expect(s.properties.surat?.owner).toBeNull();
    expect(s.pending?.kind === "auction" && s.pending.auction.bidders).toEqual(["p1", "p2", "p3"]);
  });

  test("a debtor who goes bankrupt drops the pending buy with them", () => {
    let s = debtAndBuy();
    s = act(s, "p1", { type: "declareBankruptcy" }).state;
    expectNoDanglingState(s);
    expect(s.pending).toBeNull();
    expect(s.debts).toEqual([]);
    expect(s.turn.playerId).toBe("p2");
    expect(s.properties.mumbai?.owner).toBeNull(); // bankrupt to the bank
  });
});

describe("low bank stock", () => {
  test("selling a hotel is refused when the bank cannot supply 3 houses, but selling the group works", () => {
    const s = newGame({ players: 2 });
    own(s, "p1", ["patna", "ranchi", "raipur"]);
    for (const id of ["patna", "ranchi", "raipur"]) {
      const prop = s.properties[id];
      if (prop) prop.hotel = true;
    }
    s.bank.hotels = s.economy.bank.hotels - 3;
    s.bank.houses = 2; // fewer than the 3 a downgraded hotel needs
    expect(reject(s, "p1", { type: "sellBuilding", tileId: "patna" })).toContain("3 houses");
    const sold = act(s, "p1", { type: "sellGroupBuildings", group: "brown" }).state;
    expect(sold.bank.hotels).toBe(s.economy.bank.hotels);
    expect(["patna", "ranchi", "raipur"].every((id) => sold.properties[id]?.hotel === false)).toBe(true);
    expect(player(sold, "p1").cash).toBeGreaterThan(20_000);
  });
});
