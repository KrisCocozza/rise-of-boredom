export type ResourceId = "credits" | "food" | "materials" | "components" | "energy" | "population";

export type ResourceCategory = "currency" | "basic" | "manufactured" | "capacity";

export interface ResourceDef {
  id: ResourceId;
  label: string;
  color: number;
  category: ResourceCategory;
  /** Max size of the global spendable pool. Omitted = uncapped (currency, capacity resources). */
  stockpileCap?: number;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  { id: "credits", label: "Credits", color: 0xfacc15, category: "currency" },
  { id: "food", label: "Food", color: 0x4ade80, category: "basic", stockpileCap: 300 },
  { id: "materials", label: "Materials", color: 0x94a3b8, category: "basic", stockpileCap: 300 },
  { id: "components", label: "Components", color: 0x60a5fa, category: "manufactured", stockpileCap: 200 },
  { id: "energy", label: "Energy", color: 0x22d3ee, category: "capacity" },
  { id: "population", label: "Population", color: 0xf472b6, category: "capacity" },
];

export function getResourceDef(id: ResourceId): ResourceDef {
  const def = RESOURCE_DEFS.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown resource id: ${id}`);
  return def;
}

export type ResourceAmount = Partial<Record<ResourceId, number>>;
