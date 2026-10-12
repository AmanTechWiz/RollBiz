import { RuleError, rollDie, type Ctx } from "../core/context";
import { pay, payEachOther } from "../core/money";
import { getPlayer, requireNoPending, requireTurn, tileAt } from "../core/state";
import type { PlayerId, PlayerState } from "../types";
import { countBuildings } from "./building";
import { drawCard } from "./cards";
import { landOnProperty } from "./property";

const TRACK_LENGTH = 40;

function requireNoDebts(ctx: Ctx): void {
  if (ctx.state.debts.length > 0) throw new RuleError("outstanding debts must be settled first");
}

function leaveJail(ctx: Ctx, player: PlayerState, via: "fine" | "card" | "doubles"): void {
  player.inJail = false;
  player.jailAttempts = 0;
  ctx.emit({ type: "leftJail", playerId: player.id, via });
}

/** Moves the piece by `steps` from the current position and resolves the landing. */
function moveAndResolve(ctx: Ctx, playerId: PlayerId, steps: number): void {
  movePlayer(ctx, playerId, { steps });
  resolveLanding(ctx, playerId, steps);
}

export function handleRoll(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  requireTurn(state, playerId);
  requireNoPending(state);
  requireNoDebts(ctx);
  const { turn } = state;
  if (turn.hasRolled && !turn.rollAgain) throw new RuleError("you have already rolled this turn");

  const player = getPlayer(state, playerId);
  const dice: [number, number] = [rollDie(ctx.rng), rollDie(ctx.rng)];
  const doubles = dice[0] === dice[1];
  const total = dice[0] + dice[1];
  const { rules } = state.economy;

  turn.lastRoll = dice;
  turn.hasRolled = true;
  turn.rollAgain = false;
  ctx.emit({ type: "rolled", playerId, dice, doubles });

  if (player.inJail) {
    // A roll in jail is an escape attempt. It never grants an extra roll.
    turn.doublesCount = 0;
    if (doubles) {
      leaveJail(ctx, player, "doubles");
    } else {
      player.jailAttempts += 1;
      if (player.jailAttempts < rules.maxJailAttempts) return;
      // Third failure: the fine is mandatory. If it can't be covered a debt is queued, and the player moves anyway.
      pay(ctx, playerId, "bank", rules.jailFine, "jail fine");
      leaveJail(ctx, player, "fine");
    }
    moveAndResolve(ctx, playerId, total);
    return;
  }

  turn.doublesCount = doubles ? turn.doublesCount + 1 : 0;
  if (doubles && rules.threeDoublesToJail && turn.doublesCount >= rules.doublesToJail) {
    sendToJail(ctx, playerId);
    return;
  }

  moveAndResolve(ctx, playerId, total);
  turn.rollAgain = doubles && rules.doublesRollAgain && !player.inJail;
}

export function handleEndTurn(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  requireTurn(state, playerId);
  requireNoPending(state);
  requireNoDebts(ctx);
  if (!state.turn.hasRolled) throw new RuleError("roll the dice before ending your turn");
  if (state.turn.rollAgain) throw new RuleError("you rolled doubles: roll again");
  startNextTurn(ctx);
}

/** Shared checks for the two ways of buying out of jail before rolling. */
function requireJailedBeforeRoll(ctx: Ctx, playerId: PlayerId): PlayerState {
  const { state } = ctx;
  requireTurn(state, playerId);
  requireNoPending(state);
  requireNoDebts(ctx);
  const player = getPlayer(state, playerId);
  if (!player.inJail) throw new RuleError("you are not in jail");
  if (state.turn.hasRolled) throw new RuleError("you can only do that before rolling");
  return player;
}

export function handlePayJailFine(ctx: Ctx, playerId: PlayerId): void {
  const player = requireJailedBeforeRoll(ctx, playerId);
  const fine = ctx.state.economy.rules.jailFine;
  if (player.cash < fine) throw new RuleError("you cannot afford the jail fine");
  pay(ctx, playerId, "bank", fine, "jail fine");
  leaveJail(ctx, player, "fine");
}

