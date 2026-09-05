import { describe, expect, it, vi } from "vitest";

import { createStore } from "../../src/state/store";

describe("createStore", () => {
  it("returns frozen snapshots and merges patches", () => {
    const store = createStore({ a: 1, b: "x" });
    expect(Object.isFrozen(store.get())).toBe(true);
    store.set({ a: 2 });
    expect(store.get()).toEqual({ a: 2, b: "x" });
  });

  it("notifies with the next and the previous state when a value changes", () => {
    const store = createStore({ a: 1, b: "x" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ a: 2, b: "x" }, { a: 1, b: "x" });
  });

  it("stays silent when nothing changes", () => {
    const store = createStore({ a: 1, b: "x" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ a: 1 });
    store.set({});
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe and never mutates an old snapshot", () => {
    const store = createStore({ a: 1 });
    const before = store.get();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
    expect(before.a).toBe(1);
    expect(store.get().a).toBe(2);
  });
});
