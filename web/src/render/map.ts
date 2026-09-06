/**
 * The MapLibre map and the deck.gl overlay on top of it.
 *
 * Overlaid mode: deck.gl draws on its own canvas above the basemap and follows its camera. The
 * basemap is optional by design: when its tiles cannot load, the network layer keeps the map
 * readable, so tile errors are reported once as a warning, never as a failure.
 */

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import { Map as MapLibreMap, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { BRUSSELS_VIEW } from "../theme/colors";
import { easeDurationMs } from "../theme/motion";
import { devicePixels } from "./quality";

export interface MapView {
  map: MapLibreMap;
  setLayers(layers: Layer[]): void;
  /** Called for a click that lands on no deck.gl object: the way to clear a selection. */
  onEmptyClick(handler: () => void): void;
  /** Called when the person starts dragging the map, which ends any camera follow. */
  onUserDrag(handler: () => void): void;
  /** Eases the camera onto a point, zooming in when the view is too wide to see one vehicle. */
  centerOn(position: [number, number]): void;
  /** Moves the camera onto a point at once, for one frame of a follow. */
  follow(position: [number, number]): void;
  destroy(): void;
}

/** Below this zoom a single vehicle is a speck; stepping to one zooms in this far. */
export const FOLLOW_MIN_ZOOM = 13.5;
/** Pixels around a head that still count as a click on it. */
export const PICKING_RADIUS_PX = 6;

export interface MapOptions {
  camera?: { latitude: number; longitude: number; zoom: number };
  /** When the visitor prefers reduced motion the camera jumps instead of gliding. */
  reducedMotion?: boolean;
  onBasemapUnavailable?: (message: string) => void;
}

export function createMapView(
  container: HTMLElement,
  style: StyleSpecification,
  options: MapOptions = {},
): MapView {
  setWorkerUrl(maplibreWorkerUrl);
  const camera = options.camera ?? BRUSSELS_VIEW;
  const map = new MapLibreMap({
    container,
    style,
    center: [camera.longitude, camera.latitude],
    zoom: camera.zoom,
    minZoom: 9,
    maxZoom: 17,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: false },
  });

  let reported = false;
  map.on("error", (event) => {
    // Missing tiles or glyphs: the basemap goes dark, the network layer stays. Report once.
    if (!reported) {
      reported = true;
      options.onBasemapUnavailable?.(event.error.message);
    }
  });

  const overlay = new MapboxOverlay({
    interleaved: false,
    layers: [],
    pickingRadius: PICKING_RADIUS_PX,
    useDevicePixels: devicePixels(window.devicePixelRatio),
  });
  map.addControl(overlay);

  return {
    map,
    setLayers(layers) {
      overlay.setProps({ layers });
    },
    onEmptyClick(handler) {
      overlay.setProps({
        onClick: (info) => {
          if (!info.picked) {
            handler();
          }
        },
      });
    },
    onUserDrag(handler) {
      map.on("dragstart", handler);
    },
    centerOn(position) {
      map.easeTo({
        center: position,
        zoom: Math.max(map.getZoom(), FOLLOW_MIN_ZOOM),
        duration: easeDurationMs(options.reducedMotion ?? false),
      });
    },
    follow(position) {
      // A jump would abort the ease that centerOn started, or a zoom under way: let those finish.
      if (!map.isMoving()) {
        map.jumpTo({ center: position });
      }
    },
    destroy() {
      overlay.finalize();
      map.remove();
    },
  };
}
