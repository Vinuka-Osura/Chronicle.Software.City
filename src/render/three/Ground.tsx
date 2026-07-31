import { useMemo, type JSX } from "react";
import { DoubleSide } from "three";
import type { CityBounds, CityModel } from "../frame";
import { boundsCircle, districtHue } from "./city-geometry";

/**
 * The ground, and the districts drawn on it.
 *
 * A plane large enough that its edge is never in shot, plus a disc per district. The discs
 * are what stop the city reading as buildings floating on nothing: they give the eye the
 * grouping that the data already knows about.
 */

export function Ground({ bounds }: { readonly bounds: CityBounds }): JSX.Element {
  const { centreX, centreZ, radius } = useMemo(() => boundsCircle(bounds), [bounds]);

  return (
    <mesh
      // Rotated flat rather than using a plane in the XZ axis, because a receiving shadow
      // needs a real surface normal facing the light.
      rotation={[-Math.PI / 2, 0, 0]}
      position={[centreX, 0, centreZ]}
      receiveShadow
    >
      <circleGeometry args={[Math.max(radius * 4, 240), 64]} />
      <meshStandardMaterial color="#6f7466" roughness={1} metalness={0} />
    </mesh>
  );
}

export function Districts({ model }: { readonly model: CityModel }): JSX.Element {
  const areas = useMemo(() => {
    const ids = [...model.districts.keys()].sort();
    return ids.map((id, position) => ({
      id,
      area: model.districts.get(id),
      hue: districtHue(position, ids.length),
    }));
  }, [model]);

  return (
    <group>
      {areas.map(({ id, area, hue }) =>
        area === undefined ? null : (
          <mesh
            key={id}
            rotation={[-Math.PI / 2, 0, 0]}
            // Lifted a hair off the ground: coplanar surfaces z-fight, and the flicker is
            // the single most obviously amateur thing a 3D scene can do.
            position={[area.x, 0.02, area.z]}
            receiveShadow
          >
            {/* A block, not a disc. Cities are rectangular, and a round district reads as
                a plot marker on a map rather than as ground somebody built on. */}
            <planeGeometry args={[area.halfWidth * 2, area.halfDepth * 2]} />
            <meshStandardMaterial
              color={`hsl(${String(Math.round(hue * 360))}, 12%, 34%)`}
              roughness={0.98}
              metalness={0}
              side={DoubleSide}
            />
          </mesh>
        ),
      )}
    </group>
  );
}
