import { useMemo, type JSX } from "react";
import { ConeGeometry, CylinderGeometry, DoubleSide, Object3D } from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityModel } from "../frame";
import { hashId } from "./city-geometry";

/**
 * The plate the city stands on, its ring road, and the trees along it.
 *
 * A city rendered on an infinite plane is a clipping of somewhere larger, and the eye reads
 * it as unfinished. Standing it on a disc makes it **an object** - something complete,
 * that could be picked up - which is the whole difference between a scene and a diorama.
 *
 * The ring road is doing the same job as the plate's edge, one step in: it draws a line
 * around the city that says "this is all of it", and it gives the streets somewhere to
 * arrive from.
 */

const PlateMargin = 12;
const RingRoadWidth = 6;
const PlateSkirt = 2.6;

export interface DioramaProps {
  readonly model: CityModel;
  /** Whether to place trees. Off on the plainest quality tier. */
  readonly props?: boolean;
}

/**
 * How big the built city is, ignoring the goals ringed outside it.
 *
 * Measured from the blocks and the things standing on them rather than from the layout
 * bounds, because the bounds include the survey ground - and sizing the plate to that
 * would leave the city as a small island in the middle of a large empty disc.
 */
function cityCore(model: CityModel): number {
  let radius = 0;

  for (const area of model.districts.values()) {
    radius = Math.max(radius, Math.hypot(Math.abs(area.x) + area.halfWidth, Math.abs(area.z) + area.halfDepth));
  }
  for (const item of model.items) {
    if (item.speculative) continue;
    const plot = model.plots.get(item.id);
    if (plot === undefined) continue;
    radius = Math.max(radius, Math.hypot(plot.x, plot.z));
  }

  return Math.max(radius, 12);
}

/** How far out the goals sit, so the survey ground reaches them. */
function surveyReach(model: CityModel): number {
  let radius = 0;
  for (const item of model.items) {
    if (!item.speculative) continue;
    const plot = model.plots.get(item.id);
    if (plot === undefined) continue;
    radius = Math.max(radius, Math.hypot(plot.x, plot.z));
  }
  return radius;
}

/** A trunk and a canopy, merged so a tree is one instance. */
function createTreeGeometry(): ReturnType<typeof BufferGeometryUtils.mergeGeometries> {
  const trunk = new CylinderGeometry(0.13, 0.17, 1.1, 5);
  trunk.translate(0, 0.55, 0);
  const canopy = new ConeGeometry(0.75, 1.9, 7);
  canopy.translate(0, 2.05, 0);
  const upper = new ConeGeometry(0.5, 1.2, 7);
  upper.translate(0, 2.85, 0);

  return BufferGeometryUtils.mergeGeometries([trunk, canopy, upper]);
}

export function Diorama({ model, props = true }: DioramaProps): JSX.Element {
  const core = useMemo(() => cityCore(model), [model]);
  const survey = useMemo(() => surveyReach(model), [model]);

  const plateRadius = core + PlateMargin;
  // The survey ground reaches whatever the furthest goal is, so a blueprint always stands
  // on something. A goal floating over nothing reads as a rendering fault rather than as
  // an intention.
  const groundRadius = Math.max(plateRadius + 4, survey + 10);

  const trees = useMemo(() => {
    if (!props) return [];

    const placed: { x: number; z: number; scale: number; turn: number }[] = [];
    const laneRadius = core + PlateMargin * 0.42;

    // A row along the inside of the ring road. Evenly spaced by arc length rather than by
    // angle, so a large city does not get a sparser avenue than a small one.
    const spacing = 7;
    const count = Math.max(8, Math.round((Math.PI * 2 * laneRadius) / spacing));

    for (let index = 0; index < count; index += 1) {
      const seed = hashId(`tree:${String(index)}`);
      const angle = (index / count) * Math.PI * 2;
      const jitter = (seed - 0.5) * 1.6;

      placed.push({
        x: Math.cos(angle) * (laneRadius + jitter),
        z: Math.sin(angle) * (laneRadius + jitter),
        scale: 0.8 + seed * 0.55,
        turn: seed * Math.PI * 2,
      });
    }

    return placed;
  }, [core, props]);

  const treeGeometry = useMemo(() => createTreeGeometry(), []);

  const treeMatrices = useMemo(() => {
    const object = new Object3D();
    return trees.map((tree) => {
      object.position.set(tree.x, 0, tree.z);
      object.rotation.set(0, tree.turn, 0);
      object.scale.setScalar(tree.scale);
      object.updateMatrix();
      return object.matrix.clone();
    });
  }, [trees]);

  return (
    <group>
      {/* The survey ground: flat, plain, and reaching out to the furthest goal. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[groundRadius, 64]} />
        <meshStandardMaterial color="#5c6355" roughness={1} metalness={0} side={DoubleSide} />
      </mesh>

      {/* The plate itself, with a skirt below so the city has visible thickness - which is
          what makes it read as an object rather than as paint on a floor. */}
      <mesh position={[0, -PlateSkirt / 2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[plateRadius, plateRadius * 0.965, PlateSkirt, 64]} />
        <meshStandardMaterial color="#767c6e" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Ring road. One step inside the edge, so the city has a boundary you can see from
          any angle without having to find the rim. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <ringGeometry args={[core + PlateMargin * 0.62, core + PlateMargin * 0.62 + RingRoadWidth, 72]} />
        <meshStandardMaterial color="#3f3d39" roughness={0.92} metalness={0} side={DoubleSide} />
      </mesh>

      {/* The dashed centre line, as one thin ring. Cheaper than dashes and reads the same
          at any distance a viewer will actually be at. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry
          args={[
            core + PlateMargin * 0.62 + RingRoadWidth / 2 - 0.12,
            core + PlateMargin * 0.62 + RingRoadWidth / 2 + 0.12,
            72,
          ]}
        />
        <meshBasicMaterial color="#c9c3ae" side={DoubleSide} />
      </mesh>

      {treeMatrices.length > 0 && (
        <instancedMesh
          args={[treeGeometry, undefined, treeMatrices.length]}
          castShadow
          frustumCulled={false}
          raycast={() => null}
          ref={(instance) => {
            if (instance === null) return;
            for (const [slot, matrix] of treeMatrices.entries()) {
              instance.setMatrixAt(slot, matrix);
            }
            instance.instanceMatrix.needsUpdate = true;
            instance.computeBoundingSphere();
          }}
        >
          <meshStandardMaterial color="#4e6b3f" roughness={0.95} metalness={0} />
        </instancedMesh>
      )}
    </group>
  );
}
