import { useMemo, useRef, type JSX, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, type BufferGeometry, type InstancedMesh, Matrix4, Object3D } from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ItemPhase } from "../frame";
import type { CityFrame, CityModel } from "../frame";
import { buildingBox } from "./city-geometry";

/**
 * Scaffolding and cranes on everything currently going up.
 *
 * The concept doc's claim is that the city *remembers how it was built* rather than only
 * what it currently looks like, and this is where that stops being a slogan. Without it a
 * building mid-construction is just a short building, and a still frame taken while
 * dragging says nothing at all.
 *
 * Both are instanced and sized to the number of buildings, but only the ones actually
 * under construction are given a matrix - which is almost never more than a handful,
 * because construction takes 2% of a career.
 */

export interface ConstructionProps {
  readonly model: CityModel;
  readonly frame: RefObject<CityFrame>;
}

const scratch = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);

/** A mast with a jib, merged into one geometry so a crane is one instance and not three. */
function createCraneGeometry(): BufferGeometry {
  const mast = new BoxGeometry(0.16, 1, 0.16);
  // Unit height, base at the origin, so scaling Y scales the crane from the ground up.
  mast.translate(0, 0.5, 0);

  const jib = new BoxGeometry(1.15, 0.09, 0.09);
  jib.translate(0.42, 0.96, 0);

  const counterJib = new BoxGeometry(0.34, 0.09, 0.09);
  counterJib.translate(-0.3, 0.96, 0);

  // Merging can only fail when the inputs disagree about their attributes, which three
  // boxes cannot - and this version's types say so, so there is nothing to guard.
  return BufferGeometryUtils.mergeGeometries([mast, jib, counterJib]);
}

export function Construction({ model, frame }: ConstructionProps): JSX.Element | null {
  const scaffolds = useRef<InstancedMesh>(null);
  const cranes = useRef<InstancedMesh>(null);
  const lastAt = useRef(Number.NaN);

  const items = useMemo(
    () => model.items.filter((item) => item.kind === "building" && !item.speculative),
    [model],
  );

  const craneGeometry = useMemo(() => createCraneGeometry(), []);

  useFrame(() => {
    const scaffoldMesh = scaffolds.current;
    const craneMesh = cranes.current;
    const current = frame.current;
    if (scaffoldMesh === null || craneMesh === null) return;

    // Nothing has moved, so nothing needs uploading. Scrubbing between two instants where
    // no lifecycle boundary is crossed must cost the GPU nothing at all.
    if (current.at === lastAt.current) return;
    lastAt.current = current.at;

    for (const [slot, item] of items.entries()) {
      const plot = model.plots.get(item.id);
      const phase = current.phase[item.index] ?? ItemPhase.Absent;
      const construction = current.construction[item.index] ?? 0;

      if (plot === undefined || phase !== ItemPhase.UnderConstruction) {
        scaffoldMesh.setMatrixAt(slot, hidden);
        craneMesh.setMatrixAt(slot, hidden);
        continue;
      }

      const storeys = current.storeys[item.index] ?? 0;
      const box = buildingBox(item, plot, storeys);

      // A shell around what has been built so far, standing slightly proud of it.
      scratch.position.set(box.x, box.height / 2, box.z);
      scratch.scale.set(box.width * 1.16, Math.max(box.height * 1.05, 0.001), box.depth * 1.16);
      scratch.updateMatrix();
      scaffoldMesh.setMatrixAt(slot, scratch.matrix);

      // The crane stands beside the plot and always overtops the building, the way a real
      // one has to. It comes down as the work finishes rather than vanishing at the end.
      const craneHeight = box.height * 1.35 + 6;
      const offset = box.width * 0.9;
      scratch.position.set(box.x + offset, 0, box.z + offset);
      scratch.scale.set(1, craneHeight * (1 - construction * 0.15), 1);
      scratch.rotation.set(0, ((item.index % 8) / 8) * Math.PI * 2, 0);
      scratch.updateMatrix();
      scratch.rotation.set(0, 0, 0);
      craneMesh.setMatrixAt(slot, scratch.matrix);
    }

    scaffoldMesh.instanceMatrix.needsUpdate = true;
    craneMesh.instanceMatrix.needsUpdate = true;
  });

  if (items.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={scaffolds}
        args={[undefined, undefined, items.length]}
        frustumCulled={false}
        // Not pickable: scaffolding is not a thing in the career, and a tooltip saying
        // "scaffolding" would be the renderer talking about itself.
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial wireframe transparent opacity={0.42} color="#d8b46a" />
      </instancedMesh>

      <instancedMesh
        ref={cranes}
        args={[craneGeometry, undefined, items.length]}
        castShadow
        frustumCulled={false}
        raycast={() => null}
      >
        <meshStandardMaterial color="#c9612f" roughness={0.6} metalness={0.2} />
      </instancedMesh>
    </>
  );
}
