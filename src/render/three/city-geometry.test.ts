import { describe, expect, it } from "vitest";
import type { CityBounds, CityItem, CityPlot } from "../frame";
import {
  boundsCircle,
  buildingBox,
  buildingHeight,
  cameraFrame,
  districtHue,
  landmarkHeight,
  maxPolarAngle,
} from "./city-geometry";

const plot: CityPlot = { x: 10, z: -4, footprint: 7 };

function item(overrides: Partial<CityItem> = {}): CityItem {
  return {
    id: "a",
    index: 0,
    kind: "building",
    label: "A",
    magnitude: 0.5,
    speculative: false,
    ...overrides,
  };
}

describe("a building stands on the ground", () => {
  it("is centred at half its height, so its base is at zero", () => {
    // A box is centred on its origin. Forget this and every building is buried to the
    // waist, which looks like a lighting bug and is not one.
    const box = buildingBox(item(), plot, 3);

    expect(box.y).toBeCloseTo(box.height / 2, 6);
  });

  it("stays on its plot", () => {
    const box = buildingBox(item(), plot, 3);

    expect(box.x).toBe(plot.x);
    expect(box.z).toBe(plot.z);
  });

  it("has no height at all before construction starts", () => {
    expect(buildingBox(item(), plot, 0).height).toBe(0);
  });

  it("grows out of the ground rather than appearing", () => {
    // `storeys` already ramps from zero, so partial construction is partial height.
    const quarter = buildingBox(item(), plot, 0.25).height;
    const whole = buildingBox(item(), plot, 1).height;

    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeCloseTo(whole / 4, 6);
  });

  it("never has negative height, whatever it is handed", () => {
    expect(buildingHeight(0.5, -3)).toBe(0);
  });
});

describe("height means something", () => {
  it("makes a deeper capability taller at the same number of storeys", () => {
    expect(buildingHeight(1, 2)).toBeGreaterThan(buildingHeight(0, 2));
  });

  it("makes a more-used capability taller at the same magnitude", () => {
    expect(buildingHeight(0.5, 4)).toBeGreaterThan(buildingHeight(0.5, 1));
  });

  it("compounds the two rather than letting one cancel the other", () => {
    // Seniority and repeated use should both read on the skyline. If they competed, an
    // expert who used something once would look the same as a beginner who used it often.
    expect(buildingHeight(1, 4)).toBeGreaterThan(buildingHeight(1, 1));
    expect(buildingHeight(1, 4)).toBeGreaterThan(buildingHeight(0.2, 4));
  });

  it("gives even a zero-magnitude capability something to see", () => {
    expect(buildingHeight(0, 1)).toBeGreaterThan(0);
  });
});

describe("the camera cannot get under the ground", () => {
  it("stops just short of the horizon while there is nothing down there", () => {
    // Not a right angle: exactly ninety degrees puts the camera in the ground plane and it
    // z-fights, which looks worse than the thing being prevented.
    expect(maxPolarAngle(false)).toBeLessThan(Math.PI / 2);
    expect(maxPolarAngle(false)).toBeGreaterThan(Math.PI / 2 - 0.1);
  });

  it("lets the camera go below once there is an underground layer to see", () => {
    // The constraint lifts because the data says it can, not because somebody remembered
    // to come back and find this line when the layer shipped.
    expect(maxPolarAngle(true)).toBeGreaterThan(Math.PI / 2);
  });
});

describe("the opening shot", () => {
  const bounds: CityBounds = { minX: -100, maxX: 100, minZ: -60, maxZ: 60 };

  it("looks at the middle of the city", () => {
    expect(cameraFrame(bounds).target).toEqual([0, 0, 0]);
  });

  it("is above the ground and off to one side, not directly overhead", () => {
    // A plan view hides the one thing three dimensions were chosen for.
    const { position } = cameraFrame(bounds);

    expect(position[1]).toBeGreaterThan(0);
    expect(Math.hypot(position[0], position[2])).toBeGreaterThan(position[1] * 0.5);
  });

  it("frames the whole city rather than starting inside it", () => {
    const { position, target } = cameraFrame(bounds);
    const distance = Math.hypot(position[0] - target[0], position[1], position[2] - target[2]);

    expect(distance).toBeGreaterThan(boundsCircle(bounds).radius);
  });

  it("cannot zoom out until the city is a dot, nor in through the floor", () => {
    const frame = cameraFrame(bounds);

    expect(frame.minDistance).toBeGreaterThan(0);
    expect(frame.maxDistance).toBeGreaterThan(frame.minDistance);
  });

  it("survives an empty career without dividing by zero", () => {
    const frame = cameraFrame({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });

    expect(Number.isFinite(frame.maxDistance)).toBe(true);
    expect(frame.maxDistance).toBeGreaterThan(frame.minDistance);
  });
});

describe("district colour", () => {
  it("gives every district a different hue", () => {
    const hues = [0, 1, 2, 3, 4, 5].map((position) => districtHue(position, 6));

    expect(new Set(hues).size).toBe(6);
  });

  it("stays inside the colour wheel", () => {
    for (let position = 0; position < 12; position += 1) {
      const hue = districtHue(position, 12);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(1);
    }
  });

  it("is the same colour every run, for the same district in the same city", () => {
    expect(districtHue(3, 6)).toBe(districtHue(3, 6));
  });

  it("does not divide by zero on a city with no districts", () => {
    expect(Number.isFinite(districtHue(0, 0))).toBe(true);
  });
});

describe("landmarks", () => {
  it("rise with construction like everything else", () => {
    expect(landmarkHeight(0.8, 0)).toBe(0);
    expect(landmarkHeight(0.8, 0.5)).toBeCloseTo(landmarkHeight(0.8, 1) / 2, 6);
  });
});
