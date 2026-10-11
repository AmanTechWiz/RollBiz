import { z } from "zod";

const tileId = z.string().min(1).max(40);
const cardId = z.string().min(1).max(8);
const id = z.number().int().nonnegative();
const money = z.number().int().nonnegative().max(100_000_000);

export const TradeBundleSchema = z.object({
  cash: money,
  properties: z.array(tileId).max(40),
  jailFreeCards: z.array(cardId).max(4),
});

/** Every client action may carry these for safe retries and stale-state detection. */
const meta = {
  /** Client-generated id; a repeated id is acknowledged without re-applying. */
  actionId: z.string().min(1).max(64).optional(),
  /** If set and not equal to state.version, the action is rejected as stale. */
  expectedVersion: z.number().int().nonnegative().optional(),
};

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll"), ...meta }),
  z.object({ type: z.literal("buy"), ...meta }),
  z.object({ type: z.literal("declineBuy"), ...meta }),
  z.object({ type: z.literal("bid"), amount: money.positive(), ...meta }),
  z.object({ type: z.literal("passAuction"), ...meta }),
  z.object({ type: z.literal("build"), tileId, ...meta }),
  z.object({ type: z.literal("sellBuilding"), tileId, ...meta }),
  z.object({
    type: z.literal("sellGroupBuildings"),
    group: z.enum(["brown", "lightBlue", "pink", "orange", "red", "yellow", "green", "darkBlue"]),
    ...meta,
  }),
  z.object({ type: z.literal("mortgage"), tileId, ...meta }),
  z.object({ type: z.literal("unmortgage"), tileId, ...meta }),
  z.object({ type: z.literal("payJailFine"), ...meta }),
  z.object({ type: z.literal("useJailCard"), ...meta }),
  z.object({ type: z.literal("payDebt"), ...meta }),
  z.object({ type: z.literal("declareBankruptcy"), ...meta }),
  z.object({
    type: z.literal("proposeTrade"),
    to: z.string().min(1).max(64),
    give: TradeBundleSchema,
    get: TradeBundleSchema,
    ...meta,
  }),
  z.object({ type: z.literal("acceptTrade"), tradeId: id, ...meta }),
  z.object({ type: z.literal("rejectTrade"), tradeId: id, ...meta }),
  z.object({ type: z.literal("cancelTrade"), tradeId: id, ...meta }),
  z.object({ type: z.literal("endTurn"), ...meta }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Actions only the server may issue (never parsed from client messages). */
export type SystemAction =
  | { type: "timeUp" }
  /** Player left for good: bankrupt to the bank. */
  | { type: "forfeit"; playerId: string };
