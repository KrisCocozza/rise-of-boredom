import Phaser from "phaser";

interface SkylineLayerOptions {
  count: number;
  minH: number;
  maxH: number;
  color: number;
  alpha: number;
  depth: number;
}

/**
 * Builds the non-interactive atmosphere that sits behind the play grid: a gradient sky, two
 * parallax skyline silhouette layers, a low neon horizon glow, drifting fog, and ambient rain.
 * Everything here is generated at runtime with Graphics/Particles — no image assets — and lives
 * at depth -1000..-900, safely behind the grid's own base layer (drawn at depth -100).
 */
export function createCityBackground(scene: Phaser.Scene, width: number, height: number): void {
  const horizonY = height * 0.42;

  drawSkyGradient(scene, width, height, horizonY);
  drawHorizonGlow(scene, width, horizonY);
  buildSkylineLayer(scene, width, horizonY, {
    count: 10,
    minH: 40,
    maxH: 110,
    color: 0x161c34,
    alpha: 0.6,
    depth: -960,
  });
  buildSkylineLayer(scene, width, horizonY, {
    count: 14,
    minH: 70,
    maxH: 190,
    color: 0x0e1224,
    alpha: 0.9,
    depth: -940,
  });
  createDriftingFog(scene, width, horizonY);
  createAmbientRain(scene, width, height);
}

/** Deep indigo at the top, warming slightly toward the horizon, then flush with the tile floor. */
function drawSkyGradient(scene: Phaser.Scene, width: number, height: number, horizonY: number): void {
  const sky = scene.add.graphics().setDepth(-1000);
  const steps = 36;
  const top = Phaser.Display.Color.ValueToColor(0x05060f);
  const bottom = Phaser.Display.Color.ValueToColor(0x241238);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, steps, i);
    sky.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    sky.fillRect(0, t * horizonY, width, horizonY / steps + 1);
  }
  // Ground haze below the horizon, matching the tile floor tone so the skyline sits flush with it.
  sky.fillStyle(0x05070d, 1);
  sky.fillRect(0, horizonY, width, height - horizonY);
}

/** Soft magenta/cyan bloom low in the sky — like light pollution off the city below. */
function drawHorizonGlow(scene: Phaser.Scene, width: number, horizonY: number): void {
  const glow = scene.add.graphics().setDepth(-990);
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps;
    glow.fillStyle(i % 2 === 0 ? 0xd946ef : 0x22d3ee, 0.02 * t);
    const r = 70 + i * 24;
    glow.fillEllipse(width / 2, horizonY, r * 2.4, r);
  }
}

/** A row of randomly-sized silhouette buildings with occasional lit windows, one parallax layer. */
function buildSkylineLayer(scene: Phaser.Scene, width: number, horizonY: number, opts: SkylineLayerOptions): void {
  const g = scene.add.graphics().setDepth(opts.depth);
  let x = -20;
  while (x < width + 20) {
    const w = 28 + Math.random() * 46;
    const h = opts.minH + Math.random() * (opts.maxH - opts.minH);
    const y = horizonY - h;
    g.fillStyle(opts.color, opts.alpha);
    g.fillRect(x, y, w, h);

    if (Math.random() > 0.3) {
      const rows = Math.max(1, Math.floor(h / 14));
      const cols = Math.max(1, Math.floor(w / 12));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.6) {
            g.fillStyle(0xfacc15, opts.alpha * 0.55);
            g.fillRect(x + 4 + c * 12, y + 6 + r * 14, 3, 4);
          }
        }
      }
    }
    x += w + 6 + Math.random() * 14;
  }
}

/** A slow, barely-visible band of fog drifting along the horizon for a sense of depth/motion. */
function createDriftingFog(scene: Phaser.Scene, width: number, horizonY: number): void {
  const fog = scene.add.graphics().setDepth(-930).setAlpha(0.1);
  fog.fillStyle(0x38bdf8, 1);
  fog.fillEllipse(width / 2, horizonY - 10, width * 1.4, 60);
  scene.tweens.add({ targets: fog, x: 50, duration: 16000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
}

/** Faint rain streaks drifting down the whole canvas — cheap, and does a lot for the mood. */
function createAmbientRain(scene: Phaser.Scene, width: number, height: number): void {
  const key = "rain-streak";
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x9fd8ff, 1);
    g.fillRect(0, 0, 2, 14);
    g.generateTexture(key, 2, 14);
    g.destroy();
  }
  scene.add
    .particles(0, 0, key, {
      x: { min: 0, max: width },
      y: -20,
      lifespan: Math.round((height / 450) * 1400),
      speedY: { min: 380, max: 520 },
      speedX: { min: -20, max: -60 },
      scale: { min: 0.5, max: 1 },
      alpha: { start: 0.3, end: 0 },
      quantity: 2,
      frequency: 60,
      blendMode: "ADD",
    })
    .setDepth(-900);
}
