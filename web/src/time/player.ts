/**
 * Variable-speed playback of the service day (SCOPE.md, section 4.3).
 *
 * The player owns no timer: the page calls `tick(now)` on every animation frame and the player
 * advances service time by the elapsed real time times the speed. It stops at the end of the
 * day and holds still while the page waits for data, without ever jumping when it resumes.
 */

import { SERVICE_DAY_LENGTH_S, clampTime } from "./clock";

export const SPEEDS = [60, 120, 300, 600] as const;
export const DEFAULT_SPEED = 300;

export interface PlayerState {
  readonly time: number;
  readonly speed: number;
  readonly playing: boolean;
  readonly waiting: boolean;
}

export type PlayerListener = (state: PlayerState) => void;

export interface Player {
  state(): PlayerState;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  setSpeed(speed: number): void;
  setWaiting(waiting: boolean): void;
  /** Advances to the real-time instant `nowMs` (milliseconds) and returns the new state. */
  tick(nowMs: number): PlayerState;
  subscribe(listener: PlayerListener): () => void;
}

export function createPlayer(initial: Partial<PlayerState> = {}): Player {
  let state: PlayerState = Object.freeze({
    time: clampTime(initial.time ?? 0),
    speed: initial.speed ?? DEFAULT_SPEED,
    playing: initial.playing ?? false,
    waiting: initial.waiting ?? false,
  });
  // Real-time instant of the last tick, undefined until the next tick re-anchors playback.
  let anchor: number | undefined;
  const listeners = new Set<PlayerListener>();

  function update(patch: Partial<PlayerState>): void {
    const next: PlayerState = Object.freeze({ ...state, ...patch });
    if (
      next.time === state.time &&
      next.speed === state.speed &&
      next.playing === state.playing &&
      next.waiting === state.waiting
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function play(): void {
    anchor = undefined;
    update({ playing: true });
  }

  function pause(): void {
    update({ playing: false });
  }

  return {
    state: () => state,
    play,
    pause,
    toggle() {
      if (state.playing) {
        pause();
      } else {
        play();
      }
    },
    seek(time) {
      update({ time: clampTime(time) });
    },
    setSpeed(speed) {
      if (Number.isFinite(speed) && speed > 0) {
        update({ speed });
      }
    },
    setWaiting(waiting) {
      update({ waiting });
    },
    tick(nowMs) {
      if (anchor === undefined || !state.playing || state.waiting) {
        anchor = nowMs;
        return state;
      }
      const elapsed = (nowMs - anchor) / 1000;
      anchor = nowMs;
      const time = state.time + elapsed * state.speed;
      if (time >= SERVICE_DAY_LENGTH_S) {
        update({ time: SERVICE_DAY_LENGTH_S, playing: false });
      } else {
        update({ time });
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
