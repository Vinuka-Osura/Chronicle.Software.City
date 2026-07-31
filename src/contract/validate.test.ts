import { describe, expect, it } from "vitest";
import { formatProblems, parseCareerGraph, SupportedVersion } from "./validate";
import type { ParseResult } from "./validate";
import { loadFixture } from "../../tests/fixtures";

/** Narrows, and fails with the actual problems rather than "expected true, got false". */
function expectAccepted(result: ParseResult): Extract<ParseResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`expected the document to be accepted, but:\n${formatProblems(result.problems)}`);
  }
  return result;
}

function problemsFor(document: unknown): readonly string[] {
  const result = parseCareerGraph(document);
  if (result.ok) throw new Error("expected the document to be refused, and it was accepted");
  return result.problems.map(({ path, message }) => `${path} ${message}`.trim());
}

function warningsFor(document: unknown): readonly string[] {
  return expectAccepted(parseCareerGraph(document)).warnings.map(
    ({ path, message }) => `${path} ${message}`.trim(),
  );
}

/** A document with nothing wrong with it, to mutate one field at a time. */
function validDocument(entities: readonly unknown[] = []): Record<string, unknown> {
  return {
    version: 1,
    generatedAt: "2026-07-31T06:00:00+00:00",
    subject: { name: "Somebody" },
    entities,
  };
}

function validEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "a", kind: "building", label: "A", built: "2024-01-01", ...overrides };
}

describe("every fixture is accepted", () => {
  it.each(["empty", "small", "full", "awkward"] as const)("%s.json", (name) => {
    expectAccepted(parseCareerGraph(loadFixture(name)));
  });

  it("accepts a career with no entities at all, rather than treating it as broken", () => {
    const { graph } = expectAccepted(parseCareerGraph(loadFixture("empty")));
    expect(graph.entities).toHaveLength(0);
  });
});

