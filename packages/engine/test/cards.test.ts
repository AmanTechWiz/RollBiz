import { describe, expect, test } from "bun:test";
import { drawCard } from "../src/rules/cards";
import type { CardId, DeckId, GameState, PlayerId } from "../src/types";
import { makeCtx, newGame } from "./helpers";

const DICE = 7;
const START_BONUS = 2000;

/** A 3-player game where `cardId` is on top of its deck and p1 stands on `position` (default: Power Grid). */
function setup(cardId: CardId, position = 12, players = 3) {
  const state = newGame({ players });
  const deck: DeckId = cardId.startsWith("CH") ? "chance" : "communityChest";
  state.decks[deck] = [cardId, ...state.decks[deck].filter((c) => c !== cardId)];
  p(state, "p1").position = position;
  return { state, deck, ctx: makeCtx(state), start: state.economy.startingMoney };
}

type Setup = ReturnType<typeof setup>;

function p(state: GameState, id: PlayerId) {
  const found = state.players.find((x) => x.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

function owner(state: GameState, tileId: string, to: PlayerId | null) {
  (state.properties[tileId] as { owner: PlayerId | null }).owner = to;
}

function draw(t: Setup) {
  const bankBefore = t.state.bank.cash;
  drawCard(t.ctx, "p1", t.deck, DICE);
  return { bankDelta: t.state.bank.cash - bankBefore };
}

function expectRotated(t: Setup, cardId: CardId) {
  expect(t.state.decks[t.deck]).toHaveLength(16);
  expect(t.state.decks[t.deck].at(-1)).toBe(cardId);
  expect(t.state.decks[t.deck][0]).not.toBe(cardId);
  expect(t.ctx.events.find((e) => e.type === "cardDrawn")).toMatchObject({ playerId: "p1", cardId });
}

describe("simple bank cards", () => {
  const collect: [CardId, number][] = [
    ["CH01", 2000], ["CH02", 1500], ["CH07", 2500], ["CH09", 3000], ["CH14", 1000],
    ["CC01", 1000], ["CC02", 1500], ["CC06", 500], ["CC09", 1000], ["CC10", 2000], ["CC14", 1500], ["CC16", 1000],
  ];
  const payBank: [CardId, number][] = [
    ["CH03", 1000], ["CH06", 500], ["CH10", 1500],
    ["CC03", 500], ["CC07", 1000], ["CC08", 500], ["CC13", 750],
  ];

  test.each(collect)("%s collects %i from the bank", (id, amount) => {
    const t = setup(id);
    const { bankDelta } = draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start + amount);
    expect(bankDelta).toBe(-amount);
    expectRotated(t, id);
    expect(p(t.state, "p1").position).toBe(12);
  });

  test.each(payBank)("%s pays %i to the bank", (id, amount) => {
    const t = setup(id);
    const { bankDelta } = draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start - amount);
    expect(bankDelta).toBe(amount);
    expectRotated(t, id);
  });

  test("a payment the player cannot cover becomes a debt, and the card still rotates", () => {
    const t = setup("CH03");
    p(t.state, "p1").cash = 400;
    draw(t);
    expect(p(t.state, "p1").cash).toBe(400);
    expect(t.state.debts).toMatchObject([{ debtor: "p1", creditor: "bank", amount: 1000 }]);
    expectRotated(t, "CH03");
  });

  test("drawing takes the top card and leaves the rest in order", () => {
    const t = setup("CH01");
    const rest = t.state.decks.chance.slice(1);
    drawCard(t.ctx, "p1", "chance", DICE);
    expect(t.state.decks.chance).toEqual([...rest, "CH01"]);
  });

  test("an empty deck (every card disabled) does nothing", () => {
    const t = setup("CH01");
    t.state.decks.chance = [];
    drawCard(t.ctx, "p1", "chance", DICE);
    expect(t.ctx.events).toEqual([]);
  });
});

