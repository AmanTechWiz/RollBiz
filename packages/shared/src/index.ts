import { z } from "zod";

// Room name used by both the Colyseus server and the web client.
export const GAME_ROOM = "game";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// Options a client sends when creating or joining a room.
// `accessToken` is the Supabase session JWT; the server verifies it in onAuth.
export const JoinOptionsSchema = z.object({
  accessToken: z.string().min(1),
  displayName: z.string().trim().min(1).max(24).optional(),
  // Only read when the room is created: private rooms are skipped by Quick Play.
  isPrivate: z.boolean().optional(),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

// Client -> server messages. The server validates each one with this union, then
// `settings` with the engine's RoomSettingsSchema and `action` with its ActionSchema.
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  // Host only, lobby only. Partial settings, merged over the current ones. Unreadies everyone.
  z.object({ type: z.literal("updateSettings"), settings: z.record(z.string(), z.unknown()) }),
  // Host only, lobby only: starts once MIN_PLAYERS are present and everyone is ready.
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("action"), action: z.unknown() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

/** Server -> client messages (besides state sync). */
export type ServerMessages = {
  error: { message: string };
  /** Engine GameEvent[] produced by the last action, for animations and the activity log. */
  events: { events: unknown[] };
};

export const GamePhase = {
  Lobby: "lobby",
  Playing: "playing",
  Finished: "finished",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];
