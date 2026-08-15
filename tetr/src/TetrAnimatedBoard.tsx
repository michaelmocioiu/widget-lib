import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { TetrPlayerState } from "./engine";
import type { PieceStyle } from "./pieces";
import { TetrBoardCanvas } from "./TetrBoardCanvas";
import { useTetrBoardEffects } from "./useTetrBoardEffects";
import styles from "./Tetr.module.css";

const SHAKE_MS = 220;

interface TetrAnimatedBoardProps {
  board: TetrPlayerState;
  boardWidth: number;
  boardHeight: number;
  hiddenRows: number;
  pieceColors: Record<string, string>;
  cellSize: number;
  showGhost?: boolean;
  dim?: boolean;
  suppressLockRef?: RefObject<number>;
  pieceStyle?: PieceStyle;
  shakeEnabled?: boolean;
}

export function TetrAnimatedBoard({ board, dim, suppressLockRef, shakeEnabled = true, ...rest }: TetrAnimatedBoardProps) {
  const { flashToken, shakeToken, popups } = useTetrBoardEffects(board, suppressLockRef);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shakeToken === 0 || !shakeEnabled) return;
    const el = wrapRef.current;
    if (!el) return;
    el.classList.remove(styles.boardShake);
    void el.offsetWidth;
    el.classList.add(styles.boardShake);
    const t = setTimeout(() => el.classList.remove(styles.boardShake), SHAKE_MS);
    return () => clearTimeout(t);
  }, [shakeToken, shakeEnabled]);

  return (
    <div ref={wrapRef} className={styles.boardStack}>
      <TetrBoardCanvas board={board} dim={dim} suppressLockRef={suppressLockRef} {...rest} />
      {flashToken > 0 && <div key={flashToken} className={styles.lineClearFlash} />}
      <div className={styles.popupLayer}>
        {popups.map((p) => (
          <div key={p.id} className={`${styles.popup} ${styles[`popup_${p.variant}`]}`}>
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}
