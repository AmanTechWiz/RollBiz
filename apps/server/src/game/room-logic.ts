import { randomInt } from "node:crypto";
import { RoomSettingsSchema, type RoomSettings, type Rng } from "@rollbiz/engine";

/** Seconds a dropped player has to reconnect before they forfeit. */
export const RECONNECT_SECONDS = 30;

/** The engine's only source of randomness: a CSPRNG float in [0, 1). */
// node's randomInt needs max - min <= 2^48 - 1, so the span is 2^48 - 1 (result stays below 1).
const RNG_SPAN = 2 ** 48 - 1;
export const cryptoRng: Rng = () => randomInt(0, RNG_SPAN) / RNG_SPAN;

/** Fisher-Yates shuffle into a new array. `int(n)` returns an integer in [0, n). */
export function shuffle<T>(items: readonly T[], int: (n: number) => number = (n) => randomInt(n)): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export type MergeResult = { ok: true; settings: RoomSettings } | { ok: false; error: string };

/** Merges a partial settings patch over the current settings and validates the result. */
export function mergeSettings(current: RoomSettings, patch: Record<string, unknown>): MergeResult {
  const parsed = RoomSettingsSchema.safeParse({ ...current, ...patch });
  if (parsed.success) return { ok: true, settings: parsed.data };
  const error = parsed.error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
  return { ok: false, error };
}

// Room codes: 4 digits then 2 letters, e.g. "4821KQ". I and O are left out so they can't be misread as 1 and 0.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_PATTERN = /^\d{4}[A-HJ-NP-Z]{2}$/;
const liveCodes = new Set<string>(); // shortcut: process-local, fine while one game server runs; move to presence/Redis when scaling out

/** A room code not used by any open room. Call `releaseRoomCode` when the room closes. */
export function takeRoomCode(int: (n: number) => number = (n) => randomInt(n)): string {
  for (;;) {
    const digits = String(int(10_000)).padStart(4, "0");
    const code = digits + CODE_LETTERS[int(CODE_LETTERS.length)]! + CODE_LETTERS[int(CODE_LETTERS.length)]!;
    if (!liveCodes.has(code)) {
      liveCodes.add(code);
      return code;
    }
  }
}

export function releaseRoomCode(code: string) {
  liveCodes.delete(code);
}
