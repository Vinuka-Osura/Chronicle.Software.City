import type { CareerGraphV1 } from "./types";

/**
 * The only contract version this renderer understands.
 *
 * A renderer that guesses at a version it does not know is worse than one that says it
 * cannot read the document: the guess produces a city that looks finished and is wrong,
 * and nobody can tell by looking.
 */
export const SupportedVersion = 1;

/** Where the problem is, and what is wrong with it. */
export interface GraphProblem {
  /** A path into the document, such as `entities[4].built`. Empty for the document itself. */
  readonly path: string;
  readonly message: string;
}

export type ParseResult =
  | {
      readonly ok: true;
      readonly graph: CareerGraphV1;
      /** Survivable defects. The document renders; these say what was ignored. */
      readonly warnings: readonly GraphProblem[];
    }
  | {
      readonly ok: false;
      readonly reason: "unsupported-version";
      readonly found: unknown;
      readonly problems: readonly GraphProblem[];
    }
  | {
      readonly ok: false;
      readonly reason: "malformed";
      readonly problems: readonly GraphProblem[];
    };

/**
 * Past this many, the list stops being a diagnosis and becomes a wall. A document with
 * fifty problems has one cause.
 */
const ProblemLimit = 50;

const EntityKinds = ["building", "road", "district", "landmark"] as const;

const DocumentKeys = new Set(["version", "generatedAt", "subject", "entities"]);
const SubjectKeys = new Set(["name", "headline", "url"]);
const EntityKeys = new Set([
  "id",
  "kind",
  "label",
  "district",
  "built",
  "upgraded",
  "retired",
  "magnitude",
  "connects",
  "speculative",
  "href",
  "meta",
]);

