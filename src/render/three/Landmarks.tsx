import { useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { DynamicDrawUsage, type InstancedMesh, Matrix4, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { ItemPhase } from "../frame";
import type { CityFrame, CityModel } from "../frame";
import { landmarkHeight } from "./city-geometry";
import type { CityPick } from "./picking";

/**
 * Roles and milestones: things that happened once, at a moment, rather than capabilities
 * that deepen.
 *
 * Drawn as tapered columns along the civic axis so they read as monuments rather than as
 * short buildings. The shape is doing the work of saying "this is a different kind of
 * thing" - which matters more than the colour, because the colour is the first thing lost
 * to a screenshot, a projector, or colour blindness.
 */

export interface LandmarksProps {
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
  readonly onPick?: ((pick: CityPick | null) => void) | undefined;
}

const scratch = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);

export function Landmarks({ model, frame, onPick }: LandmarksProps): JSX.Element | null {
  const mesh = useRef<InstancedMesh>(null);

  const items = useMemo(
    () => model.items.filter((item) => item.kind === "landmark" && !item.speculative),
    [model],
  );

  useFrame(() => {
    const instanced = mesh.current;
    const current = frame.current;
    if (instanced === null) return;

    for (const [slot, item] of items.entries()) {
      const plot = model.plots.get(item.id);
      const phase = current.phase[item.index] ?? ItemPhase.Absent;

      if (plot === undefined || phase === ItemPhase.Absent) {
        instanced.setMatrixAt(slot, hidden);
        continue;
      }

      const height = landmarkHeight(item.magnitude, current.construction[item.index] ?? 0);
      const width = plot.footprint * 0.34;

      scratch.position.set(plot.x, height / 2, plot.z);
      scratch.scale.set(width, Math.max(height, 0.001), width);
      scratch.updateMatrix();
      instanced.setMatrixAt(slot, scratch.matrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);
    instanced.computeBoundingSphere();
  });

  const handlePick = (event: ThreeEvent<PointerEvent>): void => {
    if (onPick === undefined) return;

    const slot = event.instanceId;
    const item = slot === undefined ? undefined : items[slot];
    if (item === undefined) return;
    if ((frame.current.phase[item.index] ?? ItemPhase.Absent) === ItemPhase.Absent) return;

    event.stopPropagation();
    onPick({ id: item.id, index: item.index, clientX: event.clientX, clientY: event.clientY });
  };

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerMove={handlePick}
      onPointerOut={() => {
        onPick?.(null);
      }}
    >
      {/* Four sides, tapered: an obelisk rather than a tower. */}
      <cylinderGeometry args={[0.22, 0.5, 1, 4]} />
      <meshStandardMaterial color="#b8763f" roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}
