/** Converts between grid coordinates (col, row) and isometric screen pixels. */
export class IsoGrid {
  constructor(
    public readonly tileWidth: number,
    public readonly tileHeight: number,
    public readonly originX: number,
    public readonly originY: number,
  ) {}

  toScreen(col: number, row: number): { x: number; y: number } {
    return {
      x: this.originX + (col - row) * (this.tileWidth / 2),
      y: this.originY + (col + row) * (this.tileHeight / 2),
    };
  }

  /** Inverse of toScreen — used to figure out which tile the mouse is over. */
  toGrid(x: number, y: number): { col: number; row: number } {
    const relX = x - this.originX;
    const relY = y - this.originY;
    const col = (relX / (this.tileWidth / 2) + relY / (this.tileHeight / 2)) / 2;
    const row = (relY / (this.tileHeight / 2) - relX / (this.tileWidth / 2)) / 2;
    return { col: Math.round(col), row: Math.round(row) };
  }
}
