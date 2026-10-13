import { describe, expect, test } from "bun:test";
import type { Action } from "../src/actions";
import { resolveEconomy } from "../src/economy/resolve";
import type { RoomSettingsInput } from "../src/economy/settings";
import { applyAction, applySystemAction } from "../src/engine";
import { createGame } from "../src/game";
import type { GameEvent, GameState, GroupId, PlayerId, PlayerState, TileId } from "../src/types";
import { newGame, seededRng } from "./helpers";

// Random-play simulation. A scripted policy picks among (mostly) legal actions for whoever has to
// act, a little fuzz adds illegal ones, and structural invariants are checked after every action.
// Everything derives from a seed, so a failing game replays exactly.

const MAX_ACTIONS = 2000;
const NOW = 1_700_000_000_000;

type Move = { playerId: PlayerId; action: Action };

// ---------------------------------------------------------------------------
// Policy randomness

function makePolicyRng(seed: number) {
  const next = seededRng((seed ^ 0x9e3779b9) >>> 0);
  return {
    next,
    chance: (p: number) => next() < p,
    int: (n: number) => Math.floor(next() * n),
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}
type PolicyRng = ReturnType<typeof makePolicyRng>;

// ---------------------------------------------------------------------------
// State helpers

const player = (s: GameState, id: PlayerId): PlayerState => s.players.find((p) => p.id === id) as PlayerState;
const active = (s: GameState) => s.players.filter((p) => !p.bankrupt);
const levelOf = (s: GameState, id: TileId) => {
  const p = s.properties[id];
  return p ? (p.hotel ? 4 : p.houses) : 0;
};
const cityIds = (s: GameState) => Object.values(s.economy.properties).filter((d) => d.kind === "city").map((d) => d.id);

function ownedProps(s: GameState, playerId: PlayerId): TileId[] {
  return Object.keys(s.properties).filter((id) => s.properties[id]?.owner === playerId);
}

function ownedGroups(s: GameState, playerId: PlayerId): GroupId[] {
  return (Object.values(s.economy.groups) as { id: GroupId; propertyIds: readonly TileId[] }[])
    .filter((g) => g.propertyIds.every((id) => s.properties[id]?.owner === playerId))
    .map((g) => g.id);
}

// ---------------------------------------------------------------------------
// Policy

function liquidationMoves(s: GameState, playerId: PlayerId, r: PolicyRng): Action[] {
  const groups = ownedGroups(s, playerId);
  const builtGroups = groups.filter((g) => s.economy.groups[g].propertyIds.some((id) => levelOf(s, id) > 0));
  const sellGroups: Action[] = builtGroups.map((group) => ({ type: "sellGroupBuildings", group }));
  const sellOne: Action[] = ownedProps(s, playerId)
    .filter((id) => levelOf(s, id) > 0)
    .map((tileId) => ({ type: "sellBuilding", tileId }));
  const mortgages: Action[] = ownedProps(s, playerId)
    .filter((id) => !s.properties[id]?.mortgaged)
    .map((tileId) => ({ type: "mortgage", tileId }));
  const buildingSales = r.chance(0.5) ? [...sellGroups, ...sellOne] : [...sellOne, ...sellGroups];
  return [...buildingSales, ...r.shuffle(mortgages)];
}

function planDebt(s: GameState, r: PolicyRng): Move[] {
  const debtorId = r.pick(s.debts).debtor;
  const p = player(s, debtorId);
  const oldest = s.debts.find((d) => d.debtor === debtorId);
  if (!oldest) return [];
  const bankrupt: Move = { playerId: debtorId, action: { type: "declareBankruptcy" } };
  const payNow: Move = { playerId: debtorId, action: { type: "payDebt" } };
  if (p.cash >= oldest.amount) return r.chance(0.01) ? [bankrupt, payNow] : [payNow, bankrupt];
  const liquidate = liquidationMoves(s, debtorId, r).map((action) => ({ playerId: debtorId, action }));
  return r.chance(0.04) ? [bankrupt, ...liquidate] : [...liquidate, bankrupt];
}

function planAuction(s: GameState, r: PolicyRng): Move[] {
  if (s.pending?.kind !== "auction") return [];
  const a = s.pending.auction;
  const rivals = a.bidders.filter((id) => id !== a.highBidder);
  const actorId = r.pick(rivals.length > 0 ? rivals : a.bidders);
  const cash = player(s, actorId).cash;
  const inc = s.economy.rules.minBidIncrement;
  const minimum = a.highBidder === null ? inc : a.highBid + inc;
  const price = s.economy.properties[a.tileId]?.price ?? 0;
  const worth = price * (0.4 + r.next() * 1.0);
  const pass: Move = { playerId: actorId, action: { type: "passAuction" } };
  if (minimum <= cash && minimum <= worth) {
    const amount = Math.min(cash, minimum + inc * r.int(12));
    return [{ playerId: actorId, action: { type: "bid", amount } }, pass];
  }
  return [pass];
}

function planExtra(s: GameState, playerId: PlayerId, r: PolicyRng): Move[] {
  const me = player(s, playerId);
  const kind = r.pick(["build", "build", "build", "mortgage", "unmortgage", "trade", "sell", "jailCard"] as const);
  switch (kind) {
    case "build": {
      const options: TileId[] = [];
      for (const g of ownedGroups(s, playerId)) {
        const ids = s.economy.groups[g].propertyIds;
        if (!cityIds(s).includes(ids[0] as string)) continue;
        const levels = ids.map((id) => levelOf(s, id));
        const min = Math.min(...levels);
        ids.forEach((id, i) => {
          if ((levels[i] as number) === min && min < 4) options.push(id);
        });
      }
      if (options.length === 0) return [];
      const tileId = r.pick(options);
      const def = s.economy.properties[tileId];
      // Keep a cash cushion most of the time so games are not over after one build spree.
      if (def?.kind === "city" && me.cash < def.houseCost + 300 && !r.chance(0.1)) return [];
      return [{ playerId, action: { type: "build", tileId } }];
    }
    case "mortgage": {
      const options = ownedProps(s, playerId).filter((id) => !s.properties[id]?.mortgaged);
      if (options.length === 0 || (me.cash > 3000 && !r.chance(0.1))) return [];
      return [{ playerId, action: { type: "mortgage", tileId: r.pick(options) } }];
    }
    case "unmortgage": {
      const options = ownedProps(s, playerId).filter((id) => s.properties[id]?.mortgaged);
      if (options.length === 0) return [];
      return [{ playerId, action: { type: "unmortgage", tileId: r.pick(options) } }];
    }
    case "sell": {
      const moves = liquidationMoves(s, playerId, r).filter((a) => a.type !== "mortgage");
      return moves.length > 0 ? [{ playerId, action: r.pick(moves) }] : [];
    }
    case "jailCard":
      return me.inJail && me.jailFreeCards.length > 0 ? [{ playerId, action: { type: "useJailCard" } }] : [];
    case "trade": {
      const others = active(s).filter((p) => p.id !== playerId);
      if (others.length === 0 || s.trades.length >= 4) return [];
      const other = r.pick(others);
      const mine = ownedProps(s, playerId);
      const theirs = ownedProps(s, other.id);
      const give = {
        cash: r.chance(0.4) ? Math.min(me.cash, 100 * r.int(30)) : 0,
        properties: mine.length > 0 && r.chance(0.7) ? [r.pick(mine)] : [],
        jailFreeCards: me.jailFreeCards.length > 0 && r.chance(0.5) ? [me.jailFreeCards[0] as string] : [],
      };
      const get = {
        cash: r.chance(0.5) ? Math.min(other.cash, 100 * r.int(30)) : 0,
        properties: theirs.length > 0 && r.chance(0.5) ? [r.pick(theirs)] : [],
        jailFreeCards: [] as string[],
      };
      return [{ playerId, action: { type: "proposeTrade", to: other.id, give, get } }];
    }
  }
}

function planTradeReply(s: GameState, r: PolicyRng): Move[] {
  const trade = r.pick(s.trades);
  const roll = r.next();
  if (roll < 0.45) {
    return [
      { playerId: trade.to, action: { type: "acceptTrade", tradeId: trade.id } },
      { playerId: trade.to, action: { type: "rejectTrade", tradeId: trade.id } },
    ];
  }
  if (roll < 0.85) return [{ playerId: trade.to, action: { type: "rejectTrade", tradeId: trade.id } }];
  return [{ playerId: trade.from, action: { type: "cancelTrade", tradeId: trade.id } }];
}

function planTurn(s: GameState, r: PolicyRng): Move[] {
  const turnId = s.turn.playerId;
  const me = player(s, turnId);

  if (s.pending?.kind === "buy") {
    const price = s.economy.properties[s.pending.tileId]?.price ?? 0;
    const buy: Move = { playerId: turnId, action: { type: "buy" } };
    const decline: Move = { playerId: turnId, action: { type: "declineBuy" } };
    return me.cash >= price && r.chance(0.85) ? [buy, decline] : [decline, buy];
  }

  if (s.trades.length > 0 && r.chance(0.3)) return planTradeReply(s, r);

  const main: Move[] = [];
  if (!s.turn.hasRolled || s.turn.rollAgain) {
    if (me.inJail && !s.turn.hasRolled && r.chance(0.3)) {
      main.push({ playerId: turnId, action: { type: r.chance(0.5) ? "useJailCard" : "payJailFine" } });
    }
    main.push({ playerId: turnId, action: { type: "roll" } });
  } else {
    main.push({ playerId: turnId, action: { type: "endTurn" } });
  }

  const extra = r.chance(0.5) ? planExtra(s, turnId, r) : [];
  return [...extra, ...main];
}

function plan(s: GameState, r: PolicyRng): Move[] {
  if (s.debts.length > 0) return planDebt(s, r);
  if (s.pending?.kind === "auction") return planAuction(s, r);
  return planTurn(s, r);
}

/** A random action by a random player, most of which the engine should refuse. */
function fuzzMove(s: GameState, r: PolicyRng): Move {
  const playerId = r.pick(s.players).id;
  const tileId = r.pick(Object.keys(s.economy.properties));
  const group = r.pick(Object.keys(s.economy.groups)) as GroupId;
  const trade = s.trades.length > 0 ? r.pick(s.trades) : null;
  const tradeId = trade ? trade.id : 9999;
  const actions: Action[] = [
    { type: "roll" },
    { type: "buy" },
    { type: "declineBuy" },
    { type: "bid", amount: 100 * (1 + r.int(40)) },
    { type: "passAuction" },
    { type: "build", tileId },
    { type: "sellBuilding", tileId },
    { type: "sellGroupBuildings", group },
    { type: "mortgage", tileId },
    { type: "unmortgage", tileId },
    { type: "payJailFine" },
    { type: "useJailCard" },
    { type: "payDebt" },
    { type: "endTurn" },
    { type: "acceptTrade", tradeId },
    { type: "rejectTrade", tradeId },
    { type: "cancelTrade", tradeId },
  ];
  return { playerId, action: r.pick(actions) };
}

// ---------------------------------------------------------------------------
// Invariants

/** Replays the ledger incrementally to check that balances and money in circulation add up. */
class MoneyTracker {
  private seen = 0;
  private readonly balances = new Map<string, number>();
  private replenished = 0;
  constructor(private readonly initialBank: number) {
    this.balances.set("bank", initialBank);
  }

  check(s: GameState): string[] {
    const errors: string[] = [];
    for (; this.seen < s.ledger.length; this.seen++) {
      const e = s.ledger[this.seen];
      if (!e) break;
      if (!Number.isInteger(e.amount) || e.amount <= 0) errors.push(`ledger #${e.seq}: bad amount ${e.amount}`);
      if (e.from === "bank" && e.to === "bank") {
        this.balances.set("bank", (this.balances.get("bank") ?? 0) + e.amount);
        this.replenished += e.amount;
      } else {
        this.balances.set(e.from, (this.balances.get(e.from) ?? 0) - e.amount);
        this.balances.set(e.to, (this.balances.get(e.to) ?? 0) + e.amount);
      }
    }
    if (s.ledger.length < this.seen) errors.push("ledger shrank");
    if ((this.balances.get("bank") ?? 0) !== s.bank.cash) {
      errors.push(`bank cash ${s.bank.cash} differs from ledger replay ${this.balances.get("bank")}`);
    }
    let total = s.bank.cash;
    for (const p of s.players) {
      total += p.cash;
      if ((this.balances.get(p.id) ?? 0) !== p.cash) {
        errors.push(`${p.id} cash ${p.cash} differs from ledger replay ${this.balances.get(p.id) ?? 0}`);
      }
    }
    const expected = this.initialBank + this.replenished;
    if (total !== expected) errors.push(`money in circulation ${total} != bank start + replenishment ${expected}`);
    return errors;
  }
}

function checkState(s: GameState, money: MoneyTracker): string[] {
  const errors: string[] = [];
  const bad = (msg: string) => errors.push(msg);
  const ids = new Set(s.players.map((p) => p.id));
  const activeIds = new Set(active(s).map((p) => p.id));
  const eco = s.economy;

  // Cash
  for (const p of s.players) {
    if (!Number.isInteger(p.cash) || p.cash < 0) bad(`${p.id} has cash ${p.cash}`);
    if (p.bankrupt && p.cash !== 0) bad(`${p.id} is bankrupt but holds ${p.cash}`);
    if (p.position < 0 || p.position > 39) bad(`${p.id} at position ${p.position}`);
    if (p.inJail && eco.tiles[p.position]?.kind !== "jail") bad(`${p.id} is in jail but stands on ${p.position}`);
    if (p.jailAttempts < 0 || p.jailAttempts >= eco.rules.maxJailAttempts) bad(`${p.id} jailAttempts ${p.jailAttempts}`);
    if (p.bankrupt && (ownedProps(s, p.id).length > 0 || p.jailFreeCards.length > 0)) bad(`${p.id} is bankrupt but holds assets`);
  }
  if (s.bank.cash < 0) bad(`bank cash ${s.bank.cash}`);
  errors.push(...money.check(s));

  // Buildings
  let houses = 0;
  let hotels = 0;
  for (const [id, prop] of Object.entries(s.properties)) {
    const def = eco.properties[id];
    if (prop.owner !== null && !activeIds.has(prop.owner)) bad(`${id} is owned by ${prop.owner}, who is not active`);
    if (prop.houses < 0 || prop.houses > eco.rules.maxHousesPerProperty) bad(`${id} has ${prop.houses} houses`);
    if (prop.hotel && prop.houses !== 0) bad(`${id} has a hotel and ${prop.houses} houses`);
    if (prop.owner === null && (prop.mortgaged || prop.houses > 0 || prop.hotel)) bad(`${id} is unowned but mortgaged or built`);
    if (def?.kind !== "city" && (prop.houses > 0 || prop.hotel)) bad(`${id} is not a city but has buildings`);
    houses += prop.houses;
    if (prop.hotel) hotels += 1;
  }
  if (s.bank.houses < 0 || s.bank.hotels < 0) bad(`bank stock negative: ${s.bank.houses}/${s.bank.hotels}`);
  if (s.bank.houses + houses !== eco.bank.houses) bad(`houses: bank ${s.bank.houses} + board ${houses} != ${eco.bank.houses}`);
  if (s.bank.hotels + hotels !== eco.bank.hotels) bad(`hotels: bank ${s.bank.hotels} + board ${hotels} != ${eco.bank.hotels}`);
  for (const g of Object.values(eco.groups)) {
    const levels = g.propertyIds.map((id) => levelOf(s, id));
    if (Math.max(...levels) - Math.min(...levels) > 1) bad(`group ${g.id} is built unevenly: ${levels.join(",")}`);
    if (Math.max(...levels) > 0) {
      const owners = new Set(g.propertyIds.map((id) => s.properties[id]?.owner));
      if (owners.size !== 1) bad(`group ${g.id} has buildings but split owners`);
      if (g.propertyIds.some((id) => s.properties[id]?.mortgaged)) bad(`group ${g.id} has buildings and a mortgage`);
    }
  }

  // Cards: every card is in exactly one place
  for (const deck of ["chance", "communityChest"] as const) {
    const held = s.players.flatMap((p) => p.jailFreeCards).filter((c) => eco.cards[c]?.deck === deck);
    const all = [...s.decks[deck], ...held].sort().join(",");
    if (all !== [...eco.decks[deck]].sort().join(",")) bad(`${deck} cards are not conserved: ${all}`);
  }

  // Debts, trades, pending
  const debtIds = new Set<number>();
  for (const d of s.debts) {
    if (debtIds.has(d.id)) bad(`duplicate debt id ${d.id}`);
    debtIds.add(d.id);
    if (!activeIds.has(d.debtor)) bad(`debt ${d.id}: debtor ${d.debtor} is not active`);
    if (d.creditor !== "bank" && !activeIds.has(d.creditor)) bad(`debt ${d.id}: creditor ${d.creditor} is not active`);
    if (d.creditor === d.debtor) bad(`debt ${d.id}: owes itself`);
    if (!Number.isInteger(d.amount) || d.amount <= 0) bad(`debt ${d.id}: amount ${d.amount}`);
  }
  for (const t of s.trades) {
    if (!activeIds.has(t.from) || !activeIds.has(t.to)) bad(`trade ${t.id} involves an inactive player`);
  }
  if (new Set(s.trades.map((t) => t.id)).size !== s.trades.length) bad("duplicate trade ids");
  if (s.processedActionIds.length > 200) bad(`processedActionIds grew to ${s.processedActionIds.length}`);

  if (s.status === "playing") {
    if (activeIds.size < 2) bad(`game still playing with ${activeIds.size} active player(s)`);
    if (!activeIds.has(s.turn.playerId)) bad(`turn belongs to ${s.turn.playerId}, who is not active`);
    if (s.winnerId !== null) bad("winnerId set while playing");
    const pend = s.pending;
    if (pend?.kind === "buy") {
      if (s.properties[pend.tileId]?.owner !== null) bad(`pending buy of owned tile ${pend.tileId}`);
      if (eco.tiles[player(s, s.turn.playerId).position]?.id !== pend.tileId) bad("pending buy is not the tile the player stands on");
    }
    if (pend?.kind === "auction") {
      const a = pend.auction;
      if (s.properties[a.tileId]?.owner !== null) bad(`auction of owned tile ${a.tileId}`);
      if (a.bidders.length === 0) bad("auction with no bidders");
      for (const b of a.bidders) if (!activeIds.has(b)) bad(`auction bidder ${b} is not active`);
      if (a.highBidder !== null) {
        if (!a.bidders.includes(a.highBidder)) bad("high bidder is not in the auction");
        if (a.highBid > player(s, a.highBidder).cash) bad(`high bid ${a.highBid} exceeds the bidder's cash`);
      }
    }
  } else {
    if (s.winnerId !== null && !ids.has(s.winnerId)) bad(`winner ${s.winnerId} is not a player`);
    if (s.winnerId === null) bad("finished without a winner");
    if (eco.settings.gameMode === "elimination" && activeIds.size > 1) bad("finished with several active players");
    if (s.winnerId !== null && !activeIds.has(s.winnerId)) bad(`winner ${s.winnerId} is bankrupt`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// One game

interface GameStats {
  seed: number;
  label: string;
  actions: number;
  rejected: number;
  finished: boolean;
  capped: boolean;
  winnerId: PlayerId | null;
  failures: string[];
  /** Applied-action history for a minimal reproduction. */
  history: string[];
  events: Record<string, number>;
}

const DEBT_ACTIONS = new Set(["sellBuilding", "sellGroupBuildings", "mortgage", "payDebt", "declareBankruptcy"]);

function playGame(seed: number, label: string, settings: RoomSettingsInput, opts: { forfeits?: boolean } = {}): GameStats {
  const r = makePolicyRng(seed);
  const engineRng = seededRng(seed);
  const economy = resolveEconomy(settings);
  const count = 2 + r.int(3);
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
  let state = createGame(economy, players, seededRng(seed + 1), NOW).state;
  const money = new MoneyTracker(economy.bank.cash);
  const stats: GameStats = {
    seed, label, actions: 0, rejected: 0, finished: false, capped: false, winnerId: null,
    failures: [], history: [], events: {},
  };
  const timeUpAt = economy.settings.gameMode === "timed" ? 150 + r.int(1200) : -1;
  let nextActionId = 1;

  const fail = (msg: string) => {
    stats.failures.push(`[${label} seed ${seed} after ${stats.actions} actions] ${msg}`);
  };
  const count_ = (events: GameEvent[]) => {
    for (const e of events) stats.events[e.type] = (stats.events[e.type] ?? 0) + 1;
  };
  const checkAll = () => {
    for (const msg of checkState(state, money)) fail(msg);
  };
  const snapshot = (s: GameState) =>
    JSON.stringify([s.version, s.players, s.properties, s.bank, s.turn, s.pending, s.debts, s.trades, s.status]);

  checkAll();

  /** Applies one move. Returns true if the engine accepted it. */
  const tryMove = (move: Move, fuzz: boolean): boolean => {
    const action: Action = { ...move.action, actionId: `a${nextActionId++}` };
    if (r.chance(0.3)) action.expectedVersion = state.version;
    const before = state;
    const beforeSnap = fuzz ? snapshot(before) : "";
    let result;
    try {
      result = applyAction(before, move.playerId, action, engineRng);
    } catch (err) {
      fail(`engine threw on ${JSON.stringify(move)}: ${err instanceof Error ? err.stack : String(err)}`);
      return false;
    }
    if (!result.ok) {
      stats.rejected++;
      if (fuzz && snapshot(before) !== beforeSnap) fail(`rejected ${JSON.stringify(move)} but changed the input state`);
      return false;
    }
    if (before.debts.length > 0) {
      if (!DEBT_ACTIONS.has(action.type)) fail(`${action.type} was accepted while debts were outstanding`);
      else if (!before.debts.some((d) => d.debtor === move.playerId)) fail(`non-debtor ${move.playerId} acted during a debt`);
    }
    if (result.state.version !== before.version + 1) fail(`version went ${before.version} -> ${result.state.version}`);
    if (result.state === before) fail("applyAction returned the same state object for a new action");
    state = result.state;
    stats.actions++;
    stats.history.push(`${move.playerId}:${JSON.stringify(move.action)}`);
    count_(result.events);
    checkAll();

    // Retry after a "reconnect": same actionId must be acknowledged, not re-applied.
    if (r.chance(0.04)) {
      const again = applyAction(state, move.playerId, action, engineRng);
      if (!again.ok || !again.duplicate || again.state !== state) fail(`duplicate ${action.actionId} was not acknowledged as a no-op`);
    }
    // A client that last saw an older version must be refused.
    if (r.chance(0.04)) {
      const stale = applyAction(state, move.playerId, { type: "endTurn", actionId: `s${nextActionId++}`, expectedVersion: state.version - 1 }, engineRng);
      if (stale.ok) fail("a stale expectedVersion was accepted");
    }
    return true;
  };

  while (stats.actions < MAX_ACTIONS && stats.failures.length === 0) {
    if (state.status === "finished") break;

    if (timeUpAt >= 0 && stats.actions >= timeUpAt) {
      const res = applySystemAction(state, { type: "timeUp" }, engineRng);
      if (!res.ok) {
        fail(`timeUp rejected: ${res.error}`);
        break;
      }
      state = res.state;
      stats.actions++;
      stats.history.push("system:timeUp");
      count_(res.events);
      checkAll();
      break;
    }

    if (opts.forfeits && r.chance(0.003) && active(state).length > 1) {
      const victim = r.pick(active(state)).id;
      const res = applySystemAction(state, { type: "forfeit", playerId: victim }, engineRng);
      if (!res.ok) {
        fail(`forfeit of ${victim} rejected: ${res.error}`);
        break;
      }
      state = res.state;
      stats.actions++;
      stats.history.push(`system:forfeit:${victim}`);
      count_(res.events);
      checkAll();
      continue;
    }

    if (r.chance(0.05) && tryMove(fuzzMove(state, r), true)) continue;

    const moves = plan(state, r);
    let applied = false;
    for (const move of moves) {
      if (tryMove(move, false)) {
        applied = true;
        break;
      }
      if (stats.failures.length > 0) break;
    }
    if (!applied && stats.failures.length === 0) {
      fail(`no legal move for ${state.debts.length > 0 ? "debt" : state.pending?.kind ?? "turn"} state; tried ${moves.length} moves, e.g. ${JSON.stringify(moves[0])}`);
    }
  }

  stats.finished = state.status === "finished";
  stats.winnerId = state.winnerId;
  stats.capped = !stats.finished && stats.failures.length === 0;

  if (state.status === "finished") {
    // A finished game takes no more actions.
    const after = applyAction(state, players[0]?.id as string, { type: "roll" }, engineRng);
    if (after.ok) fail("a finished game accepted an action");
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Suites

const CONFIGS: { label: string; games: number; settings: RoomSettingsInput; forfeits?: boolean }[] = [
  { label: "default", games: 200, settings: {} },
  {
    // Cheap, scarce and harsh: tight building stock, little bank cash (forces replenishment), no auctions, no extra turns.
    label: "custom-A (10k, 1.5x, 6 houses/2 hotels, bank 50k, no auctions, no doubles-again, no jail cards)",
    games: 100,
    settings: {
      startingMoney: 10_000, priceMultiplier: 1.5, houses: 6, hotels: 2, bankCash: 50_000,
      auctionsEnabled: false, doublesRollAgain: false, disabledCardIds: ["CH15", "CC15"],
    },
    forfeits: true,
  },
  {
    // Rich and cheap, timed (ended by a system timeUp), trading off, no three-doubles jail, with forfeits.
    label: "custom-B (40k, 0.5x, timed, no trading, no three-doubles jail)",
    games: 100,
    settings: {
      startingMoney: 40_000, priceMultiplier: 0.5, gameMode: "timed", durationMinutes: 10, houses: 48, hotels: 16,
      tradingEnabled: false, threeDoublesToJail: false,
    },
    forfeits: true,
  },
];

describe("random-play simulation", () => {
  for (const config of CONFIGS) {
    test(
      `${config.games} games: ${config.label}`,
      () => {
        const started = Date.now();
        const results: GameStats[] = [];
        for (let i = 0; i < config.games; i++) {
          results.push(playGame(1000 + i, config.label, config.settings, { forfeits: config.forfeits }));
        }
        const totals: Record<string, number> = {};
        for (const g of results) for (const [k, v] of Object.entries(g.events)) totals[k] = (totals[k] ?? 0) + v;
        const failed = results.filter((g) => g.failures.length > 0);
        const summary = {
          config: config.label,
          games: results.length,
          finished: results.filter((g) => g.finished).length,
          actionCapped: results.filter((g) => g.capped).length,
          invariantFailures: failed.length,
          actions: results.reduce((n, g) => n + g.actions, 0),
          rejectedAttempts: results.reduce((n, g) => n + g.rejected, 0),
          seconds: (Date.now() - started) / 1000,
          events: totals,
        };
        console.log(`[simulation] ${JSON.stringify(summary)}`);
        for (const g of failed.slice(0, 3)) {
          console.log(`[simulation] FAIL seed ${g.seed}: ${g.failures[0]}\n  last actions: ${g.history.slice(-12).join(" | ")}`);
        }
        expect(failed.map((g) => g.failures[0])).toEqual([]);
        expect(summary.finished + summary.actionCapped).toBe(summary.games);
        // Most games should actually finish; a sim where nobody ever goes bankrupt tests little.
        expect(summary.finished).toBeGreaterThan(summary.games / 4);
      },
      600_000,
    );
  }

  test("the same seed replays the same game", () => {
    const a = playGame(42, "replay", {});
    const b = playGame(42, "replay", {});
    expect(b.history).toEqual(a.history);
    expect(b.winnerId).toBe(a.winnerId);
  });

  test("the invariant checker notices broken states", () => {
    const fresh = () => newGame({ players: 3 });
    const check = (s: GameState) => checkState(s, new MoneyTracker(s.economy.bank.cash));
    expect(check(fresh())).toEqual([]);

    const negative = fresh();
    (negative.players[0] as PlayerState).cash = -1;
    expect(check(negative).some((e) => e.includes("cash"))).toBe(true);

    const phantomHouse = fresh();
    (phantomHouse.properties.patna as { houses: number }).houses = 1;
    expect(check(phantomHouse).length).toBeGreaterThan(0);

    const printedMoney = fresh();
    (printedMoney.players[1] as PlayerState).cash += 500;
    expect(check(printedMoney).some((e) => e.includes("ledger replay"))).toBe(true);

    const ghostOwner = fresh();
    (ghostOwner.properties.goa as { owner: string | null }).owner = "nobody";
    expect(check(ghostOwner).some((e) => e.includes("not active"))).toBe(true);
  });
});
