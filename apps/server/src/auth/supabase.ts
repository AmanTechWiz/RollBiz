import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";
import { getEnv } from "../config/env";

type SupabaseClaims = JWTPayload & {
  email?: string;
  user_metadata?: { full_name?: unknown; name?: unknown };
};

export type VerifiedUser = {
  userId: string;
  /** Best-effort display name from the Google profile / email. */
  name: string | undefined;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// jose caches the key set and refetches on unknown `kid` (key rotation).
function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(`${getEnv().SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

/**
 * True when verification failed because the key set couldn't be fetched (network
 * error, timeout, bad response), not because the token itself is bad.
 */
export function isJwksUnavailable(err: unknown): boolean {
  if (!(err instanceof errors.JOSEError)) return true;
  return err.code === "ERR_JWKS_TIMEOUT" || err.code === "ERR_JOSE_GENERIC";
}

/**
 * Verifies a Supabase access token signed with the project's asymmetric
 * signing keys. Throws if the signature, issuer, audience or expiry is invalid.
 */
export async function verifySupabaseToken(token: string): Promise<VerifiedUser> {
  const { payload } = await jwtVerify<SupabaseClaims>(token, getJwks(), {
    issuer: `${getEnv().SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
    algorithms: ["ES256", "RS256"],
    requiredClaims: ["exp", "sub"],
  });

  if (!payload.sub) throw new Error("token has no subject");

  const meta = payload.user_metadata;
  const metaName = [meta?.full_name, meta?.name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return {
    userId: payload.sub,
    name: metaName ?? payload.email?.split("@")[0],
  };
}
