import { GameController } from "../game/controller";
import { BuildingCategory, BuildingDef, buildableBuildings } from "../game/content/buildings";
import { ResourceId, getResourceDef } from "../game/content/resources";
import { canAfford } from "../game/state/actions";
import { costRow, el, formatSeconds } from "./dom";
import { attachTip, hideFloatingTip } from "./floatingTip";
import { showToast } from "./toasts";

const CATEGORY_LABELS: Partial<Record<BuildingCategory, string>> = {
  residential: "Residential",
  production: "Production",
  infrastructure: "Infrastructure",
};

function blurbFor(def: BuildingDef): string {
  const l = def.levels[0];
  const parts: string[] = [];
  if (l.populationProvided) parts.push(`Houses ${l.populationProvided} population.`);
  if (l.energyProvided) parts.push(`Generates ${l.energyProvided} MW.`);
  if (l.recipe) {
    const out = l.recipe.output;
    const inputs = Object.entries(l.recipe.inputs)
      .map(([res, amt]) => `${amt} ${getResourceDef(res as ResourceId).label}`)
      .join(", ");
    parts.push(
      inputs
        ? `Converts ${inputs} into ${out.amount} ${getResourceDef(out.resource).label} every ${l.recipe.cycleSeconds}s.`
        : `Produces ${out.amount} ${getResourceDef(out.resource).label} every ${l.recipe.cycleSeconds}s.`,
    );
  }
  return parts.join(" ");
}

function detailTipContent(def: BuildingDef): HTMLElement[] {
  const l = def.levels[0];
  const nodes: HTMLElement[] = [el("h4", { text: def.name }), el("div", { text: blurbFor(def) })];
  const add = (text: string): void => {
    nodes.push(el("div", { className: "dim", text }));
  };
  if (l.workersRequired > 0) add(`Needs ${l.workersRequired} worker${l.workersRequired > 1 ? "s" : ""} to operate.`);
  if (l.energyRequired > 0) add(`Draws ${l.energyRequired} MW while staffed.`);
  if (l.outputCapacity) add(`Output buffer holds ${l.outputCapacity} before pausing.`);
  add(`Upgradeable through ${def.levels.length} level${def.levels.length > 1 ? "s" : ""}.`);
  add(`Build time ${formatSeconds(l.buildSeconds)}.`);
  return nodes;
}

export interface BuildMenuHandle {
  update(): void;
  toggle(): void;
}

export function mountBuildMenu(root: HTMLElement, controller: GameController): BuildMenuHandle {
  const defs = buildableBuildings();
  const categories = [...new Set(defs.map((d) => d.category))].sort(
    (a, b) => Object.keys(CATEGORY_LABELS).indexOf(a) - Object.keys(CATEGORY_LABELS).indexOf(b),
  );

  let open = false;
  let activeCategory: BuildingCategory = categories[0];
  const cardByDef = new Map<string, { card: HTMLElement; cost: HTMLElement }>();

  const tabs = el("div", { className: "build-tabs" });
  const cards = el("div", { className: "build-cards" });
  const panel = el("div", { className: "build-panel panel" }, [tabs, cards]);

  const toggleBtn = el("button", {
    className: "build-toggle btn btn-primary",
    onClick: () => toggle(),
  });
  toggleBtn.append(el("span", { text: "🏗 Build" }), el("kbd", { text: "B" }));

  const dock = el("div", { className: "build-dock" }, [toggleBtn]);
  root.append(panel, dock);

  function renderTabs(): void {
    tabs.replaceChildren(
      ...categories.map((cat) =>
        el("button", {
          className: `build-tab${cat === activeCategory ? " active" : ""}`,
          text: CATEGORY_LABELS[cat] ?? cat,
          onClick: () => {
            activeCategory = cat;
            renderTabs();
            renderCards();
          },
        }),
      ),
    );
  }

  function renderCards(): void {
    cardByDef.clear();
    cards.replaceChildren(
      ...defs
        .filter((d) => d.category === activeCategory)
        .map((def) => {
          const swatch = el("span", { className: "swatch" });
          swatch.style.background = `#${def.color.toString(16).padStart(6, "0")}`;
          const cost = el("div");
          const card = el(
            "div",
            {
              className: "build-card",
              onClick: () => {
                if (card.classList.contains("unaffordable")) {
                  showToast("Not enough resources.", "error");
                  return;
                }
                if (controller.mode.placingDefId === def.id) controller.cancelMode();
                else controller.startPlacing(def.id);
              },
            },
            [
              el("div", { className: "card-head" }, [
                swatch,
                el("span", { className: "card-name", text: def.name }),
                el("span", { className: "card-size", text: `${def.footprint.w}×${def.footprint.h}` }),
              ]),
              el("div", { className: "card-blurb", text: blurbFor(def) }),
              cost,
            ],
          );
          attachTip(card, () => detailTipContent(def));
          cardByDef.set(def.id, { card, cost });
          return card;
        }),
    );
    update();
  }

  function toggle(): void {
    open = !open;
    if (!open) hideFloatingTip();
    panel.classList.toggle("open", open);
    toggleBtn.classList.toggle("open", open);
  }

  function update(): void {
    for (const def of defs) {
      const entry = cardByDef.get(def.id);
      if (!entry) continue;
      const level0 = def.levels[0];
      entry.cost.replaceChildren(costRow(level0.cost ?? {}, controller.state, level0.buildSeconds));
      entry.card.classList.toggle("unaffordable", !canAfford(controller.state, level0.cost ?? {}));
      entry.card.classList.toggle("active", controller.mode.placingDefId === def.id);
    }
  }

  renderTabs();
  renderCards();
  return { update, toggle };
}
