import type { GameEvent, GameState, Rng } from "../types";

/** Thrown for any rule violation; applyAction turns it into `{ ok: false, error }` and discards the draft. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

/** What every handler receives. `state` is a private draft: mutate it freely. */
export interface Ctx {
  state: GameState;
  rng: Rng;
  emit(event: GameEvent): void;
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng() * 6);
}
