import { Panel } from "../../ui";
import { GROUP_BG, KIND_BG, money, playerBg } from "./format";
import type { GameCtx } from "./types";

const KIND_LABEL: Record<string, string> = {
  start: "Start",
  jail: "Jail / Just visiting",
  restHouse: "Rest House",
  club: "Club",
  incomeTax: "Income tax",
  wealthTax: "Wealth tax",
  chance: "Chance",
  communityChest: "Community Chest",
};

/** All 40 tiles in board order with owner, buildings, mortgage state and who is standing there. */
export function BoardList({ ctx }: { ctx: GameCtx }) {
  const { view, economy } = ctx;

  return (
    <Panel className="space-y-2">
      <h2 className="text-xl font-bold">Board</h2>
      <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
        {economy.tiles.map((tile, index) => {
          const prop = economy.properties[tile.id];
          const state = view.properties[tile.id];
          const standing = view.players.filter((p) => !p.bankrupt && p.position === index);
          const ownerName = state?.owner ? ctx.names.party(state.owner) : null;
          const color = (tile.group && GROUP_BG[tile.group]) || KIND_BG[tile.kind] || "bg-brand-ink/25";
          const here = standing.some((p) => p.id === view.turn.playerId) && view.status === "playing";

          return (
            <li
              key={tile.id}
              className={`flex overflow-hidden rounded-xl border-2 border-brand-ink ${here ? "bg-sun/40" : "bg-white"}`}
            >
              <span className={`w-3 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1 px-2 py-1">
                <p className={`truncate text-sm font-semibold ${state?.mortgaged ? "line-through opacity-60" : ""}`}>
                  <span className="mr-1 tabular-nums opacity-50">{index}</span>
                  {tile.name}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs">
                  {!prop && <span className="opacity-60">{KIND_LABEL[tile.kind] ?? tile.kind}</span>}
                  {prop && !state?.owner && <span className="opacity-60">For sale {money(prop.price)}</span>}
                  {state?.owner && (
                    <span className="flex items-center gap-1">
                      <span className={`size-2.5 rounded-full ${playerBg(view, state.owner)}`} />
                      {ownerName}
                    </span>
                  )}
                  {state?.hotel && <span className="font-bold text-berry-dark">Hotel</span>}
                  {state && !state.hotel && state.houses > 0 && (
                    <span className="font-bold">
                      {state.houses} house{state.houses > 1 ? "s" : ""}
                    </span>
                  )}
                  {state?.mortgaged && <span className="font-bold text-berry-dark">Mortgaged</span>}
                </p>
              </div>
              {standing.length > 0 && (
                <div className="flex items-center gap-1 pr-2">
                  {standing.map((p) => (
                    <span
                      key={p.id}
                      title={p.name}
                      className={`flex size-6 items-center justify-center rounded-full text-xs font-bold text-white ${playerBg(view, p.id)}`}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
