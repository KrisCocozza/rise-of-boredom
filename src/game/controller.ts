import {
  ActionResult,
  collectBuilding,
  demolishBuilding,
  moveBuilding,
  placeBuilding,
  setAssignedWorkers,
  startUpgrade,
} from "./state/actions";
import { catchUp } from "./state/simulation";
import { GameState } from "./state/types";
import { loadGame, saveGame } from "./persistence";

export const GRID_SIZE = 10;

const SAVE_INTERVAL_TICKS = 5;

export type Listener = () => void;

/** What the player is currently doing with the pointer, shared by the canvas and the DOM UI. */
export interface UiMode {
  /** Building def selected in the build menu, awaiting a tile click. */
  placingDefId: string | null;
  /** Placed building being relocated, awaiting a destination tile click. */
  movingUid: string | null;
  /** Placed building whose inspector panel is open. */
  selectedUid: string | null;
}

/**
 * Single owner of the game state and interaction mode. The Phaser scene and the DOM UI are both
 * subscribers: every state- or mode-changing call ends in notify(), and successful actions also
 * autosave. Neither view mutates state directly.
 */
export class GameController {
  readonly state: GameState;
  readonly mode: UiMode = { placingDefId: null, movingUid: null, selectedUid: null };

  private listeners = new Set<Listener>();
  private secondsSinceSave = 0;
  private intervalId: number | null = null;

  constructor() {
    this.state = loadGame();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Drives the simulation on wall-clock time, deliberately independent of Phaser's
   * requestAnimationFrame-based clock: a backgrounded (or throttled) tab stalls rAF and would
   * silently freeze game time, but setInterval keeps firing and each fire simulates however much
   * real time actually elapsed since the last simulated moment (state.lastTickAtMs).
   */
  startTicking(): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => this.tickToNow(), 1000);
  }

  private tickToNow(): void {
    const elapsedSeconds = (Date.now() - this.state.lastTickAtMs) / 1000;
    if (elapsedSeconds < 0.25) return;
    catchUp(this.state, elapsedSeconds);
    this.secondsSinceSave += elapsedSeconds;
    if (this.secondsSinceSave >= SAVE_INTERVAL_TICKS) {
      saveGame(this.state);
      this.secondsSinceSave = 0;
    }
    this.notify();
  }

  // ------------------------------------------------------------- mode --

  startPlacing(defId: string): void {
    this.mode.placingDefId = defId;
    this.mode.movingUid = null;
    this.mode.selectedUid = null;
    this.notify();
  }

  startMoving(uid: string): void {
    this.mode.movingUid = uid;
    this.mode.placingDefId = null;
    this.mode.selectedUid = null;
    this.notify();
  }

  select(uid: string | null): void {
    this.mode.selectedUid = uid;
    this.mode.placingDefId = null;
    this.mode.movingUid = null;
    this.notify();
  }

  cancelMode(): void {
    this.mode.placingDefId = null;
    this.mode.movingUid = null;
    this.mode.selectedUid = null;
    this.notify();
  }

  // ---------------------------------------------------------- actions --

  private afterAction(result: ActionResult): ActionResult {
    if (result.ok) saveGame(this.state);
    this.notify();
    return result;
  }

  place(col: number, row: number): ActionResult {
    if (!this.mode.placingDefId) return { ok: false, reason: "Nothing selected to build." };
    return this.afterAction(placeBuilding(this.state, this.mode.placingDefId, col, row, GRID_SIZE));
  }

  moveTo(col: number, row: number): ActionResult {
    const uid = this.mode.movingUid;
    if (!uid) return { ok: false, reason: "No building is being moved." };
    const result = moveBuilding(this.state, uid, col, row, GRID_SIZE);
    if (result.ok) {
      this.mode.movingUid = null;
      this.mode.selectedUid = uid;
    }
    return this.afterAction(result);
  }

  collect(uid: string): ActionResult {
    return this.afterAction(collectBuilding(this.state, uid));
  }

  setWorkers(uid: string, desired: number): ActionResult {
    return this.afterAction(setAssignedWorkers(this.state, uid, desired));
  }

  upgrade(uid: string): ActionResult {
    return this.afterAction(startUpgrade(this.state, uid));
  }

  demolish(uid: string): ActionResult {
    const result = demolishBuilding(this.state, uid);
    if (result.ok && this.mode.selectedUid === uid) this.mode.selectedUid = null;
    return this.afterAction(result);
  }
}
