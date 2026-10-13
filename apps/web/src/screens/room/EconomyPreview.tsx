import { useMemo } from "react";
import { resolveEconomy, type GroupId, type ResolvedEconomy, type RoomSettings } from "@rollbiz/engine";
import { Panel } from "../../ui";
import { GROUP_BG, money } from "./format";

function range(values: number[]): string {
  if (values.length === 0) return "-";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? money(lo) : `${money(lo)} - ${money(hi)}`;
}

function resolve(settings: RoomSettings): { economy: ResolvedEconomy } | { error: string } {
  try {
    return { economy: resolveEconomy(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 160) : "Unknown error" };
  }
}

/** Live preview of what the current settings resolve to. Runs the engine locally. */
export function EconomyPreview({ settings }: { settings: RoomSettings }) {
  const result = useMemo(() => resolve(settings), [settings]);

  return (
    <Panel className="space-y-3">
      <h2 className="text-xl font-bold">Preview</h2>
      {"error" in result ? (
        <p role="status" className="rounded-xl bg-berry/15 p-3 text-sm font-medium">
          Preview unavailable: {result.error}
        </p>
      ) : (
        <PreviewBody economy={result.economy} />
      )}
    </Panel>
  );
}

function PreviewBody({ economy }: { economy: ResolvedEconomy }) {
  const groups = Object.values(economy.groups);
  const cities = (g: GroupId) =>
    economy.groups[g].propertyIds.flatMap((id) => {
      const p = economy.properties[id];
      return p?.kind === "city" ? [p] : [];
    });
  const transports = Object.values(economy.properties).filter((p) => p.kind === "transport");
  const utilities = Object.values(economy.properties).filter((p) => p.kind === "utility");
  const [oneUtility, bothUtilities] = economy.rules.utilityMultipliers;

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Starting money" value={money(economy.startingMoney)} />
        <Stat label="Bank cash" value={money(economy.bank.cash)} />
        <Stat label="Bank houses" value={String(economy.bank.houses)} />
        <Stat label="Bank hotels" value={String(economy.bank.hotels)} />
      </dl>

      <ul className="space-y-2">
        {groups.map((g) => {
          const props = cities(g.id);
          return (
            <li key={g.id} className="overflow-hidden rounded-xl border-2 border-line bg-cream">
              <div className="flex items-center gap-2 px-2 py-1">
                <span className={`size-4 shrink-0 rounded-full border-2 border-line ${GROUP_BG[g.id]}`} />
                <span className="font-semibold">{g.name}</span>
                <span className="ml-auto tabular-nums">Build {money(g.houseCost)}</span>
              </div>
              <p className="px-2 pb-1 text-xs leading-5 tabular-nums">
                Price {range(props.map((p) => p.price))}
                <br />
                Rent {range(props.map((p) => p.rents[0]))} (hotel {range(props.map((p) => p.rents[4]))})
              </p>
            </li>
          );
        })}
        {transports.length > 0 && (
          <li className="rounded-xl border-2 border-line bg-cream px-2 py-1">
            <p className="font-semibold">Transports ({transports.length})</p>
            <p className="text-xs leading-5 tabular-nums">
              Price {range(transports.map((p) => p.price))}
              <br />
              Rent for 1-4 owned:{" "}
              {transports[0]?.kind === "transport" ? transports[0].rents.map(money).join(" / ") : "-"}
            </p>
          </li>
        )}
        {utilities.length > 0 && (
          <li className="rounded-xl border-2 border-line bg-cream px-2 py-1">
            <p className="font-semibold">Utilities ({utilities.length})</p>
            <p className="text-xs leading-5 tabular-nums">
              Price {range(utilities.map((p) => p.price))}
              <br />
              Rent: {oneUtility}x dice for one, {bothUtilities}x for both
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream px-3 py-2">
      <dt className="text-xs font-medium opacity-70">{label}</dt>
      <dd className="text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}
