/**
 * Variable-speed playback of the service day (SCOPE.md, section 4.3).
 *
 * The player owns neither a timer nor its state: it reads and writes the time, speed, playing
 * and waiting fields of the store it is given, and the page calls `tick(now)` on every animation
 * frame. It advances service time by the elapsed real time times the speed, stops at the end of
 * the day and holds still while the page waits for data, without ever jumping when it resumes.
 */

import type { Store } from "../state/store";
import { SERVICE_DAY_LENGTH_S, clampTime } from "./clock";

export const SPEEDS = [60, 120, 300, 600] as const;
export const DEFAULT_SPEED = 300;

export interface PlayerState {
  readonly time: number;
  readonly speed: number;
  readonly playing: boolean;
  readonly waiting: boolean;
}

export interface Player {
  state(): PlayerState;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  /** Moves by a signed number of service seconds, within the day. */
  step(seconds: number): void;
  setSpeed(speed: number): void;
  setWaiting(waiting: boolean): void;
  /** Advances to the real-time instant `nowMs` (milliseconds) and returns the new state. */
  tick(nowMs: number): PlayerState;
}

export function createPlayer(store: Store<PlayerState>): Player {
  // Real-time instant of the last tick, undefined until the next tick re-anchors playback.
  let anchor: number | undefined;

  function play(): void {
    anchor = undefined;
    store.set({ playing: true });
  }

  function pause(): void {
    store.set({ playing: false });
  }

  function seek(time: number): void {
    store.set({ time: clampTime(time) });
  }

  return {
    state: () => store.get(),
    play,
    pause,
    toggle() {
      if (store.get().playing) {
        pause();
      } else {
        play();
      }
    },
    seek,
    step(seconds) {
      seek(store.get().time + seconds);
    },
    setSpeed(speed) {
      if (Number.isFinite(speed) && speed > 0) {
        store.set({ speed });
      }
    },
    setWaiting(waiting) {
      store.set({ waiting });
    },
    tick(nowMs) {
      const state = store.get();
      if (anchor === undefined || !state.playing || state.waiting) {
        anchor = nowMs;
        return state;
      }
      const elapsed = (nowMs - anchor) / 1000;
      anchor = nowMs;
      const time = state.time + elapsed * state.speed;
      if (time >= SERVICE_DAY_LENGTH_S) {
        store.set({ time: SERVICE_DAY_LENGTH_S, playing: false });
      } else {
        store.set({ time });
      }
      return store.get();
    },
  };
}
