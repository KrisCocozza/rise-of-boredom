import { BuildingDef, BuildingLevel, Footprint, getBuildingDef } from "../content/buildings";
import { GameState, PlacedBuildingState } from "./types";

export interface GridCell {
  col: number;
  row: number;
}

/** All grid cells a building's footprint covers, anchored at its (col, row) low corner. */
export function footprintCells(anchor: GridCell, footprint: Footprint): GridCell[] {
  const cells: GridCell[] = [];
  for (let dc = 0; dc < footprint.w; dc++) {
    for (let dr = 0; dr < footprint.h; dr++) {
      cells.push({ col: anchor.col + dc, row: anchor.row + dr });
    }
  }
  return cells;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Maps every occupied grid cell to the uid of the building covering it (placed buildings only, including under-construction ones). */
export function buildOccupancyMap(state: GameState): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of state.buildings) {
    const def = getBuildingDef(b.defId);
    for (const cell of footprintCells(b, def.footprint)) {
      map.set(cellKey(cell.col, cell.row), b.uid);
    }
  }
  return map;
}

export function findBuildingAt(state: GameState, col: number, row: number): PlacedBuildingState | undefined {
  const occupancy = buildOccupancyMap(state);
  const uid = occupancy.get(cellKey(col, row));
  return uid ? state.buildings.find((b) => b.uid === uid) : undefined;
}

/** True once a building has completed at least its initial construction (levelIndex >= 0). */
export function isOperational(building: PlacedBuildingState): boolean {
  return building.levelIndex >= 0;
}

/** The currently-active level — the building keeps operating at this level while an upgrade is in progress. */
export function currentLevel(building: PlacedBuildingState, def: BuildingDef): BuildingLevel | undefined {
  return isOperational(building) ? def.levels[building.levelIndex] : undefined;
}

export function totalPopulationCapacity(state: GameState): number {
  let total = 0;
  for (const b of state.buildings) {
    const def = getBuildingDef(b.defId);
    const level = currentLevel(b, def);
    if (level?.populationProvided) total += level.populationProvided;
  }
  return total;
}

export function totalAssignedWorkers(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + b.assignedWorkers, 0);
}

export function availableWorkers(state: GameState): number {
  return totalPopulationCapacity(state) - totalAssignedWorkers(state);
}

/** How much of a building's worker requirement is currently staffed, in [0, 1]. Buildings needing 0 workers are always fully staffed. */
export function workerRatio(level: BuildingLevel, assignedWorkers: number): number {
  return level.workersRequired > 0 ? Math.min(assignedWorkers / level.workersRequired, 1) : 1;
}

export interface EnergyStatus {
  provided: number;
  required: number;
  /** Fraction of required energy actually available this tick — the fair-share brownout multiplier. */
  share: number;
}

/**
 * Energy demand only counts buildings that are actually staffed (assignedWorkers > 0), scaled by
 * their worker ratio — an idle, unstaffed building draws no power. Supply is scaled the same way,
 * so an understaffed Solar Installation provides proportionally less capacity.
 */
export function computeEnergyStatus(state: GameState): EnergyStatus {
  let provided = 0;
  let required = 0;
  for (const b of state.buildings) {
    const def = getBuildingDef(b.defId);
    const level = currentLevel(b, def);
    if (!level) continue;
    const ratio = workerRatio(level, b.assignedWorkers);
    if (level.energyProvided) provided += level.energyProvided * ratio;
    if (level.energyRequired && b.assignedWorkers > 0) required += level.energyRequired * ratio;
  }
  const share = required > 0 ? Math.min(provided / required, 1) : 1;
  return { provided, required, share };
}

/** Efficiency multiplier applied to a producing building's recipe this tick, in [0, 1]. */
export function buildingEfficiency(level: BuildingLevel, assignedWorkers: number, energyShare: number): number {
  const wRatio = workerRatio(level, assignedWorkers);
  const energyRatio = level.energyRequired > 0 ? energyShare : 1;
  return Math.min(wRatio, energyRatio);
}
