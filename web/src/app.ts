/**
 * Wires the page together: loads the day, mounts the map and the slices, runs the animation
 * loop and exposes a small read-mostly API for the smoke tests (ARCHITECTURE.md, section 6.1).
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { DataError, MODES, type Mode, type RouteInfo, type Vehicle } from "./data/contract";
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
import { createStopsStore, parseStops } from "./data/stops";
import { dayKindLabel, fr } from "./i18n/fr";
import type { ColourOptions } from "./render/colors";
import {
  computeHeads,
  createHeadBuffers,
  mountSlice,
  recolour,
  type HeadBuffers,
  type MountedSlice,
} from "./render/heads";
import {
  createHeadsLayer,
  createNetworkLayer,
  createSelectionLayer,
  createTripsLayer,
  tripsLayerProps,
} from "./render/layers";
import { createMapView } from "./render/map";
import { describeVehicle, headAt } from "./render/selection";
import { initialState, type AppState, type ModeVisibility } from "./state/app-state";
import { createStore } from "./state/store";
import { applyUrlState, readUrlState, syncUrl } from "./state/url";
import { nightStyle } from "./theme/basemap";
import { MODE_COLORS, routeColor } from "./theme/colors";
import { SERVICE_DAY_LENGTH_S, hourOf, minuteOf } from "./time/clock";
import { createPlayer } from "./time/player";
import { createAbout } from "./ui/about";
import { createActivity } from "./ui/activity";
import { createClockView } from "./ui/clock";
import { createColourToggle } from "./ui/colours";
import { createPlayButton } from "./ui/controls";
import { createCounters } from "./ui/counters";
import { createFilters } from "./ui/filters";
import { bindKeyboard } from "./ui/keyboard";
import { createLineSelect } from "./ui/lines";
import { createSpeedControl } from "./ui/speed";
import { createStatusView } from "./ui/status";
import { createVehiclePanel } from "./ui/vehicle-panel";

declare global {
  interface Window {
    /** Set by main.ts once the page is running; read by the smoke tests. */
    stibviz?: DebugApi;
  }
}

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
  /** Selects a vehicle by its index in vehicles.json, or clears the selection. */
  select(vehicle: number | null): void;
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
  kind: HTMLElement;
  clock: HTMLElement;
  controls: HTMLElement;
  speed: HTMLElement;
  counters: HTMLElement;
  filters: HTMLElement;
  appearance: HTMLElement;
  status: HTMLElement;
  attribution: HTMLElement;
  about: HTMLElement;
  vehicle: HTMLElement;
  activity: HTMLElement;
}

export const REPOSITORY_URL = "https://github.com/Resadan-dev/stib-viz";

