import { GamePhase, MIN_PLAYERS } from "@rollbiz/shared";
import { useRoomState } from "../hooks/useRoomState";
import { sendMessage, type GameRoom } from "../lib/colyseus";
import { Die, GameButton, Panel } from "../ui";

export function RoomScreen({ room }: { room: GameRoom }) {
  const state = useRoomState(room);
  const players = Object.entries(state.players);
  const me = state.players[room.sessionId];
  const myTurn = state.currentTurn === room.sessionId;
  const turnName = state.players[state.currentTurn]?.name ?? "...";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-70">Room code</p>
          <p className="font-mono text-xl font-bold select-text">{room.roomId}</p>
        </div>
        <button className="text-sm font-medium underline" onClick={() => room.leave()}>
          Leave
        </button>
      </header>

      <Panel>
        <h2 className="mb-3 text-xl font-bold">Players</h2>
        <ul className="space-y-2">
          {players.map(([sessionId, p]) => (
            <li
              key={sessionId}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 ${
                sessionId === state.currentTurn && state.phase === GamePhase.Playing ? "bg-sun/40" : "bg-cream"
              } ${p.connected ? "" : "opacity-50"}`}
            >
              <span className="font-semibold">
                {p.name}
                {sessionId === room.sessionId && " (you)"}
              </span>
              {state.phase === GamePhase.Lobby ? (
                <span className={p.ready ? "text-go-dark" : "opacity-60"}>{p.ready ? "Ready" : "Waiting"}</span>
              ) : (
                <span className="text-sm tabular-nums">
                  Tile {p.position} · ${p.cash}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {state.phase === GamePhase.Lobby && (
        <Panel className="space-y-3 text-center">
          <p>
            {players.length < MIN_PLAYERS
              ? `Need at least ${MIN_PLAYERS} players. Share the code!`
              : "Game starts when everyone is ready."}
          </p>
          <GameButton variant={me?.ready ? "ghost" : "go"} className="w-full" onClick={() => sendMessage(room, "ready")}>
            {me?.ready ? "Not ready" : "I'm ready!"}
          </GameButton>
        </Panel>
      )}

      {state.phase === GamePhase.Playing && (
        <Panel className="space-y-4 text-center">
          <p className="text-xl font-bold">{myTurn ? "Your turn!" : `${turnName}'s turn`}</p>
          <div className="flex justify-center gap-3">
            {state.lastRoll.length > 0 ? (
              state.lastRoll.map((v, i) => <Die key={i} value={v} />)
            ) : (
              <p className="opacity-60">No roll yet</p>
            )}
          </div>
          {myTurn && (
            <div className="grid grid-cols-2 gap-3">
              <GameButton variant="sun" onClick={() => sendMessage(room, "roll")}>
                Roll
              </GameButton>
              <GameButton variant="ghost" onClick={() => sendMessage(room, "endTurn")}>
                End turn
              </GameButton>
            </div>
          )}
        </Panel>
      )}

      {state.phase === GamePhase.Finished && (
        <Panel className="text-center text-xl font-bold">Game over!</Panel>
      )}
    </div>
  );
}
