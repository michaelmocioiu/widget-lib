export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type CellValue = PieceType | "GARBAGE" | null;

// "solo": single board, no opponent, no garbage -- survive against ramping
// gravity (Marathon).
// "vsBot": duel ruleset (garbage flows both ways) against a client-side bot.
// "local2p": duel ruleset, two humans sharing one keyboard.
export type GameMode = "solo" | "vsBot" | "local2p";
