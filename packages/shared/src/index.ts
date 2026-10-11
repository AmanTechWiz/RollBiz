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

// Client -> server messages. Every message is validated with this union on the server.
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("roll") }),
  z.object({ type: z.literal("buy") }),
  z.object({ type: z.literal("endTurn") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

export const GamePhase = {
  Lobby: "lobby",
  Playing: "playing",
  Finished: "finished",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];
