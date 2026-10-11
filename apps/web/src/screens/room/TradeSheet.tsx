import { useState } from "react";
import type { CardId, TileId } from "@rollbiz/engine";
import { GameButton } from "../../ui";
import { money } from "./format";
import { tradable } from "./legal";
import { MiniButton } from "./MiniButton";
import { Sheet } from "./Sheet";
import type { GameCtx } from "./types";

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Composer for a new trade offer with one other player. */
export function TradeSheet({ ctx, onClose }: { ctx: GameCtx; onClose: () => void }) {
  const { view, me, meId, economy, act } = ctx;
  const others = view.players.filter((p) => p.id !== meId && !p.bankrupt);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [giveCash, setGiveCash] = useState("");
  const [getCash, setGetCash] = useState("");
  const [giveProps, setGiveProps] = useState<TileId[]>([]);
  const [getProps, setGetProps] = useState<TileId[]>([]);
  const [giveCards, setGiveCards] = useState<CardId[]>([]);
  const [getCards, setGetCards] = useState<CardId[]>([]);

  const partner = view.players.find((p) => p.id === to);
  const giveAmount = Number(giveCash || 0);
  const getAmount = Number(getCash || 0);
  const empty =
    giveAmount + getAmount === 0 &&
    giveProps.length + getProps.length + giveCards.length + getCards.length === 0;
  const affordable = !!me && !!partner && giveAmount <= me.cash && getAmount <= partner.cash;
  const canSend = !!partner && !empty && affordable;

  function pickPartner(id: string) {
    setTo(id);
    setGetProps([]);
    setGetCards([]);
  }

  function send() {
    act({
      type: "proposeTrade",
      to,
      give: { cash: giveAmount, properties: giveProps, jailFreeCards: giveCards },
      get: { cash: getAmount, properties: getProps, jailFreeCards: getCards },
    });
    onClose();
  }

  if (!economy.rules.tradingEnabled) {
    return (
      <Sheet title="Trade" onClose={onClose}>
        <p className="py-4 text-center">Trading is turned off in this room.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Propose a trade" onClose={onClose}>
      {others.length === 0 ? (
        <p className="py-4 text-center">Nobody to trade with.</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="font-semibold">Trade with</p>
            <div className="flex flex-wrap gap-2">
              {others.map((p) => (
                <MiniButton
                  key={p.id}
                  className={p.id === to ? "bg-brand text-white" : ""}
                  aria-pressed={p.id === to}
                  onClick={() => pickPartner(p.id)}
                >
                  {p.name}
                </MiniButton>
              ))}
            </div>
          </div>

          <Side
            title="You give"
            cash={giveCash}
            setCash={setGiveCash}
            maxCash={me?.cash ?? 0}
            props={tradable(ctx, meId).map((p) => ({ id: p.id, name: p.name }))}
            selectedProps={giveProps}
            onToggleProp={(id) => setGiveProps((l) => toggle(l, id))}
            cards={me?.jailFreeCards ?? []}
            selectedCards={giveCards}
            onToggleCard={(id) => setGiveCards((l) => toggle(l, id))}
            cardTitle={(id) => economy.cards[id]?.title ?? "Jail-free card"}
          />
          <Side
            title={`You get from ${partner?.name ?? "..."}`}
            cash={getCash}
            setCash={setGetCash}
            maxCash={partner?.cash ?? 0}
            props={tradable(ctx, to).map((p) => ({ id: p.id, name: p.name }))}
            selectedProps={getProps}
            onToggleProp={(id) => setGetProps((l) => toggle(l, id))}
            cards={partner?.jailFreeCards ?? []}
            selectedCards={getCards}
            onToggleCard={(id) => setGetCards((l) => toggle(l, id))}
            cardTitle={(id) => economy.cards[id]?.title ?? "Jail-free card"}
          />

          {!affordable && partner && <p className="text-sm font-medium text-berry-dark">Someone doesn't have that much cash.</p>}
          <GameButton variant="go" className="w-full" disabled={!canSend} onClick={send}>
            Send offer
          </GameButton>
        </>
      )}
    </Sheet>
  );
}

function Side(props: {
  title: string;
  cash: string;
  setCash: (v: string) => void;
  maxCash: number;
  props: { id: TileId; name: string }[];
  selectedProps: TileId[];
  onToggleProp: (id: TileId) => void;
  cards: CardId[];
  selectedCards: CardId[];
  onToggleCard: (id: CardId) => void;
  cardTitle: (id: CardId) => string;
}) {
  return (
    <div className="space-y-2 rounded-2xl border-2 border-brand-ink bg-white p-3">
      <p className="font-semibold">{props.title}</p>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">Cash (up to {money(props.maxCash)})</span>
        <input
          inputMode="numeric"
          placeholder="0"
          value={props.cash}
          onChange={(e) => props.setCash(e.target.value.replace(/[^\d]/g, ""))}
          className="min-h-11 w-28 rounded-xl border-2 border-brand-ink px-3 text-right tabular-nums"
        />
      </label>
      {props.props.length === 0 && props.cards.length === 0 && (
        <p className="text-sm opacity-70">No properties or cards available.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {props.props.map((p) => (
          <MiniButton
            key={p.id}
            aria-pressed={props.selectedProps.includes(p.id)}
            className={props.selectedProps.includes(p.id) ? "bg-brand text-white" : ""}
            onClick={() => props.onToggleProp(p.id)}
          >
            {p.name}
          </MiniButton>
        ))}
        {props.cards.map((id, i) => (
          <MiniButton
            key={`${id}-${i}`}
            aria-pressed={props.selectedCards.includes(id)}
            className={props.selectedCards.includes(id) ? "bg-brand text-white" : ""}
            onClick={() => props.onToggleCard(id)}
          >
            {props.cardTitle(id)}
          </MiniButton>
        ))}
      </div>
    </div>
  );
}
