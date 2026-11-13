import { TrainerProgress, newProgress, parseProgress } from "./poker/trainer";

/**
 * Browser storage for trainer progress, shaped for `useSyncExternalStore`.
 * Storage is optional: when it is blocked or full, progress lives in memory for the visit.
 */
const KEY = "pokerlens_trainer_v1";

let cache: TrainerProgress | null = null;
const listeners = new Set<() => void>();

function read(): TrainerProgress | null {
  try {
    return parseProgress(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function write(p: TrainerProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode, blocked or full storage: keep going in memory.
  }
}

/** A new seed per fresh start. The deal itself is a pure function of the seed. */
const freshSeed = () => (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

export function getProgress(): TrainerProgress {
  if (!cache) cache = read() ?? newProgress(freshSeed());
  return cache;
}

/** There is no progress on the server; the page renders a placeholder until it hydrates. */
export const getServerProgress = (): TrainerProgress | null => null;

export function saveProgress(p: TrainerProgress): void {
  cache = p;
  write(p);
  listeners.forEach((l) => l());
}

export function resetProgress(): void {
  saveProgress(newProgress(freshSeed()));
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
