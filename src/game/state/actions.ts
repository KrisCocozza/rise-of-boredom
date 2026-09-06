import { getBuildingDef } from "../content/buildings";
import { ResourceAmount, ResourceId, getResourceDef } from "../content/resources";
import {
  buildOccupancyMap,
  cellKey,
  currentLevel,
  footprintCells,
  isOperational,
  totalAssignedWorkers,
  totalPopulationCapacity,
} from "./derived";
import { GameState, PlacedBuildingState } from "./types";

export type ActionResult = { ok: true } | { ok: false; reason: string };

function ok(): ActionResult {
  return { ok: true };
}
function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

function canAfford(state: GameState, cost: ResourceAmount): boolean {
  return Object.entries(cost).every(([res, amt]) => (state.resources[res as ResourceId] ?? 0) >= (amt ?? 0));
}

function spend(state: GameState, cost: ResourceAmount): void {
  for (const [res, amt] of Object.entries(cost)) {
    state.resources[res as ResourceId] = (state.resources[res as ResourceId] ?? 0) - (amt ?? 0);
  }
}

function footprintFits(
  state: GameState,
  anchor: { col: number; row: number },
  footprint: { w: number; h: number },
  gridSize: number,
  ignoreUid?: string,
): boolean {
  const occupancy = buildOccupancyMap(state);
  for (const cell of footprintCells(anchor, footprint)) {
    if (cell.col < 0 || cell.col >= gridSize || cell.row < 0 || cell.row >= gridSize) return false;
    const occupant = occupancy.get(cellKey(cell.col, cell.row));
    if (occupant && occupant !== ignoreUid) return false;
  }
  return true;
}

export function placeBuilding(state: GameState, defId: string, col: number, row: number, gridSize: number): ActionResult {
  const def = getBuildingDef(defId);
  if (def.fixed) return fail(`${def.name} cannot be constructed directly.`);

  const level0 = def.levels[0];
  if (!footprintFits(state, { col, row }, def.footprint, gridSize)) return fail("That plot won't fit here.");
  const cost = level0.cost ?? {};
  if (!canAfford(state, cost)) return fail("Not enough resources.");

  spend(state, cost);
  const building: PlacedBuildingState = {
    uid: crypto.randomUUID(),
    defId,
    col,
    row,
    levelIndex: -1,
    assignedWorkers: 0,
    outputBuffer: 0,
    construction: { targetLevelIndex: 0, remainingSeconds: level0.buildSeconds, totalSeconds: level0.buildSeconds },
  };
  state.buildings.push(building);
  return ok();
}

export function startUpgrade(state: GameState, uid: string): ActionResult {
  const building = state.buildings.find((b) => b.uid === uid);
  if (!building) return fail("Unknown building.");
  if (!isOperational(building)) return fail("Still under construction.");
  if (building.construction) return fail("Already upgrading.");

  const def = getBuildingDef(building.defId);
  const nextIndex = building.levelIndex + 1;
  const nextLevel = def.levels[nextIndex];
  if (!nextLevel) return fail("Already at max level.");

  const cost = nextLevel.cost ?? {};
  if (!canAfford(state, cost)) return fail("Not enough resources.");

  spend(state, cost);
  building.construction = { targetLevelIndex: nextIndex, remainingSeconds: nextLevel.buildSeconds, totalSeconds: nextLevel.buildSeconds };
  return ok();
}

export function setAssignedWorkers(state: GameState, uid: string, desired: number): ActionResult {
  const building = state.buildings.find((b) => b.uid === uid);
  if (!building) return fail("Unknown building.");
  const def = getBuildingDef(building.defId);
  const level = currentLevel(building, def);
  if (!level) return fail("Still under construction.");

  const clamped = Math.max(0, Math.min(desired, level.workersRequired));
  if (clamped === building.assignedWorkers) return ok();

  const poolAfter = totalAssignedWorkers(state) - building.assignedWorkers + clamped;
  if (poolAfter > totalPopulationCapacity(state)) return fail("Not enough available workers.");

  building.assignedWorkers = clamped;
  return ok();
}

export function moveBuilding(state: GameState, uid: string, col: number, row: number, gridSize: number): ActionResult {
  const building = state.buildings.find((b) => b.uid === uid);
  if (!building) return fail("Unknown building.");
  const def = getBuildingDef(building.defId);
  if (def.fixed) return fail(`${def.name} cannot be moved.`);
  if (!footprintFits(state, { col, row }, def.footprint, gridSize, uid)) return fail("That plot won't fit here.");

  building.col = col;
  building.row = row;
  return ok();
}

export function demolishBuilding(state: GameState, uid: string): ActionResult {
  const index = state.buildings.findIndex((b) => b.uid === uid);
  if (index === -1) return fail("Unknown building.");
  const def = getBuildingDef(state.buildings[index].defId);
  if (def.fixed) return fail(`${def.name} cannot be demolished.`);

  state.buildings.splice(index, 1);
  return ok();
}

export function collectBuilding(state: GameState, uid: string): ActionResult {
  const building = state.buildings.find((b) => b.uid === uid);
  if (!building) return fail("Unknown building.");
  const def = getBuildingDef(building.defId);
  const level = currentLevel(building, def);
  if (!level?.recipe || building.outputBuffer <= 0) return fail("Nothing to collect.");

  const resource = level.recipe.output.resource;
  const cap = getResourceDef(resource).stockpileCap;
  const currentStock = state.resources[resource] ?? 0;
  const room = cap !== undefined ? Math.max(0, cap - currentStock) : building.outputBuffer;
  const collected = Math.min(building.outputBuffer, room);
  if (collected <= 0) return fail(`${getResourceDef(resource).label} stockpile is full.`);

  state.resources[resource] = currentStock + collected;
  building.outputBuffer -= collected;
  return ok();
}
