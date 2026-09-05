/**
 * Wires the page together: loads the day, mounts the map and the slices, runs the animation
 * loop and exposes a small read-mostly API for the smoke tests (ARCHITECTURE.md, section 6.1).
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { DataError, type Mode, type RouteInfo, type Vehicle } from "./data/contract";
import { chooseDay } from "./data/days";
import {
  createDataSource,
  loadDay,
  loadIndex,
  loadNetwork,
  loadSlice,
  loadVehicles,
  type Day,
} from "./data/loader";
import { createSliceStore } from "./data/slices";
import { fr } from "./i18n/fr";
import {
  computeHeads,
  createHeadBuffers,
  mountSlice,
  type HeadBuffers,
  type MountedSlice,
} from "./render/heads";
import {
  createHeadsLayer,
  createNetworkLayer,
  createTripsLayer,
  tripsLayerProps,
} from "./render/layers";
import { createMapView } from "./render/map";
import { readUrlState } from "./state/url";
import { nightStyle } from "./theme/basemap";
import { SERVICE_DAY_LENGTH_S, hourOf } from "./time/clock";
import { createPlayer } from "./time/player";
import { createClockView } from "./ui/clock";
import { createPlayButton } from "./ui/controls";
import { bindKeyboard } from "./ui/keyboard";
import { createStatusView } from "./ui/status";

declare global {
  interface Window {
    /** Set by main.ts once the page is running; read by the smoke tests. */
    stibviz?: DebugApi;
  }
}

/** 08:00, a lively instant to open on until the URL says otherwise. */
export const DEFAULT_START_TIME_S = 14400;

export interface AppOptions {
  dataBase?: string;
  search?: string;
  today?: string;
  reducedMotion?: boolean;
}

export interface HeadSnapshot {
  vehicle: number;
  route: string;
  mode: Mode;
  lon: number;
  lat: number;
}

export interface Snapshot {
  day: string;
  time: number;
  hour: number;
  heads: HeadSnapshot[];
}

/** Read-mostly inspection API, exposed as `window.stibviz` for the smoke tests. */
export interface DebugApi {
  ready(): boolean;
  time(): number;
  playing(): boolean;
  waiting(): boolean;
  fps(): number;
  snapshot(): Snapshot;
  seek(time: number): void;
  play(): void;
  pause(): void;
}

function localDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

interface Shell {
  map: HTMLElement;
  date: HTMLElement;
  clock: HTMLElement;
  controls: HTMLElement;
  status: HTMLElement;
  attribution: HTMLElement;
}

function buildShell(root: HTMLElement): Shell {
  root.replaceChildren();
  const map = element("main", "map", root);
  map.setAttribute("aria-label", fr.mapLabel);
  const panel = element("aside", "panel", root);
  const header = element("header", "panel__header", panel);
  element("h1", "panel__title", header).textContent = fr.appTitle;
  const date = element("p", "panel__date", header);
  const clock = element("div", "panel__clock", panel);
  const controls = element("div", "panel__controls", panel);
  const status = element("div", "panel__status", panel);
  const attribution = element("footer", "panel__attribution", panel);
  return { map, date, clock, controls, status, attribution };
}

