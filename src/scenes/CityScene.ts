import Phaser from "phaser";
import { buildableBuildings, getBuildingDef } from "../game/content/buildings";
import { QUEST_DEFS } from "../game/content/quests";
import { ResourceAmount, ResourceId, getResourceDef } from "../game/content/resources";
import {
  ActionResult,
  collectBuilding,
  demolishBuilding,
  moveBuilding,
  placeBuilding,
  setAssignedWorkers,
  startUpgrade,
} from "../game/state/actions";
import {
  availableWorkers,
  computeEnergyStatus,
  currentLevel,
  findBuildingAt,
  totalAssignedWorkers,
  totalPopulationCapacity,
} from "../game/state/derived";
import { tick } from "../game/state/simulation";
import { GameState } from "../game/state/types";
import { loadGame, saveGame } from "../game/persistence";
import { IsoGrid } from "../game/isoGrid";
import { createBuildingVisual } from "../game/buildingVisual";
import { processCutoutTexture } from "../game/spriteTexture";
import { registerSprite } from "../game/spriteRegistry";
import { createCityBackground } from "../game/background";
import { PanelButtonHandle, StepperHandle, createPanelButton, createStepper, roundedPanel } from "../ui/panel";

const GRID_SIZE = 10;
const TILE_WIDTH = 92;
const TILE_HEIGHT = 42;

const TILE_FILL = 0x141a2e;
const TILE_FILL_ALT = 0x171f38;
const TILE_STROKE = 0x2a3a5c;
const HOVER_FREE = 0x22d3ee;
const HOVER_BLOCKED = 0xf87171;

const FONT_FAMILY = '"Chakra Petch", "Segoe UI", sans-serif';

const HUD_X = 16;
const HUD_Y = 16;
const HUD_W = 430;
const HUD_H = 150;

const QUEST_W = 300;
const QUEST_X = 1024 - QUEST_W - 16;
const QUEST_Y = 16;
const QUEST_H = 120;

/** Generous fixed height covering the selection panel's tallest content (the worker-stepper layout). */
const SEL_MAX_H = 320;

const PALETTE_Y_OFFSET = 150; // distance from scale.height to the top of the palette panel
const SAVE_INTERVAL_TICKS = 5;

const HUD_RESOURCE_ORDER: ResourceId[] = ["credits", "food", "materials", "components"];

function formatCost(cost: ResourceAmount): string {
  return Object.entries(cost)
    .map(([res, amt]) => `${amt}${getResourceDef(res as ResourceId).label.slice(0, 2)}`)
    .join(" · ");
}

function formatSeconds(seconds: number): string {
  return `${Math.max(0, Math.ceil(seconds))}s`;
}

function withinRect(pointer: Phaser.Input.Pointer, x: number, y: number, w: number, h: number): boolean {
  return pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
}

export class CityScene extends Phaser.Scene {
  private grid!: IsoGrid;
  private state!: GameState;
  private ticksSinceSave = 0;

  private selectedBuildingId: string | null = null;
  private selectedUid: string | null = null;
  private moveUid: string | null = null;
  /**
   * Set by the selection panel's own buttons/stepper at the moment they're clicked, since Phaser
   * dispatches an object's own 'pointerdown' handler before the scene-global one for the same
   * event — a handler can hide/rebuild the panel (e.g. Move, Demolish) before onPointerDown ever
   * gets to check `selectPanel.visible`, which would otherwise let that same click fall through
   * and get misread as a grid click. Read-and-cleared once at the top of onPointerDown.
   */
  private uiConsumedClick = false;

  private tilesLayer!: Phaser.GameObjects.Graphics;
  private gridGlowLayer!: Phaser.GameObjects.Graphics;
  private hoverLayer!: Phaser.GameObjects.Graphics;
  private buildingsLayer!: Phaser.GameObjects.Container;

  private paletteObjects: Phaser.GameObjects.GameObject[] = [];
  private paletteButtons: PanelButtonHandle[] = [];

  private resourceTexts: Partial<Record<ResourceId, Phaser.GameObjects.Text>> = {};
  private populationText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private deficitText!: Phaser.GameObjects.Text;
  private placingText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastClearEvent?: Phaser.Time.TimerEvent;

