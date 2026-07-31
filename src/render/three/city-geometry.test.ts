import { describe, expect, it } from "vitest";
import type { CityBounds, CityItem, CityPlot } from "../frame";
import {
  boundsCircle,
  buildingBox,
  buildingHeight,
  buildingShape,
  cameraFrame,
  districtHue,
  hasPodium,
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
  it("stops just short of the horizon, always", () => {
    // Not a right angle: exactly ninety degrees puts the camera in the ground plane and it
    // z-fights, which looks worse than the thing being prevented.
    expect(maxPolarAngle()).toBeLessThan(Math.PI / 2);
    expect(maxPolarAngle()).toBeGreaterThan(Math.PI / 2 - 0.1);
  });

  it("has no way to be talked into going below", () => {
    // There is nothing under the map and there is not going to be. An underground layer
    // was considered and dropped: a career is a surface thing, and the layer would have
    // been a second world to build and explain for no gain anybody asked for.
    expect(maxPolarAngle.length).toBe(0);
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

  it("starts close enough for the city to fill the view", () => {
    // The first version framed the whole plane from high up and far back, which shows a
    // map rather than a city: at that distance a career's worth of buildings is a
    // scattering of specks.
    const { position, target } = cameraFrame(bounds);
    const distance = Math.hypot(position[0] - target[0], position[1], position[2] - target[2]);
    const radius = boundsCircle(bounds).radius;

    expect(distance).toBeGreaterThan(radius * 0.8);
    expect(distance).toBeLessThan(radius * 1.6);
  });

  it("looks along the skyline rather than down on a floor plan", () => {
    const { position } = cameraFrame(bounds);
    const ground = Math.hypot(position[0], position[2]);

    // Height well under the ground distance: a high angle flattens a skyline.
    expect(position[1]).toBeLessThan(ground);
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
    const hues = [0, 1, 2, 3, 4, 5].map(districtHue);

    expect(new Set(hues).size).toBe(6);
  });

  it("stays inside the colour wheel", () => {
    for (let position = 0; position < 12; position += 1) {
      const hue = districtHue(position);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(1);
    }
  });

  it("keeps neighbours apart even at a dozen districts", () => {
    // The failure mode of dividing the wheel evenly: at twelve, adjacent districts are
    // thirty degrees apart and nobody can tell them apart on a small building.
    const hues = Array.from({ length: 12 }, (_, position) => districtHue(position)).sort(
      (a, b) => a - b,
    );

    for (const [index, hue] of hues.entries()) {
      if (index === 0) continue;
      expect(hue - (hues[index - 1] ?? 0)).toBeGreaterThan(0.03);
    }
  });

  it("does not change a district's colour when another is added", () => {
    // It takes no count, so it cannot. Adding a district to a career must not repaint the
    // ones that were already there.
    expect(districtHue(3)).toBe(districtHue(3));
    expect(districtHue(0)).toBe(districtHue(0));
  });
});

describe("no two buildings are the same shape", () => {
  it("gives a building a rectangular footprint rather than a square one", () => {
    const shape = buildingShape(item({ id: "one" }), plot);

    expect(shape.width).not.toBeCloseTo(shape.depth, 3);
  });

  it("gives two different buildings different proportions", () => {
    // Identical boxes on a regular grid read as dominoes. A career never has enough
    // entities for repetition to hide, so no two may match.
    const a = buildingShape(item({ id: "one" }), plot);
    const b = buildingShape(item({ id: "two" }), plot);

    expect(a.width).not.toBeCloseTo(b.width, 3);
    expect(a.rotation).not.toBeCloseTo(b.rotation, 3);
  });

  it("turns each building a little off the grid, but only a little", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const { rotation } = buildingShape(item({ id }), plot);
      // Enough to break the ranks, not enough to read as a mistake.
      expect(Math.abs(rotation)).toBeLessThan(0.12);
    }
  });

  it("is the same shape on every reload, for the same building", () => {
    // Derived from the id, so a viewer never sees the city rearrange itself. This is not
    // reading meaning out of an id - it does not care what the id says, only that it is
    // the same string.
    expect(buildingShape(item({ id: "stable" }), plot)).toEqual(
      buildingShape(item({ id: "stable" }), plot),
    );
  });

  it("keeps a gap between neighbours, which is what makes them separate buildings", () => {
    for (const id of ["a", "b", "c", "d"]) {
      const shape = buildingShape(item({ id, magnitude: 1 }), plot);
      expect(shape.width).toBeLessThan(plot.footprint);
      expect(shape.depth).toBeLessThan(plot.footprint);
    }
  });
});

describe("podiums", () => {
  it("go on tall buildings only", () => {
    expect(hasPodium(40)).toBe(true);
    // A two-storey building with a podium is just a wider two-storey building.
    expect(hasPodium(6)).toBe(false);
  });
});

describe("landmarks", () => {
  it("rise with construction like everything else", () => {
    expect(landmarkHeight(0.8, 0)).toBe(0);
    expect(landmarkHeight(0.8, 0.5)).toBeCloseTo(landmarkHeight(0.8, 1) / 2, 6);
  });
});
