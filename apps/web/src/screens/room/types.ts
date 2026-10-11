import type { PlayerState, PublicGameView, ResolvedEconomy } from "@rollbiz/engine";
import type { ActionInput } from "../../lib/colyseus";
import type { Names } from "./format";

/** Everything the in-game subviews need. */
export interface GameCtx {
  view: PublicGameView;
  economy: ResolvedEconomy;
  /** Supabase user id of this client's player. */
  meId: string;
  /** Undefined for a spectator (not in the game). */
  me: PlayerState | undefined;
  names: Names;
  act: (action: ActionInput) => void;
}
