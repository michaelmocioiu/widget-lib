import { useEffect, useRef, useState } from "react";
import {
  createSnakeGame,
  stepSnakeGame,
  computeBotDirection,
  checkWinCondition,
  queueDirection,
  TICK_MS,
  type SnakeGameState,
} from "./engine";
import { SnakeGameInput } from "./SnakeGameInput";
import styles from "./Snake.module.css";
import type { Direction } from "./types";

const KILL_FREEZE_MS = 900;

export function SnakeWidget() {
  const [game, setGame] = useState<SnakeGameState>(() => createSnakeGame());
  const [score, setScore] = useState({ player: 0, bot: 0 });
  const [roundOver, setRoundOver] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const roundOverRef = useRef(false);
  roundOverRef.current = roundOver;

  useEffect(() => {
    const interval = setInterval(() => {
      if (roundOverRef.current) return;
      const g = gameRef.current;

      const botDir = computeBotDirection(g);
      if (botDir) queueDirection(g, "bot", botDir);

      stepSnakeGame(g);
      const finished = checkWinCondition(g);
      setGame({ ...g, players: g.players.map((p) => ({ ...p })), foods: [...g.foods] });

      if (finished) {
        roundOverRef.current = true;
        setTimeout(() => {
          if (g.winnerId) {
            setScore((s) => ({ ...s, [g.winnerId as "player" | "bot"]: s[g.winnerId as "player" | "bot"] + 1 }));
          }
          setRoundOver(true);
        }, KILL_FREEZE_MS);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  function handleDirection(dir: Direction) {
    if (roundOverRef.current) return;
    queueDirection(gameRef.current, "player", dir);
  }

  function restart() {
    const fresh = createSnakeGame();
    gameRef.current = fresh;
    roundOverRef.current = false;
    setGame(fresh);
    setRoundOver(false);
  }

  const me = game.players.find((p) => p.id === "player");
  const statusText = roundOver
    ? game.winnerId === "player"
      ? "You win!"
      : game.winnerId === "bot"
        ? "Bot wins!"
        : "Draw!"
    : (me?.alive ?? true)
      ? "Go!"
      : "You crashed -- waiting on the bot...";

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreRow}>
        <span>You: {score.player}</span>
        <span>Bot: {score.bot}</span>
      </div>
      <div className={styles.canvasWrap}>
        <SnakeGameInput
          grid={{ w: game.w, h: game.h }}
          foods={game.foods}
          players={game.players}
          sendDirection={handleDirection}
          statusText={statusText}
        />
        {roundOver && (
          <div className={styles.overlay}>
            <div>{statusText}</div>
            <button type="button" className={styles.restartBtn} onClick={restart}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
