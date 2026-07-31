import { describe, expect, it } from "vitest";
import { formatProblems, parseCareerGraph } from "@contract";
import { compileGraph } from "./compile";
import type { CompiledGraph } from "./compile";
import { Day } from "./time";
import type { Instant } from "./time";
import { Phase, createWorldState, stateById, worldAt } from "./world";
import type { EntityState } from "./world";
import { compiledFixture } from "../../tests/fixtures";

/** A round number, so a half-built building is exactly half built. */
const Window = 100 * Day;

const GeneratedAt = "2026-01-01T00:00:00+00:00";

function on(date: string): Instant {
  return Date.parse(`${date}T00:00:00Z`);
}

function graphOf(entities: readonly Record<string, unknown>[]): CompiledGraph {
  const result = parseCareerGraph({
    version: 1,
    generatedAt: GeneratedAt,
    subject: { name: "Under Test" },
    entities,
  });
  if (!result.ok) throw new Error(formatProblems(result.problems));

  return compileGraph(result.graph, { constructionWindow: Window, decayWindow: Window });
}

function building(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "b", kind: "building", label: "B", built: "2024-01-01", ...overrides };
}

function stateAt(graph: CompiledGraph, at: Instant, id = "b"): EntityState {
  const state = stateById(graph, worldAt(graph, at), id);
  if (state === undefined) throw new Error(`no entity ${id}`);
  return state;
}

describe("nothing appears before its built date", () => {
  const graph = graphOf([building()]);

  it("is absent the day before", () => {
    expect(stateAt(graph, on("2023-12-31")).phase).toBe(Phase.Absent);
  });

  it("is absent right up to the instant before", () => {
    expect(stateAt(graph, on("2024-01-01") - 1).phase).toBe(Phase.Absent);
  });

  it("draws nothing at all when absent, rather than a foundation", () => {
    const state = stateAt(graph, on("2020-01-01"));

    expect(state.construction).toBe(0);
    expect(state.storeys).toBe(0);
  });

  it("begins construction on the day itself", () => {
    const state = stateAt(graph, on("2024-01-01"));

    expect(state.phase).toBe(Phase.UnderConstruction);
    expect(state.construction).toBe(0);
  });
});

describe("construction takes time, and the time is continuous", () => {
  const graph = graphOf([building()]);

  it("is half built half way through the window", () => {
    expect(stateAt(graph, on("2024-01-01") + Window / 2).construction).toBeCloseTo(0.5, 5);
  });

  it("is finished at the end of the window", () => {
    const state = stateAt(graph, on("2024-01-01") + Window);

    expect(state.phase).toBe(Phase.Built);
    expect(state.construction).toBe(1);
  });

  it("never exceeds finished, however far past the window", () => {
    expect(stateAt(graph, on("2030-01-01")).construction).toBe(1);
  });

  it("moves smoothly rather than in steps, which is why this is not a state machine", () => {
    const start = on("2024-01-01");
    const readings = [0.1, 0.2, 0.3, 0.4].map(
      (fraction) => stateAt(graph, start + Window * fraction).construction,
    );

    for (const [index, reading] of readings.entries()) {
      if (index === 0) continue;
      const previous = readings[index - 1] ?? 0;
      expect(reading).toBeGreaterThan(previous);
    }
  });
});

describe("upgrades happen in place", () => {
  const graph = graphOf([building({ upgraded: ["2025-01-01", "2026-01-01"] })]);

  it("has one storey once built and before any upgrade", () => {
    expect(stateAt(graph, on("2024-12-31")).storeys).toBeCloseTo(1, 5);
  });

  it("starts growing on the day of an upgrade, not before", () => {
    expect(stateAt(graph, on("2024-12-31")).storeys).toBeCloseTo(1, 5);
    expect(stateAt(graph, on("2025-01-01") + Window / 2).storeys).toBeCloseTo(1.5, 5);
  });

  it("reaches a full extra storey a window after the upgrade", () => {
    expect(stateAt(graph, on("2025-01-01") + Window).storeys).toBeCloseTo(2, 5);
  });

  it("accumulates every upgrade, and never resets", () => {
    expect(stateAt(graph, on("2027-01-01")).storeys).toBeCloseTo(3, 5);
  });

  it("is never demolished and rebuilt, because that is not what learning feels like", () => {
    // Construction stays at 1 across the upgrade. A building that went back to 0 would be
    // a demolition, and the storeys would drop with it.
    expect(stateAt(graph, on("2025-01-01")).construction).toBe(1);
    expect(stateAt(graph, on("2025-01-01")).storeys).toBeGreaterThanOrEqual(1);
  });
});

