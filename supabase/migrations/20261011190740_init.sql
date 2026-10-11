CREATE TYPE "public"."match_status" AS ENUM('in_progress', 'finished', 'abandoned');--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"seat" smallint NOT NULL,
	"final_cash" integer,
	"placement" smallint,
	CONSTRAINT "match_players_match_id_profile_id_pk" PRIMARY KEY("match_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "match_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" text,
	"status" "match_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"winner_id" uuid
);
--> statement-breakpoint
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_profiles_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_players_profile_id_idx" ON "match_players" USING btree ("profile_id");--> statement-breakpoint
CREATE POLICY "match_players_select_authenticated" ON "match_players" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "matches_select_authenticated" ON "matches" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "profiles_select_authenticated" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = (select auth.uid())) WITH CHECK ("profiles"."id" = (select auth.uid()));