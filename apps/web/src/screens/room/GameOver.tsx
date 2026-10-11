import { netWorth, type GameState } from "@rollbiz/engine";
import { GameButton, Panel } from "../../ui";
import { money } from "./format";
import type { GameCtx } from "./types";

/** Winner and final net worths. */
export function GameOver({ ctx, onLeave }: { ctx: GameCtx; onLeave: () => void }) {
  const { view, economy, meId, names } = ctx;
  // netWorth reads economy, players and properties; the private fields are not needed.
  const state = { ...view, economy, decks: { chance: [], communityChest: [] }, processedActionIds: [] } as unknown as GameState;
  const rows = view.players
    .map((p) => {
      let worth: number | null = null;
      try {
        worth = p.bankrupt ? 0 : netWorth(state, p.id);
      } catch {
        // Engine not available: show a dash instead of crashing the screen.
      }
      return { player: p, worth };
    })
    .sort((a, b) => (b.worth ?? -1) - (a.worth ?? -1));
  const winner = view.winnerId ? names.party(view.winnerId) : null;

  return (
    <Panel className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Game over!</h2>
        <p className="text-lg">
          {winner ? (view.winnerId === meId ? "You win!" : `${winner} wins`) : "No winner"}
        </p>
      </div>
      <ol className="space-y-2">
        {rows.map(({ player, worth }) => (
          <li
            key={player.id}
            className={`flex items-center justify-between rounded-2xl px-3 py-2 ${
              player.id === view.winnerId ? "bg-sun/40" : "bg-cream"
            }`}
          >
            <span className="font-semibold">
              {player.name}
              {player.id === meId && " (you)"}
              {player.bankrupt && " - bankrupt"}
            </span>
            <span className="font-bold tabular-nums">{worth === null ? "-" : money(worth)}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs opacity-70">Net worth: cash, property value and buildings.</p>
      <GameButton variant="primary" className="w-full" onClick={onLeave}>
        Back to lobby
      </GameButton>
    </Panel>
  );
}
