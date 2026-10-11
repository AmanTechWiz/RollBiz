import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { profiles } from "./profiles";

export const matchStatus = pgEnum("match_status", ["in_progress", "finished", "abandoned"]);

// Written only by the game server (direct DB connection / service role bypasses RLS).
// Clients get read-only access.
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id"),
    status: matchStatus("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    winnerId: uuid("winner_id").references(() => profiles.id, { onDelete: "set null" }),
  },
  () => [
    pgPolicy("matches_select_authenticated", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    seat: smallint("seat").notNull(),
    finalCash: integer("final_cash"),
    placement: smallint("placement"),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.profileId] }),
    // "My match history" lookups.
    index("match_players_profile_id_idx").on(t.profileId),
    pgPolicy("match_players_select_authenticated", {
      for: "select",
      to: authenticatedRole,
      using: sql`true`,
    }),
  ],
);
