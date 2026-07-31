import { useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, type BufferGeometry } from "three";
import { ItemPhase } from "../frame";
import type { CityFrame, CityModel, CityPoint } from "../frame";

/**
 * Every road in the city, in one geometry.
 *
 * Roads are flat ribbons rather than lines, because a line has no width at distance and
 * the whole point of a road here is that a wider one means a bigger project.
 *
 * The vertex buffer is allocated once at full size and rewritten in place as the date
 * moves - roads extend end to end rather than fading in, so a half-built project is a road
 * half way across the city, which is what a project part-way through actually looks like.
 */

export interface RoadsProps {
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
}

const RoadHeight = 0.06;

interface RoadPlan {
  readonly index: number;
  readonly points: readonly CityPoint[];
  readonly halfWidth: number;
  readonly vertexOffset: number;
  readonly segments: number;
}

export function Roads({ model, frame }: RoadsProps): JSX.Element | null {
  const geometry = useRef<BufferGeometry>(null);

  const plan = useMemo(() => {
    const roads: RoadPlan[] = [];
    let vertexOffset = 0;

    for (const item of model.items) {
      if (item.kind !== "road") continue;
      const points = model.roads.get(item.id);
      if (points === undefined || points.length < 2) continue;

      const segments = points.length - 1;
      roads.push({
        index: item.index,
        points,
        halfWidth: 0.8 + 1.9 * item.magnitude,
        vertexOffset,
        segments,
      });
      // Four vertices and two triangles per segment.
      vertexOffset += segments * 4;
    }

    return { roads, vertexCount: vertexOffset };
  }, [model]);

  const buffers = useMemo(() => {
    const positions = new Float32Array(plan.vertexCount * 3);
    const indices: number[] = [];

    for (const road of plan.roads) {
      for (let segment = 0; segment < road.segments; segment += 1) {
        const base = road.vertexOffset + segment * 4;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    return { positions, indices: new Uint32Array(indices) };
  }, [plan]);

  useFrame(() => {
    const target = geometry.current;
    const current = frame.current;
    if (target === null) return;

    const { positions } = buffers;

    for (const road of plan.roads) {
      const phase = current.phase[road.index] ?? ItemPhase.Absent;
      const built =
        phase === ItemPhase.Absent ? 0 : (current.construction[road.index] ?? 0);

      writeRibbon(positions, road, built);
    }

    const attribute = target.getAttribute("position");
    if (attribute instanceof BufferAttribute) attribute.needsUpdate = true;
    target.computeBoundingSphere();
  });

  if (plan.roads.length === 0) return null;

  return (
    <mesh receiveShadow frustumCulled={false}>
      <bufferGeometry ref={geometry}>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="index" args={[buffers.indices, 1]} />
      </bufferGeometry>
      <meshStandardMaterial color="#4a4640" roughness={0.9} metalness={0} />
    </mesh>
  );
}

/**
 * Writes the first `fraction` of a road's length into the shared buffer.
 *
 * Segments past the end collapse to a point rather than being removed, because removing
 * them would mean rebuilding the index buffer every frame - and a degenerate triangle
 * costs nothing to rasterise.
 */
function writeRibbon(positions: Float32Array, road: RoadPlan, fraction: number): void {
  const lengths: number[] = [];
  let total = 0;

  for (let segment = 0; segment < road.segments; segment += 1) {
    const from = road.points[segment];
    const to = road.points[segment + 1];
    if (from === undefined || to === undefined) {
      lengths.push(0);
      continue;
    }
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    lengths.push(length);
    total += length;
  }

  const wanted = total * Math.max(0, Math.min(1, fraction));
  let travelled = 0;

  for (let segment = 0; segment < road.segments; segment += 1) {
    const from = road.points[segment];
    const to = road.points[segment + 1];
    const length = lengths[segment] ?? 0;
    const base = (road.vertexOffset + segment * 4) * 3;

    if (from === undefined || to === undefined) continue;

    const remaining = wanted - travelled;
    const along = length === 0 ? 0 : Math.max(0, Math.min(1, remaining / length));
    travelled += length;

    const endX = from.x + (to.x - from.x) * along;
    const endZ = from.z + (to.z - from.z) * along;

    // Perpendicular in the ground plane, normalised, giving the ribbon its width.
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const span = Math.hypot(dx, dz) || 1;
    const nx = (-dz / span) * road.halfWidth;
    const nz = (dx / span) * road.halfWidth;

    write(positions, base, from.x + nx, from.z + nz);
    write(positions, base + 3, from.x - nx, from.z - nz);
    write(positions, base + 6, endX + nx, endZ + nz);
    write(positions, base + 9, endX - nx, endZ - nz);
  }
}

function write(positions: Float32Array, offset: number, x: number, z: number): void {
  positions[offset] = x;
  positions[offset + 1] = RoadHeight;
  positions[offset + 2] = z;
}
