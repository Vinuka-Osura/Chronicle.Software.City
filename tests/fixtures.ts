import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatProblems, parseCareerGraph } from "@contract";
import { compileGraph } from "@engine";
import type { CompileOptions, CompiledGraph } from "@engine";

export const FixtureNames = ["empty", "small", "full", "awkward"] as const;

export type FixtureName = (typeof FixtureNames)[number];

const RepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function fixturePath(name: FixtureName): string {
  return join(RepoRoot, "fixtures", `${name}.json`);
}

/**
 * Deliberately returns `unknown`. A fixture is a document that arrived from outside, and
 * typing it as a `CareerGraph` before it has been validated would let a test assume
 * exactly the thing the validator exists to establish.
 */
export function loadFixture(name: FixtureName): unknown {
  return JSON.parse(readFileSync(fixturePath(name), "utf8"));
}

/**
 * A fixture taken all the way through the boundary: validated, then compiled. Tests that
 * skipped the validator would be asserting against documents nobody had established were
 * legal.
 */
export function compiledFixture(name: FixtureName, options: CompileOptions = {}): CompiledGraph {
  const result = parseCareerGraph(loadFixture(name));
  if (!result.ok) {
    throw new Error(`${name}.json was refused by the validator:\n${formatProblems(result.problems)}`);
  }
  return compileGraph(result.graph, options);
}

export function loadSchema(): unknown {
  return JSON.parse(
    readFileSync(join(RepoRoot, "contracts", "career-graph.v1.schema.json"), "utf8"),
  );
}
