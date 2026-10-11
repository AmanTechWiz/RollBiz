import type { TradeBundle, TradeOffer } from "@rollbiz/engine";
import { GameButton, Panel } from "../../ui";
import { money } from "./format";
import { MiniButton } from "./MiniButton";
import type { GameCtx } from "./types";

export function describeBundle(ctx: GameCtx, bundle: TradeBundle): string {
  const parts = [
    bundle.cash > 0 && money(bundle.cash),
    ...bundle.properties.map((id) => ctx.names.tile(id)),
    ...bundle.jailFreeCards.map((id) => ctx.economy.cards[id]?.title ?? "Jail-free card"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

/** Trade offers that involve me: incoming (Accept / Reject) and outgoing (Cancel). */
export function TradeOffers({ ctx }: { ctx: GameCtx }) {
  const { view, meId, names } = ctx;
  const mine = view.trades.filter((t) => t.to === meId || t.from === meId);
  if (mine.length === 0) return null;

  return (
    <Panel className="space-y-3">
      <h2 className="text-xl font-bold">Trade offers</h2>
      {mine.map((t) => (
        <Offer key={t.id} ctx={ctx} offer={t} incoming={t.to === meId} name={names.party(t.to === meId ? t.from : t.to)} />
      ))}
    </Panel>
  );
}

function Offer({ ctx, offer, incoming, name }: { ctx: GameCtx; offer: TradeOffer; incoming: boolean; name: string }) {
  const { act } = ctx;
  return (
    <div className="space-y-2 rounded-2xl bg-cream p-3 text-sm">
      <p className="font-semibold">{incoming ? `${name} offers you a trade` : `Your offer to ${name}`}</p>
      <p>
        <span className="font-semibold">{incoming ? "You get" : "You give"}:</span>{" "}
        {describeBundle(ctx, offer.give)}
      </p>
      <p>
        <span className="font-semibold">{incoming ? "You give" : "You get"}:</span>{" "}
        {describeBundle(ctx, offer.get)}
      </p>
      {incoming ? (
        <div className="grid grid-cols-2 gap-2">
          <GameButton variant="go" onClick={() => act({ type: "acceptTrade", tradeId: offer.id })}>
            Accept
          </GameButton>
          <GameButton variant="ghost" onClick={() => act({ type: "rejectTrade", tradeId: offer.id })}>
            Reject
          </GameButton>
        </div>
      ) : (
        <MiniButton onClick={() => act({ type: "cancelTrade", tradeId: offer.id })}>Cancel offer</MiniButton>
      )}
    </div>
  );
}
