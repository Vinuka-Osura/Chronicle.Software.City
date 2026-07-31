import { describe, expect, it } from "vitest";
import { createClock } from "./clock";
import type { ClockOptions, TimelineClock } from "./clock";
import type { CareerSpan } from "./compile";
import { Year } from "./time";

const span: CareerSpan = { from: Date.UTC(2020, 0, 1), to: Date.UTC(2030, 0, 1) };

function clockAt(from: number, options: Partial<ClockOptions> = {}): TimelineClock {
  const clock = createClock({ span, ...options });
  clock.jump(from);
  return clock;
}

describe("the target follows the pointer exactly", () => {
  it("moves the whole way immediately, because input that lags feels broken", () => {
    const clock = clockAt(span.from);
    clock.seek(span.to);

    expect(clock.target).toBe(span.to);
  });

  it("does not let the pointer leave the career", () => {
    const clock = clockAt(span.from);

    clock.seek(span.to + 50 * Year);
    expect(clock.target).toBe(span.to);

    clock.seek(span.from - 50 * Year);
    expect(clock.target).toBe(span.from);
  });
});

describe("the city takes its own time catching up", () => {
  it("does not teleport when the pointer jumps ten years", () => {
    const clock = clockAt(span.from);
    clock.seek(span.to);

    // The whole rule from the concept doc: dragging plays the construction.
    expect(clock.rendered).toBe(span.from);
    expect(clock.settled).toBe(false);
  });

  it("moves toward the target, and only toward it", () => {
    const clock = clockAt(span.from);
    clock.seek(span.to);

    let previous = clock.rendered;
    for (let frame = 0; frame < 10; frame += 1) {
      clock.advance(1 / 60);
      expect(clock.rendered).toBeGreaterThan(previous);
      expect(clock.rendered).toBeLessThanOrEqual(span.to);
      previous = clock.rendered;
    }
  });

  it("never overshoots, which is why the follow is first order", () => {
    const clock = clockAt(span.from);
    clock.seek(span.to);

    for (let frame = 0; frame < 600; frame += 1) {
      clock.advance(1 / 60);
      expect(clock.rendered).toBeLessThanOrEqual(span.to);
    }
  });

  it("settles exactly on the target rather than chasing an asymptote", () => {
    const clock = clockAt(span.from);
    clock.seek(span.to);

    for (let frame = 0; frame < 600; frame += 1) clock.advance(1 / 60);

    expect(clock.rendered).toBe(span.to);
    expect(clock.settled).toBe(true);
  });

  it("arrives at the same place whatever the frame rate", () => {
    // A naive `rendered += gap * 0.1` moves further per frame on a slow machine, so the
    // same drag feels different at 30fps and at 120fps. This depends on elapsed time.
    const fast = clockAt(span.from);
    const slow = clockAt(span.from);
    fast.seek(span.to);
    slow.seek(span.to);

    for (let frame = 0; frame < 120; frame += 1) fast.advance(1 / 120);
    for (let frame = 0; frame < 30; frame += 1) slow.advance(1 / 30);

    const width = span.to - span.from;
    expect(Math.abs(fast.rendered - slow.rendered) / width).toBeLessThan(0.01);
  });

  it("reports whether anything moved, so a caller can skip the redraw", () => {
    const clock = clockAt(span.from);

    expect(clock.advance(1 / 60)).toBe(false);

    clock.seek(span.to);
    expect(clock.advance(1 / 60)).toBe(true);
  });
});

describe("reduced motion stops the animation rather than shortening it", () => {
  it("cuts straight to the target", () => {
    const clock = clockAt(span.from, { reducedMotion: true });
    clock.seek(span.to);

    expect(clock.rendered).toBe(span.to);
    expect(clock.settled).toBe(true);
  });

  it("still plays, it simply does not ease", () => {
    const clock = clockAt(span.from, { reducedMotion: true, playbackSeconds: 10 });
    clock.play();
    clock.advance(1);

    expect(clock.rendered).toBe(clock.target);
    expect(clock.rendered).toBeGreaterThan(span.from);
  });
});

describe("playback", () => {
  it("crosses the career in the time it was given", () => {
    const clock = clockAt(span.from, { playbackSeconds: 10, followSeconds: 0 });
    clock.play();

    for (let second = 0; second < 10; second += 1) clock.advance(1);

    expect(clock.rendered).toBe(span.to);
  });

  it("stops at the end rather than running past it", () => {
    const clock = clockAt(span.from, { playbackSeconds: 1, followSeconds: 0 });
    clock.play();
    clock.advance(5);

    expect(clock.playing).toBe(false);
    expect(clock.target).toBe(span.to);
  });

  it("restarts from the beginning when pressed at the end", () => {
    // Otherwise pressing play on a finished city does nothing at all, which reads as a
    // broken button rather than as a finished career.
    const clock = clockAt(span.to);
    clock.play();

    expect(clock.rendered).toBe(span.from);
    expect(clock.playing).toBe(true);
  });

  it("is stopped by pausing, because the pointer is a more recent instruction", () => {
    const clock = clockAt(span.from);
    clock.play();
    clock.pause();

    expect(clock.playing).toBe(false);
  });
});

describe("progress, for a scrubber's thumb", () => {
  it("is 0 at the start and 1 at the end", () => {
    const clock = clockAt(span.from);
    expect(clock.progress()).toBe(0);

    clock.jump(span.to);
    expect(clock.progress()).toBe(1);
  });

  it("round-trips through seekProgress", () => {
    const clock = clockAt(span.from);
    clock.seekProgress(0.25);
    clock.jump(clock.target);

    expect(clock.progress()).toBeCloseTo(0.25, 6);
  });

  it("does not divide by zero on a career with no width", () => {
    const flat = createClock({ span: { from: 5, to: 5 } });

    expect(flat.progress()).toBe(0);
  });
});
