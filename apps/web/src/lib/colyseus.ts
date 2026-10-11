import { Client, type Room } from "@colyseus/sdk";
import type { Session } from "@supabase/supabase-js";
import { GAME_ROOM, type ClientMessageType, type JoinOptions } from "@rollbiz/shared";

// In dev, default to the host the page was opened from so phones on the LAN reach the Mac's server.
const endpoint =
  import.meta.env.VITE_COLYSEUS_URL ||
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : undefined);
if (!endpoint) throw new Error("Missing VITE_COLYSEUS_URL (see .env.example)");

export const colyseus = new Client(endpoint);

// Plain snapshot of the server room state (apps/server owns the schema).
export type PlayerView = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  position: number;
  cash: number;
};

export type GameView = {
  phase: string;
  players: Record<string, PlayerView>; // keyed by sessionId
  currentTurn: string; // sessionId
  lastRoll: number[];
};

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

export function joinByCode(session: Session, roomId: string): Promise<GameRoom> {
  return colyseus.joinById(roomId.trim(), joinOptions(session));
}

export function sendMessage(room: GameRoom, type: ClientMessageType) {
  room.send(type);
}

/** Converts the decoded Schema state into a plain GameView for React. */
export function snapshot(state: unknown): GameView {
  const json = (state as { toJSON?: () => Partial<GameView> } | undefined)?.toJSON?.() ?? {};
  return {
    phase: json.phase ?? "lobby",
    players: json.players ?? {},
    currentTurn: json.currentTurn ?? "",
    lastRoll: json.lastRoll ?? [],
  };
}
