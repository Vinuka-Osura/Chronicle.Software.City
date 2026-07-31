import { describe, expect, it } from "vitest";
// Bound as AjvModule rather than Ajv2020: the module also exports that name, and a local
// binding that shadows a named export is the ambiguity import-x warns about.
import AjvModule from "ajv/dist/2020";
import type { SchemaObject } from "ajv";
import addFormats from "ajv-formats";
import { parseCareerGraph } from "@contract/validate";
import { FixtureNames, loadFixture, loadSchema } from "./fixtures";

/**
 * The shipped validator is hand-written and has no runtime dependencies, because a
 * consumer should not pay 100KB of JSON Schema machinery to render a city, and because
 * the error messages are a product feature that a generic validator cannot give.
 *
 * The cost of that choice is drift: a hand-written mirror of a schema goes stale silently.
 * So the schema itself is compiled here - by a real validator, dev-only - and the two are
 * held against each other.
 *
 * Where they disagree, they disagree ON PURPOSE, and every such case is listed below with
 * its reason. A disagreement that is not in that list is a bug in one of them.
 */

// ajv ships CommonJS; which of the two shapes arrives depends on the interop path.
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// loadSchema returns unknown on purpose - it is a file read from disk. Compiling it is
// the point at which it is asserted to be a schema, and ajv throws here if it is not.
const schemaAccepts = ajv.compile(loadSchema() as SchemaObject);

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

describe("the fixtures are real career graphs", () => {
  it.each(FixtureNames)("%s.json satisfies the published schema", (name) => {
    const document = loadFixture(name);

    if (!schemaAccepts(document)) {
      throw new Error(
        `${name}.json does not satisfy contracts/career-graph.v1.schema.json:\n  ` +
          (schemaAccepts.errors ?? [])
            .map((error) => `${error.instancePath} ${error.message ?? ""}`)
            .join("\n  "),
      );
    }
  });

  it.each(FixtureNames)("%s.json is also accepted by the shipped validator", (name) => {
    expect(parseCareerGraph(loadFixture(name)).ok).toBe(true);
  });
});

describe("the two agree on documents that are simply right or simply wrong", () => {
  const agreed: readonly { readonly name: string; readonly document: unknown; readonly valid: boolean }[] = [
    { name: "a minimal entity", document: validDocument([validEntity()]), valid: true },
    { name: "no entities at all", document: validDocument(), valid: true },
    { name: "version 2", document: { ...validDocument(), version: 2 }, valid: false },
    { name: "no version", document: { generatedAt: "2026-07-31T06:00:00Z", subject: { name: "x" }, entities: [] }, valid: false },
    { name: "a subject with no name", document: { ...validDocument(), subject: {} }, valid: false },
    { name: "an entity with no built date", document: validDocument([{ id: "a", kind: "building", label: "A" }]), valid: false },
    { name: "an entity with an invented kind", document: validDocument([validEntity({ kind: "castle" })]), valid: false },
    { name: "a date that is not one", document: validDocument([validEntity({ built: "yesterday" })]), valid: false },
    { name: "the thirtieth of February", document: validDocument([validEntity({ built: "2024-02-30" })]), valid: false },
    { name: "a leap day", document: validDocument([validEntity({ built: "2024-02-29" })]), valid: true },
    { name: "an empty label", document: validDocument([validEntity({ label: "" })]), valid: false },
    { name: "entities that are not an array", document: { ...validDocument(), entities: {} }, valid: false },
  ];

  it.each(agreed)("$name", ({ document, valid }) => {
    expect(schemaAccepts(document)).toBe(valid);
    expect(parseCareerGraph(document).ok).toBe(valid);
  });
});

describe("where they differ, they differ deliberately", () => {
  const divergences: readonly {
    readonly name: string;
    readonly document: unknown;
    readonly schemaAccepts: boolean;
    readonly validatorAccepts: boolean;
    readonly because: string;
  }[] = [
    {
      name: "an unknown field on the document",
      document: { ...validDocument(), renderHint: "night" },
      schemaAccepts: false,
      validatorAccepts: true,
      because:
        "additionalProperties:false binds the producer, and its own contract test asserts it. A consumer enforcing it too is the reason nobody could ever add an optional field.",
    },
    {
      name: "an unknown field on an entity",
      document: validDocument([validEntity({ storeys: 4 })]),
      schemaAccepts: false,
      validatorAccepts: true,
      because: "Same reason. The field is ignored and reported as a warning.",
    },
    {
      name: "a magnitude outside 0 to 1",
      document: validDocument([validEntity({ magnitude: 4 })]),
      schemaAccepts: false,
      validatorAccepts: true,
      because:
        "Clamping is a truthful fallback: the building is drawn at full height rather than not drawn. Refusing the whole career over one number would not be.",
    },
    {
      name: "an href that is not absolute",
      document: validDocument([validEntity({ href: "/projects/relative" })]),
      schemaAccepts: false,
      validatorAccepts: true,
      because:
        "The link is dropped and the entity still renders. A career should not fail to draw because one link was written wrongly.",
    },
    {
      name: "two entities sharing an id",
      document: validDocument([validEntity(), validEntity()]),
      schemaAccepts: true,
      validatorAccepts: false,
      because:
        "Stricter than the schema, which cannot express uniqueness. Ids are how a renderer knows a building moved rather than that one vanished and another appeared, so duplicates have no honest fallback.",
    },
    {
      name: "a district reference naming nothing",
      document: validDocument([validEntity({ district: "district:ghost" })]),
      schemaAccepts: true,
      validatorAccepts: true,
      because:
        "Neither can express referential integrity, and standing the building alone loses a grouping without inventing anything. A warning, not a refusal.",
    },
  ];

  it.each(divergences)("$name: $because", (divergence) => {
    expect(schemaAccepts(divergence.document)).toBe(divergence.schemaAccepts);
    expect(parseCareerGraph(divergence.document).ok).toBe(divergence.validatorAccepts);
  });

  it("is the complete list, so a new disagreement has to be argued for", () => {
    // Not a count for its own sake. If this number moves, someone changed how liberal the
    // consumer is, and that is a product decision rather than a refactor.
    expect(divergences).toHaveLength(6);
  });
});
