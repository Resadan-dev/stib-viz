import { describe, expect, it } from "vitest";

import { decodeSlice } from "../../src/data/stv1";
import { createHeadBuffers, mountSlice } from "../../src/render/heads";
import {
  TRAIL_LENGTH_S,
  createHeadsLayer,
  createNetworkLayer,
  createTripsLayer,
  headsLayerProps,
  tripsLayerProps,
} from "../../src/render/layers";
import { networkColor } from "../../src/theme/colors";
import { MANIFEST, NETWORK } from "../helpers/fixtures";
import { encodeSlice } from "../helpers/stv1";

const slice = decodeSlice(
  encodeSlice(8, [
    {
      lon: [4.35, 4.36, 4.37],
      lat: [50.85, 50.851, 50.852],
      t: [100, 160, 220],
      vehicle: 0,
      trip: 0,
      route: 1,
    },
    { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [3000, 3090], vehicle: 1, trip: 0, route: 0 },
  ]),
);
const mounted = mountSlice("tram", slice, MANIFEST.routes);

describe("tripsLayerProps", () => {
  const props = tripsLayerProps(mounted, 1234);

  it("hands the decoded arrays to deck.gl as they are", () => {
    expect(props.id).toBe("trips-tram");
    expect(props.data.length).toBe(2);
    expect(props.data.startIndices).toBe(slice.index);
    expect(props.data.attributes.getPath).toEqual({ value: slice.positions, size: 2 });
    expect(props.data.attributes.getPath.value).toBe(slice.positions);
    expect(props.data.attributes.getTimestamps.value).toBe(slice.times);
    expect(props.data.attributes.getColor.value).toBe(mounted.vertexColors);
    expect(props.data.attributes.getColor.size).toBe(4);
  });

  it("skips normalisation and keeps the trail below the upstream overlap", () => {
    expect(props._pathType).toBe("open");
    expect(props.currentTime).toBe(1234);
    expect(props.fadeTrail).toBe(true);
    expect(TRAIL_LENGTH_S).toBeLessThan(300);
    expect(props.trailLength).toBe(TRAIL_LENGTH_S);
  });

  it("reuses the same data object from one frame to the next", () => {
    expect(tripsLayerProps(mounted, 1).data).toBe(tripsLayerProps(mounted, 2).data);
    expect(tripsLayerProps(mounted, 1).currentTime).toBe(1);
  });

  it("builds a deck.gl layer that keeps the same references", () => {
    const layer = createTripsLayer(props);
    expect(layer.id).toBe("trips-tram");
    expect(layer.props._pathType).toBe("open");
    expect(layer.props.data).toBe(props.data);
  });
});

describe("headsLayerProps", () => {
  it("exposes the head buffers without copying", () => {
    const buffers = createHeadBuffers(4);
    const props = headsLayerProps(buffers, 3);
    expect(props.data.length).toBe(3);
    expect(props.data.attributes.getPosition.value).toBe(buffers.positions);
    expect(props.data.attributes.getFillColor.value).toBe(buffers.colors);
    const layer = createHeadsLayer(buffers, 3);
    expect(layer.id).toBe("heads");
  });
});

describe("createNetworkLayer", () => {
  it("draws the network in the intensity colours, dimmer underground", () => {
    const layer = createNetworkLayer(NETWORK);
    expect(layer.id).toBe("network");
    expect(layer.props.data).toBe(NETWORK);
    const getLineColor = layer.props.getLineColor;
    if (typeof getLineColor !== "function") {
      throw new Error("getLineColor should be an accessor function");
    }
    const [tram, metro] = NETWORK.features;
    if (tram === undefined || metro === undefined) {
      throw new Error("fixture features missing");
    }
    const context = { index: 0, data: NETWORK.features, target: [] };
    expect(getLineColor(tram, context)).toEqual(networkColor(tram.properties));
    expect(getLineColor(metro, context)).toEqual(networkColor(metro.properties));
  });
});
