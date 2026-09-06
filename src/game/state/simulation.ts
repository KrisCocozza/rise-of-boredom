import { getBuildingDef } from "../content/buildings";
import { QUEST_DEFS, QuestObjective } from "../content/quests";
import { ResourceId } from "../content/resources";
import {
  availableWorkers,
  buildingEfficiency,
  computeEnergyStatus,
  currentLevel,
  totalPopulationCapacity,
} from "./derived";
import { GameState, PlacedBuildingState } from "./types";

/** Food upkeep drawn from the stockpile per unit of population per second. Placeholder — tune after playtesting. */
export const FOOD_UPKEEP_PER_POP = 0.03;
/** Ceiling on a single offline catch-up simulation, so leaving the tab closed for days doesn't cost a slow loop. */
const MAX_OFFLINE_SECONDS = 8 * 60 * 60;

function addResource(state: GameState, resource: ResourceId, amount: number): void {
  state.resources[resource] = (state.resources[resource] ?? 0) + amount;
}

function resourceAmount(state: GameState, resource: ResourceId): number {
  return state.resources[resource] ?? 0;
}

function tickConstruction(building: PlacedBuildingState, dtSeconds: number): void {
  if (!building.construction) return;
  building.construction.remainingSeconds -= dtSeconds;
  if (building.construction.remainingSeconds <= 0) {
    building.levelIndex = building.construction.targetLevelIndex;
    building.construction = undefined;
  }
}

function tickProduction(state: GameState, building: PlacedBuildingState, dtSeconds: number, energyShare: number): void {
  const def = getBuildingDef(building.defId);
  const level = currentLevel(building, def);
  if (!level?.recipe || building.assignedWorkers <= 0) return;

  const cap = level.outputCapacity ?? Infinity;
  const remainingCapacity = cap - building.outputBuffer;
  if (remainingCapacity <= 0) return;

  const efficiency = buildingEfficiency(level, building.assignedWorkers, energyShare);
  if (efficiency <= 0) return;

  const rate = efficiency / level.recipe.cycleSeconds;
  const rawOutput = level.recipe.output.amount * rate * dtSeconds;
  if (rawOutput <= 0) return;

  let inputScale = 1;
  for (const [resource, perCycle] of Object.entries(level.recipe.inputs)) {
    const needed = (perCycle ?? 0) * rate * dtSeconds;
    if (needed <= 0) continue;
    const available = resourceAmount(state, resource as ResourceId);
    inputScale = Math.min(inputScale, available / needed);
  }
  inputScale = Math.max(0, inputScale);

  const outputAfterInputs = rawOutput * inputScale;
  const finalOutput = Math.min(outputAfterInputs, remainingCapacity);
  const finalScale = rawOutput > 0 ? finalOutput / rawOutput : 0;
  if (finalScale <= 0) return;

  for (const [resource, perCycle] of Object.entries(level.recipe.inputs)) {
    const needed = (perCycle ?? 0) * rate * dtSeconds * finalScale;
    if (needed <= 0) continue;
    state.resources[resource as ResourceId] = Math.max(0, resourceAmount(state, resource as ResourceId) - needed);
  }

  building.outputBuffer += finalOutput;
  state.lifetimeProduced[level.recipe.output.resource] =
    (state.lifetimeProduced[level.recipe.output.resource] ?? 0) + finalOutput;
}

function tickFoodUpkeep(state: GameState, dtSeconds: number): void {
  const population = totalPopulationCapacity(state);
  const drain = population * FOOD_UPKEEP_PER_POP * dtSeconds;
  if (drain <= 0) return;
  state.resources.food = Math.max(0, resourceAmount(state, "food") - drain);
}

function objectiveMet(state: GameState, objective: QuestObjective): boolean {
  switch (objective.type) {
    case "buildCount":
      return state.buildings.filter((b) => b.defId === objective.buildingId).length >= objective.count;
    case "upgradeReached":
      return state.buildings.some((b) => b.defId === objective.buildingId && b.levelIndex + 1 >= objective.minLevel);
    case "stockpileAtLeast":
      return resourceAmount(state, objective.resource) >= objective.amount;
    case "lifetimeProducedAtLeast":
      return (state.lifetimeProduced[objective.resource] ?? 0) >= objective.amount;
    case "populationAtLeast":
      return totalPopulationCapacity(state) >= objective.amount;
    case "availableWorkersAtLeast":
      return availableWorkers(state) >= objective.amount;
  }
}

function tickQuests(state: GameState): void {
  for (const quest of QUEST_DEFS) {
    if (state.completedQuestIds.includes(quest.id)) continue;
    if (!objectiveMet(state, quest.objective)) continue;
    state.completedQuestIds.push(quest.id);
    for (const [resource, amount] of Object.entries(quest.reward)) {
      addResource(state, resource as ResourceId, amount ?? 0);
    }
  }
}

/** Advances the simulation by dtSeconds, mutating and returning the same state object. */
export function tick(state: GameState, dtSeconds: number): GameState {
  if (dtSeconds <= 0) return state;

  for (const building of state.buildings) {
    tickConstruction(building, dtSeconds);
  }

  const energyShare = computeEnergyStatus(state).share;
  for (const building of state.buildings) {
    tickProduction(state, building, dtSeconds, energyShare);
  }

  tickFoodUpkeep(state, dtSeconds);
  tickQuests(state);

  state.lastTickAtMs += dtSeconds * 1000;
  return state;
}

/** Simulates elapsed wall-clock time in fixed steps, capped so a long-idle tab doesn't hang the game. */
export function catchUp(state: GameState, elapsedSeconds: number, stepSeconds = 1): GameState {
  const clamped = Math.min(Math.max(0, elapsedSeconds), MAX_OFFLINE_SECONDS);
  let remaining = clamped;
  while (remaining > 0) {
    const step = Math.min(stepSeconds, remaining);
    tick(state, step);
    remaining -= step;
  }
  return state;
}
