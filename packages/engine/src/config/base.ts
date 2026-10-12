import type { BaseCity, BaseGroup, BaseRules, BaseTile, BaseTransport, BaseUtility, Card, GroupId } from "../types";

// Canonical, unscaled base configuration. Never mutate: resolveEconomy derives room values from it.
// Source: docs/superpowers/specs/2026-10-12-bizbash-rules-design.md §4-9.

/**
 * 40 tiles in board order (index = position). Square track: corners at 0, 10, 20, 30 with nine
 * tiles per side; each side holds two colour groups, one transport and two other spaces, prices
 * rising clockwise as on classic Indian business boards.
 */
export const BASE_TILES: readonly BaseTile[] = [
  { id: "start", name: "Start", kind: "start" },
  { id: "patna", name: "Patna", kind: "city", group: "brown" },
  { id: "community-chest-1", name: "Community Chest", kind: "communityChest" },
  { id: "ranchi", name: "Ranchi", kind: "city", group: "brown" },
  { id: "raipur", name: "Raipur", kind: "city", group: "brown" },
  { id: "indian-railways", name: "Indian Railways", kind: "transport" },
  { id: "bhopal", name: "Bhopal", kind: "city", group: "lightBlue" },
  { id: "income-tax", name: "Income Tax", kind: "incomeTax" },
  { id: "nagpur", name: "Nagpur", kind: "city", group: "lightBlue" },
  { id: "indore", name: "Indore", kind: "city", group: "lightBlue" },
  { id: "jail", name: "Jail / Just Visiting", kind: "jail" },
  { id: "lucknow", name: "Lucknow", kind: "city", group: "pink" },
  { id: "power-grid", name: "Power Grid", kind: "utility" },
  { id: "surat", name: "Surat", kind: "city", group: "pink" },
  { id: "jaipur", name: "Jaipur", kind: "city", group: "pink" },
  { id: "national-highways", name: "National Highways", kind: "transport" },
  { id: "chandigarh", name: "Chandigarh", kind: "city", group: "orange" },
  { id: "chance-1", name: "Chance", kind: "chance" },
  { id: "ahmedabad", name: "Ahmedabad", kind: "city", group: "orange" },
  { id: "ooty", name: "Ooty", kind: "city", group: "orange" },
  { id: "rest-house", name: "Rest House", kind: "restHouse" },
  { id: "darjeeling", name: "Darjeeling", kind: "city", group: "red" },
  { id: "chance-2", name: "Chance", kind: "chance" },
  { id: "srinagar", name: "Srinagar", kind: "city", group: "red" },
  { id: "goa", name: "Goa", kind: "city", group: "red" },
  { id: "indian-airways", name: "Indian Airways", kind: "transport" },
  { id: "noida", name: "Noida", kind: "city", group: "yellow" },
  { id: "gurugram", name: "Gurugram", kind: "city", group: "yellow" },
  { id: "digital-bharat-network", name: "Digital Bharat Network", kind: "utility" },
  { id: "pune", name: "Pune", kind: "city", group: "yellow" },
  { id: "club", name: "Club", kind: "club" },
  { id: "hyderabad", name: "Hyderabad", kind: "city", group: "green" },
  { id: "kolkata", name: "Kolkata", kind: "city", group: "green" },
  { id: "community-chest-2", name: "Community Chest", kind: "communityChest" },
  { id: "chennai", name: "Chennai", kind: "city", group: "green" },
  { id: "coastal-shipping", name: "Coastal Shipping", kind: "transport" },
  { id: "bengaluru", name: "Bengaluru", kind: "city", group: "darkBlue" },
  { id: "wealth-tax", name: "Wealth Tax", kind: "wealthTax" },
  { id: "new-delhi", name: "New Delhi", kind: "city", group: "darkBlue" },
  { id: "mumbai", name: "Mumbai", kind: "city", group: "darkBlue" },
];

export const BASE_GROUPS: Readonly<Record<GroupId, BaseGroup>> = {
  brown: { id: "brown", name: "Brown", houseCost: 1000, hotelCost: 1000 },
  lightBlue: { id: "lightBlue", name: "Light Blue", houseCost: 1000, hotelCost: 1000 },
  pink: { id: "pink", name: "Pink", houseCost: 1500, hotelCost: 1500 },
  orange: { id: "orange", name: "Orange", houseCost: 1500, hotelCost: 1500 },
  red: { id: "red", name: "Red", houseCost: 2000, hotelCost: 2000 },
  yellow: { id: "yellow", name: "Yellow", houseCost: 2000, hotelCost: 2000 },
  green: { id: "green", name: "Green", houseCost: 2500, hotelCost: 2500 },
  darkBlue: { id: "darkBlue", name: "Dark Blue", houseCost: 3000, hotelCost: 3000 },
};

function city(id: string, group: GroupId, price: number, rents: BaseCity["rents"], mortgage: number): BaseCity {
  return { id, group, price, rents, mortgage };
}

