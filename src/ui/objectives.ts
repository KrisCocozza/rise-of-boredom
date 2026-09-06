import { GameController } from "../game/controller";
import { QUEST_DEFS } from "../game/content/quests";
import { questProgress } from "../game/state/derived";
import { costRow, el } from "./dom";
import { showToast } from "./toasts";

export interface ObjectivesHandle {
  update(): void;
}

export function mountObjectives(root: HTMLElement, controller: GameController): ObjectivesHandle {
  let open = true;
  const known = new Set(controller.state.completedQuestIds);

  const badge = el("span", { className: "obj-badge", text: "0" });
  const panel = el("div", { className: "obj-panel panel" });
  const toggle = el("button", {
    className: "btn obj-toggle",
    onClick: () => {
      open = !open;
      panel.classList.toggle("closed", !open);
    },
  });
  toggle.append(el("span", { text: "🎯 Objectives" }), badge);

  const drawer = el("div", { className: "obj-drawer" }, [toggle, panel]);
  root.append(drawer);

  function update(): void {
    const state = controller.state;

    // Celebrate newly-completed quests.
    for (const id of state.completedQuestIds) {
      if (!known.has(id)) {
        known.add(id);
        const quest = QUEST_DEFS.find((q) => q.id === id);
        if (quest) showToast(`Objective complete: ${quest.title}!`, "quest", 3200);
      }
    }

    const active = QUEST_DEFS.filter((q) => !state.completedQuestIds.includes(q.id));
    badge.textContent = `${active.length}`;

    if (active.length === 0) {
      panel.replaceChildren(el("div", { className: "obj-done", text: "All current objectives complete — nice work!" }));
      return;
    }

    panel.replaceChildren(
      ...active.map((quest) => {
        const progress = questProgress(state, quest.objective);
        const pct = progress.target > 0 ? Math.min(progress.current / progress.target, 1) * 100 : 0;
        const fill = el("div", { className: "bar-fill bar-gold" });
        fill.style.width = `${pct}%`;
        return el("div", { className: "obj-item" }, [
          el("div", { className: "obj-title", text: quest.title }),
          el("div", { className: "obj-desc", text: quest.description }),
          el("div", { className: "obj-progress-row" }, [
            el("div", { className: "bar" }, [fill]),
            el("span", {
              className: "obj-progress-label",
              text: `${Math.min(progress.current, progress.target)}/${progress.target}`,
            }),
          ]),
          el("div", { className: "obj-reward" }, ["Reward:", costRow(quest.reward, null)]),
        ]);
      }),
    );
  }

  update();
  return { update };
}
