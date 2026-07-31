import { useLayoutEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DynamicDrawUsage, type InstancedMesh, Matrix4, Object3D } from "three";
import { ItemPhase } from "../frame";
import type { CityFrame, CityItem, CityModel } from "../frame";
import { buildingBox, districtHue } from "./city-geometry";

/**
 * Every building in the city, in one draw call.
 *
 * One `InstancedMesh` rather than one mesh per building: a forty-skill career is forty
 * buildings before any scenery, and four hundred is a career somebody could plausibly have.
 * Colour and transform are per-instance attributes, so the count costs nothing.
 *
 * Instances are written in `useFrame` from a mutable ref rather than from props, because
 * re-rendering React sixty times a second to move some matrices is the slow way to do
 * exactly the same work.
 */

export interface BuildingsProps {
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
  readonly speculative?: boolean;
}

const scratch = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);
const colour = new Color();

/** The instance slot for entity *n*, so a raycast's `instanceId` resolves in one read. */
export interface InstanceIndex {
  readonly items: readonly CityItem[];
  readonly entityIndex: Int32Array;
}

export function useInstanceIndex(model: CityModel, speculative: boolean): InstanceIndex {
  return useMemo(() => {
    const items = model.items.filter(
      (item) => item.kind === "building" && item.speculative === speculative,
    );
    return {
      items,
      entityIndex: Int32Array.from(items.map((item) => item.index)),
    };
  }, [model, speculative]);
}

export function Buildings({ model, frame, speculative = false }: BuildingsProps): JSX.Element | null {
  const mesh = useRef<InstancedMesh>(null);
  const index = useInstanceIndex(model, speculative);

  const districtOrder = useMemo(() => {
    const ids = [...model.districts.keys()].sort();
    return new Map(ids.map((id, position) => [id, districtHue(position, ids.length)]));
  }, [model]);

  // Colour never changes with the date, so it is written once rather than every frame.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced === null) return;

    instanced.instanceMatrix.setUsage(DynamicDrawUsage);

    for (const [slot, item] of index.items.entries()) {
      const plot = model.plots.get(item.id);
      const districtId = plot === undefined ? undefined : findDistrict(model, item.id);
      const hue = districtId === undefined ? 0.58 : (districtOrder.get(districtId) ?? 0.58);

      colour.setHSL(hue, speculative ? 0.55 : 0.28, speculative ? 0.62 : 0.55);
      instanced.setColorAt(slot, colour);
    }

    if (instanced.instanceColor !== null) instanced.instanceColor.needsUpdate = true;
  }, [index, model, districtOrder, speculative]);

  useFrame(() => {
    const instanced = mesh.current;
    const current = frame.current;
    if (instanced === null) return;

    for (const [slot, item] of index.items.entries()) {
      const plot = model.plots.get(item.id);
      const phase = current.phase[item.index] ?? ItemPhase.Absent;

      if (plot === undefined || phase === ItemPhase.Absent) {
        // Collapsed rather than removed: the instance keeps its slot, so nothing has to be
        // reallocated and `instanceId` still means what it meant.
        instanced.setMatrixAt(slot, hidden);
        continue;
      }

      const storeys = speculative ? 1 : (current.storeys[item.index] ?? 0);
      const box = buildingBox(item, plot, storeys);

      scratch.position.set(box.x, box.y, box.z);
      scratch.scale.set(box.width, Math.max(box.height, 0.001), box.depth);
      scratch.updateMatrix();
      instanced.setMatrixAt(slot, scratch.matrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  });

  if (index.items.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, index.items.length]}
      castShadow={!speculative}
      receiveShadow={!speculative}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {speculative ? (
        // Never solid. A goal must not be mistakable for an achievement from any angle, in
        // any lighting, or by anyone who cannot tell the two colours apart.
        <meshBasicMaterial wireframe transparent opacity={0.55} vertexColors />
      ) : (
        <meshStandardMaterial roughness={0.72} metalness={0.04} vertexColors />
      )}
    </instancedMesh>
  );
}

/** Which district area contains this plot. Cheap, and only ever run on colour setup. */
function findDistrict(model: CityModel, id: string): string | undefined {
  const plot = model.plots.get(id);
  if (plot === undefined) return undefined;

  for (const [districtId, area] of model.districts) {
    if (Math.hypot(plot.x - area.x, plot.z - area.z) <= area.radius) return districtId;
  }
  return undefined;
}
