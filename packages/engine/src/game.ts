import type { Ctx } from "./core/context";
import { pay } from "./core/money";
import type { CardId, GameEvent, GameState, PlayerId, PropertyState, ResolvedEconomy, Rng } from "./types";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

/** Fisher-Yates on a copy. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Creates the initial state. Players act in the given order (the server shuffles it).
 * Each player receives economy.startingMoney paid out of bank cash (ledger entries).
 * Decks are shuffled with `rng`. `endsAt` = now + durationMinutes in timed mode, else null.
 * Emits `turnStarted` for the first player.
 */
export function createGame(
  economy: ResolvedEconomy,
  players: readonly { id: PlayerId; name: string }[],
  rng: Rng,
  now: number,
): { state: GameState; events: GameEvent[] } {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`a game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error("duplicate player ids");
  const first = players[0] as { id: PlayerId; name: string };

  const properties: Record<string, PropertyState> = {};
  for (const id of Object.keys(economy.properties)) {
    properties[id] = { owner: null, mortgaged: false, houses: 0, hotel: false };
  }

  const state: GameState = {
    version: 0,
    economy,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: 0,
      position: 0,
      inJail: false,
      jailAttempts: 0,
      jailFreeCards: [],
      bankrupt: false,
    })),
    properties,
    bank: { ...economy.bank },
    turn: { playerId: first.id, hasRolled: false, doublesCount: 0, rollAgain: false, lastRoll: null },
    pending: null,
    debts: [],
    trades: [],
    decks: {
      chance: shuffled<CardId>(economy.decks.chance, rng),
      communityChest: shuffled<CardId>(economy.decks.communityChest, rng),
    },
    ledger: [],
    status: "playing",
    winnerId: null,
    endsAt: economy.settings.gameMode === "timed" ? now + economy.settings.durationMinutes * 60_000 : null,
    processedActionIds: [],
    nextId: 1,
  };

  // The payout goes through `pay` so the ledger (and any bank replenishment) is recorded;
  // the per-player `paid` events are not interesting to clients at game start.
  const ctx: Ctx = { state, rng, emit: () => {} };
  for (const p of state.players) pay(ctx, "bank", p.id, economy.startingMoney, "starting money");

  return { state, events: [{ type: "turnStarted", playerId: first.id }] };
}
