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

// Expected values transcribed from spec §5-9, independently of base.ts.
const CARD_TABLE: [string, string, unknown][] = [
  ["CH01", "Startup Funding", { kind: "collect", amount: 2000 }],
  ["CH02", "Market Rally", { kind: "collect", amount: 1500 }],
  ["CH03", "Unexpected Audit", { kind: "pay", amount: 1000 }],
  ["CH04", "Infrastructure Boom", { kind: "moveSteps", steps: 3 }],
  ["CH05", "Corporate Relocation", { kind: "moveToNearest", tileKind: "transport" }],
  ["CH06", "Tax Notice", { kind: "pay", amount: 500 }],
  ["CH07", "Major Contract", { kind: "collect", amount: 2500 }],
  ["CH08", "Supply Chain Disruption", { kind: "payPerBuilding", perHouse: 500, perHotel: 1000, cap: 3000 }],
  ["CH09", "Venture Capital", { kind: "collect", amount: 3000 }],
  ["CH10", "Legal Dispute", { kind: "pay", amount: 1500 }],
  ["CH11", "Strategic Acquisition", { kind: "moveToUnownedCity" }],
  ["CH12", "Rail Expansion", { kind: "moveTo", tileId: "indian-railways" }],
  ["CH13", "Economic Slowdown", { kind: "payEachPlayer", amount: 200 }],
  ["CH14", "Government Incentive", { kind: "collect", amount: 1000 }],
  ["CH15", "Free from Jail", { kind: "jailFree" }],
  ["CH16", "Advance to Start", { kind: "moveTo", tileId: "start" }],
  ["CC01", "Dividend Payment", { kind: "collect", amount: 1000 }],
  ["CC02", "Insurance Payout", { kind: "collect", amount: 1500 }],
  ["CC03", "Medical Emergency", { kind: "pay", amount: 500 }],
  ["CC04", "Municipal Maintenance", { kind: "payPerBuilding", perHouse: 200, perHotel: 500, cap: 2000 }],
  ["CC05", "Festival Bonus", { kind: "collectFromEachPlayer", amount: 500 }],
  ["CC06", "Utility Rebate", { kind: "collect", amount: 500 }],
  ["CC07", "Loan Repayment", { kind: "pay", amount: 1000 }],
  ["CC08", "Employee Bonus", { kind: "pay", amount: 500 }],
  ["CC09", "Property Sale", { kind: "collect", amount: 1000 }],
  ["CC10", "Business Award", { kind: "collect", amount: 2000 }],
  ["CC11", "Community Donation", { kind: "payEachPlayer", amount: 200 }],
  ["CC12", "Bank Interest", { kind: "collectPerTransport", perTransport: 500, cap: 2000 }],
  ["CC13", "Unexpected Fine", { kind: "pay", amount: 750 }],
  ["CC14", "Startup Grant", { kind: "collect", amount: 1500 }],
  ["CC15", "Free from Jail", { kind: "jailFree" }],
  ["CC16", "Tax Refund", { kind: "collect", amount: 1000 }],
];

describe("base config values (spec §5-9)", () => {
  test("all 32 cards: id, deck, title and effect", () => {
    expect(BASE_CARDS.map((c) => c.id)).toEqual(CARD_TABLE.map(([id]) => id));
    for (const [id, title, effect] of CARD_TABLE) {
      const card = BASE_CARDS.find((c) => c.id === id);
      expect(card?.title).toBe(title);
      expect(card?.effect).toEqual(effect as never);
      expect(card?.deck).toBe(id.startsWith("CH") ? "chance" : "communityChest");
    }
  });

  test("every city row", () => {
    const rows: [string, string, number, number[], number][] = [
      ["patna", "brown", 2000, [200, 600, 1000, 1600, 2400], 1000],
      ["ranchi", "brown", 2400, [240, 720, 1200, 1920, 2880], 1200],
      ["raipur", "brown", 2800, [280, 840, 1400, 2240, 3360], 1400],
      ["lucknow", "lightBlue", 3200, [320, 960, 1600, 2560, 3840], 1600],
      ["bhopal", "lightBlue", 3600, [360, 1080, 1800, 2880, 4320], 1800],
      ["indore", "lightBlue", 4000, [400, 1200, 2000, 3200, 4800], 2000],
      ["jaipur", "pink", 4400, [440, 1320, 2200, 3520, 5280], 2200],
      ["udaipur", "pink", 4800, [480, 1440, 2400, 3840, 5760], 2400],
      ["jodhpur", "pink", 5200, [520, 1560, 2600, 4160, 6240], 2600],
      ["ahmedabad", "orange", 5600, [560, 1680, 2800, 4480, 6720], 2800],
      ["surat", "orange", 6000, [600, 1800, 3000, 4800, 7200], 3000],
      ["vadodara", "orange", 6400, [640, 1920, 3200, 5120, 7680], 3200],
      ["hyderabad", "red", 6800, [680, 2040, 3400, 5440, 8160], 3400],
      ["chennai", "red", 7200, [720, 2160, 3600, 5760, 8640], 3600],
      ["kolkata", "red", 7600, [760, 2280, 3800, 6080, 9120], 3800],
      ["pune", "yellow", 8000, [800, 2400, 4000, 6400, 9600], 4000],
      ["bengaluru", "yellow", 8400, [840, 2520, 4200, 6720, 10080], 4200],
      ["ahmedabad-gift-city", "yellow", 8800, [880, 2640, 4400, 7040, 10560], 4400],
      ["gurugram", "green", 9200, [920, 2760, 4600, 7360, 11040], 4600],
      ["noida", "green", 9600, [960, 2880, 4800, 7680, 11520], 4800],
      ["mumbai", "green", 10000, [1000, 3000, 5000, 8000, 12000], 5000],
      ["new-delhi", "darkBlue", 11000, [1100, 3300, 5500, 8800, 13200], 5500],
      ["bengaluru-tech-park", "darkBlue", 12000, [1200, 3600, 6000, 9600, 14400], 6000],
      ["mumbai-bkc", "darkBlue", 13000, [1300, 3900, 6500, 10400, 15600], 6500],
    ];
    expect(BASE_CITIES).toHaveLength(rows.length);
    for (const [id, group, price, rents, mortgage] of rows) {
      const c = BASE_CITIES.find((x) => x.id === id);
      expect(c).toEqual({ id, group, price, rents, mortgage } as never);
      expect(BASE_TILES.find((t) => t.id === id)?.group).toBe(group as never);
    }
  });

  test("group building costs", () => {
    const costs = { brown: 1000, lightBlue: 1000, pink: 1500, orange: 1500, red: 2000, yellow: 2000, green: 2500, darkBlue: 3000 };
    for (const [g, cost] of Object.entries(costs)) {
      expect(BASE_GROUPS[g as keyof typeof costs]).toMatchObject({ houseCost: cost, hotelCost: cost });
    }
  });

  test("transports and utilities", () => {
    const rents = [500, 1000, 2000, 4000];
    expect(BASE_TRANSPORTS.map((t) => [t.id, t.price, t.mortgage])).toEqual([
      ["indian-railways", 7000, 3500],
      ["national-highways", 7000, 3500],
      ["indian-airways", 8000, 4000],
      ["coastal-shipping", 6000, 3000],
    ]);
    for (const t of BASE_TRANSPORTS) expect(t.rents).toEqual(rents as never);
    expect(BASE_UTILITIES).toEqual([
      { id: "power-grid", price: 5000, mortgage: 2500 },
      { id: "digital-bharat-network", price: 5000, mortgage: 2500 },
    ]);
  });
});

