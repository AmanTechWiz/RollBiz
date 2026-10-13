import type { GroupId, ResolvedProperty } from "@rollbiz/engine";
import { GROUP_BG, KIND_BG, money } from "./format";
import { groupAnyMortgaged, groupHasBuildings, groupLevels, level, ownsWholeGroup } from "./legal";
import { MiniButton } from "./MiniButton";
import { Sheet } from "./Sheet";
import type { GameCtx } from "./types";

/** Build, sell, mortgage and unmortgage for the player's own properties. */
export function ManageSheet({ ctx, onClose }: { ctx: GameCtx; onClose: () => void }) {
  const { view, economy, me, act } = ctx;
  const mine = economy.tiles.flatMap((t) => {
    const prop = economy.properties[t.id];
    return prop && view.properties[t.id]?.owner === ctx.meId ? [prop] : [];
  });
  const sellGroups: GroupId[] = [];
  for (const p of mine) {
    if (p.kind === "city" && !sellGroups.includes(p.group) && groupHasBuildings(ctx, p.group)) sellGroups.push(p.group);
  }

  return (
    <Sheet title="Manage properties" onClose={onClose}>
      {mine.length === 0 && <p className="py-4 text-center opacity-70">You don't own any properties yet.</p>}
      <p className="text-sm opacity-70">
        Cash {money(me?.cash ?? 0)} · Bank has {view.bank.houses} houses, {view.bank.hotels} hotels
      </p>
      <ul className="space-y-2">
        {mine.map((prop) => (
          <PropertyRow key={prop.id} ctx={ctx} prop={prop} />
        ))}
      </ul>
      {sellGroups.length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-line bg-white p-3">
          <p className="font-semibold">Sell all buildings in a colour group</p>
          <p className="text-xs opacity-70">Always works, even if the bank is short on houses.</p>
          <div className="flex flex-wrap gap-2">
            {sellGroups.map((g) => (
              <MiniButton key={g} tone="danger" onClick={() => act({ type: "sellGroupBuildings", group: g })}>
                <span className={`mr-2 inline-block size-3 rounded-full border border-white ${GROUP_BG[g]}`} />
                Sell {economy.groups[g].name}
              </MiniButton>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function PropertyRow({ ctx, prop }: { ctx: GameCtx; prop: ResolvedProperty }) {
  const { view, economy, me, act } = ctx;
  const state = view.properties[prop.id];
  const cash = me?.cash ?? 0;
  if (!state) return null;

  const city = prop.kind === "city" ? prop : null;
  const color = city ? GROUP_BG[city.group] : (KIND_BG[prop.kind] ?? "bg-brand-ink/25");

  let build: { label: string; cost: number; ok: boolean } | null = null;
  let sell: { refund: number; ok: boolean } | null = null;
  if (city) {
    const levels = groupLevels(ctx, city.group);
    const mine = level(state);
    const upgrading = state.houses === 3 && !state.hotel;
    const cost = upgrading ? city.hotelCost : city.houseCost;
    const stock = upgrading ? view.bank.hotels : view.bank.houses;
    const eligible =
      ownsWholeGroup(ctx, city.group) && !groupAnyMortgaged(ctx, city.group) && !state.hotel && mine === Math.min(...levels);
    build = { label: upgrading ? "Hotel" : "House", cost, ok: eligible && stock > 0 && cash >= cost };

    const sellCost = state.hotel ? city.hotelCost : city.houseCost;
    sell = {
      refund: Math.floor(sellCost * economy.rules.buildingRefundRate),
      // Selling a hotel returns three houses to the bank, which must have them.
      ok: mine > 0 && mine === Math.max(...levels) && (!state.hotel || view.bank.houses >= 3),
    };
  }

  const canMortgage = !state.mortgaged && !(city && groupHasBuildings(ctx, city.group));
  const canUnmortgage = state.mortgaged && cash >= prop.unmortgageCost;

  return (
    <li className="overflow-hidden rounded-2xl border-2 border-line bg-white">
      <div className="flex">
        <span className={`w-3 shrink-0 ${color}`} />
        <div className="min-w-0 flex-1 space-y-2 p-2">
          <p className="font-semibold">
            {prop.name}
            <span className="ml-2 text-xs font-medium opacity-70">
              {state.hotel ? "Hotel" : state.houses > 0 ? `${state.houses} house${state.houses > 1 ? "s" : ""}` : ""}
              {state.mortgaged ? "Mortgaged" : ""}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {build && (
              <MiniButton disabled={!build.ok} onClick={() => act({ type: "build", tileId: prop.id })}>
                Build {build.label} {money(build.cost)}
              </MiniButton>
            )}
            {sell && (state.houses > 0 || state.hotel) && (
              <MiniButton disabled={!sell.ok} onClick={() => act({ type: "sellBuilding", tileId: prop.id })}>
                Sell +{money(sell.refund)}
              </MiniButton>
            )}
            {state.mortgaged ? (
              <MiniButton tone="go" disabled={!canUnmortgage} onClick={() => act({ type: "unmortgage", tileId: prop.id })}>
                Unmortgage {money(prop.unmortgageCost)}
              </MiniButton>
            ) : (
              <MiniButton disabled={!canMortgage} onClick={() => act({ type: "mortgage", tileId: prop.id })}>
                Mortgage +{money(prop.mortgage)}
              </MiniButton>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
