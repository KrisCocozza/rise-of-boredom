import { ResourceAmount, ResourceId } from "./resources";

export interface Footprint {
  w: number;
  h: number;
}

export interface Recipe {
  /** Drawn from the global stockpile as the output buffer fills. Empty for gatherers (Urban Farm, Recycler). */
  inputs: ResourceAmount;
  /** Accumulates into the building's own local buffer, not the global stockpile — see outputCapacity. */
  output: { resource: ResourceId; amount: number };
  cycleSeconds: number;
}

export interface BuildingLevel {
  label: string;
  /** Omitted on level 1 of a purchasable building (its cost lives on the def); required for every upgrade tier. */
  cost?: ResourceAmount;
  buildSeconds: number;
  workersRequired: number;
  energyRequired: number;
  /** Capacity resources this level contributes while operating (Solar Installation, Worker Housing). */
  energyProvided?: number;
  populationProvided?: number;
  /** Omitted for pure-capacity buildings (Housing, Solar) that don't accumulate a collectible resource. */
  recipe?: Recipe;
  outputCapacity?: number;
  // Visual tuning, used by the procedural skins when present (see buildingVisual.ts).
  height: number;
  windowRows?: number;
  windowCols?: number;
  /** Tint for lit windows — lets a category read as "residential" (warm) vs "industrial" (cool) at a glance. Defaults to warm gold. */
  lightColor?: number;
  hasAntenna?: boolean;
  hasSign?: boolean;
  /** Alternate skin for flat infrastructure (Solar): animated seam lines instead of windows. */
  hasPanelLines?: boolean;
}

export type BuildingCategory = "headquarters" | "residential" | "production" | "infrastructure";

export interface BuildingDef {
  id: string;
  name: string;
  era: string;
  category: BuildingCategory;
  color: number;
  footprint: Footprint;
  /** Not player-buildable — pre-placed only (currently just the HQ). */
  fixed?: boolean;
  levels: BuildingLevel[];
}