describe("movement cards", () => {
  test("CH04 moves forward 3 and resolves the destination with the same dice total", () => {
    const t = setup("CH04", 12); // 15 = National Highways
    draw(t);
    expect(p(t.state, "p1").position).toBe(15);
    expect(t.state.pending).toEqual({ kind: "buy", tileId: "national-highways" });
    expectRotated(t, "CH04");
  });

  test("CH04 charges utility rent from the same dice total", () => {
    const t = setup("CH04", 9); // 12 = Power Grid
    owner(t.state, "power-grid", "p2");
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start - 4 * DICE);
    expect(p(t.state, "p2").cash).toBe(t.start + 4 * DICE);
  });

  test("CH04 passing Start pays the bonus once", () => {
    const t = setup("CH04", 38);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 1, cash: t.start + START_BONUS });
    expect(t.state.ledger.filter((l) => l.reason === "passed Start")).toHaveLength(1);
  });

  test("CH04 landing on a Community Chest tile draws again", () => {
    const t = setup("CH04", 39); // 2 = Community Chest, passing Start
    t.state.decks.communityChest = ["CC01", ...t.state.decks.communityChest.filter((c) => c !== "CC01")];
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 2, cash: t.start + START_BONUS + 1000 });
    expect(t.state.decks.communityChest.at(-1)).toBe("CC01");
    expect(t.ctx.events.filter((e) => e.type === "cardDrawn")).toHaveLength(2);
  });

  test("CH04 landing on a Chance tile draws again from the same deck", () => {
    const t = setup("CH04", 14); // 17 = Chance
    t.state.decks.chance = ["CH04", "CH01", ...t.state.decks.chance.filter((c) => c !== "CH04" && c !== "CH01")];
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 17, cash: t.start + 2000 });
    expect(t.state.decks.chance.slice(-2)).toEqual(["CH04", "CH01"]);
  });

  test("CH04 landing on Income Tax charges it", () => {
    const t = setup("CH04", 4);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 7, cash: t.start - 500 });
  });

  test.each([
    [12, 15, "national-highways"],
    [15, 25, "indian-airways"],
    [18, 25, "indian-airways"],
    [25, 35, "coastal-shipping"],
    [34, 35, "coastal-shipping"],
    [3, 5, "indian-railways"],
  ])("CH05 from %i goes to the next transport at %i", (from, to, tileId) => {
    const t = setup("CH05", from);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: to, cash: t.start });
    expect(t.state.pending).toEqual({ kind: "buy", tileId });
    expectRotated(t, "CH05");
  });

  test("CH05 wraps past Start, pays the bonus and charges rent to the owner", () => {
    const t = setup("CH05", 35);
    owner(t.state, "indian-railways", "p2");
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 5, cash: t.start + START_BONUS - 500 });
    expect(p(t.state, "p2").cash).toBe(t.start + 500);
    expect(t.state.pending).toBeNull();
  });

  test("CH11 moves forward to the nearest unowned city, skipping owned ones and other tiles", () => {
    const t = setup("CH11", 8);
    draw(t);
    expect(p(t.state, "p1").position).toBe(9);
    expect(t.state.pending).toEqual({ kind: "buy", tileId: "indore" });
    expectRotated(t, "CH11");

    const u = setup("CH11", 10);
    owner(u.state, "lucknow", "p2"); // 11 owned; 12 is a utility
    draw(u);
    expect(p(u.state, "p1").position).toBe(13);

    const v = setup("CH11", 14); // 15 is a transport: skipped
    draw(v);
    expect(p(v.state, "p1").position).toBe(16);
  });

  test("CH11 passing Start pays the bonus", () => {
    const t = setup("CH11", 39);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 1, cash: t.start + START_BONUS });
  });

  test("CH11 with no unowned city left does nothing", () => {
    const t = setup("CH11", 12);
    for (const tile of t.state.economy.tiles) if (tile.kind === "city") owner(t.state, tile.id, "p2");
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 12, cash: t.start });
    expect(t.state.pending).toBeNull();
    expectRotated(t, "CH11");
  });

  test("CH12 moves to Indian Railways", () => {
    const t = setup("CH12", 3);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 5, cash: t.start });
    expect(t.state.pending).toEqual({ kind: "buy", tileId: "indian-railways" });
    expectRotated(t, "CH12");
  });

  test("CH12 from past the railways wraps and pays the Start bonus", () => {
    const t = setup("CH12", 34);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 5, cash: t.start + START_BONUS });
  });

  test.each([34, 22])("CH16 from %i moves to Start and pays the bonus once", (from) => {
    const t = setup("CH16", from);
    draw(t);
    expect(p(t.state, "p1")).toMatchObject({ position: 0, cash: t.start + START_BONUS });
    expect(t.state.ledger.filter((l) => l.reason === "passed Start")).toHaveLength(1);
    expect(t.state.pending).toBeNull();
    expectRotated(t, "CH16");
  });
});

