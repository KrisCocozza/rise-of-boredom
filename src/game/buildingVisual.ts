import Phaser from "phaser";
import { BuildingDef, BuildingLevel } from "./content/buildings";
import { IsoGrid } from "./isoGrid";
import { GroundCorners, Point, drawExtrudedBlock, footprintGroundCorners } from "./blockRenderer";
import { getSprite } from "./spriteRegistry";

export interface BuildingVisualStatus {
  underConstruction: boolean;
  /** 0..1, meaningful only when underConstruction is true. */
  constructionProgress: number;
  understaffed: boolean;
  underpowered: boolean;
  readyToCollect: boolean;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Builds the on-screen representation for one placed building as its own Container, positioned
 * at world (0, 0) — every point drawn into it is already an absolute screen coordinate computed
 * from the building's footprint (see blockRenderer.footprintGroundCorners). `displayLevelIndex`
 * is whichever level should currently be drawn: the operating level normally, or the upgrade's
 * target level while under construction (so the preview reflects what's being built).
 */
export function createBuildingVisual(
  scene: Phaser.Scene,
  grid: IsoGrid,
  col: number,
  row: number,
  def: BuildingDef,
  displayLevelIndex: number,
  status: BuildingVisualStatus,
): Phaser.GameObjects.Container {
  const level = def.levels[displayLevelIndex];
  const container = scene.add.container(0, 0);
  const frontCol = col + def.footprint.w - 1;
  const frontRow = row + def.footprint.h - 1;
  container.setDepth(frontCol + frontRow);

  const isSingleTile = def.footprint.w === 1 && def.footprint.h === 1;
  const sprite = isSingleTile ? getSprite(def.id, displayLevelIndex) : undefined;

  if (sprite) {
    // Sprites are cropped tight to their content, with the building's front (lowest) pixel at
    // the bottom edge — anchoring at the raw (un-inset) ground "s" corner lines it up with the
    // tile's front vertex, matching the procedural blocks' convention.
    const anchor = footprintGroundCorners(grid, col, row, 1, 1).s;
    const img = scene.add.image(anchor.x, anchor.y, sprite.textureKey).setOrigin(0.5, 1);
    img.setScale(sprite.scale);
    container.add(img);
  } else if (level.windowRows && level.windowCols) {
    buildWindowedBlock(scene, container, grid, col, row, def, level);
  } else {
    const corners = footprintGroundCorners(grid, col, row, def.footprint.w, def.footprint.h, 0.9);
    const g = scene.add.graphics();
    container.add(g);
    drawExtrudedBlock(g, corners, def.color, level.height);
  }

  applyStatusOverlay(scene, container, grid, col, row, def, level, status);

  return container;
}

function buildWindowedBlock(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  grid: IsoGrid,
  col: number,
  row: number,
  def: BuildingDef,
  level: BuildingLevel,
): void {
  const corners = footprintGroundCorners(grid, col, row, def.footprint.w, def.footprint.h, 0.9);
  const g = scene.add.graphics();
  container.add(g);
  const { w, s, e, wTop, sTop, eTop, nTop } = drawExtrudedBlock(g, corners, def.color, level.height);

  const flickerTargets: Phaser.GameObjects.Rectangle[] = [];

  function addWindows(bottomA: Point, bottomB: Point, topA: Point, topB: Point, rows: number, cols: number): void {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols;
        const v = (r + 0.5) / rows;
        const bottomEdge = lerp(bottomA, bottomB, u);
        const topEdge = lerp(topA, topB, u);
        const p = lerp(bottomEdge, topEdge, 0.14 + v * 0.72);

        const lit = Math.random() > 0.35;
        const winColor = lit ? 0xfff3b0 : 0x0b1220;
        const win = scene.add.rectangle(p.x, p.y, 5, 6, winColor, lit ? 0.9 : 0.6);
        container.add(win);
        if (lit && Math.random() > 0.6) flickerTargets.push(win);
      }
    }
  }

  // Left face windows, then right face windows.
  addWindows(w, s, wTop, sTop, level.windowRows ?? 2, level.windowCols ?? 2);
  addWindows(s, e, sTop, eTop, level.windowRows ?? 2, level.windowCols ?? 2);

  for (const win of flickerTargets) {
    scene.tweens.add({
      targets: win,
      alpha: 0.25,
      duration: 700 + Math.random() * 900,
      yoyo: true,
      repeat: -1,
      delay: Math.random() * 1000,
    });
  }

  if (level.hasAntenna) {
    const tipY = nTop.y - 14;
    g.lineStyle(2, 0x94a3b8, 1);
    g.beginPath();
    g.moveTo(nTop.x, nTop.y);
    g.lineTo(nTop.x, tipY);
    g.strokePath();

    const light = scene.add.circle(nTop.x, tipY, 3, 0xff2965, 1);
    container.add(light);
    scene.tweens.add({ targets: light, alpha: 0.2, duration: 550, yoyo: true, repeat: -1 });
  }

  if (level.hasSign) {
    const signWidth = Math.hypot(eTop.x - wTop.x, eTop.y - wTop.y) * 0.45;
    const sign = scene.add.rectangle(nTop.x, nTop.y + 8, signWidth, 8, 0xf472b6, 0.85);
    container.add(sign);
    scene.tweens.add({ targets: sign, alpha: 0.5, duration: 450, yoyo: true, repeat: -1 });
  }
}

function roofTopCenter(corners: GroundCorners, height: number): Point {
  return { x: (corners.n.x + corners.s.x) / 2, y: (corners.n.y + corners.s.y) / 2 - height };
}

function applyStatusOverlay(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  grid: IsoGrid,
  col: number,
  row: number,
  def: BuildingDef,
  level: BuildingLevel,
  status: BuildingVisualStatus,
): void {
  const corners = footprintGroundCorners(grid, col, row, def.footprint.w, def.footprint.h);
  const topCenter = roofTopCenter(corners, level.height);

  if (status.underConstruction) {
    container.setAlpha(0.55);

    const barWidth = 44;
    const barY = topCenter.y - 16;
    const track = scene.add.graphics();
    track.fillStyle(0x0b0f1c, 0.85);
    track.fillRoundedRect(topCenter.x - barWidth / 2, barY, barWidth, 7, 3);
    track.lineStyle(1, 0x2a3a5c, 0.9);
    track.strokeRoundedRect(topCenter.x - barWidth / 2, barY, barWidth, 7, 3);
    container.add(track);

    const fill = scene.add.graphics();
    fill.fillStyle(0x38bdf8, 1);
    const fillWidth = Math.max(2, (barWidth - 2) * Phaser.Math.Clamp(status.constructionProgress, 0, 1));
    fill.fillRoundedRect(topCenter.x - barWidth / 2 + 1, barY + 1, fillWidth, 5, 2);
    container.add(fill);
    return;
  }

  if (status.readyToCollect) {
    const badge = scene.add.circle(topCenter.x, topCenter.y - 14, 7, 0xfacc15, 1);
    container.add(badge);
    scene.tweens.add({ targets: badge, y: badge.y - 5, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  if (status.understaffed || status.underpowered) {
    const color = status.underpowered ? 0x38bdf8 : 0xf97316;
    const badge = scene.add.circle(topCenter.x + 12, topCenter.y - 14, 5, color, 1);
    container.add(badge);
  }
}
