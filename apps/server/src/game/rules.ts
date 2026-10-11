import { randomInt } from "node:crypto";

// Placeholder rules; the real board/economy comes later.
export const BOARD_SIZE = 40;
export const STARTING_CASH = 1500;
export const PASS_START_BONUS = 200;
/** Seconds a dropped player has to reconnect during a game. */
export const RECONNECT_SECONDS = 30;

/** Rolls 2d6 using a CSPRNG. */
export function rollDice(): [number, number] {
  return [randomInt(1, 7), randomInt(1, 7)];
}

/** Moves a token forward and reports whether it passed (or landed on) start. */
export function move(position: number, steps: number) {
  const next = position + steps;
  return { position: next % BOARD_SIZE, passedStart: next >= BOARD_SIZE };
}