describe("retired is not deleted", () => {
  const graph = graphOf([building({ retired: "2025-01-01" })]);

  it("is still standing after retirement", () => {
    const state = stateAt(graph, on("2025-06-01"));

    expect(state.phase).toBe(Phase.Retired);
    expect(state.construction).toBe(1);
    expect(state.storeys).toBeGreaterThan(0);
  });

  it("weathers rather than vanishing", () => {
    expect(stateAt(graph, on("2025-01-01")).decay).toBe(0);
    expect(stateAt(graph, on("2025-01-01") + Window / 2).decay).toBeCloseTo(0.5, 5);
    expect(stateAt(graph, on("2025-01-01") + Window).decay).toBe(1);
  });

  it("is fully weathered and still there, years later", () => {
    const state = stateAt(graph, on("2040-01-01"));

    expect(state.decay).toBe(1);
    expect(state.phase).toBe(Phase.Retired);
    expect(state.construction).toBe(1);
  });

  it("is not decaying before it retires", () => {
    expect(stateAt(graph, on("2024-12-31")).decay).toBe(0);
  });
});

describe("a goal is anchored to when it was stated, not to when it is aimed at", () => {
  const graph = graphOf([
    building({ id: "goal", built: "2028-01-01", speculative: true }),
    building({ id: "missed", built: "2025-03-01", speculative: true }),
  ]);

  it("is absent before the document was generated, because it had not been said yet", () => {
    // Putting a 2028 goal into a 2019 city would be inventing history.
    expect(stateAt(graph, on("2019-01-01"), "goal").phase).toBe(Phase.Absent);
  });

  it("appears the moment the document was generated, years before its target", () => {
    const state = stateAt(graph, on("2026-01-01"), "goal");

    expect(state.phase).toBe(Phase.Blueprint);
    expect(state.blueprint).toBe(1);
  });

  it("is still a blueprint at its target date", () => {
    expect(stateAt(graph, on("2028-01-01"), "goal").phase).toBe(Phase.Blueprint);
  });

  it("is still a blueprint long after its target date", () => {
    // The case software-city-start.md names: a goal whose target has passed and which
    // nobody marked done must still read as intention.
    expect(stateAt(graph, on("2035-01-01"), "goal").phase).toBe(Phase.Blueprint);
    expect(stateAt(graph, on("2035-01-01"), "goal").blueprint).toBe(1);
  });

  it("never converts into something built, at any date whatsoever", () => {
    for (const year of [2026, 2027, 2028, 2029, 2035, 2050]) {
      expect(stateAt(graph, on(`${String(year)}-06-01`), "goal").phase).toBe(Phase.Blueprint);
    }
  });

  it("reports how overdue it is, so a renderer can say so without lying about it", () => {
    expect(stateAt(graph, on("2026-01-01"), "missed").overdue).toBe(1);
    expect(stateAt(graph, on("2026-01-01"), "goal").overdue).toBe(0);
  });

  it("shows a goal whose moment already passed, because it was stated and still stands", () => {
    expect(stateAt(graph, on("2026-01-01"), "missed").phase).toBe(Phase.Blueprint);
  });
});

