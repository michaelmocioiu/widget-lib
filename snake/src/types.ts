export interface GridCell {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

export type SnakeDeathCause = "self" | "crash" | "headon";

// "solo": single snake, no opponent -- round ends when the player dies.
// "vsBot": original player-vs-bot duel.
// "local2p": two human players sharing one keyboard (WASD + arrow keys).
export type GameMode = "solo" | "vsBot" | "local2p";
