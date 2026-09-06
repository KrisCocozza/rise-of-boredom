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
    // Sized so the whole starter set (Housing 20 + Farm 25 + Recycler + Solar 15 materials, and
    // ~240 credits) is affordable up front with room to spare, and so food doesn't go into
    // deficit before a farm can realistically be producing. Components are deliberately 0 —
    // earning the first batch at a Workshop is the point of the early chain.
    resources: { credits: 600, food: 50, materials: 120, components: 0 },
    lifetimeProduced: {},
    buildings: [hq],
    completedQuestIds: [],
    lastTickAtMs: Date.now(),
  };
}
