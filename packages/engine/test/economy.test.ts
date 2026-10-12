import { describe, expect, test } from "bun:test";
import { BASE_CARDS, BASE_CITIES } from "../src/config/base";
import { resolveEconomy, scaleAmount } from "../src/economy/resolve";
import type { ResolvedCity } from "../src/types";

describe("scaleAmount", () => {
  test("rounds to the nearest 100 with a floor of 100", () => {
    expect(scaleAmount(240, 1)).toBe(240);
    expect(scaleAmount(240, 0.75)).toBe(200);
    expect(scaleAmount(2000, 0.5)).toBe(1000);
    expect(scaleAmount(100, 0.25)).toBe(100);
    expect(scaleAmount(0, 1.5)).toBe(0);
  });
});

describe("resolveEconomy", () => {
  test("defaults", () => {
    const e = resolveEconomy();
    const patna = e.properties.patna as ResolvedCity;
    expect(patna.price).toBe(2000);
    expect(patna.rents).toEqual([200, 600, 1000, 1600, 2400]);
    expect(patna.mortgage).toBe(1000);
    expect(patna.unmortgageCost).toBe(1100);
    expect((e.properties["mumbai"] as ResolvedCity).houseCost).toBe(3000);
    expect(e.startingMoney).toBe(20_000);
    expect(e.bank).toEqual({ cash: 1_000_000, houses: 32, hotels: 12 });
    expect(e.rules.startBonus).toBe(2000);
    expect(e.rules.doublesRollAgain).toBe(true);
    expect(e.groups.brown.propertyIds).toEqual(["patna", "ranchi", "raipur"]);
    expect(e.decks.chance).toHaveLength(16);
    expect(e.decks.communityChest).toHaveLength(16);
    expect(Object.keys(e.cards)).toHaveLength(32);
    expect(e.tiles).toHaveLength(40);
  });

  test("unmortgage cost is exact for every property at defaults", () => {
    const e = resolveEconomy();
    for (const p of Object.values(e.properties)) {
      expect(p.unmortgageCost).toBe(Math.round((p.mortgage * 11) / 10));
    }
  });

  test("is deeply frozen", () => {
    const e = resolveEconomy();
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.properties.patna)).toBe(true);
    expect(Object.isFrozen((e.properties.patna as ResolvedCity).rents)).toBe(true);
    expect(Object.isFrozen(e.rules.utilityMultipliers)).toBe(true);
    expect(Object.isFrozen(e.decks.chance)).toBe(true);
    expect(Object.isFrozen(e.settings)).toBe(true);
    expect(Object.isFrozen(e.tiles[0])).toBe(true);
  });

  test("scales everything at 1.5x except unscaled fields", () => {
    const e = resolveEconomy({ priceMultiplier: 1.5 });
    const patna = e.properties.patna as ResolvedCity;
    expect(patna.price).toBe(3000);
    expect(patna.rents[0]).toBe(300);
    expect(e.rules.startBonus).toBe(3000);
    expect(e.rules.jailFine).toBe(800);
    expect(e.rules.wealthTaxCap).toBe(800);
    expect(e.groups.brown.houseCost).toBe(1500);
    expect(e.startingMoney).toBe(20_000);
    expect(e.bank.cash).toBe(1_000_000);
    expect(e.rules.utilityMultipliers).toEqual([4, 10]);
    expect(e.rules.unmortgageInterestRate).toBe(0.1);
    expect(e.rules.maxHousesPerProperty).toBe(3);
    expect(e.cards.CH01?.effect).toEqual({ kind: "collect", amount: 3000 });
    expect(e.cards.CH08?.effect).toEqual({ kind: "payPerBuilding", perHouse: 800, perHotel: 1500, cap: 4500 });
  });

  test("resolving repeatedly never double scales and never mutates the base", () => {
    const before = JSON.stringify(BASE_CITIES);
    const a = resolveEconomy({ priceMultiplier: 1.5 });
    const b = resolveEconomy({ priceMultiplier: 1.5 });
    expect(b).toEqual(a);
    expect(JSON.stringify(BASE_CITIES)).toBe(before);
    expect((resolveEconomy().properties.patna as ResolvedCity).price).toBe(2000);
  });

  test("custom config", () => {
    const e = resolveEconomy({ startingMoney: 40_000, priceMultiplier: 0.75, houses: 24, hotels: 8 });
    expect(e.startingMoney).toBe(40_000);
    expect(e.bank.houses).toBe(24);
    expect(e.bank.hotels).toBe(8);
    expect((e.properties.patna as ResolvedCity).price).toBe(1500);
  });

  test("copies boolean settings into rules", () => {
    const e = resolveEconomy({ auctionsEnabled: false, tradingEnabled: false, doublesRollAgain: false, threeDoublesToJail: false });
    expect(e.rules).toMatchObject({
      auctionsEnabled: false,
      tradingEnabled: false,
      doublesRollAgain: false,
      threeDoublesToJail: false,
    });
  });

  test("disabled cards are removed from decks", () => {
    const e = resolveEconomy({ disabledCardIds: ["CH01", "CC16"] });
    expect(e.decks.chance).toHaveLength(15);
    expect(e.decks.communityChest).toHaveLength(15);
    expect(e.decks.chance).not.toContain("CH01");
    expect(e.cards.CH01).toBeUndefined();
  });

  test("mortgage is 50% of the resolved price, unmortgage adds 10%", () => {
    const e = resolveEconomy({ priceMultiplier: 1.25 });
    const patna = e.properties.patna as ResolvedCity;
    expect(patna.price).toBe(2500);
    expect(patna.mortgage).toBe(1250);
    expect(patna.unmortgageCost).toBe(1375);
    for (const m of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 3]) {
      for (const p of Object.values(resolveEconomy({ priceMultiplier: m }).properties)) {
        expect(p.mortgage * 2).toBe(p.price);
        expect(Number.isInteger(p.unmortgageCost)).toBe(true);
      }
    }
  });

  test("disabling a whole deck throws", () => {
    const chance = BASE_CARDS.filter((c) => c.deck === "chance").map((c) => c.id);
    expect(() => resolveEconomy({ disabledCardIds: chance })).toThrow(/chance/);
    expect(() => resolveEconomy({ disabledCardIds: chance.slice(1) })).not.toThrow();
  });

  test("invalid settings throw", () => {
    expect(() => resolveEconomy({ startingMoney: -5 })).toThrow();
    expect(() => resolveEconomy({ priceMultiplier: 10 })).toThrow();
    expect(() => resolveEconomy({ disabledCardIds: ["NOPE"] })).toThrow(/NOPE/);
  });
});
