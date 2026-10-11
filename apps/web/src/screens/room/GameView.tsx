import { useEffect, useMemo, useState } from "react";
import { sendAction, type ActionInput, type GameRoom, type RoomView } from "../../lib/colyseus";
import type { LogEntry } from "../../hooks/useRoomState";
import { GameButton } from "../../ui";
import { ActivityLog } from "./ActivityLog";
import { AuctionPanel } from "./AuctionPanel";
import { BoardList } from "./BoardList";
import { DebtPanel } from "./DebtPanel";
import { GameOver } from "./GameOver";
import { makeNames } from "./format";
import { computeLegal } from "./legal";
import { ManageSheet } from "./ManageSheet";
import { PlayersPanel } from "./PlayersPanel";
import { TradeOffers } from "./TradeOffers";
import { TradeSheet } from "./TradeSheet";
import { TurnPanel } from "./TurnPanel";
import type { GameCtx } from "./types";

type Props = { room: GameRoom; view: RoomView; meId: string; log: LogEntry[]; onLeave: () => void };

/** In-game screen. Renders nothing until both the economy and the game view have been read. */
export function GameView({ room, view, meId, log, onLeave }: Props) {
  const { game, economy } = view;
  const [sheet, setSheet] = useState<"manage" | "trade" | null>(null);

  const ctx = useMemo<GameCtx | null>(() => {
    if (!game || !economy) return null;
    return {
      view: game,
      economy,
      meId,
      me: game.players.find((p) => p.id === meId),
      names: makeNames(game, economy),
      act: (action: ActionInput) => sendAction(room, action, game.version),
    };
  }, [game, economy, meId, room]);

  const legal = ctx ? computeLegal(ctx) : null;
  if (!ctx || !legal) return <p className="m-auto text-lg font-semibold">Loading game...</p>;
  const { view: g } = ctx;
  const auction = g.pending?.kind === "auction";

  return (
    <>
      {g.status === "finished" && <GameOver ctx={ctx} onLeave={onLeave} />}
      {g.status === "playing" && !legal.alive && ctx.me?.bankrupt && (
        <p className="rounded-2xl bg-berry/15 p-3 text-center font-semibold">You are out of the game. You can keep watching.</p>
      )}
      {g.status === "playing" && <TurnPanel ctx={ctx} />}
      <DebtPanel ctx={ctx} onManage={() => setSheet("manage")} />
      {auction && <AuctionPanel ctx={ctx} />}
      <TradeOffers ctx={ctx} />

      {legal.canManage && (
        <div className="grid grid-cols-2 gap-3">
          <GameButton variant="ghost" onClick={() => setSheet("manage")}>
            Manage
          </GameButton>
          <GameButton variant="ghost" disabled={!legal.canTrade} onClick={() => setSheet("trade")}>
            Trade
          </GameButton>
        </div>
      )}

      <PlayersPanel ctx={ctx} lobbyPlayers={view.players} />
      <BoardList ctx={ctx} />
      <ActivityLog ctx={ctx} log={log} />
      {g.status === "playing" && g.endsAt !== null && <TimeLeft endsAt={g.endsAt} />}

      {legal.canManage && sheet === "manage" && <ManageSheet ctx={ctx} onClose={() => setSheet(null)} />}
      {legal.canManage && sheet === "trade" && <TradeSheet ctx={ctx} onClose={() => setSheet(null)} />}
    </>
  );
}

/** Countdown for timed games; ticks once a second and stops on unmount. */
function TimeLeft({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((endsAt - now) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return <p className="text-center text-sm font-medium opacity-70">Time left {mm}:{ss}</p>;
}
