import type { Ctx } from "../core/context";
import { pay, payEachOther } from "../core/money";
import { getPlayer } from "../core/state";
import type { Card, DeckId, PlayerId } from "../types";
import { countBuildings } from "./building";
import { movePlayer, resolveLanding } from "./turn";

const TRACK_LENGTH = 40;

/** Index of the first tile strictly ahead of `from` (wrapping) that satisfies `match`, or -1. */
function nextTileIndex(from: number, match: (index: number) => boolean): number {
  for (let step = 1; step < TRACK_LENGTH; step++) {
    const index = (from + step) % TRACK_LENGTH;
    if (match(index)) return index;
  }
  return -1;
}

/** Moves forward to `to` (paying the Start bonus if passed) and resolves the landing with the same dice total. */
function moveToAndResolve(ctx: Ctx, playerId: PlayerId, to: number, diceTotal: number): void {
  movePlayer(ctx, playerId, { to });
  resolveLanding(ctx, playerId, diceTotal);
}

function applyEffect(ctx: Ctx, playerId: PlayerId, card: Card, diceTotal: number): void {
  const { state } = ctx;
  const player = getPlayer(state, playerId);
  const { effect } = card;
  const reason = card.title;
  switch (effect.kind) {
    case "collect":
      pay(ctx, "bank", playerId, effect.amount, reason);
      return;
    case "pay":
      pay(ctx, playerId, "bank", effect.amount, reason);
      return;
    case "moveSteps":
      movePlayer(ctx, playerId, { steps: effect.steps });
      resolveLanding(ctx, playerId, diceTotal);
      return;
    case "moveToNearest": {
      const to = nextTileIndex(player.position, (i) => state.economy.tiles[i]?.kind === effect.tileKind);
      if (to >= 0) moveToAndResolve(ctx, playerId, to, diceTotal);
      return;
    }
    case "moveTo": {
      const to = state.economy.tiles.findIndex((t) => t.id === effect.tileId);
      if (to >= 0) moveToAndResolve(ctx, playerId, to, diceTotal);
      return;
    }
    case "moveToUnownedCity": {
      const to = nextTileIndex(player.position, (i) => {
        const tile = state.economy.tiles[i];
        return tile?.kind === "city" && state.properties[tile.id]?.owner === null;
      });
      if (to >= 0) moveToAndResolve(ctx, playerId, to, diceTotal);
      return;
    }
    case "payPerBuilding": {
      const { houses, hotels } = countBuildings(state, playerId);
      const due = Math.min(effect.cap, houses * effect.perHouse + hotels * effect.perHotel);
      pay(ctx, playerId, "bank", due, reason);
      return;
    }
    case "collectPerTransport": {
      const owned = state.economy.tiles.filter(
        (t) => t.kind === "transport" && state.properties[t.id]?.owner === playerId,
      ).length;
      pay(ctx, "bank", playerId, Math.min(effect.cap, owned * effect.perTransport), reason);
      return;
    }
    case "payEachPlayer":
      payEachOther(ctx, playerId, effect.amount, "pay", reason);
      return;
    case "collectFromEachPlayer":
      payEachOther(ctx, playerId, effect.amount, "collect", reason);
      return;
    case "jailFree":
      return; // kept by the player; handled in drawCard
  }
}

/**
 * Draws the top card of `deck`, emits `cardDrawn` and applies its effect.
 * The card goes to the bottom of the deck, except Get Out of Jail Free, which the player keeps.
 * A card that moves the player onto another card tile draws again through `resolveLanding`.
 */
export function drawCard(ctx: Ctx, playerId: PlayerId, deck: DeckId, diceTotal: number): void {
  const { state } = ctx;
  const pile = state.decks[deck];
  const cardId = pile.shift();
  if (cardId === undefined) return; // every card in this deck is disabled
  const card = state.economy.cards[cardId];
  if (!card) throw new Error(`unknown card ${cardId}`);

  ctx.emit({ type: "cardDrawn", playerId, cardId, title: card.title });
  if (card.effect.kind === "jailFree") {
    getPlayer(state, playerId).jailFreeCards.push(cardId);
    return;
  }
  // Back to the bottom before the effect runs, so a redraw sees a consistent deck.
  pile.push(cardId);
  applyEffect(ctx, playerId, card, diceTotal);
}
