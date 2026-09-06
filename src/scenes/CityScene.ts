import Phaser from "phaser";
import { getBuildingDef } from "../game/content/buildings";
import { getResourceDef } from "../game/content/resources";
import { GRID_SIZE, GameController } from "../game/controller";
import { computeEnergyStatus, currentLevel, findBuildingAt } from "../game/state/derived";
import { IsoGrid } from "../game/isoGrid";
import { createBuildingVisual } from "../game/buildingVisual";
import { processCutoutTexture } from "../game/spriteTexture";
import { registerSprite } from "../game/spriteRegistry";
import { createCityBackground } from "../game/background";
import { setHoverTip } from "../ui/hoverTip";
import { showToast } from "../ui/toasts";

const TILE_WIDTH = 92;
const TILE_HEIGHT = 42;

const TILE_FILL = 0x141a2e;
const TILE_FILL_ALT = 0x171f38;
const TILE_STROKE = 0x2a3a5c;
const HOVER_FREE = 0x22d3ee;
const HOVER_BLOCKED = 0xf87171;

const FONT_FAMILY = '"Chakra Petch", "Segoe UI", sans-serif';

/**
 * Renders the game world only — grid, buildings, placement previews, collect feedback. All UI
 * chrome (menus, panels, tooltips, toasts) lives in the DOM overlay (src/ui/), which also means
 * clicks on UI never reach this scene: the input hit-region workarounds the old canvas UI needed
 * are gone. State and interaction mode live in the shared GameController.
 */
export class CityScene extends Phaser.Scene {
  private readonly controller: GameController;
  private grid!: IsoGrid;

  private tilesLayer!: Phaser.GameObjects.Graphics;
  private gridGlowLayer!: Phaser.GameObjects.Graphics;
  private hoverLayer!: Phaser.GameObjects.Graphics;
  private buildingsLayer!: Phaser.GameObjects.Container;

  constructor(controller: GameController) {
    super("city");
    this.controller = controller;
  }

  preload(): void {
    this.load.image("worker-housing-1-raw", "/art/apartment-block-1.png");
  }

  create(): void {
    const { width, height } = this.scale;

    const housingSprite = processCutoutTexture(this, "worker-housing-1-raw", "worker-housing-1");
    registerSprite("worker-housing", 0, {
      textureKey: housingSprite.key,
      scale: TILE_WIDTH / housingSprite.width,
    });

    this.grid = new IsoGrid(TILE_WIDTH, TILE_HEIGHT, width / 2, 205);

    createCityBackground(this, width, height);

    this.tilesLayer = this.add.graphics().setDepth(-100);
    this.gridGlowLayer = this.add.graphics().setDepth(-99).setBlendMode(Phaser.BlendModes.ADD);
    this.buildingsLayer = this.add.container(0, 0);
    this.hoverLayer = this.add.graphics().setDepth(1000);

    this.drawBaseGrid();

    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("gameout", () => setHoverTip(null));
    this.input.keyboard?.on("keydown-ESC", () => this.controller.cancelMode());

    const unsubscribe = this.controller.subscribe(() => this.renderBuildings());
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    this.renderBuildings();
  }

  // ---------------------------------------------------------------- grid --

