import type { GameEvent, GroupId, Party, PublicGameView, ResolvedEconomy, TileId, TileKind } from "@rollbiz/engine";

const inr = new Intl.NumberFormat("en-IN");

/** Rupees with Indian digit grouping, e.g. ₹10,00,000. */
export function money(amount: number): string {
  return `₹${inr.format(amount)}`;
}

/** Full class names so Tailwind can see them. Tokens live in index.css. */
export const GROUP_BG: Record<GroupId, string> = {
  brown: "bg-group-brown",
  lightBlue: "bg-group-light-blue",
  pink: "bg-group-pink",
  orange: "bg-group-orange",
  red: "bg-group-red",
  yellow: "bg-group-yellow",
  green: "bg-group-green",
  darkBlue: "bg-group-dark-blue",
};

export const KIND_BG: Partial<Record<TileKind, string>> = {
  transport: "bg-slate-500",
  utility: "bg-teal-500",
  chance: "bg-fuchsia-400",
  communityChest: "bg-amber-400",
};

export const PLAYER_BG = ["bg-brand", "bg-go-dark", "bg-sun-dark", "bg-berry", "bg-sky-600", "bg-fuchsia-600"] as const;

export function playerBg(view: Pick<PublicGameView, "players">, playerId: string): string {
  const index = view.players.findIndex((p) => p.id === playerId);
  return PLAYER_BG[(index < 0 ? 0 : index) % PLAYER_BG.length] ?? "bg-brand";
}

export interface Names {
  party(id: Party): string;
  tile(id: TileId): string;
  /** Name of the tile at a board position. */
  tileAt(position: number): string;
}

export function makeNames(view: PublicGameView, economy: ResolvedEconomy): Names {
  const tiles = new Map(economy.tiles.map((t) => [t.id, t.name]));
  return {
    party: (id) => (id === "bank" ? "Bank" : (view.players.find((p) => p.id === id)?.name ?? "Someone")),
    tile: (id) => tiles.get(id) ?? id,
    tileAt: (position) => economy.tiles[position]?.name ?? `tile ${position}`,
  };
}

/** One line of the activity log; null for events not worth showing. */
export function describeEvent(e: GameEvent, n: Names): string | null {
  switch (e.type) {
    case "turnStarted":
      return `${n.party(e.playerId)}'s turn`;
    case "rolled":
      return `${n.party(e.playerId)} rolled ${e.dice[0]} + ${e.dice[1]}${e.doubles ? " (doubles)" : ""}`;
    case "moved":
      return `${n.party(e.playerId)} moved to ${n.tileAt(e.to)}${e.passedStart ? " and passed Start" : ""}`;
    case "sentToJail":
      return `${n.party(e.playerId)} went to jail`;
    case "leftJail":
      return `${n.party(e.playerId)} left jail (${e.via})`;
    case "paid":
      return `${n.party(e.from)} paid ${n.party(e.to)} ${money(e.amount)}: ${e.reason}`;
    case "bought":
      return `${n.party(e.playerId)} bought ${n.tile(e.tileId)} for ${money(e.price)}`;
    case "auctionStarted":
      return `Auction for ${n.tile(e.tileId)}`;
    case "bid":
      return `${n.party(e.playerId)} bid ${money(e.amount)}`;
    case "auctionPassed":
      return `${n.party(e.playerId)} passed`;
    case "auctionEnded":
      return e.winnerId
        ? `${n.party(e.winnerId)} won ${n.tile(e.tileId)} for ${money(e.amount)}`
        : `No bids: ${n.tile(e.tileId)} stays unowned`;
    case "cardDrawn":
      return `${n.party(e.playerId)} drew "${e.title}"`;
    case "built":
      return `${n.party(e.playerId)} built on ${n.tile(e.tileId)} (${e.hotel ? "hotel" : `${e.houses} houses`})`;
    case "buildingSold":
      return `${n.party(e.playerId)} sold a building on ${n.tile(e.tileId)} for ${money(e.refund)}`;
    case "mortgaged":
      return `${n.party(e.playerId)} mortgaged ${n.tile(e.tileId)} for ${money(e.amount)}`;
    case "unmortgaged":
      return `${n.party(e.playerId)} unmortgaged ${n.tile(e.tileId)} for ${money(e.amount)}`;
    case "debtCreated":
      return `${n.party(e.debt.debtor)} owes ${n.party(e.debt.creditor)} ${money(e.debt.amount)}`;
    case "debtPaid":
      return "A debt was paid";
    case "tradeProposed":
      return `${n.party(e.from)} offered a trade to ${n.party(e.to)}`;
    case "tradeAccepted":
      return "Trade accepted";
    case "tradeRejected":
      return "Trade rejected";
    case "tradeCancelled":
      return "Trade cancelled";
    case "bankReplenished":
      return `Bank topped up by ${money(e.amount)}`;
    case "bankrupt":
      return `${n.party(e.playerId)} went bankrupt`;
    case "gameOver":
      return e.winnerId ? `Game over: ${n.party(e.winnerId)} wins` : "Game over";
  }
}
