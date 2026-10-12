import { BASE_TILES, type CardEffect } from "@rollbiz/engine";

/** Indian digit grouping: 1250000 -> "12,50,000". */
export function formatIndian(n: number): string {
  const sign = n < 0 ? "-" : "";
  const s = String(Math.round(Math.abs(n)));
  if (s.length <= 3) return sign + s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${head},${s.slice(-3)}`;
}

/** "₹2,000" with Indian grouping. */
export function rupees(n: number): string {
  return `₹${formatIndian(n)}`;
}

const TILE_NAMES: ReadonlyMap<string, string> = new Map(BASE_TILES.map((t) => [t.id, t.name]));

/** One clear sentence for a card's structured effect. Covers every CardEffect kind. */
export function describeEffect(effect: CardEffect): string {
  switch (effect.kind) {
    case "collect":
      return `Collect ${rupees(effect.amount)} from the bank`;
    case "pay":
      return `Pay ${rupees(effect.amount)} to the bank`;
    case "moveSteps": {
      const n = Math.abs(effect.steps);
      const unit = n === 1 ? "step" : "steps";
      return effect.steps >= 0 ? `Move forward ${n} ${unit}` : `Move back ${n} ${unit}`;
    }
    case "moveToNearest":
      return "Move to the nearest transport";
    case "moveTo": {
      const name = TILE_NAMES.get(effect.tileId) ?? effect.tileId;
      return effect.tileId === "start" ? "Advance to Start" : `Move to ${name}`;
    }
    case "moveToUnownedCity":
      return "Move to an unowned city";
    case "payPerBuilding":
      return `Pay ${rupees(effect.perHouse)} per house and ${rupees(effect.perHotel)} per hotel (max ${rupees(effect.cap)})`;
    case "collectPerTransport":
      return `Collect ${rupees(effect.perTransport)} per transport you own (max ${rupees(effect.cap)})`;
    case "payEachPlayer":
      return `Pay ${rupees(effect.amount)} to each player`;
    case "collectFromEachPlayer":
      return `Collect ${rupees(effect.amount)} from each player`;
    case "jailFree":
      return "Get out of jail free. Keep this card until you use it";
  }
}
