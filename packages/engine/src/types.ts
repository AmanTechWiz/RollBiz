import type { RoomSettings } from "./economy/settings";

// ---------------------------------------------------------------------------
// Ids

/** Supabase user id; stable across reconnects. */
export type PlayerId = string;
/** Stable tile id, e.g. "start", "patna", "chance-1". Property ids are tile ids. */
export type TileId = string;
/** Stable card id, e.g. "CH01", "CC15". */
export type CardId = string;
export type DeckId = "chance" | "communityChest";
export type GroupId = "brown" | "lightBlue" | "pink" | "orange" | "red" | "yellow" | "green" | "darkBlue";
/** A payer or payee: a player or the bank. */
export type Party = PlayerId | "bank";

export type TileKind =
  | "start"
  | "city"
  | "transport"
  | "utility"
  | "chance"
  | "communityChest"
  | "incomeTax"
  | "wealthTax"
  | "jail"
  | "restHouse"
  | "club";

// ---------------------------------------------------------------------------
// Base (immutable) configuration: amounts are unscaled rupees.

export interface BaseTile {
  id: TileId;
  name: string;
  kind: TileKind;
  /** Only for kind "city". */
  group?: GroupId;
}

export interface BaseGroup {
  id: GroupId;
  name: string;
  houseCost: number;
  hotelCost: number;
}

/** rents = [base, 1 house, 2 houses, 3 houses, hotel] */
export interface BaseCity {
  id: TileId;
  group: GroupId;
  price: number;
  rents: readonly [number, number, number, number, number];
  mortgage: number;
}

/** rents[i] = rent when the owner holds i + 1 transports. */
export interface BaseTransport {
  id: TileId;
  price: number;
  rents: readonly [number, number, number, number];
  mortgage: number;
}

export interface BaseUtility {
  id: TileId;
  price: number;
  mortgage: number;
}

export interface BaseRules {
  startBonus: number;
  incomeTax: number;
  wealthTaxPerHouse: number;
  wealthTaxPerHotel: number;
  wealthTaxCap: number;
  restHouseFromEach: number;
  clubToEach: number;
  jailFine: number;
  minBidIncrement: number;
  /** Not scaled. Dice-total multiplier: [one utility owned, both owned]. */
  utilityMultipliers: readonly [number, number];
  /** Not scaled. Unmortgage cost = ceil(mortgage * (1 + rate)). */
  unmortgageInterestRate: number;
  /** Not scaled. Share of a building's cost refunded when sold to the bank. */
  buildingRefundRate: number;
  maxHousesPerProperty: number;
  maxJailAttempts: number;
  doublesToJail: number;
}

/** Card effects are structured data; amounts are rupees (scaled once in the resolved economy). */
export type CardEffect =
  | { kind: "collect"; amount: number }
  | { kind: "pay"; amount: number }
  | { kind: "moveSteps"; steps: number }
  | { kind: "moveToNearest"; tileKind: "transport" }
  | { kind: "moveTo"; tileId: TileId }
  | { kind: "moveToUnownedCity" }
  | { kind: "payPerBuilding"; perHouse: number; perHotel: number; cap: number }
  | { kind: "collectPerTransport"; perTransport: number; cap: number }
  | { kind: "payEachPlayer"; amount: number }
  | { kind: "collectFromEachPlayer"; amount: number }
  | { kind: "jailFree" };

export interface Card {
  id: CardId;
  deck: DeckId;
  title: string;
  effect: CardEffect;
}

// ---------------------------------------------------------------------------
// Resolved economy: computed once per room from base config + RoomSettings.

export interface ResolvedCity {
  kind: "city";
  id: TileId;
  name: string;
  group: GroupId;
  price: number;
  rents: readonly [number, number, number, number, number];
  houseCost: number;
  hotelCost: number;
  mortgage: number;
  unmortgageCost: number;
}

export interface ResolvedTransport {
  kind: "transport";
  id: TileId;
  name: string;
  price: number;
  rents: readonly [number, number, number, number];
  mortgage: number;
  unmortgageCost: number;
}

export interface ResolvedUtility {
  kind: "utility";
  id: TileId;
  name: string;
  price: number;
  mortgage: number;
  unmortgageCost: number;
}

export type ResolvedProperty = ResolvedCity | ResolvedTransport | ResolvedUtility;

export interface ResolvedGroup {
  id: GroupId;
  name: string;
  houseCost: number;
  hotelCost: number;
  /** Board order. */
  propertyIds: readonly TileId[];
}

export interface ResolvedRules extends BaseRules {
  doublesRollAgain: boolean;
  threeDoublesToJail: boolean;
  auctionsEnabled: boolean;
  tradingEnabled: boolean;
}

export interface ResolvedEconomy {
  settings: RoomSettings;
  startingMoney: number;
  bank: { cash: number; houses: number; hotels: number };
  /** 40 tiles in board order; index = position. */
  tiles: readonly BaseTile[];
  properties: Readonly<Record<TileId, ResolvedProperty>>;
  groups: Readonly<Record<GroupId, ResolvedGroup>>;
  rules: ResolvedRules;
  /** Enabled cards per deck (disabled cards removed), amounts scaled. */
  cards: Readonly<Record<CardId, Card>>;
  decks: Readonly<Record<DeckId, readonly CardId[]>>;
}

