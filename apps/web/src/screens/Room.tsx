import { useState } from "react";
import { GamePhase } from "@rollbiz/shared";
import type { Session } from "@supabase/supabase-js";
import { useRoomFeed, useRoomState } from "../hooks/useRoomState";
import { sendAction, type GameRoom } from "../lib/colyseus";
import { GameView } from "./room/GameView";
import { RoomSetup } from "./room/RoomSetup";
import { Toast } from "./room/Toast";

/** Copies the room code; shows "Copied" for a moment. */
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="self-center rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand-dark hover:bg-brand/20"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard needs https or localhost; the code stays selectable as a fallback
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function RoomScreen({ room, session }: { room: GameRoom; session: Session }) {
  const view = useRoomState(room);
  const { log, toast, dismissToast } = useRoomFeed(room);
  const meId = session.user.id;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">
      <header className="glass-card flex items-center justify-between rounded-full py-1.5 pr-1.5 pl-5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-muted">Room</span>
          <span className="font-mono text-lg font-bold tracking-wider select-text">{room.roomId}</span>
          <CopyCode code={room.roomId} />
        </div>
        <button className="rounded-full px-4 py-2 text-sm font-semibold text-berry-dark hover:bg-berry/10" onClick={() => room.leave()}>
          Leave
        </button>
      </header>

      {view.phase === GamePhase.Lobby ? (
        <RoomSetup room={room} view={view} />
      ) : (
        <GameView view={view} meId={meId} log={log} onLeave={() => room.leave()} act={(a, v) => sendAction(room, a, v)} />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
