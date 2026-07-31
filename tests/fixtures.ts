import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

export function loadSchema(): unknown {
  return JSON.parse(
    readFileSync(join(RepoRoot, "contracts", "career-graph.v1.schema.json"), "utf8"),
  );
}
