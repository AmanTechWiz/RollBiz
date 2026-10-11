import type { BaseCity, BaseGroup, BaseRules, BaseTile, BaseTransport, BaseUtility, Card, GroupId } from "../types";

// Canonical, unscaled base configuration. Never mutate: resolveEconomy derives room values from it.
// Filled in by the foundation task from docs/superpowers/specs/2026-10-12-bizbash-rules-design.md §4-9.

/** 40 tiles in board order (index = position). */
export const BASE_TILES: readonly BaseTile[] = [];
export const BASE_GROUPS: Readonly<Record<GroupId, BaseGroup>> = {} as Record<GroupId, BaseGroup>;
export const BASE_CITIES: readonly BaseCity[] = [];
export const BASE_TRANSPORTS: readonly BaseTransport[] = [];
export const BASE_UTILITIES: readonly BaseUtility[] = [];
/** 16 Chance + 16 Community Chest cards. */
export const BASE_CARDS: readonly Card[] = [];
export const BASE_RULES: BaseRules = {} as BaseRules;
