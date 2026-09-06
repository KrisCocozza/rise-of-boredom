import { GameState } from "./state/types";
import { createInitialState } from "./state/seed";
import { catchUp } from "./state/simulation";

const STORAGE_KEY = "rise-of-boredom:save:v1";

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
