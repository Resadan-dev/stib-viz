import { describe, expect, it, vi } from "vitest";

import { SERVICE_DAY_LENGTH_S } from "../../src/time/clock";
import { DEFAULT_SPEED, SPEEDS, createPlayer } from "../../src/time/player";

describe("createPlayer", () => {
  it("starts paused at 04:00 at the default speed", () => {
    const player = createPlayer();
    expect(player.state()).toEqual({
      time: 0,
      speed: DEFAULT_SPEED,
      playing: false,
      waiting: false,
    });
    expect(SPEEDS).toEqual([60, 120, 300, 600]);
  });

  it("advances service time by elapsed real time times the speed", () => {
    const player = createPlayer({ playing: true, speed: 300 });
    player.tick(1000);
    expect(player.state().time).toBe(0);
    player.tick(2000);
    expect(player.state().time).toBe(300);
    player.tick(2500);
    expect(player.state().time).toBe(450);
  });

  it("does not advance while paused and does not jump when resumed", () => {
    const player = createPlayer({ playing: true, speed: 60 });
    player.tick(1000);
    player.pause();
    player.tick(5000);
    expect(player.state().time).toBe(0);
    player.play();
    player.tick(9000);
    player.tick(10000);
    expect(player.state().time).toBe(60);
  });

  it("does not advance while waiting for data", () => {
    const player = createPlayer({ playing: true, speed: 60 });
    player.tick(1000);
    player.setWaiting(true);
    player.tick(3000);
    expect(player.state().time).toBe(0);
    expect(player.state().playing).toBe(true);
    player.setWaiting(false);
    player.tick(4000);
    expect(player.state().time).toBe(60);
  });

  it("stops at the end of the service day", () => {
    const player = createPlayer({ time: SERVICE_DAY_LENGTH_S - 10, playing: true, speed: 600 });
    player.tick(0);
    player.tick(1000);
    expect(player.state()).toMatchObject({ time: SERVICE_DAY_LENGTH_S, playing: false });
  });

  it("toggles, seeks within bounds and changes speed", () => {
    const player = createPlayer();
    player.toggle();
    expect(player.state().playing).toBe(true);
    player.toggle();
    expect(player.state().playing).toBe(false);
    player.seek(-100);
    expect(player.state().time).toBe(0);
    player.seek(46980);
    expect(player.state().time).toBe(46980);
    player.setSpeed(600);
    expect(player.state().speed).toBe(600);
    player.setSpeed(0);
    expect(player.state().speed).toBe(600);
  });

  it("notifies subscribers with immutable snapshots on every change", () => {
    const player = createPlayer({ playing: true });
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);
    player.tick(1000);
    player.tick(1500);
    player.pause();
    expect(listener).toHaveBeenCalledTimes(2);
    const snapshot = listener.mock.calls[0]?.[0] as { time: number };
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.time).toBe(150);
    unsubscribe();
    player.play();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
