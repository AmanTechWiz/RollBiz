import { useEffect, useState } from "react";
import { useSession } from "./hooks/useSession";
import type { GameRoom } from "./lib/colyseus";
import { Lobby } from "./screens/Lobby";
import { RoomScreen } from "./screens/Room";
import { SignIn } from "./screens/SignIn";

export function App() {
  const { session, loading } = useSession();
  const [room, setRoom] = useState<GameRoom | null>(null);

  // Return to the lobby whenever we leave or get kicked from the room.
  useEffect(() => {
    if (!room) return;
    const onLeave = () => setRoom(null);
    room.onLeave(onLeave);
    return () => room.onLeave.remove(onLeave);
  }, [room]);

  // Signing out also drops any active room.
  useEffect(() => {
    if (!session && room) room.leave();
  }, [session, room]);

  let screen;
  if (loading) screen = <p className="m-auto text-xl font-semibold">Loading...</p>;
  else if (!session) screen = <SignIn />;
  else if (room) screen = <RoomScreen room={room} />;
  else screen = <Lobby session={session} onJoined={setRoom} />;

  return <main className="app-shell flex flex-col">{screen}</main>;
}
