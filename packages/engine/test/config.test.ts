import { describe, expect, test } from "bun:test";
import { BASE_CARDS, BASE_CITIES, BASE_GROUPS, BASE_RULES, BASE_TILES, BASE_TRANSPORTS, BASE_UTILITIES } from "../src/config/base";
import { validateBaseConfig } from "../src/config/validate";

describe("base config", () => {
  test("passes startup validation", () => {
    expect(() => validateBaseConfig()).not.toThrow();
  });

  test("board counts match the spec", () => {
    const count = (kind: string) => BASE_TILES.filter((t) => t.kind === kind).length;
    expect(BASE_TILES).toHaveLength(40);
    expect(new Set(BASE_TILES.map((t) => t.id)).size).toBe(40);
    expect(count("city")).toBe(24);
    expect(count("transport")).toBe(4);
    expect(count("utility")).toBe(2);
    expect(count("chance")).toBe(2);
    expect(count("communityChest")).toBe(2);
    expect(count("incomeTax") + count("wealthTax")).toBe(2);
    expect(count("start") + count("jail") + count("restHouse") + count("club")).toBe(4);
    expect(Object.keys(BASE_GROUPS)).toHaveLength(8);
    expect(BASE_CITIES).toHaveLength(24);
    expect(BASE_TRANSPORTS).toHaveLength(4);
    expect(BASE_UTILITIES).toHaveLength(2);
  });

  test("key tile positions", () => {
    expect(BASE_TILES[0]?.id).toBe("start");
    expect(BASE_TILES[9]?.id).toBe("jail");
    expect(BASE_TILES[18]?.id).toBe("rest-house");
    expect(BASE_TILES[30]?.id).toBe("club");
    expect(BASE_TILES[39]?.id).toBe("digital-bharat-network");
  });

  test("every group has three cities", () => {
    for (const g of Object.keys(BASE_GROUPS)) {
      expect(BASE_CITIES.filter((c) => c.group === g)).toHaveLength(3);
    }
  });

  test("32 cards, unique ids, 16 per deck", () => {
    expect(BASE_CARDS).toHaveLength(32);
    expect(new Set(BASE_CARDS.map((c) => c.id)).size).toBe(32);
    expect(BASE_CARDS.filter((c) => c.deck === "chance")).toHaveLength(16);
    expect(BASE_CARDS.filter((c) => c.deck === "communityChest")).toHaveLength(16);
  });

  test("special cards have the structured effects from the brief", () => {
    const byId = Object.fromEntries(BASE_CARDS.map((c) => [c.id, c.effect]));
    expect(byId.CH05).toEqual({ kind: "moveToNearest", tileKind: "transport" });
    expect(byId.CH11).toEqual({ kind: "moveToUnownedCity" });
    expect(byId.CH12).toEqual({ kind: "moveTo", tileId: "indian-railways" });
    expect(byId.CH16).toEqual({ kind: "moveTo", tileId: "start" });
    expect(byId.CH15).toEqual({ kind: "jailFree" });
    expect(byId.CC15).toEqual({ kind: "jailFree" });
  });

  test("base rules", () => {
    expect(BASE_RULES).toMatchObject({
      startBonus: 2000,
      incomeTax: 500,
      wealthTaxPerHouse: 100,
      wealthTaxPerHotel: 100,
      wealthTaxCap: 500,
      restHouseFromEach: 100,
      clubToEach: 100,
      jailFine: 500,
      minBidIncrement: 100,
      utilityMultipliers: [4, 10],
      unmortgageInterestRate: 0.1,
      buildingRefundRate: 0.5,
      maxHousesPerProperty: 3,
      maxJailAttempts: 3,
      doublesToJail: 3,
    });
  });
});
