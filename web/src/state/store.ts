/**
 * The single state object of the page (ARCHITECTURE.md, section 6.4).
 *
 * Snapshots are frozen; a patch replaces the snapshot when at least one value changed; every
 * listener receives the next and the previous snapshot, so a component reacts to the keys it
 * cares about and ignores the rest without any bookkeeping of its own.
 */

export type Listener<T> = (state: Readonly<T>, previous: Readonly<T>) => void;

export interface Store<T extends object> {
  get(): Readonly<T>;
  set(patch: Partial<T>): void;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: Readonly<T> = Object.freeze({ ...initial });
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(patch) {
      const keys = Object.keys(patch) as (keyof T)[];
      if (!keys.some((key) => patch[key] !== state[key])) {
        return;
      }
      const previous = state;
      state = Object.freeze({ ...state, ...patch });
      for (const listener of listeners) {
        listener(state, previous);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