describe("per-building and per-asset cards", () => {
  function withBuildings(t: Setup, houses: number, hotels: number) {
    const ids = Object.keys(t.state.properties);
    let i = 0;
    for (let left = houses; left > 0; left -= 3) {
      Object.assign(t.state.properties[ids[i++] as string] as object, { owner: "p1", houses: Math.min(3, left) });
    }
    for (let k = 0; k < hotels; k++) Object.assign(t.state.properties[ids[i++] as string] as object, { owner: "p1", hotel: true });
  }

  const run = (id: CardId, houses: number, hotels: number) => {
    const t = setup(id);
    withBuildings(t, houses, hotels);
    draw(t);
    expectRotated(t, id);
    return t.start - p(t.state, "p1").cash;
  };

  test("CH08 charges 500 per house and 1000 per hotel", () => {
    expect(run("CH08", 0, 0)).toBe(0);
    expect(run("CH08", 2, 1)).toBe(2000);
    expect(run("CH08", 1, 0)).toBe(500);
  });
  test("CH08 is capped at 3000", () => {
    expect(run("CH08", 9, 2)).toBe(3000);
  });
  test("CC04 charges 200 per house and 500 per hotel", () => {
    expect(run("CC04", 0, 0)).toBe(0);
    expect(run("CC04", 4, 1)).toBe(1300);
  });
  test("CC04 is capped at 2000", () => {
    expect(run("CC04", 6, 3)).toBe(2000);
  });

  test("CC04 ignores other players' buildings", () => {
    const t = setup("CC04");
    withBuildings(t, 6, 0);
    for (const prop of Object.values(t.state.properties)) if (prop.owner) prop.owner = "p2";
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start);
  });

  test.each([
    [0, 0],
    [1, 500],
    [3, 1500],
    [4, 2000],
  ])("CC12 with %i transports collects %i", (count, amount) => {
    const t = setup("CC12");
    ["indian-railways", "national-highways", "indian-airways", "coastal-shipping"]
      .slice(0, count)
      .forEach((id) => owner(t.state, id, "p1"));
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start + amount);
    expectRotated(t, "CC12");
  });

  test("CC12 is capped, ignores utilities and other players' transports", () => {
    const t = setup("CC12");
    const card = t.state.economy.cards.CC12;
    if (!card) throw new Error("CC12 missing");
    // The economy is frozen: swap in a modified copy with a lower cap.
    t.state.economy = {
      ...t.state.economy,
      cards: { ...t.state.economy.cards, CC12: { ...card, effect: { kind: "collectPerTransport", perTransport: 500, cap: 1000 } } },
    };
    for (const id of ["indian-railways", "national-highways", "indian-airways"]) owner(t.state, id, "p1");
    owner(t.state, "coastal-shipping", "p2");
    owner(t.state, "power-grid", "p1");
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start + 1000);
  });
});

describe("cards involving every other player", () => {
  test.each([
    ["CH13", 200],
    ["CC11", 200],
  ] as const)("%s pays %i to each other active player", (id, amount) => {
    const t = setup(id, 12, 4);
    p(t.state, "p3").bankrupt = true;
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start - 2 * amount);
    expect(p(t.state, "p2").cash).toBe(t.start + amount);
    expect(p(t.state, "p3").cash).toBe(t.start);
    expect(p(t.state, "p4").cash).toBe(t.start + amount);
    expectRotated(t, id);
  });

  test("CC05 collects 500 from each other active player", () => {
    const t = setup("CC05", 12, 4);
    p(t.state, "p4").bankrupt = true;
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start + 1000);
    expect(p(t.state, "p2").cash).toBe(t.start - 500);
    expect(p(t.state, "p3").cash).toBe(t.start - 500);
    expect(p(t.state, "p4").cash).toBe(t.start);
    expectRotated(t, "CC05");
  });

  test("CC05 creates a debt for each player who cannot pay", () => {
    const t = setup("CC05");
    p(t.state, "p2").cash = 100;
    p(t.state, "p3").cash = 0;
    draw(t);
    expect(p(t.state, "p1").cash).toBe(t.start);
    expect(t.state.debts).toMatchObject([
      { debtor: "p2", creditor: "p1", amount: 500 },
      { debtor: "p3", creditor: "p1", amount: 500 },
    ]);
  });

  test("CH13 with too little cash pays the first player and queues a debt for the second", () => {
    const t = setup("CH13");
    p(t.state, "p1").cash = 300;
    draw(t);
    expect(p(t.state, "p1").cash).toBe(100);
    expect(t.state.debts).toMatchObject([{ debtor: "p1", creditor: "p3", amount: 200 }]);
  });
});

describe("Get Out of Jail Free", () => {
  test.each(["CH15", "CC15"] as const)("%s is kept by the player and leaves the deck", (id) => {
    const t = setup(id);
    draw(t);
    expect(p(t.state, "p1").jailFreeCards).toEqual([id]);
    expect(t.state.decks[t.deck]).toHaveLength(15);
    expect(t.state.decks[t.deck]).not.toContain(id);
    expect(p(t.state, "p1").cash).toBe(t.start);
    expect(t.ctx.events.find((e) => e.type === "cardDrawn")).toMatchObject({ cardId: id });
  });
});

test("every one of the 32 cards can be drawn from several positions without error", () => {
  const ids = Object.keys(newGame().economy.cards).sort();
  expect(ids).toHaveLength(32);
  for (const id of ids) {
    for (const position of [0, 7, 17, 22, 37]) {
      const t = setup(id, position);
      expect(() => drawCard(t.ctx, "p1", t.deck, DICE)).not.toThrow();
    }
  }
});
