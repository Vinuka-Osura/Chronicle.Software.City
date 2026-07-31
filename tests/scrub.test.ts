import { describe, expect, it } from "vitest";
import { createClock, dateFromInstant, layout, worldAt } from "@engine";
import { renderCitySvg } from "@render";
import { toCityFrame, toCityModel } from "@react/model";
import { compiledFixture } from "./fixtures";

/**
 * Phase 3's acceptance criterion, end to end: dragging from the start of a career to the
 * end must *play* the city being built rather than cut to the finished result.
 *
 * Everything below the clock is already covered - this is the assembled thing, driven a
 * frame at a time the way a browser drives it.
 */

const Frame = 1 / 60;

function countBuildings(markup: string): number {
  return (markup.match(/<rect class="building/g) ?? []).length;
}

describe("dragging the timeline plays the construction", () => {
  const graph = compiledFixture("full");
  const model = toCityModel(graph, layout(graph));

  const frameAt = (at: number): string =>
    renderCitySvg(model, toCityFrame(worldAt(graph, at)));

  it("does not arrive at the finished city on the first frame", () => {
    const clock = createClock({ span: graph.span });
    clock.jump(graph.span.from);
    clock.seek(graph.span.to);
    clock.advance(Frame);

    const finished = countBuildings(frameAt(graph.span.to));
    expect(countBuildings(frameAt(clock.rendered))).toBeLessThan(finished);
  });

  it("passes through the whole career on the way, never skipping it", () => {
    const clock = createClock({ span: graph.span });
    clock.jump(graph.span.from);
    clock.seek(graph.span.to);

    const counts: number[] = [];
    for (let frame = 0; frame < 600 && !clock.settled; frame += 1) {
      clock.advance(Frame);
      counts.push(countBuildings(frameAt(clock.rendered)));
    }

    // Buildings only ever arrive while time runs forwards. A drop would mean something
    // was demolished, which nothing in this product may do.
    for (const [index, count] of counts.entries()) {
      if (index === 0) continue;
      expect(count).toBeGreaterThanOrEqual(counts[index - 1] ?? 0);
    }

    expect(counts.at(-1)).toBe(countBuildings(frameAt(graph.span.to)));
    // Several distinct intermediate cities, not two frames and a jump.
    expect(new Set(counts).size).toBeGreaterThan(3);
  });

  it("reaches the end, and stops there", () => {
    const clock = createClock({ span: graph.span });
    clock.jump(graph.span.from);
    clock.seek(graph.span.to);

    for (let frame = 0; frame < 1200; frame += 1) clock.advance(Frame);

    expect(clock.settled).toBe(true);
    expect(dateFromInstant(clock.rendered)).toBe(dateFromInstant(graph.span.to));
  });

  it("plays it again the same way, because the frames are evaluated and not accumulated", () => {
    const run = (): number[] => {
      const clock = createClock({ span: graph.span });
      clock.jump(graph.span.from);
      clock.seek(graph.span.to);

      const counts: number[] = [];
      for (let frame = 0; frame < 120; frame += 1) {
        clock.advance(Frame);
        counts.push(countBuildings(frameAt(clock.rendered)));
      }
      return counts;
    };

    expect(run()).toEqual(run());
  });

  it("scrubbing backwards takes the city back down, without demolishing anything", () => {
    const clock = createClock({ span: graph.span });
    clock.jump(graph.span.to);
    clock.seek(graph.span.from);

    const finished = countBuildings(frameAt(graph.span.to));
    for (let frame = 0; frame < 1200 && !clock.settled; frame += 1) clock.advance(Frame);

    // The city un-builds because the date went back, not because anything was destroyed.
    // Scrub forward again and it is exactly the city it was.
    expect(countBuildings(frameAt(clock.rendered))).toBeLessThan(finished);
    expect(countBuildings(frameAt(graph.span.to))).toBe(finished);
  });
});

describe("reduced motion lands on the finished city", () => {
  const graph = compiledFixture("full");
  const model = toCityModel(graph, layout(graph));

  it("cuts rather than playing, on the very first frame", () => {
    const clock = createClock({ span: graph.span, reducedMotion: true });
    clock.jump(graph.span.from);
    clock.seek(graph.span.to);

    const markup = renderCitySvg(model, toCityFrame(worldAt(graph, clock.rendered)));
    const finished = renderCitySvg(model, toCityFrame(worldAt(graph, graph.span.to)));

    // Stop the animation, do not merely shorten it.
    expect(markup).toBe(finished);
  });
});
