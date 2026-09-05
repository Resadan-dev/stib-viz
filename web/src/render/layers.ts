/**
 * deck.gl layer descriptors (ARCHITECTURE.md, section 6.3).
 *
 * The trails are one `TripsLayer` per mode fed with binary attributes: positions, timestamps
 * and start indices are the decoded arrays themselves. `_pathType: "open"` tells the
 * `PathLayer` to skip normalisation and use them as they are (deck.gl 9.3, path-layer.js:
 * `normalize: !props._pathType`). Only `currentTime` changes per frame.
 */

import { TripsLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";

import type { Network, NetworkFeature } from "../data/contract";
import { networkColor } from "../theme/colors";
import type { HeadBuffers, MountedSlice } from "./heads";

/** Trail length in service-day seconds, always below the 300 s upstream overlap of the slices. */
export const TRAIL_LENGTH_S = 150;
export const TRAIL_WIDTH_PX = 2;
export const HEAD_RADIUS_PX = 3.5;

// Everything is drawn on top of the basemap in insertion order; depth testing would let the
// network hide trails that share its geometry.
const FLAT = { depthCompare: "always" } as const;

export interface BinaryAttribute<T> {
  value: T;
  size: number;
  /** Uint8 colours are read as 0..1 by the shaders; deck.gl wants this said explicitly. */
  normalized?: boolean;
}

export interface TripsData {
  length: number;
  startIndices: Uint32Array;
  attributes: {
    getPath: BinaryAttribute<Float32Array>;
    getTimestamps: BinaryAttribute<Float32Array>;
    getColor: BinaryAttribute<Uint8Array>;
  };
}

// One data descriptor per mounted slice: deck.gl compares `data` by reference, so a new object
// every frame would re-upload every vertex of the hour on every frame.
const TRIPS_DATA = new WeakMap<MountedSlice, TripsData>();

export function tripsData(mounted: MountedSlice): TripsData {
  const cached = TRIPS_DATA.get(mounted);
  if (cached !== undefined) {
    return cached;
  }
  const { slice } = mounted;
  const data: TripsData = {
    length: slice.paths,
    startIndices: slice.index,
    attributes: {
      getPath: { value: slice.positions, size: 2 },
      getTimestamps: { value: slice.times, size: 1 },
      getColor: { value: mounted.vertexColors, size: 4, normalized: true },
    },
  };
  TRIPS_DATA.set(mounted, data);
  return data;
}

export function tripsLayerProps(mounted: MountedSlice, currentTime: number) {
  return {
    id: `trips-${mounted.mode}`,
    data: tripsData(mounted),
    _pathType: "open" as const,
    positionFormat: "XY" as const,
    currentTime,
    trailLength: TRAIL_LENGTH_S,
    fadeTrail: true,
    widthUnits: "pixels" as const,
    getWidth: TRAIL_WIDTH_PX,
    widthMinPixels: 1,
    // Square joints and caps: invisible at two pixels, and a third fewer triangles per vertex,
    // which is what keeps the 17:03 peak at 60 frames per second on an integrated GPU.
    capRounded: false,
    jointRounded: false,
    parameters: FLAT,
  };
}

export type TripsProps = ReturnType<typeof tripsLayerProps>;

export function createTripsLayer(props: TripsProps): TripsLayer {
  return new TripsLayer(props);
}

export interface HeadsData {
  length: number;
  attributes: {
    getPosition: BinaryAttribute<Float32Array>;
    getFillColor: BinaryAttribute<Uint8Array>;
  };
}

export function headsLayerProps(buffers: HeadBuffers, count: number) {
  const data: HeadsData = {
    length: count,
    attributes: {
      getPosition: { value: buffers.positions, size: 2 },
      getFillColor: { value: buffers.colors, size: 4, normalized: true },
    },
  };
  return {
    id: "heads",
    data,
    radiusUnits: "pixels" as const,
    getRadius: HEAD_RADIUS_PX,
    radiusMinPixels: 2,
    stroked: false,
    antialiasing: true,
    parameters: FLAT,
  };
}

export function createHeadsLayer(buffers: HeadBuffers, count: number): ScatterplotLayer {
  return new ScatterplotLayer(headsLayerProps(buffers, count));
}

/** The dark network beneath the vehicles; created once per day, never per frame. */
export function createNetworkLayer(network: Network): GeoJsonLayer<NetworkFeature["properties"]> {
  return new GeoJsonLayer<NetworkFeature["properties"]>({
    id: "network",
    data: network,
    filled: false,
    stroked: true,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    getLineWidth: (feature) => (feature.properties.underground ? 2.5 : 1.5),
    getLineColor: (feature) => networkColor(feature.properties),
    lineCapRounded: true,
    lineJointRounded: true,
    parameters: FLAT,
  });
}
