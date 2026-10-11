import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { matches, matchPlayers } from "./matches";
import { profiles } from "./profiles";

export { profiles } from "./profiles";
export { matches, matchPlayers, matchStatus } from "./matches";

// Inferred row types.
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchPlayer = typeof matchPlayers.$inferSelect;
export type NewMatchPlayer = typeof matchPlayers.$inferInsert;
export type MatchStatus = Match["status"];

// Zod schemas for validating rows at API boundaries.
export const profileSelectSchema = createSelectSchema(profiles);
export const profileInsertSchema = createInsertSchema(profiles);
// What a user may edit on their own profile (mirrors the column grants in the migration).
export const profileUpdateSchema = createUpdateSchema(profiles).pick({
  displayName: true,
  avatarUrl: true,
});

export const matchSelectSchema = createSelectSchema(matches);
export const matchInsertSchema = createInsertSchema(matches);

export const matchPlayerSelectSchema = createSelectSchema(matchPlayers);
export const matchPlayerInsertSchema = createInsertSchema(matchPlayers);
