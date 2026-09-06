import { GameController } from "../game/controller";
import { getBuildingDef } from "../game/content/buildings";
import { getResourceDef } from "../game/content/resources";
import { computeEnergyStatus } from "../game/state/derived";
import { el } from "./dom";

let tip: HTMLElement | null = null;
let controllerRef: GameController | null = null;

export function mountHoverTip(root: HTMLElement, controller: GameController): void {
  controllerRef = controller;
  tip = el("div", { className: "hover-tip hidden" });
  root.append(tip);
}

/** Called by the Phaser scene on pointermove: uid of the hovered building (or null) + cursor page coords. */
export function setHoverTip(uid: string | null, clientX = 0, clientY = 0): void {
  if (!tip || !controllerRef) return;
  if (!uid) {
    tip.classList.add("hidden");
    return;
  }

  const state = controllerRef.state;
  const building = state.buildings.find((b) => b.uid === uid);
  if (!building) {
    tip.classList.add("hidden");
    return;
  }

  const def = getBuildingDef(building.defId);
  tip.replaceChildren();

  if (building.construction) {
    const target = def.levels[building.construction.targetLevelIndex];
    const pct = Math.round((1 - building.construction.remainingSeconds / building.construction.totalSeconds) * 100);
    tip.append(
      el("div", { className: "ht-title", text: def.name }),
      el("div", { className: "ht-sub", text: `Constructing ${target.label}` }),
      el("div", { className: "dim", text: `${pct}% · ${Math.ceil(building.construction.remainingSeconds)}s remaining` }),
    );
  } else {
    const level = def.levels[building.levelIndex];
    tip.append(el("div", { className: "ht-title", text: def.name }), el("div", { className: "ht-sub", text: level.label }));

    const lines: HTMLElement[] = [];
    if (level.populationProvided) lines.push(el("div", { className: "dim", text: `Houses ${level.populationProvided} population` }));
    if (level.energyProvided) lines.push(el("div", { className: "dim", text: `Provides ${level.energyProvided} MW` }));
    if (level.recipe) {
      const outLabel = getResourceDef(level.recipe.output.resource).label;
      lines.push(
        el("div", {
          className: "dim",
          text: `Buffer: ${Math.floor(building.outputBuffer)} / ${level.outputCapacity ?? "∞"} ${outLabel}`,
        }),
      );
      if (building.outputBuffer > 0) lines.push(el("div", { text: "Click to collect" }));
    }
    if (level.workersRequired > 0 && building.assignedWorkers < level.workersRequired) {
      lines.push(el("div", { className: "warn", text: `Understaffed ${building.assignedWorkers}/${level.workersRequired}` }));
    }
    if (level.energyRequired > 0 && building.assignedWorkers > 0 && computeEnergyStatus(state).share < 0.999) {
      lines.push(el("div", { className: "warn", text: "Underpowered — production slowed" }));
    }
    tip.append(...lines);
  }

  tip.classList.remove("hidden");
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  let x = clientX + pad;
  let y = clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
