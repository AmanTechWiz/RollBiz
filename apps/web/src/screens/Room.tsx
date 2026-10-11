import { GamePhase } from "@rollbiz/shared";
import type { Session } from "@supabase/supabase-js";
import { useRoomFeed, useRoomState } from "../hooks/useRoomState";
import type { GameRoom } from "../lib/colyseus";
import { GameView } from "./room/GameView";
import { RoomSetup } from "./room/RoomSetup";
import { Toast } from "./room/Toast";

export function RoomScreen({ room, session }: { room: GameRoom; session: Session }) {
  const view = useRoomState(room);
  const { log, toast, dismissToast } = useRoomFeed(room);
  const meId = session.user.id;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-70">Room code</p>
          <p className="font-mono text-xl font-bold select-text">{room.roomId}</p>
        </div>
        <button className="min-h-11 px-2 text-sm font-medium underline" onClick={() => room.leave()}>
          Leave
        </button>
      </header>

      {view.phase === GamePhase.Lobby ? (
        <RoomSetup room={room} view={view} />
      ) : (
        <GameView room={room} view={view} meId={meId} log={log} onLeave={() => room.leave()} />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
