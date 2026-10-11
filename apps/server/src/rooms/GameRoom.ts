import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import {
  ClientMessageSchema,
  GamePhase,
  JoinOptionsSchema,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type ClientMessage,
  type JoinOptions,
  type ServerMessages,
} from "@rollbiz/shared";
import {
  ActionSchema,
  DEFAULT_SETTINGS,
  applyAction,
  applySystemAction,
  createGame,
  resolveEconomy,
  toPublicView,
  type ApplyResult,
  type GameState as EngineState,
  type RoomSettings,
  type SystemAction,
} from "@rollbiz/engine";
import { isJwksUnavailable, verifySupabaseToken } from "../auth/supabase";
import { RECONNECT_SECONDS, cryptoRng, mergeSettings, shuffle } from "../game/room-logic";
import { canTakeSeat, releaseSeat, takeSeat } from "../game/seats";
import { GameState, Player } from "./schema/GameState";

/** Returned by onAuth; available as `client.auth`. */
export type AuthData = { userId: string; name: string };

export type { ServerMessages };

export type GameClient = Client<{ auth: AuthData; messages: ServerMessages }>;

const MAX_NAME_LENGTH = 24;

export class GameRoom extends Room<{ state: GameState; client: GameClient }> {
  maxClients = MAX_PLAYERS;
  // Clients sending more than this per second are disconnected.
  maxMessagesPerSecond = 15;
  state = new GameState();

  /** Authoritative engine state; null in the lobby (server-only, clients get `gameJson`). */
  private game: EngineState | null = null;

  /** Parsed lobby settings, mirrored to `state.settingsJson`. */
  private settings: RoomSettings = DEFAULT_SETTINGS;

  /** Timed-mode deadline timer. */
  private timeUpTimer: { clear(): void } | null = null;

  /** Users holding a seat-cap slot in this room (see game/seats.ts). */
  private readonly seated = new Set<string>();

  /**
   * Runs at matchmaking time, before a seat is reserved. Throwing rejects the
   * join; the return value becomes `client.auth`.
   */
  static async onAuth(_token: string, options: unknown, _context: AuthContext): Promise<AuthData> {
    const parsed = JoinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new ServerError(400, "invalid join options");

    try {
      const user = await verifySupabaseToken(parsed.data.accessToken);
      if (!canTakeSeat(user.userId)) throw new ServerError(429, "too many open rooms");
      const name = (parsed.data.displayName ?? user.name ?? "Player").slice(0, MAX_NAME_LENGTH);
      return { userId: user.userId, name };
    } catch (err) {
      if (err instanceof ServerError) throw err;
      // Log the reason (never the token) so a bad SUPABASE_URL or legacy signing key is visible.
      const reason = err instanceof Error ? `${(err as { code?: string }).code ?? err.name}: ${err.message}` : String(err);
      console.warn(`[auth] token rejected, ${reason}`);
      if (isJwksUnavailable(err)) throw new ServerError(503, "auth service unavailable, try again");
      throw new ServerError(401, "invalid access token");
    }
  }

  onCreate(options: unknown) {
    // Public rooms are matched by Quick Play (`joinOrCreate`) until the game starts
    // and the room is locked. Private rooms are joined by sharing `room.roomId`.
    if (JoinOptionsSchema.safeParse(options).data?.isPrivate) {
      this.setPrivate(true).catch((err) => console.warn("[room] setPrivate failed", err));
    }

    this.state.settingsJson = JSON.stringify(this.settings);

    // Single entry point so every message is validated by the shared zod union.
    this.onMessage("*", (client, type, payload) => this.handleMessage(client, type, payload));
  }

  // `options` is typed so a server-typed SDK client infers the join options.
  onJoin(client: GameClient, _options: JoinOptions) {
    const auth = client.auth;
    if (!auth) throw new ServerError(401, "unauthenticated");
    if (this.state.phase !== GamePhase.Lobby) throw new ServerError(403, "game already started");
    for (const player of this.state.players.values()) {
      if (player.id === auth.userId) throw new ServerError(409, "already in this room");
    }

    this.seated.add(auth.userId);
    takeSeat(auth.userId);
    this.state.players.set(
      client.sessionId,
      new Player({ id: auth.userId, name: auth.name, ready: false, connected: true }),
    );
    if (this.state.hostId === "") this.state.hostId = client.sessionId;
  }

