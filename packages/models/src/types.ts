import type { ComponentType } from "react";

export type ModelCategory = "token" | "board" | "card";

export interface ModelEntry {
  id: string;
  name: string;
  category: ModelCategory;
  /** Renders the model centred on the origin, resting on y = 0, at game scale (1 unit = one board tile width). */
  Component: ComponentType;
  /** Suggested camera distance for the gallery thumbnail. */
  viewDistance: number;
}
