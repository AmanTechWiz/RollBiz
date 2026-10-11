import { applyAction } from "../src/engine";
import { createGame } from "../src/game";
import { resolveEconomy } from "../src/economy/resolve";
import type { RoomSettingsInput } from "../src/economy/settings";
import type { Action } from "../src/actions";
import type { Ctx } from "../src/core/context";
import type { GameEvent, GameState, PlayerId, Rng } from "../src/types";

/** Returns the given values in order. Throws if the engine asks for more than were provided. */
export function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[i++];
    if (v === undefined) throw new Error(`seqRng exhausted after ${values.length} values`);
    return v;
  };
}

/** Turns dice faces (1..6) into rng values for `rollDie`. Each pair is one roll of two dice. */
export function diceRng(...pairs: [number, number][]): Rng {
  return seqRng(pairs.flatMap(([a, b]) => [faceToRandom(a), faceToRandom(b)]));
}

function faceToRandom(face: number): number {
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error(`invalid die face ${face}`);
  return (face - 0.5) / 6;
}

/** Small deterministic generator (mulberry32) for tests that don't care about specific values. */
export function seededRng(seed = 1): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh game with players p1..pN (default 2), at default settings unless overridden. */
export function newGame(opts: { players?: number; settings?: RoomSettingsInput; now?: number } = {}): GameState {
  const count = opts.players ?? 2;
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
  const economy = resolveEconomy(opts.settings ?? {});
  return createGame(economy, players, seededRng(), opts.now ?? 1_700_000_000_000).state;
}

/** Applies an action, throwing if it is rejected. */
export function act(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  rng: Rng = seededRng(7),
): { state: GameState; events: GameEvent[] } {
  const result = applyAction(state, playerId, action, rng);
  if (!result.ok) throw new Error(`action ${action.type} rejected: ${result.error}`);
  return { state: result.state, events: result.events };
}

/** A Ctx over `state` that records emitted events, for testing helpers that take a Ctx directly. */
export function makeCtx(state: GameState, rng: Rng = seededRng()): Ctx & { events: GameEvent[] } {
  const events: GameEvent[] = [];
  return { state, rng, emit: (e) => events.push(e), events };
}
