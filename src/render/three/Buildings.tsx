import { useEffect, useLayoutEffect, useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  DynamicDrawUsage,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Object3D,
} from "three";
import { ItemPhase } from "../frame";
import type { CityFrame, CityItem, CityModel } from "../frame";
import { PodiumHeight, buildingBox, districtHue, hasPodium } from "./city-geometry";
import { createBuildingMaterial } from "./buildingMaterial";
import { BuildingForms, buildingForm, createFormGeometry, districtFamily } from "./forms";
import type { BuildingForm } from "./forms";
import type { CityPick } from "./picking";

/**
 * Every building in the city, in one draw call per shape.
 *
 * Instancing is what makes the count free: a forty-skill career is forty buildings before
 * any scenery, and four hundred is a career somebody could plausibly have. Colour,
 * transform and weathering are per-instance attributes.
 *
 * There are five shapes rather than one, and which one a building takes comes from its
 * district and its size - never from a random number and never for looks alone. Five
 * meshes is still five draw calls, so the variety costs essentially nothing.
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

interface FormGroup {
  readonly form: BuildingForm;
  readonly items: readonly CityItem[];
}

export function Buildings({
  model,
  frame,
  speculative = false,
  windows = true,
  onPick,
}: BuildingsProps): JSX.Element | null {
  const districtOrder = useMemo(() => {
    const ids = [...model.districts.keys()].sort();
    return new Map(ids.map((id, position) => [id, position]));
  }, [model]);

  /** Which district each building stands in, resolved once from its plot. */
  const homeOf = useMemo(() => {
    const home = new Map<string, number>();
    for (const item of model.items) {
      if (item.kind !== "building") continue;
      const plot = model.plots.get(item.id);
      if (plot === undefined) continue;

      for (const [districtId, area] of model.districts) {
        if (
          Math.abs(plot.x - area.x) <= area.halfWidth &&
          Math.abs(plot.z - area.z) <= area.halfDepth
        ) {
          home.set(item.id, districtOrder.get(districtId) ?? 0);
          break;
        }
      }
    }
    return home;
  }, [model, districtOrder]);

  /**
   * Buildings grouped by the shape they take.
   *
   * Slots stay stable within a group, which is what keeps picking an array read: a raycast
   * hands back an `instanceId`, and `group.items[instanceId]` is the thing under the
   * pointer.
   */
  const groups = useMemo<readonly FormGroup[]>(() => {
    const buckets = new Map<BuildingForm, CityItem[]>(
      BuildingForms.map((form) => [form, [] as CityItem[]]),
    );

    for (const item of model.items) {
      if (item.kind !== "building" || item.speculative !== speculative) continue;

      const family = districtFamily(homeOf.get(item.id) ?? 0);
      buckets.get(buildingForm(item, family))?.push(item);
    }

    return BuildingForms.map((form) => ({ form, items: buckets.get(form) ?? [] })).filter(
      (group) => group.items.length > 0,
    );
  }, [model, speculative, homeOf]);

  const material = useMemo(
    () => (speculative ? null : createBuildingMaterial({ windows })),
    [speculative, windows],
  );

  useEffect(
    () => () => {
      material?.dispose();
    },
    [material],
  );

  const districtCount = Math.max(model.districts.size, 1);

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <FormMesh
          key={group.form}
          group={group}
          model={model}
          frame={frame}
          speculative={speculative}
          material={material}
          districtCount={districtCount}
          homeOf={homeOf}
          onPick={onPick}
        />
      ))}
    </>
  );
}

function FormMesh({
  group,
  model,
  frame,
  speculative,
  material,
  districtCount,
  homeOf,
  onPick,
}: {
  readonly group: FormGroup;
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
  readonly speculative: boolean;
  readonly material: ReturnType<typeof createBuildingMaterial> | null;
  readonly districtCount: number;
  readonly homeOf: ReadonlyMap<string, number>;
  readonly onPick: ((pick: CityPick | null) => void) | undefined;
}): JSX.Element {
  const mesh = useRef<InstancedMesh>(null);
  const podiums = useRef<InstancedMesh>(null);
  const decayAttribute = useRef<InstancedBufferAttribute>(null);
  const lastAt = useRef(Number.NaN);

  const { items } = group;
  const geometry = useMemo<BufferGeometry>(() => createFormGeometry(group.form), [group.form]);

  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  /**
   * Per-instance weathering, as an attribute rather than by rewriting instance colours.
   *
   * Colour is written once and never again; decay changes with the date. Keeping them
   * apart means a retired building greys in the shader without the CPU touching the colour
   * buffer, and without a second material for "retired".
   */
  const decay = useMemo(() => new Float32Array(items.length), [items.length]);

  // Colour never changes with the date, so it is written once rather than every frame.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced === null) return;

    instanced.instanceMatrix.setUsage(DynamicDrawUsage);

    for (const [slot, item] of items.entries()) {
      const hue = districtHue(homeOf.get(item.id) ?? 0, districtCount);
      colour.setHSL(hue, speculative ? 0.55 : 0.24, speculative ? 0.62 : 0.58);
      instanced.setColorAt(slot, colour);
    }

    if (instanced.instanceColor !== null) instanced.instanceColor.needsUpdate = true;
  }, [items, speculative, homeOf, districtCount]);

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

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[geometry, undefined, items.length]}
        castShadow={!speculative}
        receiveShadow={!speculative}
        frustumCulled={false}
        onPointerMove={handlePick}
        onPointerOut={() => {
          onPick?.(null);
        }}
      >
        {material === null ? (
          // Never solid. A goal must not be mistakable for an achievement from any angle, in
          // any lighting, or by anyone who cannot tell the two colours apart.
          <meshBasicMaterial wireframe transparent opacity={0.6} vertexColors />
        ) : (
          <primitive object={material} attach="material" />
        )}
        <instancedBufferAttribute
          ref={decayAttribute}
          attach="geometry-attributes-aDecay"
          args={[decay, 1]}
        />
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
          <meshStandardMaterial color="#6f7269" roughness={0.85} metalness={0.02} />
        </instancedMesh>
      )}
    </>
  );
}
