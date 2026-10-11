import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export * from "./schema/index";
export { schema };

/**
 * Create a Drizzle client over postgres-js.
 * `prepare: false` is required for the Supabase transaction pooler (port 6543),
 * which does not support prepared statements; it is harmless on direct connections.
 */
export function createDb(url: string) {
  const client = postgres(url, { prepare: false });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;
