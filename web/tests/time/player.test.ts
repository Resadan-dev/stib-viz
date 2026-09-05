import { describe, expect, it, vi } from "vitest";

import { createStore } from "../../src/state/store";
import { SERVICE_DAY_LENGTH_S } from "../../src/time/clock";
import { DEFAULT_SPEED, SPEEDS, createPlayer, type PlayerState } from "../../src/time/player";

function player(initial: Partial<PlayerState> = {}) {
  const store = createStore<PlayerState>({
    time: 0,
    speed: DEFAULT_SPEED,
    playing: false,
    waiting: false,
    ...initial,
  });
  return { store, player: createPlayer(store) };
}

describe("createPlayer", () => {
  it("reads its state from the store it is given", () => {
    const { store, player: p } = player();
    expect(p.state()).toEqual({ time: 0, speed: DEFAULT_SPEED, playing: false, waiting: false });
    expect(SPEEDS).toEqual([60, 120, 300, 600]);
    p.seek(120);
    expect(store.get().time).toBe(120);
  });

  it("advances service time by elapsed real time times the speed", () => {
    const { player: p } = player({ playing: true, speed: 300 });
    p.tick(1000);
    expect(p.state().time).toBe(0);
    p.tick(2000);
    expect(p.state().time).toBe(300);
    p.tick(2500);
    expect(p.state().time).toBe(450);
  });

  it("does not advance while paused and does not jump when resumed", () => {
    const { player: p } = player({ playing: true, speed: 60 });
    p.tick(1000);
    p.pause();
    p.tick(5000);
    expect(p.state().time).toBe(0);
    p.play();
    p.tick(9000);
    p.tick(10000);
    expect(p.state().time).toBe(60);
  });

  it("does not advance while waiting for data", () => {
    const { player: p } = player({ playing: true, speed: 60 });
    p.tick(1000);
    p.setWaiting(true);
    p.tick(3000);
    expect(p.state().time).toBe(0);
    expect(p.state().playing).toBe(true);
    p.setWaiting(false);
    p.tick(4000);
    expect(p.state().time).toBe(60);
  });

  it("stops at the end of the service day", () => {
    const { player: p } = player({ time: SERVICE_DAY_LENGTH_S - 10, playing: true, speed: 600 });
    p.tick(0);
    p.tick(1000);
    expect(p.state()).toMatchObject({ time: SERVICE_DAY_LENGTH_S, playing: false });
  });

  it("toggles, seeks within bounds, steps and changes speed", () => {
    const { player: p } = player();
    p.toggle();
    expect(p.state().playing).toBe(true);
    p.toggle();
    expect(p.state().playing).toBe(false);
    p.seek(-100);
    expect(p.state().time).toBe(0);
    p.seek(46980);
    expect(p.state().time).toBe(46980);
    p.step(60);
    expect(p.state().time).toBe(47040);
    p.step(-600);
    expect(p.state().time).toBe(46440);
    p.setSpeed(600);
    expect(p.state().speed).toBe(600);
    p.setSpeed(0);
    expect(p.state().speed).toBe(600);
  });

  it("does not jump when a seek lands while playing", () => {
    const { player: p } = player({ playing: true, speed: 300 });
    p.tick(1000);
    p.tick(2000);
    p.seek(10000);
    p.tick(3000);
    expect(p.state().time).toBe(10300);
  });

  it("notifies through the store with frozen snapshots", () => {
    const { store, player: p } = player({ playing: true });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    p.tick(1000);
    p.tick(1500);
    p.pause();
    expect(listener).toHaveBeenCalledTimes(2);
    const snapshot = listener.mock.calls[0]?.[0] as PlayerState;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.time).toBe(150);
    unsubscribe();
    p.play();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