describe("an unrecognised version is refused, loudly", () => {
  it("names both versions, because the reader needs to know which way the gap runs", () => {
    const result = parseCareerGraph({ ...validDocument(), version: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported-version");
    expect(formatProblems(result.problems)).toContain("understands career-graph version 1");
    expect(formatProblems(result.problems)).toContain("this document is version 2");
  });

  it("exposes what it found, so a caller can report it without parsing the message", () => {
    const result = parseCareerGraph({ ...validDocument(), version: "1" });

    if (result.ok || result.reason !== "unsupported-version") {
      throw new Error("expected an unsupported-version refusal");
    }
    // A string "1" is not version 1. Coercing it would be exactly the guess the contract
    // says not to make.
    expect(result.found).toBe("1");
  });

  it("refuses a document with no version at all", () => {
    const noVersion = {
      generatedAt: "2026-07-31T06:00:00+00:00",
      subject: { name: "Somebody" },
      entities: [],
    };
    const result = parseCareerGraph(noVersion);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported-version");
  });

  it("checks the version before anything else, so one cause does not report as forty", () => {
    // Everything about this document is wrong, but the version is the only thing worth
    // saying: the rest is what reading a v2 document with v1 eyes looks like.
    const problems = problemsFor({ version: 99, subject: 5, entities: "no" });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("version");
  });
});

describe("the failure names the thing that is wrong", () => {
  it("gives the entity index and the field", () => {
    const problems = problemsFor(
      validDocument([validEntity(), validEntity({ id: "b" }), { id: "c", kind: "road", label: "C" }]),
    );

    // The whole point of validating at the boundary: this, rather than a crash inside a
    // shader three layers down.
    expect(problems).toContain("entities[2].built is required and must be a date, as YYYY-MM-DD");
  });

  it("reports every problem, not just the first", () => {
    const problems = problemsFor(
      validDocument([{ id: "", kind: "castle", label: "", built: "yesterday" }]),
    );

    expect(problems).toHaveLength(4);
  });

  it("refuses a date that looks like one but is not", () => {
    expect(problemsFor(validDocument([validEntity({ built: "2024-02-30" })]))).toContain(
      'entities[0].built is not a real date: "2024-02-30"',
    );
  });

  it("accepts a leap day, which is the reason the check cannot be a regular expression", () => {
    expectAccepted(parseCareerGraph(validDocument([validEntity({ built: "2024-02-29" })])));
  });

  it("refuses duplicate ids, which JSON Schema cannot express", () => {
    const problems = problemsFor(validDocument([validEntity(), validEntity()]));

    // Ids are how a renderer knows a building moved rather than that one vanished and
    // another appeared.
    expect(problems).toContain('entities[1].id is a duplicate of an earlier entity: "a"');
  });

  it("refuses something that is not an object at all", () => {
    expect(problemsFor(null)).toContain("expected an object, found null");
    expect(problemsFor([])).toContain("expected an object, found object");
  });

  it("stops listing problems long before the list stops being useful", () => {
    const broken = Array.from({ length: 200 }, (_, index) => ({ id: `e${String(index)}` }));
    const problems = problemsFor(validDocument(broken));

    expect(problems.length).toBeLessThanOrEqual(51);
    expect(problems.at(-1)).toContain("stopped after 50 problems");
  });
});

describe("survivable defects are warnings, and the document still renders", () => {
  it("ignores unknown fields rather than rejecting them", () => {
    // The schema says additionalProperties:false, and that binds the PRODUCER. A consumer
    // that enforces it too is the reason nobody can ever add an optional field.
    const warnings = warningsFor({
      ...validDocument([validEntity({ storeys: 4 })]),
      renderHint: "night",
    });

    expect(warnings).toContain("renderHint is not part of career-graph v1 and is ignored");
    expect(warnings).toContain("entities[0].storeys is not part of career-graph v1 and is ignored");
  });

  it("warns about a district that is not in the document, and stands the building alone", () => {
    const warnings = warningsFor(validDocument([validEntity({ district: "district:ghost" })]));

    expect(warnings.join("\n")).toContain("the entity will stand alone");
  });

  it("warns about a connection to an entity that is not in the document", () => {
    const warnings = warningsFor(
      validDocument([validEntity({ kind: "road", connects: ["nowhere"] })]),
    );

    expect(warnings.join("\n")).toContain("the connection is dropped");
  });

  it("warns about a link a reader could not follow", () => {
    const warnings = warningsFor(validDocument([validEntity({ href: "/projects/relative" })]));

    // The producer's own contract test caught this exact defect once. A renderer on a
    // different origin cannot resolve a relative path.
    expect(warnings.join("\n")).toContain("not an absolute http(s) URL");
  });

  it("warns about a magnitude outside the range the contract normalises to", () => {
    expect(warningsFor(validDocument([validEntity({ magnitude: 4 })])).join("\n")).toContain(
      "is outside 0 to 1 (4) and will be clamped",
    );
  });

  it("warns about an upgrade dated before construction", () => {
    const warnings = warningsFor(
      validDocument([validEntity({ built: "2024-01-01", upgraded: ["2023-01-01"] })]),
    );

    // A building that gains a storey before it exists. Nothing in JSON Schema can say so,
    // and the resulting city looks fine.
    expect(warnings.join("\n")).toContain("dated before the entity was built");
  });

  it("warns about a retirement dated before construction", () => {
    const warnings = warningsFor(
      validDocument([validEntity({ built: "2024-01-01", retired: "2023-01-01" })]),
    );

    expect(warnings.join("\n")).toContain("treated as never retired");
  });

  it("says nothing about a document with nothing wrong with it", () => {
    expect(warningsFor(loadFixture("full"))).toHaveLength(0);
  });

  it("accepts producer extras inside meta without comment, which is what meta is for", () => {
    const warnings = warningsFor(
      validDocument([validEntity({ meta: { yearsExperience: 4, nested: { anything: true } } })]),
    );

    expect(warnings).toHaveLength(0);
  });
});

describe("the supported version", () => {
  it("is one", () => {
    expect(SupportedVersion).toBe(1);
  });
});
