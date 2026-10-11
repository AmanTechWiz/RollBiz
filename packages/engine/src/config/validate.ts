import type { ResolvedEconomy, TileKind } from "../types";
import { BASE_CARDS, BASE_CITIES, BASE_GROUPS, BASE_TILES, BASE_TRANSPORTS, BASE_UTILITIES } from "./base";

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`invalid config: ${message}`);
}

function countKind(kinds: readonly TileKind[], kind: TileKind): number {
  return kinds.filter((k) => k === kind).length;
}

/**
 * Throws if the base config is inconsistent: 40 unique tile ids, 8 groups of 3 cities,
 * 24 cities, 4 transports, 2 utilities, 2 Chance + 2 Community Chest tiles, 2 taxes,
 * 4 corners, 32 unique cards (16 per deck), every property tile has base data.
 */
export function validateBaseConfig(): void {
  const kinds = BASE_TILES.map((t) => t.kind);
  check(BASE_TILES.length === 40, `expected 40 tiles, got ${BASE_TILES.length}`);
  check(new Set(BASE_TILES.map((t) => t.id)).size === 40, "tile ids are not unique");
  check(countKind(kinds, "city") === 24, "expected 24 cities");
  check(countKind(kinds, "transport") === 4, "expected 4 transports");
  check(countKind(kinds, "utility") === 2, "expected 2 utilities");
  check(countKind(kinds, "chance") === 2, "expected 2 Chance tiles");
  check(countKind(kinds, "communityChest") === 2, "expected 2 Community Chest tiles");
  check(countKind(kinds, "incomeTax") + countKind(kinds, "wealthTax") === 2, "expected 2 tax tiles");
  const corners = ["start", "jail", "restHouse", "club"] as const;
  check(corners.every((k) => countKind(kinds, k) === 1), "expected 4 distinct corner tiles");

  const groups = Object.values(BASE_GROUPS);
  check(groups.length === 8, "expected 8 groups");
  for (const g of groups) {
    check(BASE_CITIES.filter((c) => c.group === g.id).length === 3, `group ${g.id} must have 3 cities`);
  }

  check(BASE_CITIES.length === 24, "expected 24 base cities");
  check(BASE_TRANSPORTS.length === 4, "expected 4 base transports");
  check(BASE_UTILITIES.length === 2, "expected 2 base utilities");
  const baseIds = new Set<string>([...BASE_CITIES, ...BASE_TRANSPORTS, ...BASE_UTILITIES].map((p) => p.id));
  check(baseIds.size === 30, "property base data ids are not unique");
  for (const tile of BASE_TILES) {
    if (tile.kind === "city" || tile.kind === "transport" || tile.kind === "utility") {
      check(baseIds.has(tile.id), `tile ${tile.id} has no base data`);
    }
    if (tile.kind === "city") {
      const base = BASE_CITIES.find((c) => c.id === tile.id);
      check(base?.group === tile.group, `tile ${tile.id} group does not match its base data`);
    }
  }

  check(BASE_CARDS.length === 32, `expected 32 cards, got ${BASE_CARDS.length}`);
  check(new Set(BASE_CARDS.map((c) => c.id)).size === 32, "card ids are not unique");
  check(BASE_CARDS.filter((c) => c.deck === "chance").length === 16, "expected 16 Chance cards");
  check(BASE_CARDS.filter((c) => c.deck === "communityChest").length === 16, "expected 16 Community Chest cards");
}

/** Throws if a resolved economy is missing a property/group/card or has a non-positive price. */
export function validateEconomy(economy: ResolvedEconomy): void {
  check(economy.tiles.length === 40, "economy must have 40 tiles");
  for (const tile of economy.tiles) {
    if (tile.kind === "city" || tile.kind === "transport" || tile.kind === "utility") {
      const prop = economy.properties[tile.id];
      check(prop !== undefined, `missing property ${tile.id}`);
      check(prop.price > 0, `${tile.id} has a non-positive price`);
      check(prop.mortgage > 0, `${tile.id} has a non-positive mortgage`);
      check(prop.unmortgageCost >= prop.mortgage, `${tile.id} unmortgage cost is below its mortgage`);
    }
  }
  for (const group of Object.values(BASE_GROUPS)) {
    const g = economy.groups[group.id];
    check(g !== undefined, `missing group ${group.id}`);
    check(g.propertyIds.length === 3, `group ${group.id} must have 3 properties`);
    check(g.houseCost > 0 && g.hotelCost > 0, `group ${group.id} has a non-positive building cost`);
  }
  for (const deck of ["chance", "communityChest"] as const) {
    check(economy.decks[deck].length > 0, `deck ${deck} has no cards left; disable fewer cards`);
    for (const cardId of economy.decks[deck]) {
      check(economy.cards[cardId]?.deck === deck, `deck ${deck} references missing card ${cardId}`);
    }
  }
  check(economy.bank.cash > 0 && economy.bank.houses > 0 && economy.bank.hotels > 0, "bank inventory must be positive");
}
