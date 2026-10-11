import { useState } from "react";
import { GameButton, Panel } from "../../ui";
import { money } from "./format";
import { computeLegal } from "./legal";
import type { GameCtx } from "./types";

/** Shown to a debtor: pay up (after selling or mortgaging) or declare bankruptcy. */
export function DebtPanel({ ctx, onManage }: { ctx: GameCtx; onManage: () => void }) {
  const { me, names, view, act } = ctx;
  const { myDebt, canPayDebt } = computeLegal(ctx);
  const [confirming, setConfirming] = useState(false);
  if (!myDebt || !me) return null;
  const count = view.debts.filter((d) => d.debtor === me.id).length;

  return (
    <Panel className="space-y-3 border-berry-dark bg-berry/10">
      <h2 className="text-xl font-bold">You owe {money(myDebt.amount)}</h2>
      <p>
        To {names.party(myDebt.creditor)}: {myDebt.reason}
        {count > 1 && <span className="block text-sm opacity-70">{count} debts outstanding</span>}
      </p>
      <p className="text-sm">
        You have {money(me.cash)}. {!canPayDebt && "Sell buildings or mortgage properties to raise the rest."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <GameButton variant="go" disabled={!canPayDebt} onClick={() => act({ type: "payDebt" })}>
          Pay
        </GameButton>
        <GameButton variant="ghost" onClick={onManage}>
          Manage
        </GameButton>
      </div>
      <GameButton
        variant="danger"
        className="w-full"
        onClick={() => {
          if (confirming) act({ type: "declareBankruptcy" });
          else setConfirming(true);
        }}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? "Tap again to confirm" : "Declare bankruptcy"}
      </GameButton>
    </Panel>
  );
}
