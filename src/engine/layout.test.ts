import { describe, expect, it } from "vitest";
import { layout } from "./layout";
import type { Layout, Point } from "./layout";
import { FixtureNames, compiledFixture } from "../../tests/fixtures";

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function plotsOf(result: Layout): [string, Point][] {
  return [...result.plots].map(([id, plot]) => [id, { x: plot.x, z: plot.z }]);
}

describe("layout is deterministic", () => {
  it.each(FixtureNames)("%s.json lays out identically twice", (name) => {
    const graph = compiledFixture(name);

    // Same graph in, same city out. Anything else and a reload moves somebody's buildings.
    expect(plotsOf(layout(graph))).toEqual(plotsOf(layout(graph)));
  });

  it("is identical across two separate compilations of the same document", () => {
    expect(plotsOf(layout(compiledFixture("full")))).toEqual(
      plotsOf(layout(compiledFixture("full"))),
    );
  });

  it("does not let map iteration order leak into geometry", () => {
    // Ties are broken on id precisely so that two entities built on the same day cannot
    // swap plots between runs.
    const graph = compiledFixture("awkward");
    const first = layout(graph);
    const second = layout(graph);

    expect(first.plots.get("same-day-a")).toEqual(second.plots.get("same-day-a"));
    expect(first.plots.get("same-day-b")).toEqual(second.plots.get("same-day-b"));
  });
});

describe("layout does not depend on the date, which is what stops the city boiling", () => {
  it("takes no instant at all", () => {
    // Stated as a test because it is the property, not an implementation detail: a layout
    // computed from what exists *now* repacks a district every time a building appears.
    expect(layout.length).toBe(1);
  });

  it("places entities that have not been built yet", () => {
    const graph = compiledFixture("full");
    const result = layout(graph);

    // A goal targeted at 2029 already has ground reserved in 2019. Buildings rise out of
    // land that was always theirs rather than appearing wherever there happens to be room.
    expect(result.plots.has("roadmap:bbccddee-ff00-4a23-3445-566778899aab")).toBe(true);
  });
});

describe("everything gets somewhere to stand", () => {
  const graph = compiledFixture("full");
  const result = layout(graph);

  it("gives every building, landmark and goal a plot", () => {
    for (const entity of graph.entities) {
      if (entity.kind === "district" || entity.kind === "road") continue;
      expect(result.plots.has(entity.id), `${entity.id} has no plot`).toBe(true);
    }
  });

  it("gives every road a path of at least two points", () => {
    for (const entity of graph.entities) {
      if (entity.kind !== "road") continue;
      expect((result.roads.get(entity.id) ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every declared district an area", () => {
    for (const entity of graph.entities) {
      if (entity.kind !== "district") continue;
      expect(result.districts.has(entity.id)).toBe(true);
    }
  });
});

describe("the entities the contract lets stand alone", () => {
  const result = layout(compiledFixture("awkward"));

  it("places a building whose district does not exist", () => {
    expect(result.plots.has("orphan")).toBe(true);
  });

  it("places a road that connects nothing, because such projects are common", () => {
    const path = result.roads.get("road-connecting-nothing") ?? [];

    expect(path.length).toBeGreaterThanOrEqual(2);
  });

  it("places a road that connects exactly one thing", () => {
    const path = result.roads.get("road-connecting-one") ?? [];

    expect(path).toHaveLength(2);
    expect(path[0]).toEqual(result.plots.get("only-tenant"));
  });

  it("routes a road through the plots it connects", () => {
    const path = result.roads.get("road-connecting-a-ghost") ?? [];
    const anchor = result.plots.get("only-tenant");

    // The ghost was dropped at compile time, so this behaves as a one-connection road.
    expect(path[0]).toEqual(anchor);
  });
});

describe("districts", () => {
  const result = layout(compiledFixture("full"));

  it("do not overlap one another", () => {
    const areas = [...result.districts.values()];

    for (const [index, area] of areas.entries()) {
      for (const other of areas.slice(index + 1)) {
        expect(distance(area, other)).toBeGreaterThanOrEqual(area.radius + other.radius);
      }
    }
  });

  it("keep clear of the civic axis, so landmarks are not standing in a skills district", () => {
    for (const area of result.districts.values()) {
      expect(Math.abs(area.z)).toBeGreaterThan(area.radius);
    }
  });

  it("contain their own buildings", () => {
    const graph = compiledFixture("full");
    const city = layout(graph);

    for (const entity of graph.entities) {
      if (entity.kind !== "building" || entity.districtId === null || entity.speculative) continue;

      const area = city.districts.get(entity.districtId);
      const plot = city.plots.get(entity.id);
      if (area === undefined || plot === undefined) continue;

      expect(distance(plot, area)).toBeLessThanOrEqual(area.radius);
    }
  });
});

describe("speculative entities are physically outside the city", () => {
  const graph = compiledFixture("full");
  const result = layout(graph);

  it("stands every goal beyond everything built", () => {
    // Not a styling choice. At a glance, from any angle, planned must not read as built -
    // and distance says it before any material does.
    for (const entity of graph.entities) {
      if (!entity.speculative) continue;

      const plot = result.plots.get(entity.id);
      if (plot === undefined) throw new Error(`${entity.id} has no plot`);
      expect(Math.hypot(plot.x, plot.z)).toBeGreaterThan(result.builtRadius);
    }
  });

  it("does not let a goal drag the built city's radius outward", () => {
    expect(result.builtRadius).toBeGreaterThan(0);

    for (const entity of graph.entities) {
      if (entity.kind !== "building" || entity.speculative) continue;
      const plot = result.plots.get(entity.id);
      if (plot === undefined) continue;
      expect(Math.hypot(plot.x, plot.z)).toBeLessThanOrEqual(result.builtRadius);
    }
  });
});

describe("an empty career", () => {
  const result = layout(compiledFixture("empty"));

  it("is an empty plot of land rather than a crash", () => {
    expect(result.plots.size).toBe(0);
    expect(result.bounds).toEqual({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  });
});

describe("bounds", () => {
  it("contain every plot", () => {
    const result = layout(compiledFixture("full"));

    for (const plot of result.plots.values()) {
      expect(plot.x).toBeGreaterThanOrEqual(result.bounds.minX);
      expect(plot.x).toBeLessThanOrEqual(result.bounds.maxX);
      expect(plot.z).toBeGreaterThanOrEqual(result.bounds.minZ);
      expect(plot.z).toBeLessThanOrEqual(result.bounds.maxZ);
    }
  });
});
