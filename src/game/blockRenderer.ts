import Phaser from "phaser";
import { IsoGrid } from "./isoGrid";

export function shade(color: number, percent: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  if (percent >= 0) c.lighten(percent);
  else c.darken(-percent);
  return c.color;
}

export interface Point {
  x: number;
  y: number;
}

export interface GroundCorners {
  n: Point;
  e: Point;
  s: Point;
  w: Point;
}

export interface FootprintPoints extends GroundCorners {
  nTop: Point;
  eTop: Point;
  sTop: Point;
  wTop: Point;
}

/**
 * The four ground corners of a footprint's iso bounding rhombus, in absolute screen space.
 * Generalizes the single-tile diamond to any w x h footprint anchored at (col, row) — a tile
 * (col, row)'s own diamond corners are exactly `toScreen` at half-integer offsets from its
 * center, so the combined footprint's corners are the same trick run over its outer edge.
 * `insetScale` (< 1) shrinks the rhombus toward its centroid, leaving a visible gap between
 * adjacent buildings; pass 1 for the raw, un-shrunk rhombus (used to anchor sprite art).
 */
export function footprintGroundCorners(
  grid: IsoGrid,
  col: number,
  row: number,
  footprintW: number,
  footprintH: number,
  insetScale = 1,
): GroundCorners {
  const n = grid.toScreen(col - 0.5, row - 0.5);
  const e = grid.toScreen(col + footprintW - 0.5, row - 0.5);
  const s = grid.toScreen(col + footprintW - 0.5, row + footprintH - 0.5);
  const w = grid.toScreen(col - 0.5, row + footprintH - 0.5);

  if (insetScale === 1) return { n, e, s, w };

  const cx = (n.x + e.x + s.x + w.x) / 4;
  const cy = (n.y + e.y + s.y + w.y) / 4;
  const shrink = (p: Point): Point => ({ x: cx + (p.x - cx) * insetScale, y: cy + (p.y - cy) * insetScale });
  return { n: shrink(n), e: shrink(e), s: shrink(s), w: shrink(w) };
}

/**
 * Draws an extruded isometric block (top + two shaded side faces) at the given absolute ground
 * corners. Caller positions the containing GameObject at world (0, 0) so these coordinates can
 * be used directly.
 */
export function drawExtrudedBlock(
  g: Phaser.GameObjects.Graphics,
  corners: GroundCorners,
  color: number,
  height: number,
): FootprintPoints {
  const { n, e, s, w } = corners;
  const nTop = { x: n.x, y: n.y - height };
  const eTop = { x: e.x, y: e.y - height };
  const sTop = { x: s.x, y: s.y - height };
  const wTop = { x: w.x, y: w.y - height };

  // Left face
  g.fillStyle(shade(color, -35), 1);
  g.beginPath();
  g.moveTo(w.x, w.y);
  g.lineTo(s.x, s.y);
  g.lineTo(sTop.x, sTop.y);
  g.lineTo(wTop.x, wTop.y);
  g.closePath();
  g.fillPath();

  // Right face
  g.fillStyle(shade(color, -15), 1);
  g.beginPath();
  g.moveTo(s.x, s.y);
  g.lineTo(e.x, e.y);
  g.lineTo(eTop.x, eTop.y);
  g.lineTo(sTop.x, sTop.y);
  g.closePath();
  g.fillPath();

  // Roof
  g.fillStyle(shade(color, 15), 1);
  g.lineStyle(1, 0x000000, 0.25);
  g.beginPath();
  g.moveTo(nTop.x, nTop.y);
  g.lineTo(eTop.x, eTop.y);
  g.lineTo(sTop.x, sTop.y);
  g.lineTo(wTop.x, wTop.y);
  g.closePath();
  g.fillPath();
  g.strokePath();

  return { n, e, s, w, nTop, eTop, sTop, wTop };
}
