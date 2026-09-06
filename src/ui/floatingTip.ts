import { el } from "./dom";

let tipEl: HTMLElement | null = null;

export function mountFloatingTip(root: HTMLElement): void {
  tipEl = el("div", { className: "float-tip hidden" });
  root.append(tipEl);
}

/**
 * Attaches a hover tooltip that renders in a fixed-position layer instead of inside the target.
 * Needed wherever the target sits in a scrolling/clipping container (the build-card grid), where
 * a CSS-only `.tip` child would simply be cut off at the container's edge.
 */
export function attachTip(target: HTMLElement, buildContent: () => (HTMLElement | string)[]): void {
  const show = (): void => {
    if (!tipEl) return;
    tipEl.replaceChildren(...buildContent());
    tipEl.classList.remove("hidden");

    const t = target.getBoundingClientRect();
    const r = tipEl.getBoundingClientRect();
    const gap = 10;

    let left = t.left + t.width / 2 - r.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));

    let top = t.top - r.height - gap;
    if (top < 8) top = t.bottom + gap;

    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  };
  const hide = (): void => tipEl?.classList.add("hidden");

  target.addEventListener("mouseenter", show);
  target.addEventListener("mouseleave", hide);
  // A card can be rebuilt/removed while hovered (affordability refresh) — don't strand the tip.
  target.addEventListener("click", hide);
}

export function hideFloatingTip(): void {
  tipEl?.classList.add("hidden");
}
