import type { Ctx } from "../core/context";
import { RuleError } from "../core/context";
import { pay } from "../core/money";
import { activePlayers, getPlayer, getProperty } from "../core/state";
import type { Auction, PlayerId, TileId } from "../types";

/** Opens an auction among all active players for an unowned property. */
export function startAuction(ctx: Ctx, tileId: TileId): void {
  const { state } = ctx;
  getProperty(state, tileId);
  state.pending = {
    kind: "auction",
    auction: { tileId, highBid: 0, highBidder: null, bidders: activePlayers(state).map((p) => p.id) },
  };
  ctx.emit({ type: "auctionStarted", tileId });
}

function requireAuction(ctx: Ctx, playerId: PlayerId): Auction {
  const { pending } = ctx.state;
  if (pending?.kind !== "auction") throw new RuleError("there is no open auction");
  if (!pending.auction.bidders.includes(playerId)) throw new RuleError("you are not in this auction");
  return pending.auction;
}

export function handleBid(ctx: Ctx, playerId: PlayerId, amount: number): void {
  const auction = requireAuction(ctx, playerId);
  const increment = ctx.state.economy.rules.minBidIncrement;
  const minimum = auction.highBidder === null ? increment : auction.highBid + increment;
  if (amount < minimum) throw new RuleError(`bid at least ₹${minimum}`);
  if (amount > getPlayer(ctx.state, playerId).cash) throw new RuleError("not enough cash");
  auction.highBid = amount;
  auction.highBidder = playerId;
  ctx.emit({ type: "bid", playerId, amount });
  finishIfDone(ctx, auction);
}

export function handlePassAuction(ctx: Ctx, playerId: PlayerId): void {
  const auction = requireAuction(ctx, playerId);
  if (auction.highBidder === playerId) throw new RuleError("the high bidder cannot pass");
  auction.bidders = auction.bidders.filter((id) => id !== playerId);
  ctx.emit({ type: "auctionPassed", playerId });
  finishIfDone(ctx, auction);
}

/** Removes a bankrupt/forfeiting player from an open auction, finishing it if needed. */
export function removeFromAuction(ctx: Ctx, playerId: PlayerId): void {
  const { pending } = ctx.state;
  if (pending?.kind !== "auction") return;
  const auction = pending.auction;
  if (!auction.bidders.includes(playerId)) return;
  if (auction.highBidder === playerId) {
    // Prior bids aren't tracked, so the voided bid resets the auction.
    auction.highBid = 0;
    auction.highBidder = null;
  }
  auction.bidders = auction.bidders.filter((id) => id !== playerId);
  finishIfDone(ctx, auction);
}

/** Ends the auction when nobody is left, or the only bidder left holds the high bid. */
function finishIfDone(ctx: Ctx, auction: Auction): void {
  const { state } = ctx;
  const done =
    auction.bidders.length === 0 ||
    (auction.bidders.length === 1 && auction.highBidder === auction.bidders[0]);
  if (!done) return;

  state.pending = null;
  const winnerId = auction.highBidder;
  if (winnerId !== null) {
    const { def, state: prop } = getProperty(state, auction.tileId);
    // Cash was checked when the bid was placed, so this does not create a debt.
    pay(ctx, winnerId, "bank", auction.highBid, `won auction: ${def.name}`);
    prop.owner = winnerId;
  }
  ctx.emit({ type: "auctionEnded", tileId: auction.tileId, winnerId, amount: winnerId === null ? 0 : auction.highBid });
}
