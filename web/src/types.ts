export type GamePhase = "menu" | "playing" | "over";

export type GemType = "red" | "blue" | "green" | "yellow" | "purple" | "orange";

export interface Gem {
  id: number;
  type: GemType;
  row: number;
  col: number;
}
