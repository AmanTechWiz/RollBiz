import { useState } from "react";
import { signInWithGoogle } from "../lib/supabase";
import { GameButton, Panel } from "../ui";

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
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <h1 className="text-6xl font-bold text-brand drop-shadow-[0_4px_0_var(--color-brand-ink)]">
        RollBiz
      </h1>
      <Panel className="w-full max-w-sm space-y-4 text-center">
        <p className="text-lg">Roll the dice. Build your empire.</p>
        <GameButton className="w-full" onClick={onSignIn} disabled={busy}>
          {busy ? "Opening Google..." : "Sign in with Google"}
        </GameButton>
        {error && <p className="text-sm font-medium text-berry-dark">{error}</p>}
      </Panel>
    </div>
  );
}
