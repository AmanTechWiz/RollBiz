import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@rollbiz/engine";
import { cryptoRng, mergeSettings, shuffle } from "../src/game/room-logic";

describe("cryptoRng", () => {
  test("stays in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const v = cryptoRng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  test("keeps every item and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input);
    expect(out).toHaveLength(6);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("uses the injected integer source", () => {
    expect(shuffle(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
  });
});

describe("mergeSettings", () => {
  test("merges a partial patch over the current settings", () => {
    const r = mergeSettings(DEFAULT_SETTINGS, { startingMoney: 30_000, auctionsEnabled: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.startingMoney).toBe(30_000);
      expect(r.settings.auctionsEnabled).toBe(false);
      expect(r.settings.houses).toBe(DEFAULT_SETTINGS.houses);
    }
  });

  test("rejects out-of-range values with readable text", () => {
    const r = mergeSettings(DEFAULT_SETTINGS, { startingMoney: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("startingMoney");
  });

  test("rejects unknown keys", () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { nope: 1 }).ok).toBe(false);
  });
});

// TODO(Task I): enable once the engine is complete. Should drive GameRoom through a fake
// Colyseus client: ready -> start -> action, host handoff, forfeit on leave, timed-mode timeUp.
describe("GameRoom flow", () => {
  test.skip("lobby to finished", () => {});
});
