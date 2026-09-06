import { el } from "./dom";

let root: HTMLElement | null = null;

export function mountModals(uiRoot: HTMLElement): void {
  root = uiRoot;
}

interface ModalOptions {
  title: string;
  /** Paragraphs of body text. */
  body: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}

/** Generic pop-up. With onConfirm it's a confirm/cancel dialog; without, an info box with one Close button. */
export function openModal(options: ModalOptions): void {
  if (!root) return;

  const close = (): void => {
    overlay.remove();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  const actions = el("div", { className: "modal-actions" });
  if (options.onConfirm) {
    actions.append(
      el("button", { className: "btn btn-ghost", text: options.cancelLabel ?? "Cancel", onClick: close }),
      el("button", {
        className: `btn ${options.danger ? "btn-danger" : "btn-primary"}`,
        text: options.confirmLabel ?? "Confirm",
        onClick: () => {
          close();
          options.onConfirm?.();
        },
      }),
    );
  } else {
    actions.append(el("button", { className: "btn btn-primary", text: options.cancelLabel ?? "Close", onClick: close }));
  }

  const modal = el("div", { className: "modal panel" }, [
    el("h3", { text: options.title }),
    ...options.body.map((text) => el("p", { text })),
    actions,
  ]);

  const overlay = el("div", { className: "modal-overlay" }, [modal]);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", onKey);
  root.append(overlay);
}
