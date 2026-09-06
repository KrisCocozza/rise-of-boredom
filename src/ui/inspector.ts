import { GameController } from "../game/controller";
import { getBuildingDef } from "../game/content/buildings";
import { ResourceId, getResourceDef } from "../game/content/resources";
import { canAfford } from "../game/state/actions";
import { availableWorkers, computeEnergyStatus } from "../game/state/derived";
import { PlacedBuildingState } from "../game/state/types";
import { costRow, el, formatSeconds } from "./dom";
import { openModal } from "./modal";
import { showToast } from "./toasts";

export interface InspectorHandle {
  update(): void;
}

/**
 * The selected-building panel. Built once per building/structural state and then refreshed
 * in place each tick — a full rebuild every second would detach buttons mid-click (hover
 * states flicker, presses can be swallowed), so dynamic values update through saved refs.
 */
export function mountInspector(root: HTMLElement, controller: GameController): InspectorHandle {
  const panel = el("div", { className: "inspector panel hidden" });
  root.append(panel);

  /** Which building+shape the current DOM was built for; "" = none. */
  let builtKey = "";
  /** Refs into the built DOM for per-tick refresh. */
  let refs: {
    progressFill?: HTMLElement;
    progressRow?: HTMLElement;
    bufferFill?: HTMLElement;
    bufferRow?: HTMLElement;
    collectBtn?: HTMLButtonElement;
    stepperVal?: HTMLElement;
    minusBtn?: HTMLButtonElement;
    plusBtn?: HTMLButtonElement;
    workersLabel?: HTMLElement;
    warnIdle?: HTMLElement;
    warnStaff?: HTMLElement;
    warnPower?: HTMLElement;
    upgradeBtn?: HTMLButtonElement;
    upgradeNote?: HTMLElement;
  } = {};

  function shapeKey(building: PlacedBuildingState): string {
    return building.construction
      ? `${building.uid}:c${building.construction.targetLevelIndex}`
      : `${building.uid}:l${building.levelIndex}`;
  }

  function confirmDemolish(uid: string, name: string): void {
    openModal({
      title: `Demolish ${name}?`,
      body: [
        "This permanently removes the building. Construction costs are not refunded, and its assigned workers return to the pool.",
      ],
      confirmLabel: "Demolish",
      danger: true,
      onConfirm: () => {
        const result = controller.demolish(uid);
        showToast(result.ok ? "Demolished." : result.reason, result.ok ? "info" : "error");
      },
    });
  }

  function build(building: PlacedBuildingState): void {
    refs = {};
    panel.replaceChildren();
    const def = getBuildingDef(building.defId);

    const closeBtn = el("button", { className: "btn btn-ghost insp-close", text: "×", onClick: () => controller.select(null) });

    if (building.construction) {
      const target = def.levels[building.construction.targetLevelIndex];
      refs.progressFill = el("div", { className: "bar-fill" });
      refs.progressRow = el("div", { className: "insp-buffer-row" });
      panel.append(
        el("div", { className: "insp-head" }, [
          el("span", { className: "insp-name", text: def.name }),
          el("span", { className: "insp-level", text: `Constructing ${target.label}` }),
          closeBtn,
        ]),
        el("div", { className: "insp-buffer" }, [el("div", { className: "bar" }, [refs.progressFill]), refs.progressRow]),
        ...(def.fixed
          ? []
          : [
              el("button", {
                className: "btn btn-danger",
                text: "Demolish",
                onClick: () => confirmDemolish(building.uid, def.name),
              }),
            ]),
      );
      return;
    }

    const level = def.levels[building.levelIndex];

    const stats = el("div", { className: "insp-stats" });
    if (level.populationProvided) stats.append(el("div", { html: `Houses <b>${level.populationProvided}</b> population` }));
    if (level.energyProvided) stats.append(el("div", { html: `Generates <b>${level.energyProvided} MW</b>` }));
    if (level.recipe) {
      const out = level.recipe.output;
      const inputs = Object.entries(level.recipe.inputs)
        .map(([res, amt]) => `${amt} ${getResourceDef(res as ResourceId).label}`)
        .join(", ");
      stats.append(
        el("div", {
          html: inputs
            ? `Converts ${inputs} → <b>${out.amount} ${getResourceDef(out.resource).label}</b> / ${level.recipe.cycleSeconds}s`
            : `Produces <b>${out.amount} ${getResourceDef(out.resource).label}</b> / ${level.recipe.cycleSeconds}s`,
        }),
      );
    }
    if (level.energyRequired > 0) stats.append(el("div", { html: `Draws <b>${level.energyRequired} MW</b> while staffed` }));

    panel.append(
      el("div", { className: "insp-head" }, [
        el("span", { className: "insp-name", text: def.name }),
        el("span", { className: "insp-level", text: level.label }),
        closeBtn,
      ]),
      stats,
    );

    if (level.workersRequired > 0) {
      refs.warnIdle = el("div", { className: "insp-warning danger", text: "Idle — assign workers to start production." });
      refs.warnStaff = el("div", { className: "insp-warning", text: "Understaffed — running below full speed." });
      panel.append(refs.warnIdle, refs.warnStaff);
    }
    if (level.energyRequired > 0) {
      refs.warnPower = el("div", { className: "insp-warning", text: "Underpowered — grid brownout is slowing production." });
      panel.append(refs.warnPower);
    }

    if (level.recipe) {
      refs.bufferFill = el("div", { className: "bar-fill bar-gold" });
      refs.bufferRow = el("div", { className: "insp-buffer-row" });
      refs.collectBtn = el("button", {
        className: "btn btn-primary",
        onClick: () => {
          const result = controller.collect(building.uid);
          if (!result.ok) showToast(result.reason, "error");
        },
      }) as HTMLButtonElement;
      panel.append(
        el("div", { className: "insp-buffer" }, [refs.bufferRow, el("div", { className: "bar" }, [refs.bufferFill]), refs.collectBtn]),
      );
    }

    if (level.workersRequired > 0) {
      refs.minusBtn = el("button", {
        className: "btn",
        text: "−",
        onClick: () => {
          const current = controller.state.buildings.find((b) => b.uid === building.uid);
          if (!current) return;
          const result = controller.setWorkers(building.uid, current.assignedWorkers - 1);
          if (!result.ok) showToast(result.reason, "error");
        },
      }) as HTMLButtonElement;
      refs.plusBtn = el("button", {
        className: "btn",
        text: "+",
        onClick: () => {
          const current = controller.state.buildings.find((b) => b.uid === building.uid);
          if (!current) return;
          const result = controller.setWorkers(building.uid, current.assignedWorkers + 1);
          if (!result.ok) showToast(result.reason, "error");
        },
      }) as HTMLButtonElement;
      refs.stepperVal = el("span", { className: "stepper-val" });
      refs.workersLabel = el("span");
      panel.append(
        el("div", { className: "insp-workers" }, [
          refs.workersLabel,
          el("div", { className: "stepper" }, [refs.minusBtn, refs.stepperVal, refs.plusBtn]),
        ]),
      );
    }

    const actions = el("div", { className: "insp-actions" });
    const nextLevel = def.levels[building.levelIndex + 1];
    if (nextLevel) {
      refs.upgradeBtn = el("button", {
        className: "btn btn-primary",
        onClick: () => {
          const result = controller.upgrade(building.uid);
          showToast(result.ok ? `Upgrading to ${nextLevel.label}…` : result.reason, result.ok ? "info" : "error");
        },
      }) as HTMLButtonElement;
      refs.upgradeBtn.append(
        el("span", { text: `⬆ Upgrade to ${nextLevel.label}  ·  ` }),
        costRow(nextLevel.cost ?? {}, null, nextLevel.buildSeconds),
      );
      refs.upgradeNote = el("div", { className: "insp-upgrade-note", text: "Not enough resources to upgrade yet." });
      actions.append(refs.upgradeBtn, refs.upgradeNote);
    } else {
      actions.append(el("div", { className: "insp-upgrade-note", text: "Max level reached." }));
    }

    if (!def.fixed) {
      actions.append(
        el("div", { className: "row" }, [
          el("button", {
            className: "btn",
            text: "⇄ Move",
            onClick: () => {
              controller.startMoving(building.uid);
              showToast("Click a tile to relocate (right-click to cancel).");
            },
          }),
          el("button", {
            className: "btn btn-danger",
            text: "✕ Demolish",
            onClick: () => confirmDemolish(building.uid, def.name),
          }),
        ]),
      );
    }
    panel.append(actions);
  }

  function refresh(building: PlacedBuildingState): void {
    const state = controller.state;
    const def = getBuildingDef(building.defId);

    if (building.construction) {
      const pct = Math.min(1, 1 - building.construction.remainingSeconds / building.construction.totalSeconds);
      if (refs.progressFill) refs.progressFill.style.width = `${pct * 100}%`;
      if (refs.progressRow) {
        refs.progressRow.innerHTML = `<span>${Math.round(pct * 100)}%</span><b>${formatSeconds(building.construction.remainingSeconds)} left</b>`;
      }
      return;
    }

    const level = def.levels[building.levelIndex];

    if (refs.warnIdle) refs.warnIdle.hidden = !(level.workersRequired > 0 && building.assignedWorkers === 0);
    if (refs.warnStaff) {
      refs.warnStaff.hidden = !(building.assignedWorkers > 0 && building.assignedWorkers < level.workersRequired);
    }
    if (refs.warnPower) {
      refs.warnPower.hidden = !(building.assignedWorkers > 0 && computeEnergyStatus(state).share < 0.999);
    }

    if (level.recipe && refs.bufferFill && refs.bufferRow && refs.collectBtn) {
      const cap = level.outputCapacity ?? 0;
      refs.bufferFill.style.width = cap > 0 ? `${Math.min(building.outputBuffer / cap, 1) * 100}%` : "0%";
      refs.bufferRow.innerHTML = `<span>Output buffer</span><b>${Math.floor(building.outputBuffer)} / ${cap}</b>`;
      refs.collectBtn.textContent = `Collect ${Math.floor(building.outputBuffer)} ${getResourceDef(level.recipe.output.resource).label}`;
      refs.collectBtn.disabled = building.outputBuffer < 1;
    }

    if (level.workersRequired > 0 && refs.stepperVal && refs.minusBtn && refs.plusBtn && refs.workersLabel) {
      refs.stepperVal.textContent = `${building.assignedWorkers}/${level.workersRequired}`;
      refs.workersLabel.textContent = `Workers (${availableWorkers(state)} available)`;
      refs.minusBtn.disabled = building.assignedWorkers <= 0;
      refs.plusBtn.disabled = building.assignedWorkers >= level.workersRequired || availableWorkers(state) <= 0;
    }

    const nextLevel = def.levels[building.levelIndex + 1];
    if (nextLevel && refs.upgradeBtn && refs.upgradeNote) {
      const affordable = canAfford(state, nextLevel.cost ?? {});
      refs.upgradeBtn.disabled = !affordable;
      refs.upgradeNote.hidden = affordable;
    }
  }

  function update(): void {
    const uid = controller.mode.selectedUid;
    const building = uid ? controller.state.buildings.find((b) => b.uid === uid) : undefined;
    if (!building) {
      panel.classList.add("hidden");
      builtKey = "";
      return;
    }
    panel.classList.remove("hidden");

    const key = shapeKey(building);
    if (key !== builtKey) {
      build(building);
      builtKey = key;
    }
    refresh(building);
  }

  return { update };
}
