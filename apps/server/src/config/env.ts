import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(2567),
  // e.g. https://abcd.supabase.co (trailing slash is stripped)
  SUPABASE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  // Comma separated list of web origins. Entries may use one leading wildcard
  // label, e.g. "https://*.vercel.app". Empty = allow any origin (dev only).
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

// Read lazily: @colyseus/tools loads .env files when it is imported, so env
// must not be parsed at module-evaluation time of files imported before it.
export function getEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => getEnv().NODE_ENV === "production";

const toPattern = (origin: string) =>
  new RegExp(`^${origin.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", "[^.]+")}$`);

let patterns: RegExp[] | undefined;

export function isOriginAllowed(origin: string): boolean {
  const allowed = getEnv().ALLOWED_ORIGINS;
  if (allowed.length === 0) return true;
  patterns ??= allowed.map(toPattern);
  return patterns.some((pattern) => pattern.test(origin));
}
