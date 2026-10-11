import { defineConfig } from "drizzle-kit";

// Drizzle generates SQL into the Supabase migrations folder; the Supabase CLI
// owns applying them (`supabase migration up` / `supabase db reset` / `db push`).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "../../supabase/migrations",
  // Name files `<timestamp>_<name>.sql` so the Supabase CLI picks them up.
  migrations: { prefix: "supabase" },
  // Ignore Supabase-managed roles (anon, authenticated, service_role, ...).
  entities: { roles: { provider: "supabase" } },
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  strict: true,
  verbose: true,
});
