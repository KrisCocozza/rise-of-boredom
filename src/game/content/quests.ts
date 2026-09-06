import { ResourceAmount, ResourceId } from "./resources";

export type QuestObjective =
  | { type: "buildCount"; buildingId: string; count: number }
  | { type: "upgradeReached"; buildingId: string; minLevel: number }
  | { type: "stockpileAtLeast"; resource: ResourceId; amount: number }
  | { type: "lifetimeProducedAtLeast"; resource: ResourceId; amount: number }
  | { type: "populationAtLeast"; amount: number }
  | { type: "availableWorkersAtLeast"; amount: number };

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  objective: QuestObjective;
  reward: ResourceAmount;
}

// A short linear chain mirroring the Milestone 1 definition-of-done loop.
export const QUEST_DEFS: QuestDef[] = [
  {
    id: "build-housing",
    title: "Break Ground",
    description: "Build Worker Housing to attract your first workers.",
    objective: { type: "buildCount", buildingId: "worker-housing", count: 1 },
    reward: { credits: 60 },
  },
  {
    id: "grow-population",
    title: "Open For Business",
    description: "Reach a population of 10.",
    objective: { type: "populationAtLeast", amount: 10 },
    reward: { credits: 80, materials: 20 },
  },
  {
    id: "collect-food",
    title: "Feed The Team",
    description: "Produce 60 Food at an Urban Farm.",
    // Measured on production rather than stockpile so it tracks actually building the farm, and
    // so it can't be trivially satisfied by the starting resources. Set above the farm's 40-unit
    // buffer cap so it can't be finished without collecting at least once.
    objective: { type: "lifetimeProducedAtLeast", resource: "food", amount: 60 },
    reward: { credits: 60 },
  },
  {
    id: "collect-materials",
    title: "Raw Supply",
    description: "Produce 60 Materials at a Recycler.",
    objective: { type: "lifetimeProducedAtLeast", resource: "materials", amount: 60 },
    reward: { credits: 80 },
  },
  {
    id: "build-workshop",
    title: "Tool Up",
    description: "Build a Workshop to start manufacturing Components.",
    objective: { type: "buildCount", buildingId: "workshop", count: 1 },
    reward: { materials: 30 },
  },
  {
    id: "produce-components",
    title: "First Batch",
    description: "Produce a lifetime total of 20 Components.",
    objective: { type: "lifetimeProducedAtLeast", resource: "components", amount: 20 },
    reward: { credits: 150 },
  },
  {
    id: "upgrade-something",
    title: "Level Up",
    description: "Upgrade any building to Level 2.",
    objective: { type: "upgradeReached", buildingId: "worker-housing", minLevel: 2 },
    reward: { credits: 120, components: 20 },
  },
  {
    id: "workforce",
    title: "Full Employment",
    description: "Have at least 5 workers available and unassigned at once.",
    objective: { type: "availableWorkersAtLeast", amount: 5 },
    reward: { credits: 100 },
  },
];