  private drawBaseGrid(): void {
    this.tilesLayer.clear();
    this.gridGlowLayer.clear();
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const alt = (col + row) % 2 === 0;
        this.drawTileDiamond(col, row, alt ? TILE_FILL : TILE_FILL_ALT, TILE_STROKE);
        this.drawTileGlowOutline(col, row);
      }
    }
  }

  /** A faint additive-blended cyan outline over every tile — a subtle "digital grid" glow. */
  private drawTileGlowOutline(col: number, row: number): void {
    const { x, y } = this.grid.toScreen(col, row);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    this.gridGlowLayer.lineStyle(1, 0x22d3ee, 0.08);
    this.gridGlowLayer.beginPath();
    this.gridGlowLayer.moveTo(x, y - hh);
    this.gridGlowLayer.lineTo(x + hw, y);
    this.gridGlowLayer.lineTo(x, y + hh);
    this.gridGlowLayer.lineTo(x - hw, y);
    this.gridGlowLayer.closePath();
    this.gridGlowLayer.strokePath();
  }

  private drawTileDiamond(col: number, row: number, fill: number, stroke: number): void {
    const { x, y } = this.grid.toScreen(col, row);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    this.tilesLayer.fillStyle(fill, 1);
    this.tilesLayer.lineStyle(1, stroke, 1);
    this.tilesLayer.beginPath();
    this.tilesLayer.moveTo(x, y - hh);
    this.tilesLayer.lineTo(x + hw, y);
    this.tilesLayer.lineTo(x, y + hh);
    this.tilesLayer.lineTo(x - hw, y);
    this.tilesLayer.closePath();
    this.tilesLayer.fillPath();
    this.tilesLayer.strokePath();
  }

  private drawHoverOutline(col: number, row: number, color: number): void {
    const { x, y } = this.grid.toScreen(col, row);
    const hw = TILE_WIDTH / 2 - 3;
    const hh = TILE_HEIGHT / 2 - 2;
    this.hoverLayer.lineStyle(3, color, 1);
    this.hoverLayer.beginPath();
    this.hoverLayer.moveTo(x, y - hh);
    this.hoverLayer.lineTo(x + hw, y);
    this.hoverLayer.lineTo(x, y + hh);
    this.hoverLayer.lineTo(x - hw, y);
    this.hoverLayer.closePath();
    this.hoverLayer.strokePath();
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE;
  }

  private previewFootprint(col: number, row: number, w: number, h: number, ignoreUid?: string): void {
    const cells: { col: number; row: number }[] = [];
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) cells.push({ col: col + dc, row: row + dr });
    }

    const occupancy = new Map<string, string>();
    for (const b of this.controller.state.buildings) {
      const bDef = getBuildingDef(b.defId);
      for (let dc = 0; dc < bDef.footprint.w; dc++) {
        for (let dr = 0; dr < bDef.footprint.h; dr++) {
          occupancy.set(`${b.col + dc},${b.row + dr}`, b.uid);
        }
      }
    }

    const valid = cells.every((c) => {
      if (!this.inBounds(c.col, c.row)) return false;
      const occupant = occupancy.get(`${c.col},${c.row}`);
      return !occupant || occupant === ignoreUid;
    });
    for (const c of cells) this.drawHoverOutline(c.col, c.row, valid ? HOVER_FREE : HOVER_BLOCKED);
  }

  // --------------------------------------------------------------- input --

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.hoverLayer.clear();
    const { col, row } = this.grid.toGrid(pointer.x, pointer.y);
    const mode = this.controller.mode;

    if (mode.placingDefId) {
      setHoverTip(null);
      if (!this.inBounds(col, row)) return;
      const def = getBuildingDef(mode.placingDefId);
      this.previewFootprint(col, row, def.footprint.w, def.footprint.h);
      return;
    }

    if (mode.movingUid) {
      setHoverTip(null);
      if (!this.inBounds(col, row)) return;
      const building = this.controller.state.buildings.find((b) => b.uid === mode.movingUid);
      if (!building) return;
      const def = getBuildingDef(building.defId);
      this.previewFootprint(col, row, def.footprint.w, def.footprint.h, building.uid);
      return;
    }

    if (!this.inBounds(col, row)) {
      setHoverTip(null);
      return;
    }
    const existing = findBuildingAt(this.controller.state, col, row);
    if (existing) {
      const nativeEvent = pointer.event as MouseEvent;
      setHoverTip(existing.uid, nativeEvent.clientX ?? 0, nativeEvent.clientY ?? 0);
    } else {
      setHoverTip(null);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      this.controller.cancelMode();
      return;
    }

    const { col, row } = this.grid.toGrid(pointer.x, pointer.y);
    if (!this.inBounds(col, row)) {
      this.controller.select(null);
      return;
    }

    const mode = this.controller.mode;

    if (mode.movingUid) {
      const result = this.controller.moveTo(col, row);
      showToast(result.ok ? "Moved." : result.reason, result.ok ? "info" : "error");
      return;
    }

    if (mode.placingDefId) {
      const result = this.controller.place(col, row);
      if (result.ok) showToast("Construction started.");
      else showToast(result.reason, "error");
      return;
    }

    const existing = findBuildingAt(this.controller.state, col, row);
    if (!existing) {
      this.controller.select(null);
      return;
    }

    if (existing.outputBuffer > 0) {
      const level = currentLevel(existing, getBuildingDef(existing.defId));
      const collected = existing.outputBuffer;
      const result = this.controller.collect(existing.uid);
      if (result.ok && level?.recipe) {
        const world = this.grid.toScreen(existing.col, existing.row);
        this.spawnFloatText(
          world.x,
          world.y - 40,
          `+${Math.floor(collected)} ${getResourceDef(level.recipe.output.resource).label}`,
          "#facc15",
        );
      } else if (!result.ok) {
        showToast(result.reason, "error");
      }
      return;
    }

    this.controller.select(existing.uid);
  }

  // -------------------------------------------------------------- render --

  private renderBuildings(): void {
    this.buildingsLayer.removeAll(true);
    const state = this.controller.state;
    const energyStatus = computeEnergyStatus(state);

    for (const building of state.buildings) {
      const def = getBuildingDef(building.defId);
      const displayLevelIndex = building.construction ? building.construction.targetLevelIndex : building.levelIndex;
      const level = def.levels[displayLevelIndex];

      const underConstruction = !!building.construction;
      const understaffed =
        !underConstruction && level.workersRequired > 0 && building.assignedWorkers < level.workersRequired;
      const underpowered =
        !underConstruction && level.energyRequired > 0 && building.assignedWorkers > 0 && energyStatus.share < 0.999;

      const visual = createBuildingVisual(this, this.grid, building.col, building.row, def, displayLevelIndex, {
        underConstruction,
        constructionProgress: building.construction
          ? 1 - building.construction.remainingSeconds / building.construction.totalSeconds
          : 0,
        understaffed,
        underpowered,
        readyToCollect: !underConstruction && building.outputBuffer > 0,
      });
      this.buildingsLayer.add(visual);
    }
  }

  private spawnFloatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: "14px", fontStyle: "700", color })
      .setOrigin(0.5)
      .setDepth(1200);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }
}
