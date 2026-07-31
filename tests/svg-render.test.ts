import { describe, expect, it } from "vitest";
import { compileGraph, layout, worldAt } from "@engine";
import { toCityFrame, toCityModel } from "@react/model";
import { formatProblems, parseCareerGraph } from "@contract";
import { renderCitySvg } from "@render";
import type { CityModel } from "@render";
import { compiledFixture, loadFixture } from "./fixtures";
import type { FixtureName } from "./fixtures";

/**
 * The renderer itself imports nothing from the engine - that is the point of it - so this
 * lives in tests/ rather than beside the code it exercises. It deliberately drives the
 * renderer with real engine output, which is the only way to find out whether the two
 * shapes actually fit, and doing that from inside src/render/ is a boundary violation that
 * the lint rule refuses. Rightly: an exception for files named *.test.ts would be a place
 * for a real violation to hide.
 */

function sceneOf(name: FixtureName): {
  model: CityModel;
  at: (date: string) => string;
} {
  const graph = compiledFixture(name);
  const model = toCityModel(graph, layout(graph));

  return {
    model,
    at: (date) =>
      renderCitySvg(model, toCityFrame(worldAt(graph, Date.parse(`${date}T00:00:00Z`)))),
  };
}

describe("it draws every fixture without throwing", () => {
  it.each(["empty", "small", "full", "awkward"] as const)("%s.json", (name) => {
    const scene = sceneOf(name);

    expect(scene.at("2026-01-01")).toContain("<svg");
  });

  it("draws an empty career as empty ground rather than failing", () => {
    const markup = sceneOf("empty").at("2026-01-01");

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("<rect");
  });
});

describe("nothing appears before its built date", () => {
  const scene = sceneOf("full");

  it("draws no structures at all before the career begins", () => {
    // The entire premise of the timeline, checked at the last layer rather than assumed
    // from the engine's tests.
    expect(scene.at("2010-01-01")).not.toContain("<rect");
  });

  it("draws more of the city later than earlier", () => {
    const early = (scene.at("2023-06-01").match(/<rect/g) ?? []).length;
    const late = (scene.at("2026-06-01").match(/<rect/g) ?? []).length;

    expect(late).toBeGreaterThan(early);
  });
});

describe("a goal is unmistakably not built", () => {
  const scene = sceneOf("full");

  // full.json was generated on 2026-07-31, and a goal exists from the moment it is
  // stated - so this date is after that, not after any particular target.
  const afterItWasStated = "2026-08-01";

  it("draws nothing at all before the document was generated", () => {
    // Found by this test being written with the wrong date, which is the best way to
    // find it: in June 2026 those goals had not been said out loud, so a city showing
    // them would be inventing history.
    expect(scene.at("2026-06-01")).not.toContain("blueprint");
  });

  it("draws it with the blueprint class, never as a building", () => {
    expect(scene.at(afterItWasStated)).toContain('class="blueprint"');
  });

  it("never fills it, so it cannot be mistaken in a screenshot", () => {
    // Carried by the shape and the stroke rather than by colour alone: somebody who
    // cannot distinguish the two hues must still be able to tell a goal from a tower.
    const blueprints = scene.at(afterItWasStated).match(/<rect class="blueprint"[^>]*>/g) ?? [];

    expect(blueprints.length).toBeGreaterThan(0);
    for (const rect of blueprints) {
      expect(rect).not.toContain("fill-opacity");
    }
  });

  it("is still a blueprint years past its target date", () => {
    expect(scene.at("2040-01-01")).toContain('class="blueprint"');
  });
});

describe("retired is not deleted", () => {
  const scene = sceneOf("full");

  it("keeps drawing a project long after it ended", () => {
    // Student Records API ended in 2023. It happened, so it stays on the map.
    expect(scene.at("2026-06-01")).toContain("retired");
  });
});

describe("construction is a duration, not an event", () => {
  const scene = sceneOf("small");

  it("draws a building smaller while it is going up", () => {
    const partial = scene.at("2024-09-20");
    const finished = scene.at("2026-01-01");

    const widthOf = (markup: string): number =>
      Number(/<rect class="building"[^>]*width="([\d.]+)"/.exec(markup)?.[1] ?? 0);

    expect(widthOf(partial)).toBeGreaterThan(0);
    expect(widthOf(partial)).toBeLessThan(widthOf(finished));
  });
});

describe("the view does not move as the city grows", () => {
  const scene = sceneOf("full");

  it("keeps the same viewBox at every date", () => {
    // Another consequence of layout being time-invariant: the camera has nothing to lurch
    // toward, because the bounds were known before anything was drawn.
    const viewBoxOf = (markup: string): string => /viewBox="([^"]+)"/.exec(markup)?.[1] ?? "";

    expect(viewBoxOf(scene.at("2019-01-01"))).toBe(viewBoxOf(scene.at("2040-01-01")));
  });
});

describe("producer text is escaped, because it is untrusted input", () => {
  it("does not let a label close a tag", () => {
    const result = parseCareerGraph({
      version: 1,
      generatedAt: "2026-01-01T00:00:00+00:00",
      subject: { name: "x" },
      entities: [
        {
          id: "d",
          kind: "district",
          label: '</text><script>alert(1)</script>',
          built: "2024-01-01",
        },
      ],
    });
    if (!result.ok) throw new Error(formatProblems(result.problems));

    const graph = compileGraph(result.graph);
    const markup = renderCitySvg(
      toCityModel(graph, layout(graph)),
      toCityFrame(worldAt(graph, Date.parse("2026-01-01T00:00:00Z"))),
    );

    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;/text&gt;");
  });
});

describe("the model is built from the same document the validator accepted", () => {
  it("carries one item per entity", () => {
    const raw = loadFixture("full");
    const result = parseCareerGraph(raw);
    if (!result.ok) throw new Error(formatProblems(result.problems));

    const graph = compileGraph(result.graph);

    expect(toCityModel(graph, layout(graph)).items).toHaveLength(graph.entities.length);
  });
});
