// Cheap glow alternative
// to ctx.shadowBlur (a real per-frame cost on many mobile Canvas2D
// implementations).
export function drawGlowCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  glowRadius: number,
) {
  const outer = radius + glowRadius;
  if (outer <= 0) return;
  const gradient = ctx.createRadialGradient(cx, cy, Math.max(0, radius * 0.4), cx, cy, outer);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
}
