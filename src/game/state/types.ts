import { ResourceId } from "../content/resources";

export interface ConstructionState {
  targetLevelIndex: number;
  remainingSeconds: number;
  totalSeconds: number;
}

export interface PlacedBuildingState {
  uid: string;
  defId: string;
  col: number;
  row: number;
  levelIndex: number;
  assignedWorkers: number;
  /** Uncollected units of this building's recipe output resource, capped at that level's outputCapacity. */
  outputBuffer: number;
  /** Present while the building is under initial construction or mid-upgrade; absent once operational. */
  construction?: ConstructionState;
}

export interface GameState {
  /** The spendable, already-collected pool. */
  resources: Partial<Record<ResourceId, number>>;
  lifetimeProduced: Partial<Record<ResourceId, number>>;
  buildings: PlacedBuildingState[];
  completedQuestIds: string[];
  /** Wall-clock ms of the last simulated tick — used to compute offline catch-up on load. */
  lastTickAtMs: number;
}
