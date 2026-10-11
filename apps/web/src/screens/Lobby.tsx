import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createPrivateRoom, joinByCode, quickPlay, type GameRoom } from "../lib/colyseus";
import { signOut } from "../lib/supabase";
import { GameButton, Panel } from "../ui";

type Props = {
  session: Session;
  onJoined: (room: GameRoom) => void;
};

export function Lobby({ session, onJoined }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(join: () => Promise<GameRoom>) {
    setBusy(true);
    setError(null);
    try {
      onJoined(await join());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room");
      setBusy(false);
    }
  }

  const name = (session.user.user_metadata.full_name as string | undefined) ?? session.user.email;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-brand">RollBiz</h1>
        <button className="text-sm font-medium underline" onClick={() => signOut()}>
          Sign out
        </button>
      </header>

      <p className="text-lg">Hi {name}!</p>

      <Panel className="space-y-3">
        <GameButton variant="go" className="w-full" disabled={busy} onClick={() => run(() => quickPlay(session))}>
          Quick Play
        </GameButton>
        <GameButton variant="sun" className="w-full" disabled={busy} onClick={() => run(() => createPrivateRoom(session))}>
          Create Room
        </GameButton>
      </Panel>

      <Panel>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) run(() => joinByCode(session, code));
          }}
        >
          <label className="block font-semibold" htmlFor="room-code">
            Join with a code
          </label>
          <input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Room code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-chunky border-4 border-brand-ink/20 px-4 py-3 text-lg outline-none focus:border-brand"
          />
          <GameButton type="submit" className="w-full" disabled={busy || !code.trim()}>
            Join
          </GameButton>
        </form>
      </Panel>

      {error && <p className="text-center font-medium text-berry-dark">{error}</p>}
    </div>
  );
}
