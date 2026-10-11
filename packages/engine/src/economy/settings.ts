import { z } from "zod";

export const STARTING_MONEY_PRESETS = [10_000, 15_000, 20_000, 25_000, 30_000, 40_000] as const;
export const PRICE_MULTIPLIER_PRESETS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export const BANK_INVENTORY_PRESETS = {
  small: { houses: 24, hotels: 8 },
  standard: { houses: 32, hotels: 12 },
  large: { houses: 48, hotels: 16 },
} as const;

export const SETTINGS_LIMITS = {
  startingMoney: { min: 1_000, max: 1_000_000 },
  priceMultiplier: { min: 0.25, max: 3 },
  houses: { min: 1, max: 200 },
  hotels: { min: 1, max: 100 },
  bankCash: { min: 1, max: 100_000_000 },
  durationMinutes: { min: 10, max: 240 },
} as const;

const L = SETTINGS_LIMITS;

/** Host-selected room settings. Every field has a default, so `{}` parses to the defaults. */
export const RoomSettingsSchema = z
  .object({
    startingMoney: z.number().int().min(L.startingMoney.min).max(L.startingMoney.max).default(20_000),
    priceMultiplier: z.number().finite().min(L.priceMultiplier.min).max(L.priceMultiplier.max).default(1),
    houses: z.number().int().min(L.houses.min).max(L.houses.max).default(32),
    hotels: z.number().int().min(L.hotels.min).max(L.hotels.max).default(12),
    bankCash: z.number().int().min(L.bankCash.min).max(L.bankCash.max).default(1_000_000),
    gameMode: z.enum(["elimination", "timed"]).default("elimination"),
    durationMinutes: z.number().int().min(L.durationMinutes.min).max(L.durationMinutes.max).default(60),
    auctionsEnabled: z.boolean().default(true),
    tradingEnabled: z.boolean().default(true),
    doublesRollAgain: z.boolean().default(true),
    threeDoublesToJail: z.boolean().default(true),
    /** Card ids removed from the decks. Unknown ids are rejected by resolveEconomy. */
    disabledCardIds: z.array(z.string().max(8)).max(32).default([]),
  })
  .strict();

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export type RoomSettingsInput = z.input<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = RoomSettingsSchema.parse({});
