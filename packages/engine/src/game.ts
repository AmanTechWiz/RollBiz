import { todo } from "./core/todo";
import type { GameEvent, GameState, PlayerId, ResolvedEconomy, Rng } from "./types";

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
  return todo("createGame");
}
