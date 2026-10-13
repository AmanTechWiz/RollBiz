import { Client, type Room } from "@colyseus/sdk";
import type { Session } from "@supabase/supabase-js";
import {
  DEFAULT_SETTINGS,
  RoomSettingsSchema,
  type Action,
  type PublicGameView,
  type ResolvedEconomy,
  type RoomSettings,
  type RoomSettingsInput,
} from "@rollbiz/engine";
import { GAME_ROOM, GamePhase, type ClientMessageType, type JoinOptions } from "@rollbiz/shared";

// In dev, default to the host the page was opened from so phones on the LAN reach the Mac's server.
const endpoint =
  import.meta.env.VITE_COLYSEUS_URL ||
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : undefined);
if (!endpoint) throw new Error("Missing VITE_COLYSEUS_URL (see .env.example)");

export const colyseus = new Client(endpoint);

// We decode without a client-side schema class, so state is untyped here.
export type GameRoom = Room<any, any>;

function joinOptions(session: Session, isPrivate = false): JoinOptions {
  const meta = session.user.user_metadata as Record<string, unknown>;
  const raw = meta.full_name ?? meta.name ?? session.user.email?.split("@")[0];
  const displayName = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 24) : undefined;
  return { accessToken: session.access_token, displayName, isPrivate };
}

export function quickPlay(session: Session): Promise<GameRoom> {
  return colyseus.joinOrCreate(GAME_ROOM, joinOptions(session));
}

export function createPrivateRoom(session: Session): Promise<GameRoom> {
  return colyseus.create(GAME_ROOM, joinOptions(session, true));
}

/** Room codes are 4 digits then 2 letters (no I or O), e.g. "4821KQ". Mirrors apps/server room-logic. */
export const ROOM_CODE_PATTERN = /^\d{4}[A-HJ-NP-Z]{2}$/;

export function joinByCode(session: Session, code: string): Promise<GameRoom> {
  return colyseus.joinById(code.trim().toUpperCase(), joinOptions(session));
}

// The reconnection token lets a reloaded page (or a relaunched PWA) take its seat back.
const RESUME_KEY = "rollbiz.resume";

export function rememberRoom(room: GameRoom) {
  localStorage.setItem(RESUME_KEY, room.reconnectionToken);
}

export function forgetRoom() {
  localStorage.removeItem(RESUME_KEY);
}

/** Rejoins the room saved by rememberRoom, or returns null if there is none or it expired. */
export async function resumeRoom(): Promise<GameRoom | null> {
  const token = localStorage.getItem(RESUME_KEY);
  if (!token) return null;
  try {
    return await colyseus.reconnect(token);
  } catch {
    forgetRoom();
    return null;
  }
}

export function sendReady(room: GameRoom) {
  room.send("ready" satisfies ClientMessageType);
}

export function sendStart(room: GameRoom) {
  room.send("start" satisfies ClientMessageType);
}

/** Partial settings, merged over the current ones by the server (host only, lobby only). */
export function sendUpdateSettings(room: GameRoom, settings: RoomSettingsInput) {
  room.send("updateSettings" satisfies ClientMessageType, { settings });
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ActionInput = DistributiveOmit<Action, "actionId" | "expectedVersion">;

/** Sends a game action with a fresh actionId (safe retries) and the version it was chosen against. */
export function sendAction(room: GameRoom, action: ActionInput, version: number) {
  room.send("action" satisfies ClientMessageType, {
    action: { ...action, actionId: crypto.randomUUID(), expectedVersion: version },
  });
}

// ---------------------------------------------------------------------------
// Room state (schema owned by apps/server): phase, hostId, players, and three JSON strings.

export type LobbyPlayer = {
  sessionId: string;
  /** Supabase user id; equals the engine PlayerId. */
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
};

export type RoomView = {
  phase: GamePhase;
  /** sessionId of the host. */
  hostId: string;
  players: LobbyPlayer[];
  settings: RoomSettings;
  /** Null in the lobby (or if the payload could not be read). */
  economy: ResolvedEconomy | null;
  game: PublicGameView | null;
};

const PHASES: readonly string[] = Object.values(GamePhase);

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" ? (value as T) : null;
  } catch {
    return null;
  }
}

type RawRoom = {
  phase?: unknown;
  hostId?: unknown;
  players?: Record<string, Partial<LobbyPlayer>>;
  settingsJson?: unknown;
  economyJson?: unknown;
  gameJson?: unknown;
};

/**
 * Returns a function that converts the decoded Schema state into a plain RoomView.
 * The JSON strings are only re-parsed when they change (economyJson is large).
 */
export function createSnapshotter() {
  const cache = new Map<string, { raw: unknown; value: unknown }>();
  const cached = <T>(key: string, raw: unknown, parse: (raw: unknown) => T): T => {
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value as T;
    const value = parse(raw);
    cache.set(key, { raw, value });
    return value;
  };

  return (state: unknown): RoomView => {
    const json = (state as { toJSON?: () => RawRoom } | undefined)?.toJSON?.() ?? {};
    const players = Object.entries(json.players ?? {}).map(([sessionId, p]) => ({
      sessionId,
      id: p.id ?? "",
      name: p.name ?? "",
      ready: p.ready ?? false,
      connected: p.connected ?? true,
    }));
    return {
      phase: typeof json.phase === "string" && PHASES.includes(json.phase) ? (json.phase as GamePhase) : GamePhase.Lobby,
      hostId: typeof json.hostId === "string" ? json.hostId : "",
      players,
      settings: cached("settings", json.settingsJson, (raw) => {
        const parsed = RoomSettingsSchema.safeParse(parseJson<unknown>(raw) ?? {});
        return parsed.success ? parsed.data : DEFAULT_SETTINGS;
      }),
      economy: cached("economy", json.economyJson, parseJson<ResolvedEconomy>),
      game: cached("game", json.gameJson, parseJson<PublicGameView>),
    };
  };
}
