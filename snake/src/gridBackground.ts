// Trimmed from nangame's client/src/lib/gridGameEngine.ts -- just the
// cached background-layer builder snakeCanvas.ts uses for its checkered
// board fill.
const layerCache = new Map<string, HTMLCanvasElement>();

export function getGridBackgroundLayer(
  gridW: number,
  gridH: number,
  cellSize: number,
  extraKey: string,
  paintExtra?: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const key = `${gridW}x${gridH}@${cellSize}:${extraKey}`;
  const cached = layerCache.get(key);
  if (cached) return cached;

  const layer = document.createElement("canvas");
  layer.width = gridW * cellSize;
  layer.height = gridH * cellSize;
  const ctx = layer.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, layer.width, layer.height);

    ctx.strokeStyle = "#22262f";
    ctx.lineWidth = 1;
    for (let x = 0; x <= gridW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, gridH * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= gridH; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(gridW * cellSize, y * cellSize + 0.5);
      ctx.stroke();
    }

    paintExtra?.(ctx);
  }

  layerCache.set(key, layer);
  return layer;
}
