import { useEffect, useState } from "react";
import { snapshot, type GameRoom, type GameView } from "../lib/colyseus";

/**
 * Re-renders on every state patch with a plain snapshot of room.state.
 * Fine for a small board game; switch to `Callbacks.get(room)` (from @colyseus/sdk)
 * if fine-grained listeners or animations per field are needed later.
 */
export function useRoomState(room: GameRoom): GameView {
  const [view, setView] = useState(() => snapshot(room.state));

  useEffect(() => {
    const onChange = (state: unknown) => setView(snapshot(state));
    room.onStateChange(onChange);
    setView(snapshot(room.state));
    return () => room.onStateChange.remove(onChange);
  }, [room]);

  return view;
}
