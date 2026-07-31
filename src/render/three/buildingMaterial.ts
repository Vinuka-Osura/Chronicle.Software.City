import { MeshStandardMaterial } from "three";

/**
 * A box with storeys, windows and a grubby base — which is most of the distance between
 * "some cubes" and "a city", and costs one shader rather than any geometry.
 *
 * Everything here is computed from the instance's own transform, so it stays a single draw
 * call. A forty-storey tower gets forty rows of windows because the shader can see it is
 * forty storeys tall, not because anything generated forty rows of anything.
 *
 * Nothing is fetched. No window texture, no atlas, no image that can fail to load and
 * leave a viewer looking at flat grey while everyone else sees a city.
 */

/** World units per storey. Matches the height model so bands land on real floors. */
const StoreyHeight = 3.6;

/** Horizontal spacing of window columns, in world units. */
const ColumnWidth = 2.1;

export interface BuildingMaterialOptions {
  /** Windows lit from within. Off for the plainest quality tier. */
  readonly windows?: boolean;
}

export function createBuildingMaterial(
  options: BuildingMaterialOptions = {},
): MeshStandardMaterial {
  const windows = options.windows ?? true;

  // Glossier than a real building, on purpose. The reference is a stylised diorama, and
  // the environment map below is what those reflections come from - so roughness is what
  // decides whether any of it is visible.
  const material = new MeshStandardMaterial({
    roughness: 0.34,
    metalness: 0.22,
    vertexColors: true,
    envMapIntensity: 0.9,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindows = { value: windows ? 1 : 0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec2 aLifecycle;
         varying vec3 vLocalPosition;
         varying vec3 vWorldScale;
         varying float vSideness;
         varying vec2 vLifecycle;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vLocalPosition = position;
         vLifecycle = aLifecycle;
         // Each column of the instance matrix is an axis scaled by that axis's scale, so
         // its length is the scale. This is how the shader knows how tall the building is
         // without being told separately.
         vWorldScale = vec3(
           length(instanceMatrix[0].xyz),
           length(instanceMatrix[1].xyz),
           length(instanceMatrix[2].xyz)
         );
         // 1 on the walls, 0 on the roof: bands and windows belong on the sides only.
         vSideness = 1.0 - abs(normal.y);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uWindows;
         varying vec3 vLocalPosition;
         varying vec3 vWorldScale;
         varying float vSideness;
         varying vec2 vLifecycle;

         float hash21(vec2 p) {
           p = fract(p * vec2(123.34, 456.21));
           p += dot(p, p + 45.32);
           return fract(p.x * p.y);
         }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           // The box geometry is a unit cube centred on the origin, so local Y runs -0.5
           // to 0.5. Times the instance's Y scale, that is metres above the pavement.
           float heightUp = (vLocalPosition.y + 0.5) * vWorldScale.y;
           float storey = heightUp / ${StoreyHeight.toFixed(2)};

           // Which face we are on, so window columns wrap the building instead of
           // stretching across a corner.
           float across = abs(vLocalPosition.x) > abs(vLocalPosition.z)
             ? vLocalPosition.z * vWorldScale.z
             : vLocalPosition.x * vWorldScale.x;
           float column = across / ${ColumnWidth.toFixed(2)};

           // A darker line at every floor. This alone reads as "building" rather than "box".
           float floorLine = 1.0 - smoothstep(0.0, 0.09, abs(fract(storey) - 0.5) );
           diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62,
                                  floorLine * vSideness * 0.75);

           // Grime and contact shadow at the base: nothing in a real city is uniformly lit
           // to the ground, and the eye reads the gradient as weight.
           float base = 1.0 - smoothstep(0.0, 6.0, heightUp);
           diffuseColor.rgb *= mix(1.0, 0.68, base * vSideness);

           float decay = vLifecycle.x;
           float trim = vLifecycle.y;

           if (uWindows > 0.5) {
             vec2 cell = vec2(floor(column), floor(storey));
             float lit = hash21(cell);
             // Only some windows, and never on the ground floor where the lobby would be.
             float isWindow = step(0.72, lit) * step(1.0, storey) * vSideness;
             // Inset from the floor line and from the column edge, so it reads as a pane.
             float insetY = step(0.22, fract(storey)) * (1.0 - step(0.78, fract(storey)));
             float insetX = step(0.25, fract(column)) * (1.0 - step(0.75, fract(column)));
             float pane = isWindow * insetY * insetX;

             // Unlit as it weathers. A retired capability is not demolished - it is
             // still standing, and nobody is in it.
             totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * pane * 0.55 * (1.0 - decay);
           }

           // A lit band near the crown, in the district's own colour.
           //
           // Brightness comes from magnitude, so the trim says something rather than
           // decorating: the capabilities somebody has taken furthest are the ones that
           // light up. A city where everything glowed equally would be prettier and would
           // be telling the viewer nothing.
           float fromTop = vWorldScale.y - heightUp;
           float crown = smoothstep(0.3, 0.55, fromTop) * (1.0 - smoothstep(1.2, 1.6, fromTop));
           totalEmissiveRadiance +=
             vColor * crown * vSideness * trim * 2.4 * (1.0 - decay);

           // Retired is not deleted. Colour drains toward grey and the surface darkens,
           // which reads as weathering rather than as removal - the building happened.
           float grey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grey * 0.74), decay * 0.88);
         }`,
      );
  };

  // Two materials with identical parameters but different injected shaders would otherwise
  // share a compiled program, and the second would silently get the first one's code.
  material.customProgramCacheKey = () => `software-city-building:${windows ? "lit" : "plain"}`;

  return material;
}
