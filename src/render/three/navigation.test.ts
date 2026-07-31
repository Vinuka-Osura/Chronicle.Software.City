import { describe, expect, it } from "vitest";
import {
  StreetEntryDistance,
  StreetExitDistance,
  WalkerRadius,
  clampPitch,
  resolveWalk,
  walkStep,
} from "./navigation";
import type { Obstacle } from "./navigation";

const tower: Obstacle = { x: 0, z: 0, radius: 4 };

function distanceTo(point: { x: number; z: number }, obstacle: Obstacle): number {
  return Math.hypot(point.x - obstacle.x, point.z - obstacle.z);
}

describe("you cannot walk through a building", () => {
  it("pushes a walker out of one it tried to enter", () => {
    const resolved = resolveWalk({ x: 1, z: 0 }, [tower]);

    expect(distanceTo(resolved, tower)).toBeCloseTo(tower.radius + WalkerRadius, 5);
  });

  it("leaves a walker alone when they are nowhere near", () => {
    expect(resolveWalk({ x: 40, z: 40 }, [tower])).toEqual({ x: 40, z: 40 });
  });

  it("stops exactly at the surface, not inside it", () => {
    const resolved = resolveWalk({ x: 0.2, z: 0.2 }, [tower]);

    expect(distanceTo(resolved, tower)).toBeGreaterThanOrEqual(tower.radius + WalkerRadius - 1e-6);
  });

  it("slides along a wall rather than stopping dead", () => {
    // Walking into a building at an angle should keep the sideways part of the movement.
    // Blocking outright feels like catching on scenery; sliding feels like a wall.
    const resolved = resolveWalk({ x: 0.5, z: 3.5 }, [tower]);

    expect(resolved.z).toBeGreaterThan(0);
    expect(Math.abs(resolved.x)).toBeGreaterThan(0);
  });

  it("handles a walker standing exactly in the centre", () => {
    // Not hypothetical: the timeline can put a building up on top of somebody standing
    // still, and there is no surface normal to push along from dead centre.
    const resolved = resolveWalk({ x: 0, z: 0 }, [tower]);

    expect(distanceTo(resolved, tower)).toBeCloseTo(tower.radius + WalkerRadius, 5);
    expect(Number.isFinite(resolved.x)).toBe(true);
    expect(Number.isFinite(resolved.z)).toBe(true);
  });

  it("gets a walker clear of two buildings at once", () => {
    // Pushing clear of one can push into its neighbour, which is what happens in a dense
    // district - the only place anybody would notice.
    const pair: Obstacle[] = [
      { x: -3, z: 0, radius: 4 },
      { x: 3, z: 0, radius: 4 },
    ];
    const resolved = resolveWalk({ x: 0, z: 0.4 }, pair);

    for (const obstacle of pair) {
      expect(distanceTo(resolved, obstacle)).toBeGreaterThan(obstacle.radius);
    }
  });

  it("does nothing at all when there is nothing built yet", () => {
    expect(resolveWalk({ x: 3, z: 3 }, [])).toEqual({ x: 3, z: 3 });
  });
});

describe("walking", () => {
  it("goes where you are looking", () => {
    // Yaw 0 faces -Z, which is the direction a default camera looks.
    const step = walkStep(0, 1, 0, 10);

    expect(step.x).toBeCloseTo(0, 5);
    expect(step.z).toBeCloseTo(-10, 5);
  });

  it("backs up when you ask it to", () => {
    expect(walkStep(0, -1, 0, 10).z).toBeCloseTo(10, 5);
  });

  it("strafes at a right angle to the look direction", () => {
    const step = walkStep(0, 0, 1, 10);

    expect(step.x).toBeCloseTo(10, 5);
    expect(step.z).toBeCloseTo(0, 5);
  });

  it("turns with the yaw", () => {
    const step = walkStep(Math.PI / 2, 1, 0, 10);

    expect(step.x).toBeCloseTo(-10, 5);
    expect(step.z).toBeCloseTo(0, 5);
  });

  it("is not faster diagonally", () => {
    // The bug every first-person controller ships with once: pressing two keys gives
    // 1.41x the speed, and the map feels different depending on which way you face.
    const straight = walkStep(0, 1, 0, 10);
    const diagonal = walkStep(0, 1, 1, 10);

    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z), 5);
  });

  it("stands still when nothing is pressed", () => {
    expect(walkStep(0, 0, 0, 10)).toEqual({ x: 0, z: 0 });
  });

  it("stands still on a zero-length frame", () => {
    expect(walkStep(0, 1, 0, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe("looking", () => {
  it("cannot roll past straight up", () => {
    expect(clampPitch(Math.PI)).toBeLessThan(Math.PI / 2);
  });

  it("cannot roll past straight down", () => {
    expect(clampPitch(-Math.PI)).toBeGreaterThan(-Math.PI / 2);
  });

  it("leaves an ordinary look direction alone", () => {
    expect(clampPitch(0.3)).toBe(0.3);
  });
});

describe("entering and leaving street level", () => {
  it("leaves from further out than it enters", () => {
    // On a single threshold, one wheel notch at the boundary flips the mode back and
    // forth, which is genuinely unpleasant to experience.
    expect(StreetExitDistance).toBeGreaterThan(StreetEntryDistance);
  });
});