  private questPanel!: Phaser.GameObjects.Container;

  private selectPanel!: Phaser.GameObjects.Container;
  private readonly SEL_X: number;
  private readonly SEL_Y = 174;
  private readonly SEL_W = 292;

  constructor() {
    super("city");
    this.SEL_X = 1024 - this.SEL_W - 16;
  }

  preload(): void {
    this.load.image("worker-housing-1-raw", "/art/apartment-block-1.png");
  }

  create(): void {
    const { width } = this.scale;

    const housingSprite = processCutoutTexture(this, "worker-housing-1-raw", "worker-housing-1");
    registerSprite("worker-housing", 0, {
      textureKey: housingSprite.key,
      scale: TILE_WIDTH / housingSprite.width,
    });

    this.state = loadGame();
    this.grid = new IsoGrid(TILE_WIDTH, TILE_HEIGHT, width / 2, 205);

    createCityBackground(this, this.scale.width, this.scale.height);

    this.tilesLayer = this.add.graphics().setDepth(-100);
    this.gridGlowLayer = this.add.graphics().setDepth(-99).setBlendMode(Phaser.BlendModes.ADD);
    this.buildingsLayer = this.add.container(0, 0);
    this.hoverLayer = this.add.graphics().setDepth(1000);

    this.drawBaseGrid();
    this.createHud();
    this.createQuestPanel();
    this.createPalette();
    this.createSelectionPanel();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.keyboard?.on("keydown-ESC", () => this.cancelSelection());

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.onTick() });

    this.refreshAll();
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

  private footprintCellsFor(col: number, row: number, w: number, h: number): { col: number; row: number }[] {
    const cells: { col: number; row: number }[] = [];
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) cells.push({ col: col + dc, row: row + dr });
    }
    return cells;
  }

  /**
   * True when the pointer is over any non-interactive HUD chrome (palette, HUD, quest panel, or
   * the selection panel while it's showing) rather than the grid. Gating the selection-panel
   * check on `.visible` keeps it from blanket-blocking legitimate grid tiles that happen to fall
   * under that screen region once the panel is closed.
   *
   * This does NOT cover clicks that hit one of the panel's own buttons — see `uiConsumedClick`
   * for why that needs a separate mechanism.
   */
  private isOverUi(pointer: Phaser.Input.Pointer): boolean {
    if (pointer.y > this.scale.height - PALETTE_Y_OFFSET) return true;
    if (withinRect(pointer, HUD_X, HUD_Y, HUD_W, HUD_H)) return true;
    if (withinRect(pointer, QUEST_X, QUEST_Y, QUEST_W, QUEST_H)) return true;
    if (this.selectPanel.visible && withinRect(pointer, this.SEL_X, this.SEL_Y, this.SEL_W, SEL_MAX_H)) return true;
    return false;
  }

  // ----------------------------------------------------------------- hud --

  private createHud(): void {
    roundedPanel(this, HUD_X, HUD_Y, HUD_W, HUD_H, 16);

    this.add.text(HUD_X + 18, HUD_Y + 12, "THE CONNECTED AGE — 2026", {
      fontFamily: FONT_FAMILY,
      fontSize: "14px",
      fontStyle: "700",
      color: "#f8fafc",
    });

    const rowY = [HUD_Y + 44, HUD_Y + 78];
    const colSpacing = (HUD_W - 36) / 4;

    HUD_RESOURCE_ORDER.forEach((id, i) => {
      this.addHudChip(HUD_X + 18 + i * colSpacing, rowY[0], id);
    });

    this.addPopulationEnergyChips(HUD_X + 18, rowY[1]);

    this.deficitText = this.add.text(HUD_X + 18, HUD_Y + 108, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      fontStyle: "600",
      color: "#f87171",
    });

    this.placingText = this.add.text(HUD_X + 18, HUD_Y + HUD_H - 20, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      fontStyle: "600",
      color: "#38bdf8",
    });

    this.toastText = this.add
      .text(this.scale.width / 2, HUD_Y + HUD_H + 8, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "13px",
        fontStyle: "600",
        color: "#facc15",
      })
      .setOrigin(0.5, 0);
  }

  private addHudChip(x: number, y: number, id: ResourceId): void {
    const def = getResourceDef(id);
    const swatch = this.add.graphics({ x, y });
    swatch.fillStyle(def.color, 1);
    swatch.fillRoundedRect(0, 0, 11, 11, 3);

    this.add.text(x + 16, y - 7, def.label, {
      fontFamily: FONT_FAMILY,
      fontSize: "10px",
      color: "#94a3b8",
    });

    const value = this.add
      .text(x + 16, y + 5, "0", {
        fontFamily: FONT_FAMILY,
        fontSize: "14px",
        fontStyle: "600",
        color: "#e5e7eb",
      })
      .setOrigin(0, 0.5);
    this.resourceTexts[id] = value;
  }

  private addPopulationEnergyChips(x: number, y: number): void {
    const popSwatch = this.add.graphics({ x, y });
    popSwatch.fillStyle(getResourceDef("population").color, 1);
    popSwatch.fillRoundedRect(0, 0, 11, 11, 3);
    this.populationText = this.add
      .text(x + 16, y + 5, "", { fontFamily: FONT_FAMILY, fontSize: "13px", fontStyle: "600", color: "#e5e7eb" })
      .setOrigin(0, 0.5);

    const energyX = x + 220;
    const energySwatch = this.add.graphics({ x: energyX, y });
    energySwatch.fillStyle(getResourceDef("energy").color, 1);
    energySwatch.fillRoundedRect(0, 0, 11, 11, 3);
    this.energyText = this.add
      .text(energyX + 16, y + 5, "", { fontFamily: FONT_FAMILY, fontSize: "13px", fontStyle: "600", color: "#e5e7eb" })
      .setOrigin(0, 0.5);
  }

  private updateHud(): void {
    for (const id of HUD_RESOURCE_ORDER) {
      const def = getResourceDef(id);
      const value = this.state.resources[id] ?? 0;
      const text = def.stockpileCap !== undefined ? `${Math.floor(value)}/${def.stockpileCap}` : `${Math.floor(value)}`;
      this.resourceTexts[id]?.setText(text);
      const short = def.stockpileCap !== undefined && value <= 0 ? "#f87171" : "#e5e7eb";
      this.resourceTexts[id]?.setColor(short);
    }

    const population = totalPopulationCapacity(this.state);
    const assigned = totalAssignedWorkers(this.state);
    const available = availableWorkers(this.state);
    this.populationText.setText(`Pop ${population} · Workers ${available} free / ${assigned} busy`);

    const energy = computeEnergyStatus(this.state);
    this.energyText.setText(`Energy ${Math.round(energy.provided)} / ${Math.round(energy.required)} MW`);
    this.energyText.setColor(energy.share < 0.999 ? "#f97316" : "#e5e7eb");

    const foodShort = (this.state.resources.food ?? 0) <= 0 && population > 0;
    this.deficitText.setText(foodShort ? "FOOD SHORTAGE — population upkeep isn't being met." : "");

    this.placingText.setText(this.describeMode());
  }

  private describeMode(): string {
    if (this.moveUid) return "Moving building — click a tile to relocate it (Esc to cancel).";
    if (this.selectedBuildingId) {
      const def = getBuildingDef(this.selectedBuildingId);
      return `Placing: ${def.name} (${def.footprint.w}x${def.footprint.h}) — click a tile (Esc to cancel).`;
    }
    return "Select a building below to place it, or click a placed building to inspect/collect it.";
  }

  private flashMessage(message: string): void {
    this.toastClearEvent?.remove();
    this.toastText.setText(message);
    this.toastClearEvent = this.time.delayedCall(1800, () => this.toastText.setText(""));
  }

  private spawnFloatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: "14px", fontStyle: "700", color })
      .setOrigin(0.5)
      .setDepth(1200);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------- palette --

  private createPalette(): void {
    for (const obj of this.paletteObjects) obj.destroy();
    this.paletteObjects = [];
    this.paletteButtons = [];

    const startX = 16;
    const y = this.scale.height - 76;
    const width = 172;
    const height = 60;
    const spacing = 186;

    const defs = buildableBuildings();
    const panelWidth = spacing * (defs.length - 1) + width + 20;
    const panel = roundedPanel(this, startX - 10, y - 10, panelWidth, height + 20, 18);
    this.paletteObjects.push(panel);

    defs.forEach((def, i) => {
      const x = startX + i * spacing;
      const level0 = def.levels[0];
      const handle = createPanelButton(
        this,
        x,
        y,
        width,
        height,
        `${def.name}\n${formatCost(level0.cost ?? {})} · ${formatSeconds(level0.buildSeconds)}`,
        def.color,
        { fontFamily: FONT_FAMILY, fontSize: "11px", color: "#e5e7eb" },
      );

      handle.onClick(() => {
        this.selectedBuildingId = def.id;
        this.moveUid = null;
        this.selectedUid = null;
        for (const btn of this.paletteButtons) btn.setState({ selected: false });
        handle.setState({ selected: true });
        this.refreshAll();
      });

      this.paletteButtons.push(handle);
      this.paletteObjects.push(handle.container);
    });
  }

  // -------------------------------------------------------------- quests --

  private createQuestPanel(): void {
    this.questPanel = this.add.container(0, 0);
    const bg = roundedPanel(this, QUEST_X, QUEST_Y, QUEST_W, QUEST_H, 16);
    this.questPanel.add(bg);

    const title = this.add.text(QUEST_X + 16, QUEST_Y + 14, "OBJECTIVES", {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      fontStyle: "700",
      color: "#94a3b8",
    });
    this.questPanel.add(title);
  }

  private updateQuestPanel(): void {
    // Rebuild the list rows each refresh — quest count is tiny, so this is cheap.
    const stale = this.questPanel.list.slice(2);
    for (const obj of stale) obj.destroy();

    const x = QUEST_X + 16;
    const active = QUEST_DEFS.filter((q) => !this.state.completedQuestIds.includes(q.id)).slice(0, 3);

    active.forEach((quest, i) => {
      const y = QUEST_Y + 36 + i * 24;
      const line = this.add.text(x, y, `${quest.title} — ${quest.description}`, {
        fontFamily: FONT_FAMILY,
        fontSize: "11px",
        color: "#e5e7eb",
        wordWrap: { width: 268 },
      });
      this.questPanel.add(line);
    });

    if (active.length === 0) {
      const done = this.add.text(x, QUEST_Y + 36, "All current objectives complete!", {
        fontFamily: FONT_FAMILY,
        fontSize: "11px",
        color: "#4ade80",
      });
      this.questPanel.add(done);
    }
  }

  // ------------------------------------------------------- selection UI --

  private createSelectionPanel(): void {
    this.selectPanel = this.add.container(this.SEL_X, this.SEL_Y).setVisible(false);
  }

  private selectBuilding(uid: string): void {
    this.selectedUid = uid;
    this.selectedBuildingId = null;
    this.moveUid = null;
    for (const btn of this.paletteButtons) btn.setState({ selected: false });
  }

  private cancelSelection(): void {
    this.selectedBuildingId = null;
    this.selectedUid = null;
    this.moveUid = null;
    for (const btn of this.paletteButtons) btn.setState({ selected: false });
    this.hoverLayer.clear();
    this.refreshAll();
  }

  private updateSelectionPanel(): void {
    this.selectPanel.removeAll(true);

    const building = this.selectedUid ? this.state.buildings.find((b) => b.uid === this.selectedUid) : undefined;
    if (!building) {
      this.selectPanel.setVisible(false);
      return;
    }
    this.selectPanel.setVisible(true);

    const def = getBuildingDef(building.defId);
    const panelHeight = 300;
    const bg = roundedPanel(this, 0, 0, this.SEL_W, panelHeight, 16);
    this.selectPanel.add(bg);

    const closeBtn = this.add
      .text(this.SEL_W - 24, 14, "×", { fontFamily: FONT_FAMILY, fontSize: "20px", color: "#94a3b8" })
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => {
      this.uiConsumedClick = true;
      this.cancelSelection();
    });
    this.selectPanel.add(closeBtn);

    let y = 18;
    const addLine = (text: string, opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}, gap = 20): void => {
      const t = this.add.text(18, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#cbd5e1",
        wordWrap: { width: this.SEL_W - 36 },
        ...opts,
      });
      this.selectPanel.add(t);
      y += Math.max(gap, t.height + 4);
    };

    if (building.construction) {
      const targetLevel = def.levels[building.construction.targetLevelIndex];
      addLine(`${def.name}`, { fontSize: "15px", fontStyle: "700", color: "#f8fafc" }, 24);
      const progress = 1 - building.construction.remainingSeconds / building.construction.totalSeconds;
      addLine(`Constructing ${targetLevel.label}: ${Math.round(progress * 100)}%`);
      addLine(`Remaining: ${formatSeconds(building.construction.remainingSeconds)}`);
      this.addSelectionButton(y, "Demolish", 0xf87171, () => this.doDemolish(building.uid));
      return;
    }

    const level = def.levels[building.levelIndex];
    addLine(`${def.name} — ${level.label}`, { fontSize: "15px", fontStyle: "700", color: "#f8fafc" }, 24);

    if (level.populationProvided) addLine(`Provides ${level.populationProvided} population capacity.`);
    if (level.energyProvided) addLine(`Provides ${level.energyProvided} MW energy capacity.`);
    if (level.recipe) {
      const out = level.recipe.output;
      const outLabel = getResourceDef(out.resource).label;
      const inputsText = Object.entries(level.recipe.inputs)
        .map(([res, amt]) => `${amt} ${getResourceDef(res as ResourceId).label}`)
        .join(", ");
      addLine(
        inputsText
          ? `Converts ${inputsText} → ${out.amount} ${outLabel} every ${level.recipe.cycleSeconds}s.`
          : `Produces ${out.amount} ${outLabel} every ${level.recipe.cycleSeconds}s.`,
      );
      addLine(`Buffer: ${Math.floor(building.outputBuffer)} / ${level.outputCapacity ?? "∞"} (tap the building to collect).`);
    }

    if (level.workersRequired > 0) {
      addLine("Workers assigned:", {}, 4);
      const stepperY = y + 4;
      const stepper: StepperHandle = createStepper(this, 18, stepperY, {
        fontFamily: FONT_FAMILY,
        fontSize: "13px",
        color: "#e5e7eb",
      });
      stepper.setValue(building.assignedWorkers, level.workersRequired);
      stepper.onChange((delta) => {
        this.uiConsumedClick = true;
        const result = setAssignedWorkers(this.state, building.uid, building.assignedWorkers + delta);
        if (!result.ok) this.flashMessage(result.reason);
        this.refreshAll();
      });
      const stepperContainer = stepper.container.setPosition(18, stepperY);
      this.selectPanel.add(stepperContainer);
      y = stepperY + 30;
    }

    if (level.energyRequired > 0) addLine(`Draws ${level.energyRequired} MW while staffed.`);

    const nextLevel = def.levels[building.levelIndex + 1];
    if (nextLevel) {
      const cost = nextLevel.cost ?? {};
      addLine(`Upgrade to ${nextLevel.label}: ${formatCost(cost)} · ${formatSeconds(nextLevel.buildSeconds)}`);
      y += 6;
      this.addSelectionButton(y, "Upgrade", def.color, () => this.doUpgrade(building.uid));
      y += 40;
    } else {
      addLine("Max level reached.");
      y += 6;
    }

    if (!def.fixed) {
      this.addSelectionButton(y, "Move", 0x38bdf8, () => this.beginMove(building.uid));
      y += 40;
      this.addSelectionButton(y, "Demolish", 0xf87171, () => this.doDemolish(building.uid));
    }
  }

  private addSelectionButton(y: number, label: string, color: number, onClick: () => void): void {
    const handle = createPanelButton(this, 18, y, this.SEL_W - 36, 32, label, color, {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      color: "#e5e7eb",
    });
    handle.onClick(() => {
      this.uiConsumedClick = true;
      onClick();
    });
    this.selectPanel.add(handle.container);
  }

  private doUpgrade(uid: string): void {
    const result = startUpgrade(this.state, uid);
    this.reportResult(result, "Upgrade started.");
  }

  private doDemolish(uid: string): void {
    const result = demolishBuilding(this.state, uid);
    if (result.ok && this.selectedUid === uid) this.selectedUid = null;
    this.reportResult(result, "Demolished.");
  }

  private beginMove(uid: string): void {
    this.moveUid = uid;
    this.selectedUid = null;
    this.selectedBuildingId = null;
    this.refreshAll();
  }

  private reportResult(result: ActionResult, successMessage: string): void {
    this.flashMessage(result.ok ? successMessage : result.reason);
    this.refreshAll();
  }

  // -------------------------------------------------------------- input --

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.hoverLayer.clear();
    if (this.isOverUi(pointer)) return;

    const { col, row } = this.grid.toGrid(pointer.x, pointer.y);
    if (!this.inBounds(col, row)) return;

    if (this.moveUid) {
      const building = this.state.buildings.find((b) => b.uid === this.moveUid);
      if (!building) return;
      const def = getBuildingDef(building.defId);
      this.previewFootprint(col, row, def.footprint.w, def.footprint.h, building.uid);
      return;
    }

    if (this.selectedBuildingId) {
      const def = getBuildingDef(this.selectedBuildingId);
      this.previewFootprint(col, row, def.footprint.w, def.footprint.h);
    }
  }

  private previewFootprint(col: number, row: number, w: number, h: number, ignoreUid?: string): void {
    const cells = this.footprintCellsFor(col, row, w, h);
    const occupancy = new Map<string, string>();
    for (const b of this.state.buildings) {
      const bDef = getBuildingDef(b.defId);
      for (const c of this.footprintCellsFor(b.col, b.row, bDef.footprint.w, bDef.footprint.h)) {
        occupancy.set(`${c.col},${c.row}`, b.uid);
      }
    }
    const valid = cells.every((c) => {
      if (!this.inBounds(c.col, c.row)) return false;
      const occupant = occupancy.get(`${c.col},${c.row}`);
      return !occupant || occupant === ignoreUid;
    });
    for (const c of cells) this.drawHoverOutline(c.col, c.row, valid ? HOVER_FREE : HOVER_BLOCKED);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.uiConsumedClick) {
      this.uiConsumedClick = false;
      return;
    }
    if (this.isOverUi(pointer)) return;

    const { col, row } = this.grid.toGrid(pointer.x, pointer.y);
    if (!this.inBounds(col, row)) return;

    if (this.moveUid) {
      const result = moveBuilding(this.state, this.moveUid, col, row, GRID_SIZE);
      if (result.ok) {
        this.selectedUid = this.moveUid;
        this.moveUid = null;
      }
      this.reportResult(result, "Moved.");
      return;
    }

    const existing = findBuildingAt(this.state, col, row);
    if (existing) {
      if (existing.outputBuffer > 0) {
        const level = currentLevel(existing, getBuildingDef(existing.defId));
        const collected = existing.outputBuffer;
        const result = collectBuilding(this.state, existing.uid);
        if (result.ok && level?.recipe) {
          const world = this.grid.toScreen(existing.col, existing.row);
          this.spawnFloatText(world.x, world.y - 40, `+${Math.floor(collected)} ${getResourceDef(level.recipe.output.resource).label}`, "#facc15");
        }
        this.refreshAll();
      } else {
        this.selectBuilding(existing.uid);
        this.refreshAll();
      }
      return;
    }

    if (this.selectedBuildingId) {
      const result = placeBuilding(this.state, this.selectedBuildingId, col, row, GRID_SIZE);
      this.reportResult(result, "Construction started.");
      return;
    }

    this.cancelSelection();
  }

  // --------------------------------------------------------- render/tick --

  private renderBuildings(): void {
    this.buildingsLayer.removeAll(true);
    const energyStatus = computeEnergyStatus(this.state);

    for (const building of this.state.buildings) {
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

  private refreshAll(): void {
    this.renderBuildings();
    this.updateHud();
    this.updateQuestPanel();
    this.updateSelectionPanel();
  }

  private onTick(): void {
    tick(this.state, 1);
    this.ticksSinceSave += 1;
    if (this.ticksSinceSave >= SAVE_INTERVAL_TICKS) {
      saveGame(this.state);
      this.ticksSinceSave = 0;
    }
    this.refreshAll();
  }
}
