import { Panel } from "../../ui";
import { money, playerBg } from "./format";
import type { GameCtx } from "./types";
import type { LobbyPlayer } from "../../lib/colyseus";

/** Everyone's cash, jail state and cards. */
export function PlayersPanel({ ctx, lobbyPlayers }: { ctx: GameCtx; lobbyPlayers: LobbyPlayer[] }) {
  const { view, economy, meId } = ctx;
  const connected = new Map(lobbyPlayers.map((p) => [p.id, p.connected]));
  const propertyCount = (id: string) => Object.values(view.properties).filter((p) => p.owner === id).length;

  return (
    <Panel className="space-y-2">
      <h2 className="text-xl font-bold">Players</h2>
      <ul className="space-y-2">
        {view.players.map((p) => {
          const active = view.status === "playing" && view.turn.playerId === p.id && !p.bankrupt;
          return (
            <li
              key={p.id}
              className={`rounded-2xl px-3 py-2 ${active ? "bg-sun/40" : "bg-cream"} ${
                p.bankrupt || connected.get(p.id) === false ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`size-4 shrink-0 rounded-full ${playerBg(view, p.id)}`} />
                <span className={`min-w-0 flex-1 truncate font-semibold ${p.bankrupt ? "line-through" : ""}`}>
                  {p.name}
                  {p.id === meId && " (you)"}
                </span>
                <span className="font-bold tabular-nums">{money(p.cash)}</span>
              </div>
              <p className="pl-6 text-xs">
                {p.bankrupt
                  ? "Bankrupt"
                  : [
                      `${propertyCount(p.id)} properties`,
                      p.inJail && `In jail (${p.jailAttempts}/${economy.rules.maxJailAttempts})`,
                      p.jailFreeCards.length > 0 && `${p.jailFreeCards.length} jail-free card${p.jailFreeCards.length > 1 ? "s" : ""}`,
                      connected.get(p.id) === false && "Disconnected",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs opacity-70">
        Bank: {money(view.bank.cash)} · {view.bank.houses} houses · {view.bank.hotels} hotels
      </p>
    </Panel>
  );
}
