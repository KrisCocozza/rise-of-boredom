import { GameController } from "../game/controller";
import { ResourceId, getResourceDef } from "../game/content/resources";
import {
  availableWorkers,
  computeEnergyStatus,
  computeResourceRates,
  totalAssignedWorkers,
  totalPopulationCapacity,
} from "../game/state/derived";
import { FOOD_UPKEEP_PER_POP } from "../game/state/simulation";
import { el, resourceIcon } from "./dom";

const STOCK_RESOURCES: ResourceId[] = ["credits", "food", "materials", "components"];

interface Chip {
  root: HTMLElement;
  val: HTMLElement;
  cap: HTMLElement | null;
  tip: HTMLElement;
}

export interface TopBarHandle {
  update(): void;
}

export function mountTopBar(root: HTMLElement, controller: GameController, onMenu: () => void): TopBarHandle {
  const chips = new Map<ResourceId, Chip>();
  const chipsRow = el("div", { className: "res-chips" });

  for (const id of STOCK_RESOURCES) {
    const def = getResourceDef(id);
    const val = el("span", { className: "val", text: "0" });
    const cap = def.stockpileCap !== undefined ? el("span", { className: "cap", text: `/${def.stockpileCap}` }) : null;
    const tip = el("div", { className: "tip tip-below" });
    const icon = resourceIcon(id, 15);
    icon.style.color = `#${def.color.toString(16).padStart(6, "0")}`;
    const chip = el("div", { className: "res-chip has-tip" }, [icon, val, ...(cap ? [cap] : []), tip]);
    chips.set(id, { root: chip, val, cap, tip });
    chipsRow.append(chip);
  }

  // Population + energy chips with mini meters.
  const popVal = el("span", { className: "val", text: "" });
  const popFill = el("div", { className: "bar-fill" });
  const popTip = el("div", { className: "tip tip-below" });
  const popIcon = resourceIcon("population", 15);
  popIcon.style.color = "#f472b6";
  const popChip = el("div", { className: "res-chip chip-wide has-tip" }, [
    popIcon,
    popVal,
    el("div", { className: "bar meter" }, [popFill]),
    popTip,
  ]);

  const energyVal = el("span", { className: "val", text: "" });
  const energyFill = el("div", { className: "bar-fill" });
  const energyTip = el("div", { className: "tip tip-below" });
  const energyIcon = resourceIcon("energy", 15);
  energyIcon.style.color = "#22d3ee";
  const energyChip = el("div", { className: "res-chip chip-wide has-tip" }, [
    energyIcon,
    energyVal,
    el("div", { className: "bar meter" }, [energyFill]),
    energyTip,
  ]);

  chipsRow.append(popChip, energyChip);

  const bar = el("div", { className: "top-bar" }, [
    el("div", { className: "era-badge", html: 'The Connected Age — <span class="year">2026</span>' }),
    chipsRow,
    el("button", { className: "btn menu-btn", text: "⚙", title: "Game menu", onClick: onMenu }),
  ]);
  root.append(bar);

  const rateLine = (text: string, dim = true): HTMLElement => el("div", { className: dim ? "dim" : "", text });

  function update(): void {
    const state = controller.state;
    const rates = computeResourceRates(state, FOOD_UPKEEP_PER_POP);

    for (const id of STOCK_RESOURCES) {
      const chip = chips.get(id)!;
      const def = getResourceDef(id);
      const amount = Math.floor(state.resources[id] ?? 0);
      chip.val.textContent = `${amount}`;
      chip.root.classList.toggle("warn", def.stockpileCap !== undefined && amount <= 0);

      const fill = rates.bufferFill[id] ?? 0;
      const drain = rates.drain[id] ?? 0;
      chip.tip.replaceChildren(el("h4", { text: def.label }));
      if (id === "credits") {
        chip.tip.append(rateLine("Earned from objectives; spent on construction and upgrades."));
      } else {
        if (fill > 0) chip.tip.append(rateLine(`+${fill.toFixed(1)}/s filling building buffers`, false));
        if (drain > 0) chip.tip.append(rateLine(`−${drain.toFixed(1)}/s ${id === "food" ? "upkeep & inputs" : "consumed as input"}`, false));
        if (fill === 0 && drain === 0) chip.tip.append(rateLine("No production or consumption right now."));
        chip.tip.append(rateLine("Tap a building with a full buffer to collect."));
      }
    }

    const pop = totalPopulationCapacity(state);
    const busy = totalAssignedWorkers(state);
    const free = availableWorkers(state);
    popVal.textContent = `${free}/${pop}`;
    popFill.style.width = pop > 0 ? `${(busy / pop) * 100}%` : "0%";
    popTip.replaceChildren(
      el("h4", { text: "Population" }),
      rateLine(`${pop} total · ${busy} working · ${free} available`, false),
      rateLine("Build housing to attract more workers."),
    );

    const energy = computeEnergyStatus(state);
    energyVal.textContent = `${Math.round(energy.provided)}/${Math.round(energy.required)} MW`;
    const load = energy.provided > 0 ? Math.min(energy.required / energy.provided, 1) : energy.required > 0 ? 1 : 0;
    energyFill.style.width = `${load * 100}%`;
    energyChip.classList.toggle("warn", energy.share < 0.999);
    energyTip.replaceChildren(
      el("h4", { text: "Energy" }),
      rateLine(`Supply ${Math.round(energy.provided)} MW · Demand ${Math.round(energy.required)} MW`, false),
      energy.share < 0.999
        ? rateLine("Brownout! Production is slowed — build more Solar.", false)
        : rateLine("Staffed buildings draw power while operating."),
    );
  }

  update();
  return { update };
}
