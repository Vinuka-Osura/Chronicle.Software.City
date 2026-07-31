import { useEffect, useLayoutEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  DynamicDrawUsage,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Object3D,
} from "three";
import { ItemPhase } from "../frame";
import type { CityFrame, CityModel } from "../frame";
import { PodiumHeight, buildingBox, districtHue, hasPodium } from "./city-geometry";
import { createBuildingMaterial } from "./buildingMaterial";
import type { CityPick } from "./picking";

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
  readonly windows?: boolean;
  readonly onPick?: ((pick: CityPick | null) => void) | undefined;
}

const scratch = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);
const colour = new Color();

export function Buildings({
  model,
  frame,
  speculative = false,
  windows = true,
  onPick,
}: BuildingsProps): JSX.Element | null {
  const mesh = useRef<InstancedMesh>(null);
  const podiums = useRef<InstancedMesh>(null);
  const decayAttribute = useRef<InstancedBufferAttribute>(null);
  const lastAt = useRef(Number.NaN);

  /**
   * The instance slot for each item, fixed for the session.
   *
   * This is what makes picking an array read: a raycast hands back an `instanceId`, and
   * `items[instanceId]` is the thing under the pointer. It is the same stability that lets
   * scrubbing write matrices instead of reallocating buffers - the property earns itself
   * twice.
   */
  const items = useMemo(
    () =>
      model.items.filter((item) => item.kind === "building" && item.speculative === speculative),
    [model, speculative],
  );

  const material = useMemo(
    () => (speculative ? null : createBuildingMaterial({ windows })),
    [speculative, windows],
  );

  /**
   * Per-instance weathering, as an attribute rather than by rewriting instance colours.
   *
   * Colour is written once and never again; decay changes with the date. Keeping them
   * apart means a retired building greys in the shader without the CPU touching the colour
   * buffer, and without a second material for "retired".
   */
  const decay = useMemo(() => new Float32Array(items.length), [items.length]);

  useEffect(
    () => () => {
      material?.dispose();
    },
    [material],
  );

  const districtOrder = useMemo(() => {
    const ids = [...model.districts.keys()].sort();
    return new Map(ids.map((id, position) => [id, districtHue(position, ids.length)]));
  }, [model]);

  // Colour never changes with the date, so it is written once rather than every frame.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced === null) return;

    instanced.instanceMatrix.setUsage(DynamicDrawUsage);

    for (const [slot, item] of items.entries()) {
      const districtId = findDistrict(model, item.id);
      const hue = districtId === undefined ? 0.58 : (districtOrder.get(districtId) ?? 0.58);

      colour.setHSL(hue, speculative ? 0.55 : 0.26, speculative ? 0.62 : 0.58);
      instanced.setColorAt(slot, colour);
    }

    if (instanced.instanceColor !== null) instanced.instanceColor.needsUpdate = true;
  }, [items, model, districtOrder, speculative]);

  useFrame(() => {
    const instanced = mesh.current;
    const current = frame.current;
    if (instanced === null) return;

    // Scrubbing between two instants where nothing crosses a lifecycle boundary must cost
    // the GPU nothing. The clock only advances the date when something actually moved, so
    // an unchanged date means an unchanged city.
    if (current.at === lastAt.current) return;
    lastAt.current = current.at;

    for (const [slot, item] of items.entries()) {
      const plot = model.plots.get(item.id);
      const phase = current.phase[item.index] ?? ItemPhase.Absent;

      if (plot === undefined || phase === ItemPhase.Absent) {
        // Collapsed rather than removed: the instance keeps its slot, so nothing has to be
        // reallocated and `instanceId` still means what it meant.
        instanced.setMatrixAt(slot, hidden);
        podiums.current?.setMatrixAt(slot, hidden);
        decay[slot] = 0;
        continue;
      }

      decay[slot] = current.decay[item.index] ?? 0;

      const storeys = speculative ? 1 : (current.storeys[item.index] ?? 0);
      const box = buildingBox(item, plot, storeys);

      scratch.position.set(box.x, box.y, box.z);
      scratch.rotation.set(0, box.rotation, 0);
      scratch.scale.set(box.width, Math.max(box.height, 0.001), box.depth);
      scratch.updateMatrix();
      instanced.setMatrixAt(slot, scratch.matrix);

      // The shoulder a tall building stands on. Short ones do not get one, because a
      // two-storey building with a podium is just a wider two-storey building.
      const podiumMesh = podiums.current;
      if (podiumMesh !== null) {
        if (speculative || !hasPodium(box.height)) {
          podiumMesh.setMatrixAt(slot, hidden);
        } else {
          const rise = Math.min(PodiumHeight, box.height * 0.4);
          scratch.position.set(box.x, rise / 2, box.z);
          scratch.scale.set(box.width * 1.5, rise, box.depth * 1.5);
          scratch.updateMatrix();
          podiumMesh.setMatrixAt(slot, scratch.matrix);
        }
      }
    }
    scratch.rotation.set(0, 0, 0);

    instanced.instanceMatrix.needsUpdate = true;
    if (podiums.current !== null) podiums.current.instanceMatrix.needsUpdate = true;
    if (decayAttribute.current !== null) decayAttribute.current.needsUpdate = true;
    // Raycasting an InstancedMesh tests this first, so a stale sphere is a building that is
    // plainly there and cannot be pointed at.
    instanced.computeBoundingSphere();
  });

  const handlePick = (event: ThreeEvent<PointerEvent>): void => {
    if (onPick === undefined) return;

    const slot = event.instanceId;
    const item = slot === undefined ? undefined : items[slot];
    if (item === undefined) return;

    // A building that has not been built yet is collapsed to nothing, but a degenerate
    // triangle can still register a hit. Left unchecked, the city has invisible walls made
    // of buildings that do not exist yet.
    if ((frame.current.phase[item.index] ?? ItemPhase.Absent) === ItemPhase.Absent) return;

    event.stopPropagation();
    onPick({ id: item.id, index: item.index, clientX: event.clientX, clientY: event.clientY });
  };

  if (items.length === 0) return null;

  return (
    <>
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      castShadow={!speculative}
      receiveShadow={!speculative}
      frustumCulled={false}
      onPointerMove={handlePick}
      onPointerOut={() => {
        onPick?.(null);
      }}
    >
      <boxGeometry args={[1, 1, 1]}>
        {material !== null && (
          <instancedBufferAttribute
            ref={decayAttribute}
            attach="attributes-aDecay"
            args={[decay, 1]}
          />
        )}
      </boxGeometry>
      {material === null ? (
        // Never solid. A goal must not be mistakable for an achievement from any angle, in
        // any lighting, or by anyone who cannot tell the two colours apart.
        <meshBasicMaterial wireframe transparent opacity={0.6} vertexColors />
      ) : (
        <primitive object={material} attach="material" />
      )}
    </instancedMesh>

    {!speculative && (
      <instancedMesh
        ref={podiums}
        args={[undefined, undefined, items.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        // Part of the building it belongs to, so pointing at it should not report a
        // separate thing - and the tower above it is the easier target anyway.
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7b7d76" roughness={0.82} metalness={0.02} />
      </instancedMesh>
    )}
    </>
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
