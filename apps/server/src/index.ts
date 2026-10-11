// Importing @colyseus/tools first also loads .env / .env.<NODE_ENV> files.
import { listen } from "@colyseus/tools";
import app from "./app.config";
import { getEnv } from "./config/env";

// Fail fast on missing/invalid configuration.
const env = getEnv();
if (env.NODE_ENV === "production" && env.ALLOWED_ORIGINS.length === 0) {
  console.warn("ALLOWED_ORIGINS is empty: accepting connections from any origin.");
}

await listen(app, env.PORT);