function buildShell(root: HTMLElement): Shell {
  root.replaceChildren();
  const map = element("main", "map", root);
  map.setAttribute("aria-label", fr.mapLabel);
  const panel = element("aside", "panel", root);
  const header = element("header", "panel__header", panel);
  element("h1", "panel__title", header).textContent = fr.appTitle;
  const dateLine = element("p", "panel__date", header);
  const date = element("span", "panel__date-text", dateLine);
  const kind = element("span", "panel__kind", dateLine);
  const clock = element("div", "panel__clock", panel);
  const controls = element("div", "panel__controls", panel);
  const speed = element("div", "panel__speed", controls);
  const counters = element("div", "panel__counters", panel);
  const filters = element("div", "panel__filters", panel);
  const appearance = element("div", "panel__appearance", panel);
  const status = element("div", "panel__status", panel);
  const about = element("div", "panel__about", panel);
  const attribution = element("footer", "panel__attribution", panel);
  const vehicle = element("div", "vehicle-slot", root);
  const activity = element("div", "activity-slot", root);
  return {
    about,
    vehicle,
    activity,
    map,
    date,
    kind,
    clock,
    controls,
    speed,
    counters,
    filters,
    appearance,
    status,
    attribution,
  };
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
  shell.kind.textContent = dayKindLabel(entry.kind);
  shell.attribution.textContent = day.manifest.attribution;

  const reducedMotion =
    options.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The URL may name a day the index does not have: the chosen day always wins.
  const store = createStore({
    ...applyUrlState(initialState(entry.date, { playing: !reducedMotion }), url),
    day: entry.date,
  });
  const player = createPlayer(store);
  syncUrl(store, (query) => {
    window.history.replaceState(null, "", query);
  });
  const clock = createClockView(shell.clock);
  const playButton = createPlayButton(shell.controls, () => {
    player.toggle();
  });
  const speedControl = createSpeedControl(shell.speed, (speed) => {
    player.setSpeed(speed);
  });
  const counters = createCounters(shell.counters, day.manifest);
  const filters = createFilters(shell.filters, (mode, visible) => {
    store.set({ modes: { ...store.get().modes, [mode]: visible } });
  });
  const lineSelect = createLineSelect(shell.appearance, routes, (line) => {
    // Selecting a line shows its mode again: a hidden selection would be a puzzle.
    const route = routes.find((candidate) => candidate.name === line);
    const modes =
      route === undefined ? store.get().modes : { ...store.get().modes, [route.mode]: true };
    store.set({ line, modes });
  });
  const colourToggle = createColourToggle(shell.appearance, (colours) => {
    store.set({ colours });
  });
  const activity = createActivity(shell.activity, day.manifest, (time) => {
    player.seek(time);
  });
  createAbout(shell.about, {
    feedVersion: day.manifest.feed_version,
    attribution: day.manifest.attribution,
    repositoryUrl: REPOSITORY_URL,
  });
  const colourOptions = (state: AppState): ColourOptions => ({
    scheme: state.colours,
    line: state.line,
  });
  bindKeyboard(document, {
    toggle: () => {
      player.toggle();
    },
    step: (seconds) => {
      player.step(seconds);
    },
    setSpeed: (speed) => {
      player.setSpeed(speed);
    },
    escape: () => {
      store.set({ vehicle: null });
    },
  });

  const camera = store.get().camera;
  const view = createMapView(shell.map, nightStyle(), {
    ...(camera === null ? {} : { camera }),
    onBasemapUnavailable: (message) => {
      console.warn(`${fr.basemapUnavailable} (${message})`);
    },
  });
  view.map.on("moveend", () => {
    const center = view.map.getCenter();
    store.set({
      camera: { latitude: center.lat, longitude: center.lng, zoom: view.map.getZoom() },
    });
  });
  const networkLayer = createNetworkLayer(network);
  const stopsStore = createStopsStore(day.manifest.stops_files, (entry) =>
    source.json(day.directory + entry.path).then(parseStops),
  );
  const panel = createVehiclePanel(shell.vehicle, () => {
    store.set({ vehicle: null });
  });
  view.onEmptyClick(() => {
    store.set({ vehicle: null });
  });
  const slices = createSliceStore(day.manifest.slices, (sliceEntry) =>
    loadSlice(source, day, sliceEntry),
  );

  let vehicles: Vehicle[] | null = null;
  let mounted: MountedSlice[] = [];
  let mountedHour = -1;
  // What is mounted: the hour and the visible modes, as one comparable key.
  let mountedKey = "";
  let buffers: HeadBuffers = createHeadBuffers(0);
  let mounting: Promise<void> | null = null;
  // An hour whose slices failed to load is not retried until the instant leaves it, otherwise
  // every animation frame would request the failed file again.
  let failedHour = -1;

  function mountKey(hour: number, modes: ModeVisibility): string {
    return `${String(hour)}|${MODES.filter((mode) => modes[mode]).join(",")}`;
  }

  async function mountHour(hour: number, modes: ModeVisibility): Promise<void> {
    const result = await slices.mount(hour, modes);
    const options = colourOptions(store.get());
    mounted = [...result.slices].map(([mode, slice]) => mountSlice(mode, slice, routes, options));
    buffers = createHeadBuffers(mounted.reduce((total, item) => total + item.slice.paths, 0));
    mountedHour = hour;
    mountedKey = mountKey(hour, modes);
    slices.prefetch(hour + 1, modes);
  }

  function ensureMounted(hour: number, modes: ModeVisibility): void {
    if (mountKey(hour, modes) === mountedKey || hour === failedHour || mounting !== null) {
      return;
    }
    failedHour = -1;
    if (!slices.cached(hour, modes)) {
      player.setWaiting(true);
      status.show(fr.waitingNextHour);
    }
    mounting = mountHour(hour, modes)
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

  function pick(index: number): void {
    const head = headAt(mounted, buffers, index);
    if (head !== undefined) {
      store.set({ vehicle: head.vehicle });
    }
  }

  /** Position and route of the selected vehicle among the heads just computed, if drawn. */
  function selectedHead(
    count: number,
    vehicle: number | null,
  ): { position: [number, number]; route: RouteInfo | undefined } | null {
    if (vehicle === null) {
      return null;
    }
    for (let i = 0; i < count; i += 1) {
      const head = headAt(mounted, buffers, i);
      if (head?.vehicle === vehicle) {
        const item = mounted[buffers.slot[i] ?? -1];
        const routeIndex = item?.slice.route[buffers.path[i] ?? -1];
        return {
          position: [buffers.positions[2 * i] ?? 0, buffers.positions[2 * i + 1] ?? 0],
          route: routeIndex === undefined ? undefined : routes[routeIndex],
        };
      }
    }
    return null;
  }

  let renderedTime = Number.NaN;
  let renderedKey = "";
  let renderedVehicle: number | null = null;
  function render(time: number, vehicle: number | null): void {
    if (
      mountedHour < 0 ||
      (time === renderedTime && mountedKey === renderedKey && vehicle === renderedVehicle)
    ) {
      return;
    }
    renderedTime = time;
    renderedKey = mountedKey;
    renderedVehicle = vehicle;
    const count = computeHeads(mounted, time, vehicles, buffers);
    const selection = selectedHead(count, vehicle);
    const ring =
      selection === null
        ? null
        : {
            position: selection.position,
            colour: routeColor(selection.route ?? { mode: "bus", color: "" }, store.get().colours),
          };
    view.setLayers([
      networkLayer,
      ...mounted.map((item) => createTripsLayer(tripsLayerProps(item, time))),
      createHeadsLayer(buffers, count, pick),
      createSelectionLayer(ring?.position ?? null, ring?.colour ?? MODE_COLORS.bus),
    ]);
  }

  let frames = 0;
  let fpsAnchor = performance.now();
  let fps = 0;
  function frame(now: number): void {
    player.tick(now);
    const state = store.get();
    ensureMounted(hourOf(state.time), state.modes);
    render(state.time, state.vehicle);
    frames += 1;
    if (now - fpsAnchor >= 1000) {
      fps = (frames * 1000) / (now - fpsAnchor);
      frames = 0;
      fpsAnchor = now;
    }
    requestAnimationFrame(frame);
  }

  let describing = 0;
  function describeSelected(state: AppState): void {
    if (state.vehicle === null || vehicles === null) {
      panel.hide();
      return;
    }
    const vehicle = state.vehicle;
    const time = state.time;
    const names = network.stops;
    const list = vehicles;
    const first = describeVehicle(vehicle, list, routes, time, null, names);
    if (first === null) {
      panel.hide();
      return;
    }
    panel.show(first);
    // Stops are loaded on the first click within the hour, never earlier (section 5.6).
    const request = (describing += 1);
    stopsStore
      .get(hourOf(time))
      .then((stops) => {
        if (request !== describing || stops === null) {
          return;
        }
        const full = describeVehicle(vehicle, list, routes, time, stops, names);
        if (full !== null) {
          panel.show(full);
        }
      })
      .catch((error: unknown) => {
        console.warn("stops of the hour unavailable", error);
      });
  }

  function reflect(state: AppState, previous: AppState): void {
    if (
      state.vehicle !== previous.vehicle ||
      (state.vehicle !== null && minuteOf(state.time) !== minuteOf(previous.time))
    ) {
      describeSelected(state);
    }
    clock.update(state.time);
    playButton.update(state.playing);
    speedControl.update(state.speed);
    counters.update(state.time, state.modes);
    filters.update(state.modes);
    lineSelect.update(state.line);
    colourToggle.update(state.colours);
    activity.update(state.time, state.modes);
    if (state.colours !== previous.colours || state.line !== previous.line) {
      const options = colourOptions(state);
      mounted = mounted.map((item) => recolour(item, routes, options));
      renderedKey = "";
    }
    if (!state.playing && state.time >= SERVICE_DAY_LENGTH_S) {
      status.show(fr.endOfDay);
    }
  }
  store.subscribe(reflect);
  reflect(store.get(), store.get());
  requestAnimationFrame(frame);

  // The vehicle list only refines layovers; it is read after the first frame, never before it.
  loadVehicles(source, day)
    .then((list) => {
      vehicles = list;
      renderedTime = Number.NaN;
      describeSelected(store.get());
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
    select(vehicle) {
      store.set({ vehicle });
    },
  };
}