// ---------------------------------------------------------------------------
// Live game state: plain JSON, cloned per action by applyAction.

export interface PlayerState {
  id: PlayerId;
  name: string;
  cash: number;
  /** Tile index 0..39. */
  position: number;
  inJail: boolean;
  /** Failed doubles attempts during the current jail stay. */
  jailAttempts: number;
  jailFreeCards: CardId[];
  bankrupt: boolean;
}

export interface PropertyState {
  owner: PlayerId | null;
  mortgaged: boolean;
  /** 0..3; always 0 when hotel is true. */
  houses: number;
  hotel: boolean;
}

export interface BankState {
  cash: number;
  houses: number;
  hotels: number;
}

/** A payment that couldn't be covered. Balances never go negative. */
export interface Debt {
  id: number;
  debtor: PlayerId;
  creditor: Party;
  amount: number;
  reason: string;
}

export interface Auction {
  tileId: TileId;
  highBid: number;
  highBidder: PlayerId | null;
  /** Players still in the auction (in turn order). */
  bidders: PlayerId[];
}

export type Pending =
  | { kind: "buy"; tileId: TileId }
  | { kind: "auction"; auction: Auction };

export interface TradeBundle {
  cash: number;
  properties: TileId[];
  jailFreeCards: CardId[];
}

export interface TradeOffer {
  id: number;
  from: PlayerId;
  to: PlayerId;
  /** What `from` gives to `to`. */
  give: TradeBundle;
  /** What `from` gets from `to`. */
  get: TradeBundle;
}

export interface TurnState {
  playerId: PlayerId;
  hasRolled: boolean;
  /** Consecutive doubles rolled this turn. */
  doublesCount: number;
  /** True after a non-jail doubles roll: the player must roll again before ending the turn. */
  rollAgain: boolean;
  lastRoll: [number, number] | null;
}

export interface LedgerEntry {
  seq: number;
  from: Party;
  to: Party;
  amount: number;
  reason: string;
}

export interface GameState {
  /** Increments on every successful action. */
  version: number;
  economy: ResolvedEconomy;
  /** Turn order. Bankrupt players stay in the list with bankrupt = true. */
  players: PlayerState[];
  properties: Record<TileId, PropertyState>;
  bank: BankState;
  turn: TurnState;
  pending: Pending | null;
  /** Outstanding debts, oldest first. Nothing else progresses until they are cleared. */
  debts: Debt[];
  trades: TradeOffer[];
  /** Draw piles: index 0 is the top. Private: never sent to clients. */
  decks: Record<DeckId, CardId[]>;
  ledger: LedgerEntry[];
  status: "playing" | "finished";
  winnerId: PlayerId | null;
  /** Epoch ms when a timed game ends; null in elimination mode. */
  endsAt: number | null;
  /** Recent client action ids, for idempotent retries. */
  processedActionIds: string[];
  /** Counter for debt / trade / ledger ids. */
  nextId: number;
}

// ---------------------------------------------------------------------------
// Events: emitted by actions for UI feedback and animation. Not state.

export type GameEvent =
  | { type: "turnStarted"; playerId: PlayerId }
  | { type: "rolled"; playerId: PlayerId; dice: [number, number]; doubles: boolean }
  | { type: "moved"; playerId: PlayerId; from: number; to: number; passedStart: boolean }
  | { type: "sentToJail"; playerId: PlayerId }
  | { type: "leftJail"; playerId: PlayerId; via: "fine" | "card" | "doubles" }
  | { type: "paid"; from: Party; to: Party; amount: number; reason: string }
  | { type: "bought"; playerId: PlayerId; tileId: TileId; price: number }
  | { type: "auctionStarted"; tileId: TileId }
  | { type: "bid"; playerId: PlayerId; amount: number }
  | { type: "auctionPassed"; playerId: PlayerId }
  | { type: "auctionEnded"; tileId: TileId; winnerId: PlayerId | null; amount: number }
  | { type: "cardDrawn"; playerId: PlayerId; cardId: CardId; title: string }
  | { type: "built"; playerId: PlayerId; tileId: TileId; houses: number; hotel: boolean }
  | { type: "buildingSold"; playerId: PlayerId; tileId: TileId; houses: number; hotel: boolean; refund: number }
  | { type: "mortgaged"; playerId: PlayerId; tileId: TileId; amount: number }
  | { type: "unmortgaged"; playerId: PlayerId; tileId: TileId; amount: number }
  | { type: "debtCreated"; debt: Debt }
  | { type: "debtPaid"; debtId: number }
  | { type: "tradeProposed"; tradeId: number; from: PlayerId; to: PlayerId }
  | { type: "tradeAccepted"; tradeId: number }
  | { type: "tradeRejected"; tradeId: number }
  | { type: "tradeCancelled"; tradeId: number }
  | { type: "bankReplenished"; amount: number }
  | { type: "bankrupt"; playerId: PlayerId; creditor: Party }
  | { type: "gameOver"; winnerId: PlayerId | null; reason: "elimination" | "timeUp" };

/** Uniform random number in [0, 1). The server injects crypto randomness; tests inject a fixed sequence. */
export type Rng = () => number;