export const BASE_CITIES: readonly BaseCity[] = [
  city("patna", "brown", 2000, [200, 600, 1000, 1600, 2400], 1000),
  city("ranchi", "brown", 2400, [240, 720, 1200, 1920, 2880], 1200),
  city("raipur", "brown", 2800, [280, 840, 1400, 2240, 3360], 1400),
  city("bhopal", "lightBlue", 3200, [320, 960, 1600, 2560, 3840], 1600),
  city("nagpur", "lightBlue", 3600, [360, 1080, 1800, 2880, 4320], 1800),
  city("indore", "lightBlue", 4000, [400, 1200, 2000, 3200, 4800], 2000),
  city("lucknow", "pink", 4400, [440, 1320, 2200, 3520, 5280], 2200),
  city("surat", "pink", 4800, [480, 1440, 2400, 3840, 5760], 2400),
  city("jaipur", "pink", 5200, [520, 1560, 2600, 4160, 6240], 2600),
  city("chandigarh", "orange", 5600, [560, 1680, 2800, 4480, 6720], 2800),
  city("ahmedabad", "orange", 6000, [600, 1800, 3000, 4800, 7200], 3000),
  city("ooty", "orange", 6400, [640, 1920, 3200, 5120, 7680], 3200),
  city("darjeeling", "red", 6800, [680, 2040, 3400, 5440, 8160], 3400),
  city("srinagar", "red", 7200, [720, 2160, 3600, 5760, 8640], 3600),
  city("goa", "red", 7600, [760, 2280, 3800, 6080, 9120], 3800),
  city("noida", "yellow", 8000, [800, 2400, 4000, 6400, 9600], 4000),
  city("gurugram", "yellow", 8400, [840, 2520, 4200, 6720, 10080], 4200),
  city("pune", "yellow", 8800, [880, 2640, 4400, 7040, 10560], 4400),
  city("hyderabad", "green", 9200, [920, 2760, 4600, 7360, 11040], 4600),
  city("kolkata", "green", 9600, [960, 2880, 4800, 7680, 11520], 4800),
  city("chennai", "green", 10000, [1000, 3000, 5000, 8000, 12000], 5000),
  city("bengaluru", "darkBlue", 11000, [1100, 3300, 5500, 8800, 13200], 5500),
  city("new-delhi", "darkBlue", 12000, [1200, 3600, 6000, 9600, 14400], 6000),
  city("mumbai", "darkBlue", 13000, [1300, 3900, 6500, 10400, 15600], 6500),
];

const TRANSPORT_RENTS: BaseTransport["rents"] = [500, 1000, 2000, 4000];

export const BASE_TRANSPORTS: readonly BaseTransport[] = [
  { id: "indian-railways", price: 7000, rents: TRANSPORT_RENTS, mortgage: 3500 },
  { id: "national-highways", price: 7000, rents: TRANSPORT_RENTS, mortgage: 3500 },
  { id: "indian-airways", price: 8000, rents: TRANSPORT_RENTS, mortgage: 4000 },
  { id: "coastal-shipping", price: 6000, rents: TRANSPORT_RENTS, mortgage: 3000 },
];

export const BASE_UTILITIES: readonly BaseUtility[] = [
  { id: "power-grid", price: 5000, mortgage: 2500 },
  { id: "digital-bharat-network", price: 5000, mortgage: 2500 },
];

function card(id: string, title: string, effect: Card["effect"]): Card {
  return { id, deck: id.startsWith("CH") ? "chance" : "communityChest", title, effect };
}

/** 16 Chance + 16 Community Chest cards. */
export const BASE_CARDS: readonly Card[] = [
  card("CH01", "Startup Funding", { kind: "collect", amount: 2000 }),
  card("CH02", "Market Rally", { kind: "collect", amount: 1500 }),
  card("CH03", "Unexpected Audit", { kind: "pay", amount: 1000 }),
  card("CH04", "Infrastructure Boom", { kind: "moveSteps", steps: 3 }),
  card("CH05", "Corporate Relocation", { kind: "moveToNearest", tileKind: "transport" }),
  card("CH06", "Tax Notice", { kind: "pay", amount: 500 }),
  card("CH07", "Major Contract", { kind: "collect", amount: 2500 }),
  card("CH08", "Supply Chain Disruption", { kind: "payPerBuilding", perHouse: 500, perHotel: 1000, cap: 3000 }),
  card("CH09", "Venture Capital", { kind: "collect", amount: 3000 }),
  card("CH10", "Legal Dispute", { kind: "pay", amount: 1500 }),
  card("CH11", "Strategic Acquisition", { kind: "moveToUnownedCity" }),
  card("CH12", "Rail Expansion", { kind: "moveTo", tileId: "indian-railways" }),
  card("CH13", "Economic Slowdown", { kind: "payEachPlayer", amount: 200 }),
  card("CH14", "Government Incentive", { kind: "collect", amount: 1000 }),
  card("CH15", "Free from Jail", { kind: "jailFree" }),
  card("CH16", "Advance to Start", { kind: "moveTo", tileId: "start" }),
  card("CC01", "Dividend Payment", { kind: "collect", amount: 1000 }),
  card("CC02", "Insurance Payout", { kind: "collect", amount: 1500 }),
  card("CC03", "Medical Emergency", { kind: "pay", amount: 500 }),
  card("CC04", "Municipal Maintenance", { kind: "payPerBuilding", perHouse: 200, perHotel: 500, cap: 2000 }),
  card("CC05", "Festival Bonus", { kind: "collectFromEachPlayer", amount: 500 }),
  card("CC06", "Utility Rebate", { kind: "collect", amount: 500 }),
  card("CC07", "Loan Repayment", { kind: "pay", amount: 1000 }),
  card("CC08", "Employee Bonus", { kind: "pay", amount: 500 }),
  card("CC09", "Property Sale", { kind: "collect", amount: 1000 }),
  card("CC10", "Business Award", { kind: "collect", amount: 2000 }),
  card("CC11", "Community Donation", { kind: "payEachPlayer", amount: 200 }),
  card("CC12", "Bank Interest", { kind: "collectPerTransport", perTransport: 500, cap: 2000 }),
  card("CC13", "Unexpected Fine", { kind: "pay", amount: 750 }),
  card("CC14", "Startup Grant", { kind: "collect", amount: 1500 }),
  card("CC15", "Free from Jail", { kind: "jailFree" }),
  card("CC16", "Tax Refund", { kind: "collect", amount: 1000 }),
];

export const BASE_RULES: BaseRules = {
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
};