describe("the same instant always gives the same answer", () => {
  const graph = compiledFixture("full");

  it("is identical when called twice", () => {
    const at = on("2025-06-15");
    const first = worldAt(graph, at);
    const second = worldAt(graph, at);

    expect([...second.construction]).toEqual([...first.construction]);
    expect([...second.storeys]).toEqual([...first.storeys]);
    expect([...second.phase]).toEqual([...first.phase]);
  });

  it("is identical whether the timeline was scrubbed forwards or backwards to get there", () => {
    // The property most timeline animations quietly lack: they advance state rather than
    // evaluate it, so arriving from the future gives a different city.
    const target = on("2025-06-15");

    for (const at of [on("2019-01-01"), on("2022-01-01"), target]) worldAt(graph, at);
    const forwards = [...worldAt(graph, target).storeys];

    for (const at of [on("2040-01-01"), on("2030-01-01"), target]) worldAt(graph, at);
    const backwards = [...worldAt(graph, target).storeys];

    expect(backwards).toEqual(forwards);
  });

  it("accumulates nothing between calls", () => {
    const early = [...worldAt(graph, on("2023-01-01")).storeys];
    worldAt(graph, on("2040-01-01"));
    const earlyAgain = [...worldAt(graph, on("2023-01-01")).storeys];

    expect(earlyAgain).toEqual(early);
  });
});

describe("writing into an existing buffer", () => {
  const graph = compiledFixture("full");

  it("reuses the buffer rather than allocating, which is the point of it", () => {
    const buffer = createWorldState(graph.entities.length);
    const returned = worldAt(graph, on("2025-01-01"), buffer);

    expect(returned).toBe(buffer);
    expect(returned.construction).toBe(buffer.construction);
  });

  it("gives the same answer as allocating a fresh one", () => {
    const at = on("2025-01-01");
    const buffer = createWorldState(graph.entities.length);

    expect([...worldAt(graph, at, buffer).storeys]).toEqual([...worldAt(graph, at).storeys]);
  });

  it("leaves nothing behind from the previous instant", () => {
    const buffer = createWorldState(graph.entities.length);
    worldAt(graph, on("2040-01-01"), buffer);
    worldAt(graph, on("2019-01-01"), buffer);

    // Everything is absent in 2019, so any non-zero value is a leftover.
    expect([...buffer.storeys].every((value) => value === 0)).toBe(true);
  });

  it("allocates a new buffer when the one it is handed is the wrong size", () => {
    const wrongSize = createWorldState(3);

    expect(worldAt(graph, on("2025-01-01"), wrongSize)).not.toBe(wrongSize);
  });
});

describe("a career with nothing in it", () => {
  it("produces a valid, empty world rather than throwing", () => {
    const graph = compiledFixture("empty");
    const world = worldAt(graph, on("2026-01-01"));

    expect(world.count).toBe(0);
    expect(graph.entities).toHaveLength(0);
  });
});

describe("every construct the schema allows, from awkward.json", () => {
  const graph = compiledFixture("awkward");

  it("renders a building whose magnitude was never given", () => {
    const entity = graph.byId.get("no-magnitude");

    // Absent is not zero. A building at zero height is one nobody can see, and nothing may
    // silently disappear.
    expect(entity?.magnitude).toBe(0.5);
  });

  it("keeps a magnitude of exactly zero, which the producer meant", () => {
    expect(graph.byId.get("zero-magnitude")?.magnitude).toBe(0);
  });

  it("sorts upgrade dates the producer left out of order", () => {
    const upgrades = graph.byId.get("unsorted-upgrades")?.upgraded ?? [];

    expect([...upgrades]).toEqual([...upgrades].sort((a, b) => a - b));
    expect(upgrades).toHaveLength(3);
  });

  it("drops an upgrade dated before the building existed", () => {
    // Applied here, having been reported by the validator. A storey arriving before the
    // building would be a lie told quietly.
    expect(graph.byId.get("upgrade-before-built")?.upgraded).toHaveLength(0);
  });

  it("ignores a retirement dated before construction", () => {
    expect(graph.byId.get("retired-before-built")?.retired).toBeNull();
  });

  it("stands a building alone when it names a district that is not there", () => {
    expect(graph.byId.get("orphan")?.districtId).toBeNull();
  });

  it("drops a connection to an entity that is not there", () => {
    expect(graph.byId.get("road-connecting-a-ghost")?.connects).toEqual(["only-tenant"]);
  });

  it("gives an entity with only its four required fields somewhere to stand", () => {
    const minimal = graph.byId.get("minimal");

    expect(minimal?.upgraded).toEqual([]);
    expect(minimal?.connects).toEqual([]);
    expect(minimal?.speculative).toBe(false);
    expect(minimal?.retired).toBeNull();
  });
});
