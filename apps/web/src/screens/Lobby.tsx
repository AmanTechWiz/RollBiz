import type { Session } from "@supabase/supabase-js";
import { motion } from "motion/react";
import { useState } from "react";
import { ROOM_CODE_PATTERN, joinByCode, quickPlay, type GameRoom } from "../lib/colyseus";
import { signOut } from "../lib/supabase";
import { Backdrop, GameButton } from "../ui";

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#fff" />
      {[[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="#14924d" />
      ))}
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <circle cx="8" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12.5 12H21m-3 0v3.5m-3-3.5v2.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  session: Session;
  onJoined: (room: GameRoom) => void;
};

/**
 * Home screen: a top bar, the RollBiz logo, then Play now and Join with code.
 * The hero flexes with the viewport; on short screens it gives up space before the buttons do.
 */
export function Lobby({ session, onJoined }: Props) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState<"play" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function run(kind: "play" | "join", join: () => Promise<GameRoom>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      onJoined(await join());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the room");
      setBusy(null);
    }
  }

  const meta = session.user.user_metadata as Record<string, unknown>;
  const name = (meta.full_name as string | undefined) ?? session.user.email ?? "Player";
  const avatar = meta.avatar_url as string | undefined;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <Backdrop />

      <header className="flex items-center gap-3 rounded-full border border-line-dark bg-surface/80 py-1.5 pr-1.5 pl-1.5">
        {avatar ? (
          <img src={avatar} alt="" className="size-10 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-lg font-bold text-page">{name[0]}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{name}</span>
        <div className="relative">
          <button
            type="button"
            aria-label="Settings"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink transition hover:brightness-125 active:scale-95"
          >
            <GearIcon />
          </button>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute top-full right-0 z-20 mt-2 min-w-40 overflow-hidden rounded-2xl border border-line-dark bg-surface-2 py-1 shadow-xl"
            >
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  location.assign("/"); // back to the title screen
                }}
                className="w-full px-4 py-3 text-left font-semibold text-[#ff9aa9] hover:bg-white/5"
              >
                Sign out
              </button>
            </motion.div>
          )}
        </div>
      </header>

      {/* Hero: the logo. It carries its size so nothing shifts while loading. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-4">
        <motion.img
          src="/logo.webp"
          width={1200}
          height={600}
          alt="RollBiz"
          draggable={false}
          initial={{ opacity: 0, scale: 0.85, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="h-auto max-h-[34dvh] w-full max-w-[26rem] object-contain drop-shadow-[0_12px_16px_rgb(0_0_0_/_0.45)]"
        />
      </div>

      <div className="flex flex-col gap-3 pb-1">
        <GameButton variant="go" icon={<DiceIcon />} className="w-full py-4 text-xl" disabled={busy !== null} onClick={() => run("play", () => quickPlay(session))}>
          {busy === "play" ? "Finding a game…" : "Play now"}
        </GameButton>
        <GameButton variant="surface" icon={<KeyIcon />} className="w-full" disabled={busy !== null} onClick={() => setJoining((v) => !v)} aria-expanded={joining}>
          Join with code
        </GameButton>

        {joining && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 rounded-full border border-line-dark bg-surface p-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ROOM_CODE_PATTERN.test(code)) run("join", () => joinByCode(session, code));
            }}
          >
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6))}
              maxLength={6}
              placeholder="4821KQ"
              aria-label="Room code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-full bg-page px-5 font-mono text-lg tracking-[0.2em] text-ink uppercase placeholder:text-ink-2/50 outline-none focus:ring-2 focus:ring-accent"
            />
            <GameButton type="submit" className="px-5 py-2.5" disabled={busy !== null || !ROOM_CODE_PATTERN.test(code)}>
              {busy === "join" ? "Joining…" : "Join"}
            </GameButton>
          </motion.form>
        )}

        {error && (
          <p role="alert" className="text-center text-sm font-medium text-[#ff8a9c]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
