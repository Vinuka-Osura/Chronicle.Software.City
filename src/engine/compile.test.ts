import { describe, expect, it } from "vitest";
import { formatProblems, parseCareerGraph } from "@contract";
import { compileGraph } from "./compile";
import type { CompileOptions, CompiledGraph } from "./compile";
import { Day, Year, dateFromInstant } from "./time";

function graphOf(
  entities: readonly Record<string, unknown>[],
  generatedAt = "2026-01-01T00:00:00+00:00",
  options: CompileOptions = {},
): CompiledGraph {
  const result = parseCareerGraph({
    version: 1,
    generatedAt,
    subject: { name: "Under Test" },
    entities,
  });
  if (!result.ok) throw new Error(formatProblems(result.problems));

  return compileGraph(result.graph, options);
}

function building(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "b", kind: "building", label: "B", built: "2024-01-01", ...overrides };
}

describe("the span is the ends of the timeline", () => {
  it("starts at the earliest thing actually built", () => {
    const graph = graphOf([
      building({ id: "a", built: "2024-01-01" }),
      building({ id: "b", built: "2021-06-30" }),
    ]);

    expect(dateFromInstant(graph.span.from)).toBe("2021-06-30");
  });

  it("ends at the latest date anything reached", () => {
    const graph = graphOf([building({ built: "2021-01-01", upgraded: ["2023-05-05"] })]);

    expect(dateFromInstant(graph.span.to)).toBe("2026-01-01");
  });

  it("counts an upgrade date past the present", () => {
    const graph = graphOf([building({ built: "2021-01-01", upgraded: ["2027-05-05"] })]);

    expect(dateFromInstant(graph.span.to)).toBe("2027-05-05");
  });

  it("counts a retirement date", () => {
    const graph = graphOf([building({ built: "2021-01-01", retired: "2028-02-02" })]);

    expect(dateFromInstant(graph.span.to)).toBe("2028-02-02");
  });

  it("reaches at least the day the document was generated, even for a dormant career", () => {
    const graph = graphOf([building({ built: "2020-01-01" })]);

    expect(dateFromInstant(graph.span.to)).toBe("2026-01-01");
  });

  it("extends to a stated goal, because an intention is part of the arc", () => {
    const graph = graphOf([
      building({ id: "a", built: "2024-01-01" }),
      building({ id: "goal", built: "2031-09-09", speculative: true }),
    ]);

    expect(dateFromInstant(graph.span.to)).toBe("2031-09-09");
  });

  it("is never dragged backwards by a goal, even one dated in the past", () => {
    // A goal is not the beginning of a career. Opening the scrubber years before anything
    // happened would give an empty city for no reason.
    const graph = graphOf([
      building({ id: "a", built: "2024-01-01" }),
      building({ id: "old-goal", built: "2015-01-01", speculative: true }),
    ]);

    expect(dateFromInstant(graph.span.from)).toBe("2024-01-01");
  });

  it("gives a career with nothing in it a scrubber that can still be dragged", () => {
    const graph = graphOf([]);

    // Zero width would be a division by zero in every consumer that maps pixels to dates.
    expect(graph.span.to).toBeGreaterThan(graph.span.from);
  });

  it("gives a career with one single-day entity a draggable span too", () => {
    const graph = graphOf([building({ built: "2026-01-01" })], "2026-01-01T00:00:00+00:00");

    expect(graph.span.to).toBeGreaterThan(graph.span.from);
  });
});

describe("the construction window", () => {
  it("is a fraction of the whole career, not of what is on screen", () => {
    // A fraction of the visible span would mean the city changed appearance when the
    // timeline was zoomed, and zoom is not a time machine.
    const graph = graphOf([building({ built: "2006-01-01" })], "2026-01-01T00:00:00+00:00");

    expect(graph.constructionWindow).toBeCloseTo((graph.span.to - graph.span.from) * 0.02, -4);
  });

  it("never drops below a month, or it would be invisible across twenty years", () => {
    const graph = graphOf([building({ built: "2025-12-20" })], "2026-01-01T00:00:00+00:00");

    expect(graph.constructionWindow).toBe(30 * Day);
  });

  it("never exceeds a year, or a long career would be permanently under scaffolding", () => {
    const graph = graphOf([building({ built: "1900-01-01" })], "2026-01-01T00:00:00+00:00");

    expect(graph.constructionWindow).toBe(Year);
  });

  it("can be overridden, because a demo may want to exaggerate it", () => {
    const graph = graphOf([building()], "2026-01-01T00:00:00+00:00", {
      constructionWindow: 7 * Day,
    });

    expect(graph.constructionWindow).toBe(7 * Day);
  });

  it("weathers more slowly than it builds", () => {
    expect(graphOf([building()]).decayWindow).toBeGreaterThan(
      graphOf([building()]).constructionWindow,
    );
  });
});

describe("optional fields are resolved once, here, and never asked about again", () => {
  it("defaults an absent magnitude to mid-height rather than to nothing", () => {
    expect(graphOf([building()]).byId.get("b")?.magnitude).toBe(0.5);
  });

  it("keeps a magnitude the producer actually set to zero", () => {
    expect(graphOf([building({ magnitude: 0 })]).byId.get("b")?.magnitude).toBe(0);
  });

  it("clamps a magnitude outside the range the contract normalises to", () => {
    expect(graphOf([building({ magnitude: 7 })]).byId.get("b")?.magnitude).toBe(1);
  });

  it("de-duplicates repeated upgrade dates", () => {
    const graph = graphOf([building({ upgraded: ["2025-01-01", "2025-01-01"] })]);

    expect(graph.byId.get("b")?.upgraded).toHaveLength(1);
  });

  it("drops a link a reader could not follow", () => {
    expect(graphOf([building({ href: "/projects/x" })]).byId.get("b")?.href).toBeNull();
  });

  it("keeps a link a reader could follow", () => {
    const graph = graphOf([building({ href: "https://example.com/x" })]);

    expect(graph.byId.get("b")?.href).toBe("https://example.com/x");
  });
});

describe("entity indices", () => {
  it("are the entity's slot for the session, matching document order", () => {
    const graph = graphOf([
      building({ id: "first" }),
      building({ id: "second" }),
      building({ id: "third" }),
    ]);

    // Instance n in a mesh belongs to entity n. If these moved, scrubbing would reallocate
    // buffers rather than write matrices.
    expect(graph.byId.get("first")?.index).toBe(0);
    expect(graph.byId.get("second")?.index).toBe(1);
    expect(graph.byId.get("third")?.index).toBe(2);
  });

  it("cover every entity exactly once", () => {
    const graph = graphOf([building({ id: "a" }), building({ id: "b" }), building({ id: "c" })]);
    const indices = graph.entities.map((entity) => entity.index).sort((x, y) => x - y);

    expect(indices).toEqual([0, 1, 2]);
  });
});

describe("ids are opaque", () => {
  it("works on a producer that uses none of Chronicle's conventions", () => {
    // No "skill:" prefix, no "district:Backend" pattern, no GUIDs. The moment the engine
    // reads meaning out of an id it has a producer, and the product has one customer.
    const graph = graphOf([
      { id: "1", kind: "district", label: "Things", built: "2020-01-01" },
      { id: "2", kind: "building", label: "A thing", district: "1", built: "2020-01-01" },
      { id: "3", kind: "road", label: "Some work", built: "2021-01-01", connects: ["2"] },
    ]);

    expect(graph.byId.get("2")?.districtId).toBe("1");
    expect(graph.byId.get("3")?.connects).toEqual(["2"]);
  });
});
