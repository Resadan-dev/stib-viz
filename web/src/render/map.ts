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

export interface MapView {
  map: MapLibreMap;
  setLayers(layers: Layer[]): void;
  destroy(): void;
}

export interface MapOptions {
  camera?: { latitude: number; longitude: number; zoom: number };
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

  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);

  return {
    map,
    setLayers(layers) {
      overlay.setProps({ layers });
    },
    destroy() {
      overlay.finalize();
      map.remove();
    },
  };
}
