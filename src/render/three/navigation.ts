/**
 * Walking the streets: the arithmetic, with no camera and no renderer in it.
 *
 * A first-person camera that can walk through a building is the moment the illusion dies -
 * and it is also the kind of thing that is nearly impossible to debug by looking, because
 * from inside a tower every frame looks like a shading bug. So the collision is a pure
 * function of numbers and is tested as one.
 */

export interface Ground2D {
  readonly x: number;
  readonly z: number;
}

export interface Obstacle extends Ground2D {
  /** Circumscribing radius. A square footprint is treated as the circle around it. */
  readonly radius: number;
}

/** Eye height, in world units, where one unit is roughly a metre. */
export const EyeHeight = 1.72;

/** How wide the walker is. Slightly generous, so you never brush a wall. */
export const WalkerRadius = 0.75;

/** Below this orbit distance, standing on the ground is what the viewer is asking for. */
export const StreetEntryDistance = 14;

/** And above this, being on foot has stopped being the useful view. */
export const StreetExitDistance = 26;

export const WalkSpeed = 11;
export const RunMultiplier = 2.4;

/**
 * Where the walker actually ends up, given where they tried to go.
 *
 * Pushed out along the surface normal rather than blocked outright, so walking into a
 * building at an angle slides along it. Blocking dead stops feels like catching on
 * scenery; sliding feels like a wall.
 *
 * Two passes, because pushing clear of one building can push into its neighbour - which is
 * exactly what happens in a dense district, the only place anybody would notice.
 */
export function resolveWalk(
  desired: Ground2D,
  obstacles: readonly Obstacle[],
  walkerRadius: number = WalkerRadius,
): Ground2D {
  let { x, z } = desired;

  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;

    for (const obstacle of obstacles) {
      const clearance = obstacle.radius + walkerRadius;
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const distance = Math.hypot(dx, dz);

      if (distance >= clearance) continue;

      if (distance < 1e-6) {
        // Dead centre: there is no normal to push along, so pick one. Happens when a
        // building goes up on top of a stationary walker, which the timeline makes possible.
        x = obstacle.x + clearance;
        z = obstacle.z;
      } else {
        x = obstacle.x + (dx / distance) * clearance;
        z = obstacle.z + (dz / distance) * clearance;
      }
      moved = true;
    }

    if (!moved) break;
  }

  return { x, z };
}

/**
 * A step on the ground plane, from look direction and input.
 *
 * Movement is horizontal even when looking up or down: a walker who drifts into the sky
 * because they were looking at a rooftop is not walking, and the alternative - clamping
 * afterwards - makes the speed depend on the pitch.
 */
export function walkStep(
  yaw: number,
  forward: number,
  strafe: number,
  distance: number,
): Ground2D {
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude === 0 || distance === 0) return { x: 0, z: 0 };

  // Normalised, so walking diagonally is not forty per cent faster than walking straight.
  const f = forward / magnitude;
  const s = strafe / magnitude;

  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  return {
    x: (-sin * f + cos * s) * distance,
    z: (-cos * f - sin * s) * distance,
  };
}

/** Stops the camera rolling past vertical, where the world turns upside down. */
export function clampPitch(pitch: number): number {
  const limit = Math.PI / 2 - 0.05;
  return Math.max(-limit, Math.min(limit, pitch));
}
