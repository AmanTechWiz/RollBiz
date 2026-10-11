import {
  WebSocketTransport,
  defineRoom,
  defineServer,
  matchMaker,
  monitor,
  playground,
} from "colyseus";
import { GAME_ROOM } from "@rollbiz/shared";
import { getEnv, isOriginAllowed, isProduction } from "./config/env";
import { GameRoom } from "./rooms/GameRoom";

// CORS for the HTTP matchmaking routes (POST /matchmake/...). Colyseus merges
// this over its defaults, which would otherwise allow any origin.
matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get("origin");
  const allowed = origin !== null && isOriginAllowed(origin);
  return {
    // A non-matching value makes the browser block the response.
    "Access-Control-Allow-Origin": allowed ? origin : (getEnv().ALLOWED_ORIGINS[0] ?? ""),
    Vary: "Origin",
  };
};

const server = defineServer({
  // WebSocket upgrades bypass CORS, so check the Origin header here too.
  // Requests without an Origin (non-browser clients) still need a valid token.
  transport: new WebSocketTransport({
    beforeUpgrade: (_request, context) => {
      const origin = context.headers.get("origin");
      if (origin && !isOriginAllowed(origin)) {
        return new Response("Origin not allowed", { status: 403 });
      }
    },
  }),

  rooms: {
    [GAME_ROOM]: defineRoom(GameRoom),
  },

  express: (app) => {
    // Fly.io health check.
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });

    // Dev tools only; never expose these in production.
    if (!isProduction()) {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
