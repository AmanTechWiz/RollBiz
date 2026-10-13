import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./hooks/useSession";
import { forgetRoom, rememberRoom, resumeRoom, type GameRoom } from "./lib/colyseus";
import { Lobby } from "./screens/Lobby";
import { RoomScreen } from "./screens/Room";
import { SignIn } from "./screens/SignIn";

export function App() {
  const { session, loading } = useSession();
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [resuming, setResuming] = useState(true);
  const triedResume = useRef(false);

  // After a reload, take the previous seat back once the session is known.
  useEffect(() => {
    if (loading || triedResume.current) return;
    triedResume.current = true;
    if (!session) {
      forgetRoom();
      setResuming(false);
      return;
    }
    resumeRoom()
      .then((resumed) => resumed && setRoom(resumed))
      .finally(() => setResuming(false));
  }, [loading, session]);

  // Keep the reconnection token fresh; return to the lobby when we leave or get kicked.
  useEffect(() => {
    if (!room) return;
    rememberRoom(room);
    const onReconnect = () => rememberRoom(room);
    const onLeave = () => {
      forgetRoom();
      setRoom(null);
    };
    room.onReconnect(onReconnect);
    room.onLeave(onLeave);
    return () => {
      room.onReconnect.remove(onReconnect);
      room.onLeave.remove(onLeave);
    };
  }, [room]);

  // Signing out also drops any active room.
  useEffect(() => {
    if (!session && room) room.leave();
  }, [session, room]);

  // Dev-only: open /?preview to see the signed-in home screen without Google sign-in.
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has("preview");
  const fake = { user: { id: "preview", email: "you@example.com", user_metadata: { full_name: "Aman Kumar" } } } as unknown as Session;

  let screen;
  if (preview) screen = <Lobby session={fake} onJoined={() => {}} />;
  else if (loading || resuming) screen = <p className="m-auto text-xl font-semibold">Loading...</p>;
  else if (!session) screen = <SignIn />;
  else if (room) screen = <RoomScreen room={room} session={session} />;
  else screen = <Lobby session={session} onJoined={setRoom} />;

  return <main className="app-shell flex flex-col">{screen}</main>;
}
