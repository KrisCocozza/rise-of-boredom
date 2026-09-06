# rise-of-boredom

A browser city-builder inspired by the genre style of games like *Rise of Cultures*
and *Anno* (isometric grid, staffed production chains, timed construction) —
themed as a timeline that starts today and pushes into a cyberpunk future. No
copied art, text, character/corp names, or code from any existing cyberpunk
property — just original names in that style, so it stays clear of anyone's IP.

## Status: milestone 1 — The Connected Age

A playable city-builder core: build housing to gain workers, staff production
buildings by hand, produce Food/Materials into a per-building buffer, collect
it into your stockpile, convert Materials into Components at a Workshop, and
spend everything on construction and upgrades. Everything is Era 1 content —
later eras (and the exploration/combat/empire layers described in the design
brief) are intentionally not built yet; the architecture just shouldn't have
to be reworked to add them.

Client-side only, but no longer stateless: progress autosaves to
`localStorage` and picks up where you left off on reload, including
fast-forwarding construction/production through the time you were away
(capped at 8 hours).

## Core loop

Build **Worker Housing** → it finishes construction and adds population
capacity → assign the workers it freed up to a production building (Urban
Farm or Recycler) via the **+/-** stepper in its info panel → that building
fills its own output buffer over time, gated by how well it's staffed and by
available Energy → **tap the building** once its buffer has something in it
to collect that into your spendable stockpile → spend Materials at a
**Workshop** to manufacture Components → spend Components/Materials/Credits
on more buildings and upgrades → repeat with a bigger, better-staffed city.

Food is not collected into stockpile passively — like every other resource,
it only reaches your spendable pool when you tap a Farm with a full-enough
buffer, and population steadily draws down the Food stockpile as upkeep. Let
it run out and you'll see a deficit warning in the HUD (no harsher penalty
yet — deliberately deferred until the loop's been played with more).

## Running it

