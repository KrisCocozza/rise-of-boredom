import { GameState, PlacedBuildingState } from "./types";

/** The HQ starts pre-placed and pre-built — it's not something the player constructs. */
export function createInitialState(): GameState {
  const hq: PlacedBuildingState = {
    uid: "hq",
    defId: "headquarters",
    col: 4,
    row: 4,
    levelIndex: 0,
    assignedWorkers: 0,
    outputBuffer: 0,
  };

  return {
    resources: { credits: 400, food: 20, materials: 40, components: 0 },
    lifetimeProduced: {},
    buildings: [hq],
    completedQuestIds: [],
    lastTickAtMs: Date.now(),
  };
}
