import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@rollbiz/engine";
import { GamePhase } from "@rollbiz/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { ROOM_CODE_PATTERN, cryptoRng, mergeSettings, releaseRoomCode, shuffle, takeRoomCode } from "../src/game/room-logic";

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

describe("room codes", () => {
  test("4 digits then 2 letters, never I or O", () => {
    for (let i = 0; i < 500; i++) {
      const code = takeRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      releaseRoomCode(code);
    }
  });

  test("a live code is never handed out twice; a released one can be", () => {
    // forced source: "0000AA" first, then a fresh code
    const seq = [0, 0, 0, 0, 0, 0, 1234, 1, 2];
    const int = () => seq.shift()!;
    expect(takeRoomCode(int)).toBe("0000AA");
    expect(takeRoomCode(int)).toBe("1234BC"); // the repeat "0000AA" was skipped
    releaseRoomCode("0000AA");
    expect(takeRoomCode(() => 0)).toBe("0000AA");
    releaseRoomCode("0000AA");
    releaseRoomCode("1234BC");
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

// ---------------------------------------------------------------------------
// GameRoom flow. The real room class is driven directly, without Colyseus' transport: fake clients
// stand in for sockets, and the few framework calls that need a running server (lock, broadcast,
// reconnection window, clock) are replaced on the instance. Everything else (message parsing, the
// lobby, settings, start, engine calls, forfeit on leave, timed-mode time-up) is the real code.

type Sent = { type: string; payload: any };

interface FakeClient {
  sessionId: string;
  auth: { userId: string; name: string };
  sent: Sent[];
  send(type: string, payload: unknown): void;
}

interface Harness {
  room: any;
  broadcasts: Sent[];
  locked: () => boolean;
  timers: { fn: () => void; ms: number; cleared: boolean }[];
  join(name: string): FakeClient;
  send(client: FakeClient, type: string, payload?: Record<string, unknown>): void;
  game(): any;
  errors(client: FakeClient): string[];
}

let roomCounter = 0;

function harness(): Harness {
  const room: any = new GameRoom();
  const broadcasts: Sent[] = [];
  const timers: Harness["timers"] = [];
  let locked = false;
  room.broadcast = (type: string, payload: unknown) => broadcasts.push({ type, payload });
  room.lock = async () => {
    locked = true;
  };
  room.setPrivate = async () => {};
  room.allowReconnection = () => new Promise(() => {});
  room.clock = {
    setTimeout: (fn: () => void, ms: number) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return {
        clear() {
          timer.cleared = true;
        },
      };
    },
  };
  room.onCreate({});
  const run = roomCounter++;

  return {
    room,
    broadcasts,
    locked: () => locked,
    timers,
    join(name) {
      const client: FakeClient = {
        sessionId: `s-${run}-${name}`,
        auth: { userId: `u-${run}-${name}`, name },
        sent: [],
        send(type, payload) {
          this.sent.push({ type, payload });
        },
      };
      room.onJoin(client, { accessToken: "x" });
      return client;
    },
    send(client, type, payload = {}) {
      room.handleMessage(client, type, payload);
    },
    game() {
      return room.state.gameJson ? JSON.parse(room.state.gameJson) : null;
    },
    errors(client) {
      return client.sent.filter((m) => m.type === "error").map((m) => m.payload.message);
    },
  };
}

function lobbyOf(count: number) {
  const h = harness();
  const names = ["ann", "bob", "cy", "dee"].slice(0, count);
  const clients = names.map((n) => h.join(n));
  return { h, clients };
}

function startedGame(count: number, settings: Record<string, unknown> = {}) {
  const { h, clients } = lobbyOf(count);
  const host = clients[0] as FakeClient;
  if (Object.keys(settings).length > 0) h.send(host, "updateSettings", { settings });
  for (const c of clients) h.send(c, "ready");
  h.send(host, "start");
  return { h, clients, host };
}

/** The client whose turn it is, for the current engine state. */
function turnClient(h: Harness, clients: FakeClient[]): FakeClient {
  const id = h.game().turn.playerId;
  const c = clients.find((x) => x.auth.userId === id);
  if (!c) throw new Error(`no client for ${id}`);
  return c;
}

describe("GameRoom flow: lobby", () => {
  test("the first joiner hosts; ready toggles; only the host can start", () => {
    const { h, clients } = lobbyOf(2);
    const [host, guest] = clients as [FakeClient, FakeClient];
    expect(h.room.state.hostId).toBe(host.sessionId);
    expect(h.room.state.phase).toBe(GamePhase.Lobby);

    h.send(guest, "ready");
    expect(h.room.state.players.get(guest.sessionId).ready).toBe(true);
    h.send(guest, "ready");
    expect(h.room.state.players.get(guest.sessionId).ready).toBe(false);

    h.send(guest, "start");
    expect(h.errors(guest)).toContain("only the host can start the game");
    h.send(guest, "updateSettings", { settings: { startingMoney: 30_000 } });
    expect(h.errors(guest)).toContain("only the host can change settings");
  });

  test("start needs two players and everyone ready", () => {
    const solo = harness();
    const only = solo.join("ann");
    solo.send(only, "ready");
    solo.send(only, "start");
    expect(solo.errors(only)).toContain("need at least 2 players");

    const { h, clients } = lobbyOf(2);
    const [host, guest] = clients as [FakeClient, FakeClient];
    h.send(host, "ready");
    h.send(host, "start");
    expect(h.errors(host)).toContain("everyone must be ready");
    expect(h.room.state.phase).toBe(GamePhase.Lobby);
    expect(guest.sent).toEqual([]);
  });

  test("bad settings are refused with the validation message and leave the lobby as it was", () => {
    const { h, clients } = lobbyOf(2);
    const host = clients[0] as FakeClient;
    h.send(host, "updateSettings", { settings: { startingMoney: 5 } });
    expect(h.errors(host)[0]).toContain("startingMoney");
    expect(JSON.parse(h.room.state.settingsJson).startingMoney).toBe(20_000);
  });

  test("changing settings un-readies everyone", () => {
    const { h, clients } = lobbyOf(2);
    const [host, guest] = clients as [FakeClient, FakeClient];
    h.send(guest, "ready");
    h.send(host, "updateSettings", { settings: { priceMultiplier: 1.5 } });
    expect(h.room.state.players.get(guest.sessionId).ready).toBe(false);
    expect(JSON.parse(h.room.state.settingsJson).priceMultiplier).toBe(1.5);
  });

  test("when the host leaves the lobby the next player in join order becomes host", () => {
    const { h, clients } = lobbyOf(3);
    const [host, second, third] = clients as [FakeClient, FakeClient, FakeClient];
    h.room.onLeave(host);
    expect(h.room.state.players.has(host.sessionId)).toBe(false);
    expect(h.room.state.hostId).toBe(second.sessionId);
    h.room.onLeave(second);
    expect(h.room.state.hostId).toBe(third.sessionId);
  });

  test("a second tab with the same account cannot take another seat", () => {
    const { h, clients } = lobbyOf(1);
    const dupe: FakeClient = { ...(clients[0] as FakeClient), sessionId: "other-session", sent: [] };
    expect(() => h.room.onJoin(dupe, { accessToken: "x" })).toThrow();
  });
});

describe("GameRoom flow: playing", () => {
  test("start resolves the economy, deals the starting money, locks the room and publishes the view", () => {
    const { h, host } = startedGame(3, { startingMoney: 30_000 });
    expect(h.room.state.phase).toBe(GamePhase.Playing);
    expect(h.locked()).toBe(true);
    expect(JSON.parse(h.room.state.economyJson).startingMoney).toBe(30_000);
    const game = h.game();
    expect(game.version).toBe(0);
    expect(game.players.map((p: any) => p.cash)).toEqual([30_000, 30_000, 30_000]);
    expect(game.players).toHaveLength(3);
    // Private state stays on the server.
    expect(game.decks).toBeUndefined();
    expect(game.processedActionIds).toBeUndefined();
    expect(game.deckSizes.chance).toBe(16);
    expect(host.sent.filter((m) => m.type === "error")).toEqual([]);
    expect(h.broadcasts.some((b) => b.type === "events")).toBe(true);
  });

  test("a late join is refused once the game is running", () => {
    const { h } = startedGame(2);
    const late: FakeClient = { sessionId: "late", auth: { userId: "late-user", name: "late" }, sent: [], send() {} };
    expect(() => h.room.onJoin(late, { accessToken: "x" })).toThrow();
  });

  test("the turn holder rolls: the version advances and events are broadcast", () => {
    const { h, clients } = startedGame(2);
    const mover = turnClient(h, clients);
    const before = h.broadcasts.length;
    h.send(mover, "action", { action: { type: "roll", actionId: "r1" } });
    const game = h.game();
    expect(game.version).toBe(1);
    expect(game.turn.hasRolled).toBe(true);
    const events = h.broadcasts.slice(before).filter((b) => b.type === "events");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.events.some((e: any) => e.type === "rolled")).toBe(true);
  });

  test("a player acting out of turn gets an error and nothing changes", () => {
    const { h, clients } = startedGame(2);
    const mover = turnClient(h, clients);
    const other = clients.find((c) => c !== mover) as FakeClient;
    const json = h.room.state.gameJson;
    h.send(other, "action", { action: { type: "roll" } });
    expect(h.errors(other)).toEqual(["it is not your turn"]);
    expect(h.room.state.gameJson).toBe(json);
  });

  test("the same actionId sent twice (a reconnect retry) is applied and broadcast once", () => {
    const { h, clients } = startedGame(2);
    const mover = turnClient(h, clients);
    h.send(mover, "action", { action: { type: "roll", actionId: "same-id" } });
    const afterFirst = h.room.state.gameJson;
    const broadcasts = h.broadcasts.length;
    h.send(mover, "action", { action: { type: "roll", actionId: "same-id" } });
    expect(h.room.state.gameJson).toBe(afterFirst);
    expect(h.broadcasts.length).toBe(broadcasts);
    expect(h.errors(mover)).toEqual([]);
  });

  test("a stale expectedVersion is refused", () => {
    const { h, clients } = startedGame(2);
    const mover = turnClient(h, clients);
    h.send(mover, "action", { action: { type: "roll", expectedVersion: 5 } });
    expect(h.errors(mover)).toEqual(["stale state, please retry"]);
    expect(h.game().version).toBe(0);
  });

  test("malformed actions and unknown message types are refused or ignored", () => {
    const { h, clients } = startedGame(2);
    const mover = turnClient(h, clients);
    h.send(mover, "action", { action: { type: "teleport" } });
    expect(h.errors(mover)).toEqual(["invalid action"]);
    h.send(mover, "action", { action: { type: "bid", amount: -5 } });
    expect(h.errors(mover)).toEqual(["invalid action", "invalid action"]);
    h.send(mover, "nonsense", {});
    expect(h.game().version).toBe(0);
  });

  test("actions before the game starts are refused", () => {
    const { h, clients } = lobbyOf(2);
    const c = clients[0] as FakeClient;
    h.send(c, "action", { action: { type: "roll" } });
    expect(h.errors(c)).toEqual(["the game is not running"]);
  });

  test("a drop marks the player disconnected and a reconnect restores them", () => {
    const { h, clients } = startedGame(2);
    const c = clients[1] as FakeClient;
    h.room.onDrop(c);
    expect(h.room.state.players.get(c.sessionId).connected).toBe(false);
    h.room.onReconnect(c);
    expect(h.room.state.players.get(c.sessionId).connected).toBe(true);
    expect(h.game().players.every((p: any) => !p.bankrupt)).toBe(true);
  });
});

describe("GameRoom flow: leaving and finishing", () => {
  test("leaving mid-game forfeits to the bank and the game goes on with the rest", () => {
    const { h, clients } = startedGame(3);
    const leaver = turnClient(h, clients);
    h.room.onLeave(leaver);
    const game = h.game();
    expect(game.status).toBe("playing");
    expect(game.players.find((p: any) => p.id === leaver.auth.userId).bankrupt).toBe(true);
    expect(game.turn.playerId).not.toBe(leaver.auth.userId);
    expect(h.room.state.phase).toBe(GamePhase.Playing);
    // The entry stays so the name is still visible, but is marked gone.
    expect(h.room.state.players.get(leaver.sessionId).connected).toBe(false);
  });

  test("the last opponent leaving ends the game and finishes the room", () => {
    const { h, clients } = startedGame(2);
    const [a, b] = clients as [FakeClient, FakeClient];
    h.room.onLeave(a);
    expect(h.room.state.phase).toBe(GamePhase.Finished);
    expect(h.game().status).toBe("finished");
    expect(h.game().winnerId).toBe(b.auth.userId);
    const over = h.broadcasts.flatMap((m) => (m.type === "events" ? m.payload.events : [])).find((e: any) => e.type === "gameOver");
    expect(over).toMatchObject({ winnerId: b.auth.userId, reason: "elimination" });
    // Nobody can act on a finished game.
    h.send(b, "action", { action: { type: "roll" } });
    expect(h.errors(b)).toEqual(["the game is not running"]);
  });

  test("a leave after the game is over changes nothing", () => {
    const { h, clients } = startedGame(2);
    const [a, b] = clients as [FakeClient, FakeClient];
    h.room.onLeave(a);
    const json = h.room.state.gameJson;
    h.room.onLeave(b);
    expect(h.room.state.gameJson).toBe(json);
  });

  test("timed mode arms a deadline timer and time-up ends the game with a winner", () => {
    const { h, clients } = startedGame(3, { gameMode: "timed", durationMinutes: 10 });
    expect(h.timers).toHaveLength(1);
    const timer = h.timers[0] as Harness["timers"][number];
    expect(timer.ms).toBeGreaterThan(9 * 60_000);
    expect(timer.ms).toBeLessThanOrEqual(10 * 60_000);
    timer.fn();
    expect(h.room.state.phase).toBe(GamePhase.Finished);
    const game = h.game();
    expect(game.status).toBe("finished");
    expect(clients.map((c) => c.auth.userId)).toContain(game.winnerId);
    const over = h.broadcasts.flatMap((m) => (m.type === "events" ? m.payload.events : [])).find((e: any) => e.type === "gameOver");
    expect(over?.reason).toBe("timeUp");
  });

  test("elimination mode arms no timer", () => {
    const { h } = startedGame(2);
    expect(h.timers).toHaveLength(0);
  });

  test("a game that ends before the deadline clears the timer", () => {
    const { h, clients } = startedGame(2, { gameMode: "timed", durationMinutes: 10 });
    h.room.onLeave(clients[0] as FakeClient);
    expect(h.room.state.phase).toBe(GamePhase.Finished);
    expect((h.timers[0] as Harness["timers"][number]).cleared).toBe(true);
  });
});