export const BUILDING_DEFS: BuildingDef[] = [
  {
    id: "headquarters",
    name: "Startup Office",
    era: "present",
    category: "headquarters",
    color: 0xfbbf24,
    footprint: { w: 2, h: 2 },
    fixed: true,
    levels: [
      {
        label: "Level 1",
        buildSeconds: 0,
        workersRequired: 0,
        energyRequired: 0,
        energyProvided: 10,
        populationProvided: 4,
        height: 46,
        windowRows: 2,
        windowCols: 2,
        lightColor: 0xfacc15,
        hasAntenna: true,
        hasSign: true,
      },
    ],
  },
  {
    id: "worker-housing",
    name: "Worker Housing",
    era: "present",
    category: "residential",
    color: 0x64748b,
    footprint: { w: 1, h: 1 },
    levels: [
      {
        label: "Worker Housing",
        cost: { credits: 50, materials: 20 },
        buildSeconds: 20,
        workersRequired: 0,
        energyRequired: 2,
        populationProvided: 6,
        height: 28,
        windowRows: 2,
        windowCols: 2,
      },
      {
        label: "Apartments",
        cost: { credits: 150, materials: 60, components: 20 },
        buildSeconds: 40,
        workersRequired: 0,
        energyRequired: 4,
        populationProvided: 14,
        height: 42,
        windowRows: 3,
        windowCols: 2,
        hasAntenna: true,
      },
      {
        label: "Smart Apartments",
        cost: { credits: 400, materials: 120, components: 80 },
        buildSeconds: 70,
        workersRequired: 0,
        energyRequired: 6,
        populationProvided: 26,
        height: 56,
        windowRows: 3,
        windowCols: 3,
        hasAntenna: true,
        hasSign: true,
      },
    ],
  },
  {
    id: "solar-installation",
    name: "Solar Installation",
    era: "present",
    category: "infrastructure",
    color: 0x22d3ee,
    footprint: { w: 2, h: 1 },
    levels: [
      {
        label: "Solar Installation",
        cost: { credits: 60, materials: 15 },
        buildSeconds: 15,
        workersRequired: 1,
        energyRequired: 0,
        energyProvided: 12,
        height: 14,
        hasPanelLines: true,
      },
      {
        label: "Solar Array",
        cost: { credits: 180, materials: 50, components: 15 },
        buildSeconds: 30,
        workersRequired: 1,
        energyRequired: 0,
        energyProvided: 24,
        height: 18,
        hasPanelLines: true,
      },
      {
        label: "Grid-Tied Array",
        cost: { credits: 420, materials: 110, components: 60 },
        buildSeconds: 55,
        workersRequired: 2,
        energyRequired: 0,
        energyProvided: 45,
        height: 22,
        hasPanelLines: true,
      },
    ],
  },
  {
    id: "urban-farm",
    name: "Urban Farm",
    era: "present",
    category: "production",
    color: 0x4ade80,
    footprint: { w: 2, h: 2 },
    levels: [
      {
        label: "Urban Farm",
        cost: { credits: 70, materials: 25 },
        buildSeconds: 20,
        workersRequired: 2,
        energyRequired: 3,
        recipe: { inputs: {}, output: { resource: "food", amount: 10 }, cycleSeconds: 20 },
        outputCapacity: 40,
        height: 12,
        windowRows: 1,
        windowCols: 3,
        lightColor: 0x86efac,
      },
      {
        label: "Vertical Farm",
        cost: { credits: 200, materials: 70, components: 20 },
        buildSeconds: 40,
        workersRequired: 3,
        energyRequired: 5,
        recipe: { inputs: {}, output: { resource: "food", amount: 22 }, cycleSeconds: 20 },
        outputCapacity: 70,
        height: 24,
        windowRows: 2,
        windowCols: 3,
        lightColor: 0x86efac,
      },
      {
        label: "Automated Farm",
        cost: { credits: 450, materials: 150, components: 80 },
        buildSeconds: 70,
        // Fewer workers than the previous tier — automation, per design principle.
        workersRequired: 2,
        energyRequired: 8,
        recipe: { inputs: {}, output: { resource: "food", amount: 34 }, cycleSeconds: 18 },
        outputCapacity: 100,
        height: 30,
        windowRows: 2,
        windowCols: 4,
        lightColor: 0x86efac,
        hasAntenna: true,
      },
    ],
  },
  {
    id: "recycler",
    name: "Recycler",
    era: "present",
    category: "production",
    color: 0x94a3b8,
    footprint: { w: 1, h: 1 },
    levels: [
      {
        label: "Recycler",
        // Credits only, deliberately: the Recycler is the only source of Materials, so charging
        // Materials for it means a player who spends down to zero can never rebuild the thing
        // that makes them — an unrecoverable dead end.
        cost: { credits: 70 },
        buildSeconds: 18,
        workersRequired: 2,
        energyRequired: 3,
        recipe: { inputs: {}, output: { resource: "materials", amount: 8 }, cycleSeconds: 18 },
        outputCapacity: 35,
        height: 20,
        windowRows: 2,
        windowCols: 1,
        lightColor: 0x67e8f9,
      },
      {
        label: "Recycling Plant",
        cost: { credits: 180, materials: 50, components: 15 },
        buildSeconds: 35,
        workersRequired: 3,
        energyRequired: 5,
        recipe: { inputs: {}, output: { resource: "materials", amount: 18 }, cycleSeconds: 18 },
        outputCapacity: 60,
        height: 28,
        windowRows: 2,
        windowCols: 2,
        lightColor: 0x67e8f9,
      },
      {
        label: "Automated Recycler",
        cost: { credits: 400, materials: 110, components: 60 },
        buildSeconds: 60,
        workersRequired: 2,
        energyRequired: 7,
        recipe: { inputs: {}, output: { resource: "materials", amount: 28 }, cycleSeconds: 16 },
        outputCapacity: 90,
        height: 34,
        windowRows: 3,
        windowCols: 2,
        lightColor: 0x67e8f9,
        hasAntenna: true,
      },
    ],
  },
  {
    id: "workshop",
    name: "Workshop",
    era: "present",
    category: "production",
    color: 0x60a5fa,
    footprint: { w: 2, h: 1 },
    levels: [
      {
        label: "Workshop",
        cost: { credits: 120, materials: 40 },
        buildSeconds: 30,
        workersRequired: 3,
        energyRequired: 6,
        recipe: { inputs: { materials: 6 }, output: { resource: "components", amount: 4 }, cycleSeconds: 20 },
        outputCapacity: 30,
        height: 26,
        windowRows: 2,
        windowCols: 2,
        lightColor: 0xfb923c,
      },
      {
        label: "Assembly Workshop",
        cost: { credits: 300, materials: 90, components: 40 },
        buildSeconds: 55,
        workersRequired: 4,
        energyRequired: 9,
        recipe: { inputs: { materials: 10 }, output: { resource: "components", amount: 8 }, cycleSeconds: 20 },
        outputCapacity: 50,
        height: 34,
        windowRows: 2,
        windowCols: 3,
        lightColor: 0xfb923c,
      },
      {
        label: "Automated Assembly",
        cost: { credits: 650, materials: 180, components: 100 },
        buildSeconds: 90,
        workersRequired: 3,
        energyRequired: 12,
        recipe: { inputs: { materials: 14 }, output: { resource: "components", amount: 13 }, cycleSeconds: 18 },
        outputCapacity: 75,
        height: 42,
        windowRows: 3,
        windowCols: 3,
        lightColor: 0xfb923c,
        hasAntenna: true,
        hasSign: true,
      },
    ],
  },
];

export function getBuildingDef(id: string): BuildingDef {
  const def = BUILDING_DEFS.find((b) => b.id === id);
  if (!def) throw new Error(`Unknown building id: ${id}`);
  return def;
}

export function buildableBuildings(): BuildingDef[] {
  return BUILDING_DEFS.filter((b) => !b.fixed);
}
