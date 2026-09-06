import Phaser from "phaser";

export interface CutoutResult {
  key: string;
  width: number;
  height: number;
}

/**
 * Turns a loaded "raw" texture — a square render on a flat background — into
 * a new texture with the background keyed to transparent and cropped tightly
 * to the remaining content. Runs once at scene startup; no server involved.
 */
export function processCutoutTexture(
  scene: Phaser.Scene,
  rawKey: string,
  outKey: string,
  tolerance = 32,
): CutoutResult {
  const source = scene.textures.get(rawKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = source.width;
  const height = source.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;

  // Sample the background color from the top-left corner pixel.
  const bgR = px[0];
  const bgG = px[1];
  const bgB = px[2];

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = px[i] - bgR;
      const dg = px[i + 1] - bgG;
      const db = px[i + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist < tolerance) {
        px[i + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  cropped.getContext("2d")!.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

  scene.textures.addCanvas(outKey, cropped);

  return { key: outKey, width: cropW, height: cropH };
}
