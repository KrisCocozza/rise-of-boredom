import Phaser from "phaser";

export function roundedPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 14,
  fillColor = 0x0b0f1c,
  fillAlpha = 0.72,
  strokeColor = 0x2a3a5c,
  strokeAlpha = 0.8,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(fillColor, fillAlpha);
  g.fillRoundedRect(0, 0, width, height, radius);
  g.lineStyle(1.5, strokeColor, strokeAlpha);
  g.strokeRoundedRect(0, 0, width, height, radius);
  return g;
}

export interface PanelButtonHandle {
  container: Phaser.GameObjects.Container;
  setState(state: { selected?: boolean; locked?: boolean }): void;
  setLabel(text: string): void;
  onClick(cb: () => void): void;
}

/** A rounded card button with a colored left accent stripe, hover lift, and selected/locked states. */
export function createPanelButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  labelText: string,
  accentColor: number,
  textStyle: Phaser.Types.GameObjects.Text.TextStyle,
): PanelButtonHandle {
  const radius = 10;
  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const stripe = scene.add.graphics();
  const label = scene.add
    .text(20, height / 2, labelText, textStyle)
    .setOrigin(0, 0.5)
    .setWordWrapWidth(width - 32);

  container.add([bg, stripe, label]);
  container.setSize(width, height);
  container.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });

  let selected = false;
  let locked = false;
  let hovered = false;

  function repaint(): void {
    bg.clear();
    bg.fillStyle(selected ? accentColor : 0x0e1424, selected ? 0.18 : 0.92);
    bg.fillRoundedRect(0, 0, width, height, radius);

    const strokeAlpha = locked ? 0.2 : selected ? 1 : hovered ? 0.85 : 0.4;
    const strokeWidth = selected ? 2.5 : hovered ? 2 : 1.5;
    bg.lineStyle(strokeWidth, accentColor, strokeAlpha);
    bg.strokeRoundedRect(0, 0, width, height, radius);

    stripe.clear();
    stripe.fillStyle(accentColor, locked ? 0.3 : 1);
    stripe.fillRoundedRect(0, 0, 6, height, { tl: radius, bl: radius, tr: 0, br: 0 });

    label.setAlpha(locked ? 0.4 : 1);
  }

  container.on("pointerover", () => {
    hovered = true;
    if (!locked) scene.tweens.add({ targets: container, scale: 1.03, duration: 100, ease: "Quad.easeOut" });
    repaint();
  });
  container.on("pointerout", () => {
    hovered = false;
    scene.tweens.add({ targets: container, scale: 1, duration: 100, ease: "Quad.easeOut" });
    repaint();
  });

  repaint();

  return {
    container,
    setState(state) {
      if (state.selected !== undefined) selected = state.selected;
      if (state.locked !== undefined) locked = state.locked;
      repaint();
    },
    setLabel(text: string) {
      label.setText(text);
    },
    onClick(cb) {
      container.on("pointerdown", () => {
        if (!locked) cb();
      });
    },
  };
}

export interface StepperHandle {
  container: Phaser.GameObjects.Container;
  setValue(value: number, max: number): void;
  onChange(cb: (delta: number) => void): void;
}

/** A minus/value/plus row for adjusting a bounded count in place — used for manual worker assignment. */
export function createStepper(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textStyle: Phaser.Types.GameObjects.Text.TextStyle,
): StepperHandle {
  const container = scene.add.container(x, y);

  const minusBg = scene.add.circle(0, 0, 12, 0x0e1424, 0.92).setStrokeStyle(1.5, 0x2a3a5c, 0.8);
  const minusLabel = scene.add.text(0, 0, "-", { ...textStyle, fontSize: "16px" }).setOrigin(0.5);
  const valueText = scene.add.text(34, 0, "0/0", textStyle).setOrigin(0.5);
  const plusBg = scene.add.circle(68, 0, 12, 0x0e1424, 0.92).setStrokeStyle(1.5, 0x2a3a5c, 0.8);
  const plusLabel = scene.add.text(68, 0, "+", { ...textStyle, fontSize: "16px" }).setOrigin(0.5);

  minusBg.setInteractive({ useHandCursor: true });
  plusBg.setInteractive({ useHandCursor: true });
  container.add([minusBg, minusLabel, valueText, plusBg, plusLabel]);

  let changeCb: ((delta: number) => void) | undefined;
  minusBg.on("pointerdown", () => changeCb?.(-1));
  plusBg.on("pointerdown", () => changeCb?.(1));

  return {
    container,
    setValue(value: number, max: number) {
      valueText.setText(`${value}/${max}`);
    },
    onChange(cb) {
      changeCb = cb;
    },
  };
}
