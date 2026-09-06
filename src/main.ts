import Phaser from "phaser";
import { CityScene } from "./scenes/CityScene";
import { GameController } from "./game/controller";
import { mountUi } from "./ui";
import "./ui/ui.css";

async function boot(): Promise<void> {
  // Wait for the web font so Phaser's canvas text measures correctly on first paint.
  await Promise.all([
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('700 16px "Chakra Petch"'),
  ]).catch(() => undefined);

  const controller = new GameController();

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    width: 1024,
    height: 768,
    backgroundColor: "#05070d",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new CityScene(controller)],
  });

  mountUi(controller);
  controller.startTicking();
}

boot();
