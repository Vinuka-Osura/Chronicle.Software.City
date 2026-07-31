import { afterEach, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The layering rule, tested by trying to break it.
 *
 * A lint rule that is misconfigured does not fail loudly - it passes everything, for
 * ever, and the first sign of trouble is a renderer import three months deep in the
 * engine. So this asserts the rule REFUSES what it should refuse, rather than asserting
 * the codebase happens to be clean today.
 *
 * The probes are written to disk rather than linted as text, because the config is
 * type-aware and a virtual path has no program behind it. Written, linted, deleted.
 */

const RepoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ProbeFile = "__boundary-probe.ts";
const Layers = ["contract", "engine", "render", "react"] as const;

type Layer = (typeof Layers)[number];

const BoundaryRule = "import-x/no-restricted-paths";

function probePath(layer: Layer): string {
  return join(RepoRoot, "src", layer, ProbeFile);
}

function writeProbe(layer: Layer, source: string): void {
  const path = probePath(layer);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, "utf8");
}

async function boundaryErrorsIn(layer: Layer): Promise<string[]> {
  // A fresh instance per call: ESLint caches configuration per run, and these probes
  // appear and disappear between them.
  const eslint = new ESLint({ cwd: RepoRoot });
  const [result] = await eslint.lintFiles([probePath(layer)]);

  return (result?.messages ?? [])
    .filter((message) => message.ruleId === BoundaryRule)
    .map((message) => message.message);
}

afterEach(() => {
  for (const layer of Layers) {
    rmSync(probePath(layer), { force: true });
  }
});

describe("the engine may not reach into the renderer", () => {
  it("refuses an aliased import", async () => {
    writeProbe("render", "export const drawn = 1;\n");
    writeProbe(
      "engine",
      'import { drawn } from "@render/__boundary-probe";\nexport const used = drawn;\n',
    );

    const errors = await boundaryErrorsIn("engine");

    expect(errors).toHaveLength(1);
    // The message is the whole point of the rule. Somebody hits this at 11pm and the
    // useful response tells them where the thing they want actually belongs.
    expect(errors[0]).toContain("must not know what a mesh is");
  });

  it("refuses a relative import, which is what you reach for when the rule is in the way", async () => {
    writeProbe("render", "export const drawn = 1;\n");
    writeProbe(
      "engine",
      'import { drawn } from "../render/__boundary-probe";\nexport const used = drawn;\n',
    );

    expect(await boundaryErrorsIn("engine")).toHaveLength(1);
  });

  it("refuses a type-only import, because the layering is about what a layer knows", async () => {
    writeProbe("render", "export interface Drawn {\n  readonly x: number;\n}\n");
    writeProbe(
      "engine",
      'import type { Drawn } from "@render/__boundary-probe";\nexport type Used = Drawn;\n',
    );

    expect(await boundaryErrorsIn("engine")).toHaveLength(1);
  });
});

describe("the renderer has never heard of a career", () => {
  it("refuses render/ importing the contract", async () => {
    writeProbe("contract", "export const supportedVersion = 1;\n");
    writeProbe(
      "render",
      'import { supportedVersion } from "@contract/__boundary-probe";\nexport const used = supportedVersion;\n',
    );

    const errors = await boundaryErrorsIn("render");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("react/ is the layer allowed to see both sides");
  });

  it("refuses render/ importing the engine", async () => {
    writeProbe("engine", "export const world = 1;\n");
    writeProbe(
      "render",
      'import { world } from "@engine/__boundary-probe";\nexport const used = world;\n',
    );

    expect(await boundaryErrorsIn("render")).toHaveLength(1);
  });
});

describe("the boundaries that are allowed stay allowed", () => {
  it("permits engine/ importing the contract", async () => {
    writeProbe("contract", "export const supportedVersion = 1;\n");
    writeProbe(
      "engine",
      'import { supportedVersion } from "@contract/__boundary-probe";\nexport const used = supportedVersion;\n',
    );

    // Without this the suite would pass just as well against a rule that refused
    // everything, which would be a different way of having no boundary at all.
    expect(await boundaryErrorsIn("engine")).toHaveLength(0);
  });

  it("permits react/ importing both the engine and the renderer", async () => {
    writeProbe("engine", "export const world = 1;\n");
    writeProbe("render", "export const drawn = 2;\n");
    writeProbe(
      "react",
      'import { world } from "@engine/__boundary-probe";\n' +
        'import { drawn } from "@render/__boundary-probe";\n' +
        "export const used = world + drawn;\n",
    );

    expect(await boundaryErrorsIn("react")).toHaveLength(0);
  });
});
