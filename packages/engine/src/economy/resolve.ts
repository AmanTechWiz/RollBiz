import { todo } from "../core/todo";
import type { ResolvedEconomy } from "../types";
import type { RoomSettingsInput } from "./settings";

/**
 * Scales a base rupee amount. At exactly 1x returns `base` unchanged. Otherwise rounds
 * base * multiplier to the nearest 100, with a minimum of 100 for positive amounts. 0 stays 0.
 */
export function scaleAmount(base: number, multiplier: number): number {
  return todo("scaleAmount");
}

/**
 * Parses settings (throws ZodError on invalid input), scales every price-scaled value once from
 * the immutable base config, validates the result and deep-freezes it.
 */
export function resolveEconomy(input: RoomSettingsInput = {}): ResolvedEconomy {
  return todo("resolveEconomy");
}
