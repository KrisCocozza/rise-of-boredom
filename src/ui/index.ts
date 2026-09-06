import { GameController } from "../game/controller";
import { clearSave } from "../game/persistence";
import { mountBuildMenu } from "./buildMenu";
import { mountFloatingTip } from "./floatingTip";
import { mountHoverTip } from "./hoverTip";
import { mountInspector } from "./inspector";
import { mountModals, openModal } from "./modal";
import { mountObjectives } from "./objectives";
import { mountToasts } from "./toasts";
import { mountTopBar } from "./topBar";

/** Mounts the full DOM overlay UI and wires it to the controller. */
export function mountUi(controller: GameController): void {
  const root = document.getElementById("ui-root");
  if (!root) throw new Error("#ui-root missing from index.html");

  mountToasts(root);
  mountModals(root);
  mountHoverTip(root, controller);
  mountFloatingTip(root);

  const topBar = mountTopBar(root, controller, openGameMenu);
  const buildMenu = mountBuildMenu(root, controller);
  const objectives = mountObjectives(root, controller);
  const inspector = mountInspector(root, controller);

  controller.subscribe(() => {
    topBar.update();
    buildMenu.update();
    objectives.update();
    inspector.update();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "b" && !e.repeat) buildMenu.toggle();
  });

  function openGameMenu(): void {
    openModal({
      title: "Rise of Boredom",
      body: [
        "Build housing to attract workers, staff your production buildings, and collect what they produce by tapping them once their buffer fills.",
        "Convert Materials into Components at a Workshop to unlock upgrades, keep your people fed, and keep the power on — understaffed or underpowered buildings run slow.",
        "Progress autosaves. Press B to open the build menu, Esc or right-click to cancel placing.",
      ],
      confirmLabel: "New Game…",
      cancelLabel: "Close",
      danger: true,
      onConfirm: () => {
        openModal({
          title: "Start a new game?",
          body: ["This permanently deletes your current city and save. There's no undo."],
          confirmLabel: "Delete save & restart",
          danger: true,
          onConfirm: () => {
            clearSave();
            location.reload();
          },
        });
      },
    });
  }
}
