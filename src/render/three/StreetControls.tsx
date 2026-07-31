import { useEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Euler, Vector3 } from "three";
import { ItemPhase } from "../frame";
import type { CityFrame, CityModel } from "../frame";
import {
  EyeHeight,
  RunMultiplier,
  StreetExitDistance,
  WalkSpeed,
  clampPitch,
  resolveWalk,
  walkStep,
} from "./navigation";
import type { Obstacle } from "./navigation";

/**
 * Walking the city.
 *
 * **Drag to look, not pointer lock.** Pointer lock is the usual answer and it takes the
 * cursor away - which would cost the tooltips, and tooltips are the thing that turns a
 * pretty picture into something readable. Dragging keeps both.
 *
 * Movement is clamped to eye height on the ground plane and cannot enter a building that
 * exists at the current instant. "At the current instant" matters: a tower that goes up in
 * 2027 must not be a wall in 2019, and scrubbing forwards while standing on its plot has
 * to push you out rather than trap you.
 */

export interface StreetControlsProps {
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
  /** Raised when the viewer asks to go back up - by scrolling out, or pressing Escape. */
  readonly onExit: () => void;
}

const look = new Euler(0, 0, 0, "YXZ");
const forwardAxis = new Vector3();

export function StreetControls({ model, frame, onExit }: StreetControlsProps): JSX.Element | null {
  const { camera, gl } = useThree();

  const held = useRef(new Set<string>());
  const dragging = useRef(false);
  const yaw = useRef(0);
  const pitch = useRef(0);

  /** Footprints never move, so the obstacle list is built once per city. */
  const footprints = useMemo(() => {
    const all: (Obstacle & { readonly index: number })[] = [];

    for (const item of model.items) {
      if (item.kind !== "building" || item.speculative) continue;
      const plot = model.plots.get(item.id);
      if (plot === undefined) continue;

      const side = plot.footprint * (0.55 + 0.45 * item.magnitude);
      all.push({ x: plot.x, z: plot.z, radius: side * 0.62, index: item.index });
    }

    return all;
  }, [model]);

  // Take the camera's current heading rather than resetting it, so dropping into street
  // mode continues the look direction instead of spinning the viewer round.
  useEffect(() => {
    camera.getWorldDirection(forwardAxis);
    yaw.current = Math.atan2(-forwardAxis.x, -forwardAxis.z);
    pitch.current = clampPitch(Math.asin(forwardAxis.y));
    camera.position.y = EyeHeight;
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    // Captured now: by the time the cleanup runs, held.current may be a different Set.
    const keys = held.current;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onExit();
        return;
      }
      keys.add(event.key.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      keys.delete(event.key.toLowerCase());
    };
    const onBlur = (): void => {
      // Otherwise alt-tabbing mid-stride leaves the viewer walking for ever.
      keys.clear();
    };

    const onPointerDown = (event: PointerEvent): void => {
      dragging.current = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent): void => {
      dragging.current = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging.current) return;
      yaw.current -= event.movementX * 0.0032;
      pitch.current = clampPitch(pitch.current - event.movementY * 0.0032);
    };

    const onWheel = (event: WheelEvent): void => {
      // Scrolling out is how you got in, so it is how you get out.
      if (event.deltaY > 0) onExit();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("wheel", onWheel);
      keys.clear();
    };
  }, [gl, onExit]);

  useFrame((_, delta) => {
    const keys = held.current;
    const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const strafe = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);

    const speed = WalkSpeed * (keys.has("shift") ? RunMultiplier : 1);
    const step = walkStep(yaw.current, forward, strafe, speed * Math.min(delta, 0.1));

    if (step.x !== 0 || step.z !== 0) {
      const current = frame.current;
      const solid = footprints.filter(
        (footprint) => (current.phase[footprint.index] ?? ItemPhase.Absent) !== ItemPhase.Absent,
      );

      const resolved = resolveWalk(
        { x: camera.position.x + step.x, z: camera.position.z + step.z },
        solid,
      );
      camera.position.x = resolved.x;
      camera.position.z = resolved.z;
    }

    camera.position.y = EyeHeight;
    look.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(look);
  });

  return null;
}

export { StreetExitDistance };
