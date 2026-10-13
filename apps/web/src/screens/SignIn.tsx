import { motion } from "motion/react";
import { useState } from "react";
import { signInWithGoogle } from "../lib/supabase";
import { Backdrop, GameButton, Logo } from "../ui";

/** Title screen: big bouncy logo, a tagline, and one glossy "Start" button. */
export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    // On success the browser navigates away to Google.
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
      <Backdrop />
      <div className="flex flex-col items-center gap-4">
        <Logo size={68} />
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-lg font-medium text-muted"
        >
          Roll the dice. Build your empire across India.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.55, type: "spring", stiffness: 300, damping: 18 }}
        className="flex w-full max-w-xs flex-col gap-3"
      >
        <GameButton className="w-full py-4 text-xl" onClick={onSignIn} disabled={busy}>
          {busy ? "Opening Google…" : "Start with Google"}
        </GameButton>
        <p className="text-sm text-muted">2–4 players · play with friends on any phone</p>
        {error && <p className="text-sm font-medium text-berry-dark">{error}</p>}
      </motion.div>
    </div>
  );
}
