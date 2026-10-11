import { todo } from "../core/todo";
import type { ResolvedEconomy } from "../types";

/**
 * Throws if the base config is inconsistent: 40 unique tile ids, 8 groups of 3 cities,
 * 24 cities, 4 transports, 2 utilities, 2 Chance + 2 Community Chest tiles, 2 taxes,
 * 4 corners, 32 unique cards (16 per deck), every property tile has base data.
 */
export function validateBaseConfig(): void {
  todo("validateBaseConfig");
}

/** Throws if a resolved economy is missing a property/group/card or has a non-positive price. */
export function validateEconomy(economy: ResolvedEconomy): void {
  todo("validateEconomy");
}