function createLog(): {
  add: (path: string, message: string) => void;
  isEmpty: () => boolean;
  list: () => readonly GraphProblem[];
} {
  const items: GraphProblem[] = [];
  let truncated = false;

  return {
    add(path, message) {
      if (items.length >= ProblemLimit) {
        truncated = true;
        return;
      }
      items.push({ path, message });
    },
    isEmpty: () => items.length === 0,
    list: () =>
      truncated
        ? [...items, { path: "", message: `stopped after ${String(ProblemLimit)} problems` }]
        : items,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `2024-02-30` parses in some engines and rolls over to March. Formatting the parsed date
 * back and comparing is the only check that does not depend on which engine is running.
 */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate a document that arrived from somewhere untrustworthy, which is every document.
 *
 * **Fatal versus survivable.** A missing `built` date is fatal, because there is no honest
 * way to invent one and dropping the entity silently would render a career with a hole in
 * it that nobody can see. A dangling district reference is not fatal, because standing the
 * building on its own is a truthful fallback that loses only a grouping. The rule is
 * whether the renderer can degrade without misrepresenting anyone.
 *
 * **Unknown fields are ignored, not rejected**, even though the schema says
 * `additionalProperties: false`. That constraint binds the producer - it is what the
 * producer's own contract test asserts. A consumer that enforces it too is the reason
 * nobody can ever add an optional field, so unknown keys are reported as warnings and
 * skipped.
 */
export function parseCareerGraph(input: unknown): ParseResult {
  const problems = createLog();

  if (!isRecord(input)) {
    problems.add("", `expected an object, found ${input === null ? "null" : typeof input}`);
    return { ok: false, reason: "malformed", problems: problems.list() };
  }

  // The version is checked before anything else and returns immediately. Reading a v2
  // document with v1 expectations produces a page of shape errors whose real cause is one
  // line, and the reader chases the symptoms.
  if (input.version !== SupportedVersion) {
    const found: unknown = input.version;

    // Spelled out rather than `JSON.stringify(found) ?? "absent"`, because the lib types
    // say stringify returns string and at runtime it returns undefined for undefined.
    // The `??` looked redundant to the type checker and was load-bearing.
    const described = found === undefined ? "absent" : JSON.stringify(found);

    return {
      ok: false,
      reason: "unsupported-version",
      found,
      problems: [
        {
          path: "version",
          message:
            `this renderer understands career-graph version ${String(SupportedVersion)}, ` +
            `and this document is version ${described}`,
        },
      ],
    };
  }

  validateDocument(input, problems);

  if (!problems.isEmpty()) {
    return { ok: false, reason: "malformed", problems: problems.list() };
  }

  const warnings = createLog();
  collectWarnings(input, warnings);

  return { ok: true, graph: input as unknown as CareerGraphV1, warnings: warnings.list() };
}

function validateDocument(
  document: Record<string, unknown>,
  problems: ReturnType<typeof createLog>,
): void {
  const generatedAt = document.generatedAt;
  if (typeof generatedAt !== "string") {
    problems.add("generatedAt", "is required and must be an ISO 8601 timestamp");
  } else if (!isTimestamp(generatedAt)) {
    problems.add("generatedAt", `is not an ISO 8601 timestamp: ${JSON.stringify(generatedAt)}`);
  }

  const subject = document.subject;
  if (!isRecord(subject)) {
    problems.add("subject", "is required and must be an object with a name");
  } else {
    const name = subject.name;
    if (typeof name !== "string" || name.length === 0) {
      problems.add("subject.name", "is required and must be a non-empty string");
    }
    for (const key of ["headline", "url"] as const) {
      const value = subject[key];
      if (value !== undefined && value !== null && typeof value !== "string") {
        problems.add(`subject.${key}`, "must be a string or null");
      }
    }
  }

  const entities = document.entities;
  if (!Array.isArray(entities)) {
    problems.add("entities", "is required and must be an array");
    return;
  }

  const seenIds = new Set<string>();
  for (const [index, entity] of entities.entries()) {
    validateEntity(entity, `entities[${String(index)}]`, seenIds, problems);
  }
}

function validateEntity(
  entity: unknown,
  path: string,
  seenIds: Set<string>,
  problems: ReturnType<typeof createLog>,
): void {
  if (!isRecord(entity)) {
    problems.add(path, "must be an object");
    return;
  }

  const id = entity.id;
  if (typeof id !== "string" || id.length === 0) {
    problems.add(`${path}.id`, "is required and must be a non-empty string");
  } else if (seenIds.has(id)) {
    // Ids are how a renderer knows a building moved rather than that one vanished and
    // another appeared. Duplicates make that impossible, and JSON Schema cannot say so.
    problems.add(`${path}.id`, `is a duplicate of an earlier entity: ${JSON.stringify(id)}`);
  } else {
    seenIds.add(id);
  }

  const kind = entity.kind;
  if (typeof kind !== "string" || !(EntityKinds as readonly string[]).includes(kind)) {
    problems.add(`${path}.kind`, `must be one of ${EntityKinds.join(", ")}`);
  }

  const label = entity.label;
  if (typeof label !== "string" || label.length === 0) {
    problems.add(`${path}.label`, "is required and must be a non-empty string");
  }

  const built = entity.built;
  if (typeof built !== "string") {
    problems.add(`${path}.built`, "is required and must be a date, as YYYY-MM-DD");
  } else if (!isCalendarDate(built)) {
    problems.add(`${path}.built`, `is not a real date: ${JSON.stringify(built)}`);
  }

  const upgraded = entity.upgraded;
  if (upgraded !== undefined) {
    if (!Array.isArray(upgraded)) {
      problems.add(`${path}.upgraded`, "must be an array of dates");
    } else {
      for (const [index, date] of upgraded.entries()) {
        if (typeof date !== "string" || !isCalendarDate(date)) {
          problems.add(`${path}.upgraded[${String(index)}]`, "is not a real date, as YYYY-MM-DD");
        }
      }
    }
  }

  const retired = entity.retired;
  if (retired !== undefined && retired !== null) {
    if (typeof retired !== "string" || !isCalendarDate(retired)) {
      problems.add(`${path}.retired`, "must be a date, as YYYY-MM-DD, or null");
    }
  }

  const district = entity.district;
  if (district !== undefined && district !== null && typeof district !== "string") {
    problems.add(`${path}.district`, "must be the id of a district, or null");
  }

  const connects = entity.connects;
  if (connects !== undefined) {
    if (!Array.isArray(connects)) {
      problems.add(`${path}.connects`, "must be an array of entity ids");
    } else if (connects.some((target) => typeof target !== "string")) {
      problems.add(`${path}.connects`, "must contain only entity ids");
    }
  }

  const speculative = entity.speculative;
  if (speculative !== undefined && typeof speculative !== "boolean") {
    problems.add(`${path}.speculative`, "must be true or false");
  }

  const meta = entity.meta;
  if (meta !== undefined && !isRecord(meta)) {
    problems.add(`${path}.meta`, "must be an object");
  }

  const magnitude = entity.magnitude;
  if (magnitude !== undefined && (typeof magnitude !== "number" || !Number.isFinite(magnitude))) {
    problems.add(`${path}.magnitude`, "must be a number between 0 and 1");
  }
}

/**
 * Defects the renderer can survive. Each has a fallback that loses detail without
 * inventing anything, which is the test for belonging here rather than above.
 */
function collectWarnings(
  document: Record<string, unknown>,
  warnings: ReturnType<typeof createLog>,
): void {
  for (const key of Object.keys(document)) {
    if (!DocumentKeys.has(key)) warnings.add(key, "is not part of career-graph v1 and is ignored");
  }

  const subject = document.subject;
  if (isRecord(subject)) {
    for (const key of Object.keys(subject)) {
      if (!SubjectKeys.has(key)) {
        warnings.add(`subject.${key}`, "is not part of career-graph v1 and is ignored");
      }
    }
  }

  const entities = document.entities;
  if (!Array.isArray(entities)) return;

  const ids = new Set<string>();
  const districts = new Set<string>();
  for (const entity of entities) {
    if (!isRecord(entity)) continue;
    const id = entity.id;
    if (typeof id !== "string") continue;
    ids.add(id);
    if (entity.kind === "district") districts.add(id);
  }

  for (const [index, entity] of entities.entries()) {
    if (!isRecord(entity)) continue;
    const path = `entities[${String(index)}]`;

    for (const key of Object.keys(entity)) {
      if (!EntityKeys.has(key)) {
        warnings.add(`${path}.${key}`, "is not part of career-graph v1 and is ignored");
      }
    }

    const district = entity.district;
    if (typeof district === "string" && !districts.has(district)) {
      warnings.add(
        `${path}.district`,
        `names no district in this document (${JSON.stringify(district)}); the entity will stand alone`,
      );
    }

    const connects = entity.connects;
    if (Array.isArray(connects)) {
      for (const [target, targetIndex] of connects.map(
        (value, position) => [value, position] as const,
      )) {
        if (typeof target === "string" && !ids.has(target)) {
          warnings.add(
            `${path}.connects[${String(targetIndex)}]`,
            `names no entity in this document (${JSON.stringify(target)}); the connection is dropped`,
          );
        }
      }
    }

    const magnitude = entity.magnitude;
    if (typeof magnitude === "number" && (magnitude < 0 || magnitude > 1)) {
      warnings.add(
        `${path}.magnitude`,
        `is outside 0 to 1 (${String(magnitude)}) and will be clamped`,
      );
    }

    // Dates are validated as YYYY-MM-DD above, so ordering them as strings is ordering
    // them as dates. Neither of these is expressible in JSON Schema, and both produce a
    // city that looks fine and is lying - a building that gains a storey before it
    // exists, or one demolished before it is built.
    const built = entity.built;
    if (typeof built === "string") {
      const upgraded = entity.upgraded;
      if (Array.isArray(upgraded)) {
        for (const [position, date] of upgraded.entries()) {
          if (typeof date === "string" && date < built) {
            warnings.add(
              `${path}.upgraded[${String(position)}]`,
              `is dated before the entity was built (${date} < ${built}) and will be ignored`,
            );
          }
        }
      }

      const retired = entity.retired;
      if (typeof retired === "string" && retired < built) {
        warnings.add(
          `${path}.retired`,
          `is dated before the entity was built (${retired} < ${built}); it will be treated as never retired`,
        );
      }
    }

    const href = entity.href;
    if (href !== undefined && href !== null) {
      if (typeof href !== "string" || !isAbsoluteUrl(href)) {
        warnings.add(
          `${path}.href`,
          "is not an absolute http(s) URL and will be dropped; a link a reader cannot follow is worse than no link",
        );
      }
    }
  }
}

/** A readable block for a log or an error screen. */
export function formatProblems(problems: readonly GraphProblem[]): string {
  return problems
    .map(({ path, message }) => (path === "" ? message : `${path} ${message}`))
    .join("\n");
}
