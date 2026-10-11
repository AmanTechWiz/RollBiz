import type { LogEntry } from "../../hooks/useRoomState";
import { Panel } from "../../ui";
import { describeEvent } from "./format";
import type { GameCtx } from "./types";

const SHOWN = 8;

/** The most recent events, newest first. */
export function ActivityLog({ ctx, log }: { ctx: GameCtx; log: LogEntry[] }) {
  const lines = log
    .slice(-SHOWN)
    .reverse()
    .flatMap((entry) => {
      const text = describeEvent(entry.event, ctx.names);
      return text ? [{ id: entry.id, text }] : [];
    });

  return (
    <Panel className="space-y-2">
      <h2 className="text-xl font-bold">Activity</h2>
      {lines.length === 0 ? (
        <p className="text-sm opacity-70">Nothing yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {lines.map((l, i) => (
            <li key={l.id} className={i === 0 ? "font-semibold" : "opacity-70"}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
