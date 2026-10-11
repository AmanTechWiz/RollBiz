import { schema, t, type SchemaType } from "@colyseus/schema";
import { GamePhase } from "@rollbiz/shared";

// Client-facing state contract. Keep in sync with the web client.
// Game rules state lives in the engine and is sent as JSON (`gameJson`).

export const Player = schema(
  {
    /** Supabase user id; also the engine PlayerId. */
    id: t.string(),
    name: t.string(),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const GameState = schema(
  {
    phase: t.string<GamePhase>().default(GamePhase.Lobby),
    /** sessionId of the host (first joiner); "" before anyone joined. */
    hostId: t.string().default(""),
    /** Keyed by sessionId. */
    players: t.map(Player),
    /** JSON of the parsed RoomSettings. */
    settingsJson: t.string().default(""),
    /** JSON of the ResolvedEconomy; "" in the lobby. */
    economyJson: t.string().default(""),
    /** JSON of the engine PublicGameView; "" in the lobby. */
    gameJson: t.string().default(""),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
