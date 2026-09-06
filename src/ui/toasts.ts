import { el } from "./dom";

let stack: HTMLElement | null = null;

export type ToastKind = "info" | "error" | "quest";

export function mountToasts(root: HTMLElement): void {
  stack = el("div", { className: "toast-stack" });
  root.append(stack);
}

/** Shows a transient message. Importable from anywhere (the Phaser scene included) — it's a leaf module. */
export function showToast(message: string, kind: ToastKind = "info", durationMs = 2400): void {
  if (!stack) return;
  const kindClass = kind === "info" ? "" : ` toast-${kind}`;
  const toast = el("div", { className: `toast${kindClass}`, text: message });
  stack.append(toast);
  window.setTimeout(() => {
    toast.classList.add("out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, durationMs);
}
