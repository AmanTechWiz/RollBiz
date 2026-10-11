import { schema, t, type SchemaType } from "@colyseus/schema";
import { GamePhase } from "@rollbiz/shared";

// Client-facing state contract. Keep in sync with the web client.

export const Player = schema(
  {
    /** Supabase user id. */
    id: t.string(),
    name: t.string(),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    position: t.uint8().default(0),
    cash: t.int32().default(0),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const GameState = schema(
  {
    phase: t.string<GamePhase>().default(GamePhase.Lobby),
    /** Keyed by sessionId. */
    players: t.map(Player),
    /** sessionId of the player whose turn it is; "" when nobody can act. */
    currentTurn: t.string().default(""),
    /** The two dice of the most recent roll; empty before the first roll. */
    lastRoll: t.array("uint8"),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
