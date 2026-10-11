import { randomInt } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import {
  ClientMessageSchema,
  GamePhase,
  JoinOptionsSchema,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type ClientMessage,
  type JoinOptions,
} from "@rollbiz/shared";
import { isJwksUnavailable, verifySupabaseToken } from "../auth/supabase";
import { PASS_START_BONUS, RECONNECT_SECONDS, STARTING_CASH, move, rollDice } from "../game/rules";
import { canTakeSeat, releaseSeat, takeSeat } from "../game/seats";
import { GameState, Player } from "./schema/GameState";

/** Returned by onAuth; available as `client.auth`. */
export type AuthData = { userId: string; name: string };

/** Server -> client messages. */
export type ServerMessages = { error: { message: string } };

export type GameClient = Client<{ auth: AuthData; messages: ServerMessages }>;

const MAX_NAME_LENGTH = 24;

export class GameRoom extends Room<{ state: GameState; client: GameClient }> {
  maxClients = MAX_PLAYERS;
  // Clients sending more than this per second are disconnected.
  maxMessagesPerSecond = 15;
  state = new GameState();

  /** Whether the current player already rolled this turn (server-only). */
  private hasRolled = false;

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
      new Player({ id: auth.userId, name: auth.name, ready: false, connected: true, position: 0, cash: 0 }),
    );
  }

  /** Unexpected disconnect (network blip, tab suspended, page reload). */
  onDrop(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.connected = false;
    if (this.state.phase === GamePhase.Playing && this.state.currentTurn === client.sessionId) {
      this.advanceTurn();
    }

    // Not awaited: the framework calls onReconnect() or onLeave() itself.
    // The catch only silences the rejection on timeout / room disposal.
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = true;
    // Everyone was gone: hand the turn to whoever came back first.
    if (this.state.phase === GamePhase.Playing && this.state.currentTurn === "") {
      this.setTurn(client.sessionId);
    }
  }

  /** Consented leave, or a drop whose reconnection window expired. */
  onLeave(client: GameClient) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.releaseUser(player.id);

    if (this.state.phase === GamePhase.Lobby) {
      this.state.players.delete(client.sessionId);
      this.maybeStartGame();
      return;
    }

    // During a game the seat is kept (cash/position) but is skipped from now on.
    player.connected = false;
    if (this.state.currentTurn === client.sessionId) this.advanceTurn();
  }

  onDispose() {
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
      case "roll":
        return this.onRoll(client);
      case "buy":
        return this.sendError(client, "not implemented");
      case "endTurn":
        return this.onEndTurn(client);
    }
  }

  private onReady(client: GameClient) {
    if (this.state.phase !== GamePhase.Lobby) return this.sendError(client, "game already started");
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = !player.ready;
    this.maybeStartGame();
  }

  private onRoll(client: GameClient) {
    if (!this.isCurrentPlayer(client)) return this.sendError(client, "not your turn");
    if (this.hasRolled) return this.sendError(client, "already rolled this turn");
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const [a, b] = rollDice();
    this.state.lastRoll.clear();
    this.state.lastRoll.push(a, b);

    const result = move(player.position, a + b);
    player.position = result.position;
    if (result.passedStart) player.cash += PASS_START_BONUS;
    this.hasRolled = true;
  }

  private onEndTurn(client: GameClient) {
    if (!this.isCurrentPlayer(client)) return this.sendError(client, "not your turn");
    if (!this.hasRolled) return this.sendError(client, "roll before ending your turn");
    this.advanceTurn();
  }

  // ---------------------------------------------------------------------------
  // Game flow

  private maybeStartGame() {
    const players = [...this.state.players.values()];
    if (players.length < MIN_PLAYERS || !players.every((p) => p.ready)) return;

    this.state.phase = GamePhase.Playing;
    this.lock().catch((err) => console.warn("[room] lock failed", err)); // no new joins mid-game; reconnects still work

    for (const player of players) {
      player.position = 0;
      player.cash = STARTING_CASH;
    }
    this.state.lastRoll.clear();

    const ids = [...this.state.players.keys()];
    this.setTurn(ids[randomInt(ids.length)] ?? "");
  }

  /** Passes the turn to the next connected player in join order. */
  private advanceTurn() {
    const ids = [...this.state.players.keys()];
    const start = ids.indexOf(this.state.currentTurn);
    for (let step = 1; step <= ids.length; step++) {
      const id = ids[(start + step + ids.length) % ids.length];
      if (id && this.state.players.get(id)?.connected) return this.setTurn(id);
    }
    this.setTurn(""); // nobody connected; onReconnect picks it back up
  }

  private setTurn(sessionId: string) {
    this.state.currentTurn = sessionId;
    this.hasRolled = false;
  }

  private isCurrentPlayer(client: GameClient) {
    return this.state.phase === GamePhase.Playing && this.state.currentTurn === client.sessionId;
  }

  private sendError(client: GameClient, message: string) {
    client.send("error", { message });
  }
}