  /** Unexpected disconnect (network blip, tab suspended, page reload). */
  onDrop(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.connected = false;

    // Not awaited: the framework calls onReconnect() or onLeave() itself.
    // The catch only silences the rejection on timeout / room disposal.
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  /** Consented leave, or a drop whose reconnection window expired. */
  onLeave(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.releaseUser(player.id);

    if (this.state.phase === GamePhase.Lobby) {
      this.state.players.delete(client.sessionId);
      if (this.state.hostId === client.sessionId) {
        // Hand the room to the next player in join order.
        this.state.hostId = this.state.players.keys().next().value ?? "";
      }
      return;
    }

    // During a game the entry is kept (the name stays visible) but the player forfeits.
    player.connected = false;
    if (this.state.phase === GamePhase.Playing) this.applySystem({ type: "forfeit", playerId: player.id });
  }

  onDispose() {
    this.timeUpTimer?.clear();
    for (const userId of this.seated) this.releaseUser(userId);
  }

  private releaseUser(userId: string) {
    if (this.seated.delete(userId)) releaseSeat(userId);
  }

  // ---------------------------------------------------------------------------
  // Messages

  private handleMessage(client: GameClient, type: string | number, payload: unknown) {
    const body = typeof payload === "object" && payload !== null ? payload : {};
    const parsed = ClientMessageSchema.safeParse({ ...body, type });
    // Don't answer junk: replying would amplify a flood of bad messages.
    if (!parsed.success) return;

    const message: ClientMessage = parsed.data;
    switch (message.type) {
      case "ready":
        return this.onReady(client);
      case "updateSettings":
        return this.onUpdateSettings(client, message.settings);
      case "start":
        return this.onStart(client);
      case "action":
        return this.onAction(client, message.action);
    }
  }

  private onReady(client: GameClient) {
    if (this.state.phase !== GamePhase.Lobby) return this.sendError(client, "game already started");
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = !player.ready;
  }

  private onUpdateSettings(client: GameClient, patch: Record<string, unknown>) {
    if (this.state.phase !== GamePhase.Lobby) return this.sendError(client, "game already started");
    if (!this.isHost(client)) return this.sendError(client, "only the host can change settings");

    const merged = mergeSettings(this.settings, patch);
    if (!merged.ok) return this.sendError(client, merged.error);

    this.settings = merged.settings;
    this.state.settingsJson = JSON.stringify(this.settings);
    for (const player of this.state.players.values()) player.ready = false;
  }

  private onStart(client: GameClient) {
    if (this.state.phase !== GamePhase.Lobby) return this.sendError(client, "game already started");
    if (!this.isHost(client)) return this.sendError(client, "only the host can start the game");

    const players = [...this.state.players.values()];
    if (players.length < MIN_PLAYERS) return this.sendError(client, `need at least ${MIN_PLAYERS} players`);
    if (!players.every((p) => p.ready)) return this.sendError(client, "everyone must be ready");

    let created: ReturnType<typeof createGame>;
    let economyJson: string;
    try {
      // Random seat order.
      const order = shuffle(players).map((p) => ({ id: p.id, name: p.name }));
      const economy = resolveEconomy(this.settings);
      created = createGame(economy, order, cryptoRng, Date.now());
      economyJson = JSON.stringify(economy);
    } catch (err) {
      console.warn("[room] start failed", err);
      return this.sendError(client, err instanceof Error ? err.message : "could not start the game");
    }

    this.state.economyJson = economyJson;
    this.state.phase = GamePhase.Playing;
    this.lock().catch((err) => console.warn("[room] lock failed", err)); // no new joins mid-game; reconnects still work
    this.commit(created.state, created.events);
    this.armTimeUp(created.state);
  }

  private onAction(client: GameClient, raw: unknown) {
    if (this.state.phase !== GamePhase.Playing || !this.game) return this.sendError(client, "the game is not running");
    const action = ActionSchema.safeParse(raw);
    if (!action.success) return this.sendError(client, "invalid action");

    const userId = client.auth?.userId;
    if (!userId) return this.sendError(client, "unauthenticated");
    this.handleResult(applyAction(this.game, userId, action.data, cryptoRng), client);
  }

  // ---------------------------------------------------------------------------
  // Game flow

  /** Server-issued engine actions (time-up, forfeit). Failures are only logged. */
  private applySystem(action: SystemAction) {
    if (!this.game) return; // no engine game yet: nothing to forfeit or time out
    this.handleResult(applySystemAction(this.game, action, cryptoRng));
  }

  private handleResult(result: ApplyResult, client?: GameClient) {
    if (!result.ok) {
      if (client) this.sendError(client, result.error);
      else console.warn("[room] system action rejected:", result.error);
      return;
    }
    if (result.duplicate) return; // retried action: already applied, nothing new to publish
    this.commit(result.state, result.events);
  }

  /** Stores a new engine state, publishes it and broadcasts what happened. */
  private commit(state: EngineState, events: unknown[]) {
    this.game = state;
    this.state.gameJson = JSON.stringify(toPublicView(state));
    if (events.length > 0) this.broadcast("events", { events });
    if (state.status === "finished") {
      this.timeUpTimer?.clear();
      this.timeUpTimer = null;
      this.state.phase = GamePhase.Finished;
    }
  }

  /** In timed mode, ends the game at `endsAt`. */
  private armTimeUp(state: EngineState) {
    if (state.endsAt === null) return;
    this.timeUpTimer = this.clock.setTimeout(
      () => {
        this.timeUpTimer = null;
        this.applySystem({ type: "timeUp" });
      },
      Math.max(0, state.endsAt - Date.now()),
    );
  }

  private isHost(client: GameClient) {
    return this.state.hostId === client.sessionId;
  }

  private sendError(client: GameClient, message: string) {
    client.send("error", { message });
  }
}