export async function startApp(root: HTMLElement, options: AppOptions = {}): Promise<DebugApi> {
  const shell = buildShell(root);
  const status = createStatusView(shell.status);
  status.show(fr.loading);

  const source = createDataSource(options.dataBase ?? "/data");
  const url = readUrlState(options.search ?? "");
  const index = await loadIndex(source);
  const entry = chooseDay(index, url.day, options.today ?? localDate());
  if (entry === undefined) {
    throw new DataError(fr.noDay);
  }
  const day: Day = await loadDay(source, entry);
  const network = await loadNetwork(source, day);
  const routes: readonly RouteInfo[] = day.manifest.routes;
  shell.date.textContent = formatDate(day.manifest.date);
  shell.attribution.textContent = day.manifest.attribution;

  const reducedMotion =
    options.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const player = createPlayer({
    time: url.time ?? DEFAULT_START_TIME_S,
    playing: url.playing ?? !reducedMotion,
  });
  const clock = createClockView(shell.clock);
  const playButton = createPlayButton(shell.controls, () => {
    player.toggle();
  });
  bindKeyboard(document, {
    toggle: () => {
      player.toggle();
    },
  });

  const view = createMapView(shell.map, nightStyle(), {
    ...(url.camera === undefined ? {} : { camera: url.camera }),
    onBasemapUnavailable: (message) => {
      console.warn(`${fr.basemapUnavailable} (${message})`);
    },
  });
  const networkLayer = createNetworkLayer(network);
  const store = createSliceStore(day.manifest.slices, (sliceEntry) =>
    loadSlice(source, day, sliceEntry),
  );

  let vehicles: Vehicle[] | null = null;
  let mounted: MountedSlice[] = [];
  let mountedHour = -1;
  let buffers: HeadBuffers = createHeadBuffers(0);
  let mounting: Promise<void> | null = null;
  // An hour whose slices failed to load is not retried until the instant leaves it, otherwise
  // every animation frame would request the failed file again.
  let failedHour = -1;

  async function mountHour(hour: number): Promise<void> {
    const result = await store.mount(hour);
    mounted = [...result.slices].map(([mode, slice]) => mountSlice(mode, slice, routes));
    buffers = createHeadBuffers(mounted.reduce((total, item) => total + item.slice.paths, 0));
    mountedHour = hour;
    store.prefetch(hour + 1);
  }

  function ensureHour(hour: number): void {
    if (hour === mountedHour || hour === failedHour || mounting !== null) {
      return;
    }
    failedHour = -1;
    if (!store.cached(hour)) {
      player.setWaiting(true);
      status.show(fr.waitingNextHour);
    }
    mounting = mountHour(hour)
      .then(() => {
        player.setWaiting(false);
        status.hide();
      })
      .catch((error: unknown) => {
        console.error(error);
        failedHour = hour;
        player.setWaiting(false);
        player.pause();
        status.show(fr.dataError);
      })
      .finally(() => {
        mounting = null;
      });
  }

  let renderedTime = Number.NaN;
  let renderedHour = -1;
  function render(time: number): void {
    if (mountedHour < 0 || (time === renderedTime && mountedHour === renderedHour)) {
      return;
    }
    renderedTime = time;
    renderedHour = mountedHour;
    const count = computeHeads(mounted, time, vehicles, buffers);
    view.setLayers([
      networkLayer,
      ...mounted.map((item) => createTripsLayer(tripsLayerProps(item, time))),
      createHeadsLayer(buffers, count),
    ]);
  }

  let frames = 0;
  let fpsAnchor = performance.now();
  let fps = 0;
  function frame(now: number): void {
    const state = player.tick(now);
    ensureHour(hourOf(state.time));
    render(state.time);
    frames += 1;
    if (now - fpsAnchor >= 1000) {
      fps = (frames * 1000) / (now - fpsAnchor);
      frames = 0;
      fpsAnchor = now;
    }
    requestAnimationFrame(frame);
  }

  player.subscribe((state) => {
    clock.update(state.time);
    playButton.update(state.playing);
    if (!state.playing && state.time >= SERVICE_DAY_LENGTH_S) {
      status.show(fr.endOfDay);
    }
  });
  clock.update(player.state().time);
  playButton.update(player.state().playing);
  requestAnimationFrame(frame);

  // The vehicle list only refines layovers; it is read after the first frame, never before it.
  loadVehicles(source, day)
    .then((list) => {
      vehicles = list;
      renderedTime = Number.NaN;
    })
    .catch((error: unknown) => {
      console.warn("vehicles.json unavailable, layovers are held from the slices alone", error);
    });

  return {
    ready: () => mountedHour >= 0,
    time: () => player.state().time,
    playing: () => player.state().playing,
    waiting: () => player.state().waiting,
    fps: () => fps,
    snapshot() {
      const time = player.state().time;
      const heads: HeadSnapshot[] = [];
      const count = mountedHour >= 0 ? computeHeads(mounted, time, vehicles, buffers) : 0;
      for (let i = 0; i < count; i += 1) {
        const item = mounted[buffers.slot[i] ?? 0];
        const path = buffers.path[i] ?? 0;
        if (item === undefined) {
          continue;
        }
        heads.push({
          vehicle: item.slice.vehicle[path] ?? -1,
          route: routes[item.slice.route[path] ?? -1]?.name ?? "?",
          mode: item.mode,
          lon: buffers.positions[2 * i] ?? Number.NaN,
          lat: buffers.positions[2 * i + 1] ?? Number.NaN,
        });
      }
      return { day: day.manifest.date, time, hour: mountedHour, heads };
    },
    seek(time) {
      player.seek(time);
    },
    play() {
      player.play();
    },
    pause() {
      player.pause();
    },
  };
}
