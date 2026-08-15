import { useEffect, useRef } from "react";
import type { PieceType } from "./types";
import { PIECE_SHAPES } from "./pieces";
import { PIECE_OUTLINES, buildRoundedShapePath } from "./outline";
import type { TetrPlayerState } from "./engine";
import styles from "./Tetr.module.css";

// 4x4 grid, same as the board pieces, drawn as one rounded shape instead of
// per-cell squares so hold/next previews match the board's piece style.
function PiecePreview({ type, color, size = 5 }: { type: PieceType | null; color: string | undefined; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = size * 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dim, dim);
    if (!type) return;
    const outline = PIECE_OUTLINES[type][0];
    const cells = PIECE_SHAPES[type][0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [ox, oy] of cells) {
      minX = Math.min(minX, ox);
      minY = Math.min(minY, oy);
      maxX = Math.max(maxX, ox + 1);
      maxY = Math.max(maxY, oy + 1);
    }
    const originX = (dim - (maxX - minX) * size) / 2 - minX * size;
    const originY = (dim - (maxY - minY) * size) / 2 - minY * size;
    const radius = Math.max(1.5, size * 0.22);
    const path = buildRoundedShapePath(outline, originX, originY, size, radius);
    ctx.fillStyle = color || "#888";
    ctx.fill(path);
  }, [type, color, size, dim]);

  return <canvas ref={canvasRef} width={dim} height={dim} className={styles.piecePreview} />;
}

interface TetrHUDProps {
  board: TetrPlayerState;
  pieceColors: Record<string, string>;
  showScore?: boolean;
}

export function TetrHUD({ board, pieceColors, showScore = false }: TetrHUDProps) {
  const pendingGarbage = board.garbageQueue.reduce((sum, g) => sum + g.amount, 0);
  const combo = Math.max(board.comboCount, 0);
  return (
    <div className={styles.hud}>
      {showScore && (
        <div className={styles.hudBox}>
          <div className={styles.hudLabel}>Score</div>
          <div className={styles.scoreValue}>{board.score.toLocaleString()}</div>
          <div className={styles.levelValue}>Level {board.level}</div>
        </div>
      )}
      <div className={styles.hudBox}>
        <div className={styles.hudLabel}>Hold</div>
        <PiecePreview type={board.held} color={board.held ? pieceColors[board.held] : undefined} size={8} />
      </div>
      <div className={styles.hudBox}>
        <div className={styles.hudLabel}>Next</div>
        <div className={styles.nextQueue}>
          {board.nextQueue.map((type, i) => (
            <PiecePreview key={i} type={type} color={pieceColors[type]} size={i === 0 ? 7 : 5.5} />
          ))}
        </div>
      </div>
      <div className={styles.hudBox}>
        <div className={styles.hudLabel}>Garbage</div>
        <div className={styles.garbageCount}>{pendingGarbage}</div>
      </div>
      {(combo > 0 || board.b2b) && (
        <div className={styles.comboFlash}>
          {combo > 0 && <span>Combo x{combo}</span>}
          {board.b2b && <span>B2B</span>}
        </div>
      )}
    </div>
  );
}
