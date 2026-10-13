import { useEffect, useState } from "react";
import { GameButton, Panel } from "../../ui";
import { money } from "./format";
import type { GameCtx } from "./types";

/** Open-outcry auction: shown to everyone, actionable for remaining bidders. */
export function AuctionPanel({ ctx }: { ctx: GameCtx }) {
  const { view, economy, me, names, act } = ctx;
  const pending = view.pending;
  const auction = pending?.kind === "auction" ? pending.auction : null;
  const increment = economy.rules.minBidIncrement;
  const minBid = auction ? (auction.highBid > 0 ? auction.highBid + increment : increment) : 0;
  const [amount, setAmount] = useState(String(minBid));

  // Follow the minimum bid as others bid.
  useEffect(() => setAmount(String(minBid)), [minBid]);

  if (!auction) return null;
  const inAuction = !!me && auction.bidders.includes(me.id);
  const value = Number(amount);
  const valid = Number.isInteger(value) && value >= minBid && !!me && value <= me.cash;
  const tile = economy.properties[auction.tileId];

  return (
    <Panel className="space-y-3">
      <h2 className="text-xl font-bold">Auction: {names.tile(auction.tileId)}</h2>
      <p>
        {auction.highBidder
          ? `High bid ${money(auction.highBid)} by ${names.party(auction.highBidder)}`
          : "No bids yet"}
        {tile && <span className="block text-sm opacity-70">List price {money(tile.price)}</span>}
      </p>
      <p className="text-sm">In: {auction.bidders.map((id) => names.party(id)).join(", ") || "nobody"}</p>

      {inAuction ? (
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <span className="font-semibold">Your bid</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="min-h-11 w-full min-w-0 rounded-xl border-2 border-line bg-white px-3 text-right tabular-nums"
            />
          </label>
          <p className="text-sm opacity-70">Minimum {money(minBid)}.</p>
          <div className="grid grid-cols-2 gap-3">
            <GameButton variant="go" disabled={!valid} onClick={() => act({ type: "bid", amount: value })}>
              Bid
            </GameButton>
            <GameButton variant="ghost" onClick={() => act({ type: "passAuction" })}>
              Pass
            </GameButton>
          </div>
        </div>
      ) : (
        <p className="text-sm opacity-70">You are not in this auction.</p>
      )}
    </Panel>
  );
}
