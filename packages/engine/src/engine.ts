import type { Action, ActionType, SystemAction } from "./actions";
import { RuleError, type Ctx } from "./core/context";
import { handleBid, handlePassAuction } from "./rules/auction";
import { handleDeclareBankruptcy, handleForfeit, handlePayDebt, handleTimeUp } from "./rules/bankruptcy";
import { handleBuild, handleSellBuilding, handleSellGroupBuildings } from "./rules/building";
import { handleMortgage, handleUnmortgage } from "./rules/mortgage";
import { handleBuy, handleDeclineBuy } from "./rules/property";
import { handleAcceptTrade, handleCancelTrade, handleProposeTrade, handleRejectTrade } from "./rules/trade";
import { handleEndTurn, handlePayJailFine, handleRoll, handleUseJailCard } from "./rules/turn";
import type { GameEvent, GameState, PlayerId, Rng } from "./types";

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[]; duplicate?: boolean }
  | { ok: false; error: string };

/** How many recent action ids are remembered for idempotent retries. */
const REMEMBERED_ACTION_IDS = 200;

/** The only actions allowed while any debt is outstanding (and only by a debtor). */
const DEBT_ACTIONS: ReadonlySet<ActionType> = new Set([
  "sellBuilding",
  "sellGroupBuildings",
  "mortgage",
  "payDebt",
  "declareBankruptcy",
]);

function dispatch(ctx: Ctx, playerId: PlayerId, action: Action): void {
  switch (action.type) {
    case "roll":
      return handleRoll(ctx, playerId);
    case "buy":
      return handleBuy(ctx, playerId);
    case "declineBuy":
      return handleDeclineBuy(ctx, playerId);
    case "bid":
      return handleBid(ctx, playerId, action.amount);
    case "passAuction":
      return handlePassAuction(ctx, playerId);
    case "build":
      return handleBuild(ctx, playerId, action.tileId);
    case "sellBuilding":
      return handleSellBuilding(ctx, playerId, action.tileId);
    case "sellGroupBuildings":
      return handleSellGroupBuildings(ctx, playerId, action.group);
    case "mortgage":
      return handleMortgage(ctx, playerId, action.tileId);
    case "unmortgage":
      return handleUnmortgage(ctx, playerId, action.tileId);
    case "payJailFine":
      return handlePayJailFine(ctx, playerId);
    case "useJailCard":
      return handleUseJailCard(ctx, playerId);
    case "payDebt":
      return handlePayDebt(ctx, playerId);
    case "declareBankruptcy":
      return handleDeclareBankruptcy(ctx, playerId);
    case "proposeTrade":
      return handleProposeTrade(ctx, playerId, action);
    case "acceptTrade":
      return handleAcceptTrade(ctx, playerId, action.tradeId);
    case "rejectTrade":
      return handleRejectTrade(ctx, playerId, action.tradeId);
    case "cancelTrade":
      return handleCancelTrade(ctx, playerId, action.tradeId);
    case "endTurn":
      return handleEndTurn(ctx, playerId);
  }
}

/** Clones the state, runs `fn` on the draft, and commits only if no RuleError was thrown. */
function transact(state: GameState, rng: Rng, fn: (ctx: Ctx) => void): ApplyResult {
  const events: GameEvent[] = [];
  const ctx: Ctx = { state: structuredClone(state), rng, emit: (event) => events.push(event) };
  try {
    fn(ctx);
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, error: err.message };
    throw err; // a bug, not a rule violation
  }
  ctx.state.version += 1;
  return { ok: true, state: ctx.state, events };
}

/**
 * The single state-transition function for player actions. Pure apart from `rng`:
 * the input state is never mutated. `action` must already be parsed with ActionSchema.
 */
export function applyAction(state: GameState, playerId: PlayerId, action: Action, rng: Rng): ApplyResult {
  if (action.actionId && state.processedActionIds.includes(action.actionId)) {
    return { ok: true, state, events: [], duplicate: true };
  }
  if (action.expectedVersion !== undefined && action.expectedVersion !== state.version) {
    return { ok: false, error: "stale state, please retry" };
  }
  if (state.status !== "playing") return { ok: false, error: "the game is over" };

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "you are not in this game" };
  if (player.bankrupt) return { ok: false, error: "you are bankrupt" };

  if (state.debts.length > 0) {
    if (!DEBT_ACTIONS.has(action.type)) return { ok: false, error: "outstanding debts must be settled first" };
    if (!state.debts.some((d) => d.debtor === playerId)) return { ok: false, error: "waiting for debts to be settled" };
  }

  const result = transact(state, rng, (ctx) => dispatch(ctx, playerId, action));
  if (result.ok && action.actionId) {
    const ids = result.state.processedActionIds;
    ids.push(action.actionId);
    if (ids.length > REMEMBERED_ACTION_IDS) ids.splice(0, ids.length - REMEMBERED_ACTION_IDS);
  }
  return result;
}

/** Server-issued actions (time-up, forfeit). */
export function applySystemAction(state: GameState, action: SystemAction, rng: Rng): ApplyResult {
  if (state.status !== "playing") return { ok: false, error: "the game is over" };
  return transact(state, rng, (ctx) => {
    switch (action.type) {
      case "timeUp":
        return handleTimeUp(ctx);
      case "forfeit":
        return handleForfeit(ctx, action.playerId);
    }
  });
}
