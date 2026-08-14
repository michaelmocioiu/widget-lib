export interface GridCell {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

export type SnakeDeathCause = "self" | "crash" | "headon";
