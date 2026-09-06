import { ResourceAmount, ResourceId, getResourceDef } from "../game/content/resources";
import { GameState } from "../game/state/types";

interface ElProps {
  className?: string;
  text?: string;
  html?: string;
  title?: string;
  onClick?: (e: MouseEvent) => void;
}

/** Tiny element builder — the only DOM-construction primitive the UI layer uses. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (HTMLElement | SVGElement | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title) node.title = props.title;
  if (props.onClick) node.addEventListener("click", props.onClick as EventListener);
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// Compact inline-SVG glyphs, colored via CSS `color` (fill="currentColor").
const ICON_PATHS: Record<ResourceId, string> = {
  credits:
    '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.6v6.8M5.8 6.4h4.4M5.8 9.6h4.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  food: '<path d="M8 14C4 11.5 3 8 4.5 4.5 8 5 11.5 7 11.5 10.5c0 1.8-1.4 3-3.5 3.5z" fill="currentColor"/><path d="M8 13.5C7 10 7.5 7 9.5 4.5" stroke="#05070d" stroke-width="1" fill="none"/>',
  materials:
    '<path d="M8 1.8 14 5v6L8 14.2 2 11V5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 5l6 3 6-3M8 8v6" stroke="currentColor" stroke-width="1.2" fill="none"/>',
  components:
    '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  energy: '<path d="M9.5 1.5 3.5 9h3.5l-1 5.5 6-7.5H8.5z" fill="currentColor"/>',
  population:
    '<circle cx="8" cy="5" r="3" fill="currentColor"/><path d="M2.5 14.5c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5z" fill="currentColor"/>',
};

export function resourceIcon(id: ResourceId, size = 14): HTMLElement {
  const span = el("span", { className: `icon icon-${id}` });
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${ICON_PATHS[id]}</svg>`;
  return span;
}

export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Cost rendered as icon+amount pairs; parts the player can't afford are flagged red via CSS. */
export function costRow(cost: ResourceAmount, state: GameState | null, buildSeconds?: number): HTMLElement {
  const row = el("span", { className: "cost-row" });
  for (const [res, amt] of Object.entries(cost)) {
    const id = res as ResourceId;
    const short = state !== null && (state.resources[id] ?? 0) < (amt ?? 0);
    row.append(
      el("span", { className: `cost-part${short ? " cost-short" : ""}`, title: getResourceDef(id).label }, [
        resourceIcon(id, 12),
        el("span", { text: `${amt}` }),
      ]),
    );
  }
  if (buildSeconds !== undefined) {
    row.append(el("span", { className: "cost-part cost-time", text: `⏱ ${formatSeconds(buildSeconds)}` }));
  }
  return row;
}
