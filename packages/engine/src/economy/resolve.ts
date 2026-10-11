import { BASE_CARDS, BASE_CITIES, BASE_GROUPS, BASE_RULES, BASE_TILES, BASE_TRANSPORTS, BASE_UTILITIES } from "../config/base";
import { validateBaseConfig, validateEconomy } from "../config/validate";
import type {
  BaseRules,
  Card,
  CardEffect,
  DeckId,
  GroupId,
  ResolvedEconomy,
  ResolvedGroup,
  ResolvedProperty,
  ResolvedRules,
} from "../types";
import { RoomSettingsSchema, type RoomSettings, type RoomSettingsInput } from "./settings";

/**
 * Scales a base rupee amount. At exactly 1x returns `base` unchanged. Otherwise rounds
 * base * multiplier to the nearest 100, with a minimum of 100 for positive amounts. 0 stays 0.
 */
export function scaleAmount(base: number, multiplier: number): number {
  if (multiplier === 1 || base === 0) return base;
  const scaled = Math.round((base * multiplier) / 100) * 100;
  return base > 0 ? Math.max(100, scaled) : scaled;
}

/** Interest is a decimal rate, so strip float noise (1000 * 1.1 is 1100.0000000000002) before rounding up. */
function unmortgageCost(mortgage: number, rate: number): number {
  return Math.ceil(Number((mortgage * (1 + rate)).toFixed(6)));
}

function scaleRules(base: BaseRules, settings: RoomSettings, m: number): ResolvedRules {
  return {
    ...base,
    startBonus: scaleAmount(base.startBonus, m),
    incomeTax: scaleAmount(base.incomeTax, m),
    wealthTaxPerHouse: scaleAmount(base.wealthTaxPerHouse, m),
    wealthTaxPerHotel: scaleAmount(base.wealthTaxPerHotel, m),
    wealthTaxCap: scaleAmount(base.wealthTaxCap, m),
    restHouseFromEach: scaleAmount(base.restHouseFromEach, m),
    clubToEach: scaleAmount(base.clubToEach, m),
    jailFine: scaleAmount(base.jailFine, m),
    minBidIncrement: scaleAmount(base.minBidIncrement, m),
    utilityMultipliers: [...base.utilityMultipliers],
    doublesRollAgain: settings.doublesRollAgain,
    threeDoublesToJail: settings.threeDoublesToJail,
    auctionsEnabled: settings.auctionsEnabled,
    tradingEnabled: settings.tradingEnabled,
  };
}

function scaleEffect(effect: CardEffect, m: number): CardEffect {
  switch (effect.kind) {
    case "collect":
    case "pay":
    case "payEachPlayer":
    case "collectFromEachPlayer":
      return { ...effect, amount: scaleAmount(effect.amount, m) };
    case "payPerBuilding":
      return {
        ...effect,
        perHouse: scaleAmount(effect.perHouse, m),
        perHotel: scaleAmount(effect.perHotel, m),
        cap: scaleAmount(effect.cap, m),
      };
    case "collectPerTransport":
      return { ...effect, perTransport: scaleAmount(effect.perTransport, m), cap: scaleAmount(effect.cap, m) };
    case "moveSteps":
    case "moveToNearest":
    case "moveTo":
    case "moveToUnownedCity":
    case "jailFree":
      return { ...effect };
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Parses settings (throws ZodError on invalid input), scales every price-scaled value once from
 * the immutable base config, validates the result and deep-freezes it.
 */
export function resolveEconomy(input: RoomSettingsInput = {}): ResolvedEconomy {
  const settings = RoomSettingsSchema.parse(input);
  validateBaseConfig();
  const m = settings.priceMultiplier;
  const rate = BASE_RULES.unmortgageInterestRate;

  const tileNames = new Map(BASE_TILES.map((t) => [t.id, t.name]));
  const nameOf = (id: string) => tileNames.get(id) ?? id;

  const properties: Record<string, ResolvedProperty> = {};
  for (const c of BASE_CITIES) {
    const group = BASE_GROUPS[c.group];
    const mortgage = scaleAmount(c.mortgage, m);
    properties[c.id] = {
      kind: "city",
      id: c.id,
      name: nameOf(c.id),
      group: c.group,
      price: scaleAmount(c.price, m),
      rents: c.rents.map((r) => scaleAmount(r, m)) as [number, number, number, number, number],
      houseCost: scaleAmount(group.houseCost, m),
      hotelCost: scaleAmount(group.hotelCost, m),
      mortgage,
      unmortgageCost: unmortgageCost(mortgage, rate),
    };
  }
  for (const t of BASE_TRANSPORTS) {
    const mortgage = scaleAmount(t.mortgage, m);
    properties[t.id] = {
      kind: "transport",
      id: t.id,
      name: nameOf(t.id),
      price: scaleAmount(t.price, m),
      rents: t.rents.map((r) => scaleAmount(r, m)) as [number, number, number, number],
      mortgage,
      unmortgageCost: unmortgageCost(mortgage, rate),
    };
  }
  for (const u of BASE_UTILITIES) {
    const mortgage = scaleAmount(u.mortgage, m);
    properties[u.id] = {
      kind: "utility",
      id: u.id,
      name: nameOf(u.id),
      price: scaleAmount(u.price, m),
      mortgage,
      unmortgageCost: unmortgageCost(mortgage, rate),
    };
  }

  const groups = {} as Record<GroupId, ResolvedGroup>;
  for (const g of Object.values(BASE_GROUPS)) {
    groups[g.id] = {
      id: g.id,
      name: g.name,
      houseCost: scaleAmount(g.houseCost, m),
      hotelCost: scaleAmount(g.hotelCost, m),
      propertyIds: BASE_TILES.filter((t) => t.group === g.id).map((t) => t.id),
    };
  }

  const known = new Set(BASE_CARDS.map((c) => c.id));
  for (const id of settings.disabledCardIds) {
    if (!known.has(id)) throw new Error(`unknown card id in disabledCardIds: ${id}`);
  }
  const disabled = new Set(settings.disabledCardIds);
  const cards: Record<string, Card> = {};
  const decks: Record<DeckId, string[]> = { chance: [], communityChest: [] };
  for (const c of BASE_CARDS) {
    if (disabled.has(c.id)) continue;
    cards[c.id] = { ...c, effect: scaleEffect(c.effect, m) };
    decks[c.deck].push(c.id);
  }

  const economy: ResolvedEconomy = {
    settings: { ...settings, disabledCardIds: [...settings.disabledCardIds] },
    startingMoney: settings.startingMoney,
    bank: { cash: settings.bankCash, houses: settings.houses, hotels: settings.hotels },
    tiles: BASE_TILES.map((t) => ({ ...t })),
    properties,
    groups,
    rules: scaleRules(BASE_RULES, settings, m),
    cards,
    decks,
  };
  validateEconomy(economy);
  return deepFreeze(economy);
}