export function handleUseJailCard(ctx: Ctx, playerId: PlayerId): void {
  const player = requireJailedBeforeRoll(ctx, playerId);
  const cardId = player.jailFreeCards.shift();
  if (cardId === undefined) throw new RuleError("you have no Get Out of Jail Free card");
  const card = ctx.state.economy.cards[cardId];
  if (card) ctx.state.decks[card.deck].push(cardId);
  leaveJail(ctx, player, "card");
}

/**
 * Moves a player forward (clockwise) by steps, or forward to a tile index.
 * Awards the Start bonus once if the move passes or lands on Start. Emits `moved`.
 * Does not resolve the landing.
 */
export function movePlayer(ctx: Ctx, playerId: PlayerId, target: { steps: number } | { to: number }): void {
  const player = getPlayer(ctx.state, playerId);
  const from = player.position;
  const distance = "steps" in target ? target.steps : (target.to - from + TRACK_LENGTH) % TRACK_LENGTH;
  if (distance === 0) return;
  const raw = from + distance;
  const to = raw % TRACK_LENGTH;
  const passedStart = raw >= TRACK_LENGTH;
  player.position = to;
  if (passedStart) pay(ctx, "bank", playerId, ctx.state.economy.rules.startBonus, "passed Start");
  ctx.emit({ type: "moved", playerId, from, to, passedStart });
}

/** Resolves the tile the player is standing on. `diceTotal` is used for utility rent. */
export function resolveLanding(ctx: Ctx, playerId: PlayerId, diceTotal: number): void {
  const { state } = ctx;
  const tile = tileAt(state, getPlayer(state, playerId).position);
  const { rules } = state.economy;
  switch (tile.kind) {
    case "start": // the bonus was paid by the move
    case "jail": // just visiting
      return;
    case "city":
    case "transport":
    case "utility":
      return landOnProperty(ctx, playerId, tile.id, diceTotal);
    case "incomeTax":
      pay(ctx, playerId, "bank", rules.incomeTax, "income tax");
      return;
    case "wealthTax": {
      const { houses, hotels } = countBuildings(state, playerId);
      const due = Math.min(rules.wealthTaxCap, houses * rules.wealthTaxPerHouse + hotels * rules.wealthTaxPerHotel);
      pay(ctx, playerId, "bank", due, "wealth tax");
      return;
    }
    case "restHouse":
      payEachOther(ctx, playerId, rules.restHouseFromEach, "collect", "Rest House");
      return;
    case "club":
      payEachOther(ctx, playerId, rules.clubToEach, "pay", "Club");
      return;
    case "chance":
      return drawCard(ctx, playerId, "chance", diceTotal);
    case "communityChest":
      return drawCard(ctx, playerId, "communityChest", diceTotal);
  }
}

export function sendToJail(ctx: Ctx, playerId: PlayerId): void {
  const { state } = ctx;
  const player = getPlayer(state, playerId);
  const jailIndex = state.economy.tiles.findIndex((t) => t.kind === "jail");
  player.position = jailIndex;
  player.inJail = true;
  player.jailAttempts = 0;
  if (state.turn.playerId === playerId) {
    // Going to jail ends the turn's movement; the player can only end the turn.
    state.turn.hasRolled = true;
    state.turn.rollAgain = false;
  }
  ctx.emit({ type: "sentToJail", playerId });
}

/** Passes the turn to the next non-bankrupt player in order and emits `turnStarted`. */
export function startNextTurn(ctx: Ctx): void {
  const { state } = ctx;
  const count = state.players.length;
  const current = Math.max(
    0,
    state.players.findIndex((p) => p.id === state.turn.playerId),
  );
  // The loop reaches `current` itself last, so a lone survivor keeps the turn.
  for (let step = 1; step <= count; step++) {
    const next = state.players[(current + step) % count];
    if (!next || next.bankrupt) continue;
    state.turn = { playerId: next.id, hasRolled: false, doublesCount: 0, rollAgain: false, lastRoll: null };
    ctx.emit({ type: "turnStarted", playerId: next.id });
    return;
  }
}
