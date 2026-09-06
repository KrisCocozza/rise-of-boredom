import Phaser from "phaser";
import { CityScene } from "./scenes/CityScene";

async function boot(): Promise<void> {
  // Wait for the web font so Phaser's canvas text measures correctly on first paint.
  await Promise.all([
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('700 16px "Chakra Petch"'),
  ]).catch(() => undefined);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    width: 1024,
    height: 768,
    backgroundColor: "#05070d",
    scene: [CityScene],
  });
}

boot();
