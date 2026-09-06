import { GameState } from "./state/types";
import { createInitialState } from "./state/seed";
import { catchUp } from "./state/simulation";

const STORAGE_KEY = "rise-of-boredom:save:v1";

/** Wipes the save so the next load starts a fresh game (used by the game menu's New Game). */
export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same private-browsing caveat as saveGame — nothing useful to do.
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts — losing an autosave isn't fatal.
  }
}

/** Loads the save (or seeds a new game) and fast-forwards production/construction through any offline time. */
export function loadGame(): GameState {
  let state: GameState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? (JSON.parse(raw) as GameState) : createInitialState();
  } catch {
    state = createInitialState();
  }

  const elapsedSeconds = (Date.now() - state.lastTickAtMs) / 1000;
  if (elapsedSeconds > 0) catchUp(state, elapsedSeconds);
  return state;
}