```
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Architecture

Three layers, so building/resource/quest content stays data instead of code,
and so the whole simulation is serializable for save/load:

- **Content** (`src/game/content/`) — pure data. `resources.ts` defines each
  resource (category, optional stockpile cap). `buildings.ts` defines every
  building's levels — cost, build time, worker/energy requirements, footprint,
  and (for production buildings) a `recipe`: what it consumes from the global
  stockpile and what it accumulates into its own local output buffer.
  `quests.ts` is a small linear chain of objectives/rewards.
- **Simulation** (`src/game/state/`) — pure, Phaser-free, and what
  save/load actually persists. `types.ts` defines `GameState`. `actions.ts`
  has the reducer-style mutations (`placeBuilding`, `startUpgrade`,
  `setAssignedWorkers`, `moveBuilding`, `demolishBuilding`,
  `collectBuilding`), each returning an `{ ok }` or `{ ok: false, reason }`
  result. `simulation.ts`'s `tick(state, dtSeconds)` advances construction
  timers, computes the energy fair-share brownout, fills production buffers,
  drains Food upkeep, and evaluates quest completion. `derived.ts` has the
  shared read-only queries (population/worker/energy totals, footprint
  occupancy) used by both the simulation and the view.
- **Controller** (`src/game/controller.ts`) — the single owner of `GameState`
  plus the interaction mode (what you're placing / moving / have selected).
  Every action goes through it, so it can autosave and then `notify()` its
  subscribers; the two views below never mutate state themselves. It also
  drives time via `setInterval` + `catchUp()` on wall-clock elapsed time
  rather than Phaser's rAF clock, so a backgrounded or throttled tab doesn't
  silently freeze the simulation.
- **World view** (`src/scenes/CityScene.ts`) — Phaser, and *only* the world:
  grid, buildings, placement ghost, collect float-text. It subscribes to the
  controller and re-renders on change.
- **Interface** (`src/ui/`) — a DOM/CSS overlay above the canvas holding all
  chrome: `topBar.ts` (resources, population/energy meters, hover tooltips),
  `buildMenu.ts` (categorised, tooltipped building cards), `objectives.ts`
  (drawer with live progress bars), `inspector.ts` (selected building:
  buffer + collect, worker stepper, upgrade/move/demolish), plus `modal.ts`,
  `toasts.ts`, `hoverTip.ts`, and `floatingTip.ts`. `dom.ts` has the `el()`
  builder and resource icons; `ui.css` is the whole visual language.

Putting the interface in the DOM rather than drawing it into the canvas is
what makes text crisp, gives real hover/scroll/transitions for free, and —
because a click on a panel simply never reaches the canvas — removes the
manual hit-region bookkeeping the old in-canvas UI needed.

Everything else is presentation, reused from the original prototype:
`isoGrid.ts` (grid↔screen math), `background.ts` (skyline/rain atmosphere),
and `spriteTexture.ts`/`spriteRegistry.ts` (the real-art pipeline).

The canvas renders a fixed 1024×768 world scaled to fit the window
(`Phaser.Scale.FIT`), so grid math stays in stable game-space coordinates
while the interface anchors to the real window edges.

### Production, buffers, and collection

A production building doesn't feed the global stockpile directly. Each tick
it fills its own `outputBuffer` (capped per level) at a rate scaled by
`efficiency = min(workersAssigned / workersRequired, energyShare)` — so a
half-staffed or browned-out building fills more slowly rather than stopping
outright. Once
the buffer is full, production simply pauses; nothing is lost. This is also
what makes offline catch-up safe — simulating hours of elapsed time just
clamps every buffer at its cap instead of needing a decay rule. The player
taps the building to move its buffer into the spendable stockpile (respecting
that resource's `stockpileCap`, if any).

### Footprints

Buildings can occupy more than one tile (`BuildingDef.footprint`). Placement
validity and depth-sorting are footprint-aware; `blockRenderer.ts`'s
`footprintGroundCorners()` computes a multi-tile building's iso bounding
rhombus by running its footprint's extreme grid corners through
`IsoGrid.toScreen` (the same trick a single tile's own diamond corners use,
generalized).

## Real building art

Buildings can use a generated/illustrated image instead of the procedural
block. The art for Worker Housing Level 1 lives at
`public/art/apartment-block-1.png` — a square isometric render on a flat
background. `CityScene.preload()` loads it; `create()` runs it through
`processCutoutTexture()`, which keys out the background and crops tightly to
the remaining content, then registers it via
`registerSprite("worker-housing", 0, { textureKey, scale })`.
`buildingVisual.ts`'s `createBuildingVisual` checks the sprite registry
first, before falling back to the procedural renderers — currently only for
1×1 buildings; scaling real art across a multi-tile footprint is unbuilt.

The image was generated via Hugging Face's free Inference API
(`stabilityai/stable-diffusion-3-medium-diffusers`, called directly over HTTP
— no SDK). The prompt that worked: an isometric game asset icon, explicit "2:1
isometric camera angle, orthographic dimetric projection, no perspective
distortion", "smooth 3D render, cel-shaded", the building described as wide
and multi-story with a grid of windows, isolated on a plain background.

## Controls

- **B** or the Build button — open/close the build menu.
- **Click a tile** with a building selected to place it; **Esc** or
  **right-click** cancels placing/moving.
- **Click a placed building** to open its inspector; if its output buffer has
  something in it, that click collects instead.
- **Gear button** — help, and New Game (wipes the save, with confirmation).

## Building upgrades

A `BuildingLevel` with `windowRows`/`windowCols` set gets the detailed
windowed skin (lit/flickering windows, optional antenna/sign) in
`buildingVisual.ts`; any other level falls back to the plain shaded block —
this is data-driven, not tied to a specific building id, so any building can
opt in by supplying those fields. Selecting a placed building opens its info
panel (production status, worker stepper, Upgrade/Move/Demolish), rather than
upgrading on a bare click, since upgrades now cost real build time.

## Planned next milestones

Per the design brief this milestone was scoped against: exploration/world
map, real-time automated combat, the Data/Research/Electronics resource tier
and the rest of the technology tree, gigs, and the side systems (financial
markets, motorsport, businesses) are all intentionally not started yet.
