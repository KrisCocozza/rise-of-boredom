export interface SpriteEntry {
  textureKey: string;
  /** Scale applied so the sprite's base footprint matches one tile's width. */
  scale: number;
}

const registry = new Map<string, SpriteEntry>();

function key(buildingId: string, levelIndex: number): string {
  return `${buildingId}:${levelIndex}`;
}

export function registerSprite(buildingId: string, levelIndex: number, entry: SpriteEntry): void {
  registry.set(key(buildingId, levelIndex), entry);
}

export function getSprite(buildingId: string, levelIndex: number): SpriteEntry | undefined {
  return registry.get(key(buildingId, levelIndex));
}
