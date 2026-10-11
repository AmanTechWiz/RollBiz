import { Die, GameButton, Panel } from "../../ui";
import { computeLegal } from "./legal";
import { money } from "./format";
import type { GameCtx } from "./types";

/** Whose turn it is, the dice, and the contextual roll / buy / jail / end-turn buttons. */
export function TurnPanel({ ctx }: { ctx: GameCtx }) {
  const { view, economy, me, names, act } = ctx;
  const legal = computeLegal(ctx);
  const { turn, pending } = view;
  const turnName = names.party(turn.playerId);
  const buyTile = pending?.kind === "buy" ? economy.properties[pending.tileId] : undefined;
  const debtors = [...new Set(view.debts.map((d) => names.party(d.debtor)))];

  const status = legal.myTurn ? "Your turn!" : `${turnName}'s turn`;

  return (
    <Panel className="space-y-4 text-center">
      <p className="text-xl font-bold">{status}</p>

      <div className="flex min-h-16 justify-center gap-3">
        {turn.lastRoll ? (
          turn.lastRoll.map((v, i) => <Die key={i} value={v} />)
        ) : (
          <p className="self-center opacity-60">No roll yet</p>
        )}
      </div>

      {buyTile && pending?.kind === "buy" && (
        <div className="space-y-3">
          <p className="font-semibold">
            {legal.myTurn ? "Buy" : `${turnName} may buy`} {names.tile(pending.tileId)} for {money(buyTile.price)}?
          </p>
          {legal.myTurn && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <GameButton variant="go" disabled={!legal.canBuy} onClick={() => act({ type: "buy" })}>
                  Buy
                </GameButton>
                <GameButton
                  variant="ghost"
                  disabled={!legal.canDecline}
                  onClick={() => act({ type: "declineBuy" })}
                >
                  {economy.rules.auctionsEnabled ? "Auction" : "Decline"}
                </GameButton>
              </div>
              {!legal.canBuy && me && <p className="text-sm opacity-70">Not enough cash to buy.</p>}
            </>
          )}
        </div>
      )}

      {legal.myTurn && me?.inJail && !pending && (
        <div className="space-y-3">
          <p className="font-semibold">
            In jail (failed attempts {me.jailAttempts}/{economy.rules.maxJailAttempts})
          </p>
          <div className="grid grid-cols-2 gap-3">
            <GameButton variant="sun" disabled={!legal.canPayFine} onClick={() => act({ type: "payJailFine" })}>
              Pay {money(economy.rules.jailFine)}
            </GameButton>
            <GameButton variant="primary" disabled={!legal.canUseCard} onClick={() => act({ type: "useJailCard" })}>
              Use card
            </GameButton>
          </div>
        </div>
      )}

      {legal.myTurn && !pending && (
        <div className="grid grid-cols-2 gap-3">
          <GameButton variant="sun" disabled={!legal.canRoll} onClick={() => act({ type: "roll" })}>
            {me?.inJail ? "Roll for doubles" : turn.rollAgain ? "Roll again" : "Roll"}
          </GameButton>
          <GameButton variant="ghost" disabled={!legal.canEndTurn} onClick={() => act({ type: "endTurn" })}>
            End turn
          </GameButton>
        </div>
      )}

      {!legal.myTurn && !pending && view.debts.length === 0 && <p className="text-sm opacity-70">Waiting for {turnName}...</p>}
      {debtors.length > 0 && (
        <p className="text-sm font-medium">Waiting for {debtors.join(", ")} to settle a debt.</p>
      )}
    </Panel>
  );
}
