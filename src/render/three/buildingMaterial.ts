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

  const material = new MeshStandardMaterial({
    roughness: 0.68,
    metalness: 0.06,
    vertexColors: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindows = { value: windows ? 1 : 0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vLocalPosition;
         varying vec3 vWorldScale;
         varying float vSideness;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vLocalPosition = position;
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

           if (uWindows > 0.5) {
             vec2 cell = vec2(floor(column), floor(storey));
             float lit = hash21(cell);
             // Only some windows, and never on the ground floor where the lobby would be.
             float isWindow = step(0.72, lit) * step(1.0, storey) * vSideness;
             // Inset from the floor line and from the column edge, so it reads as a pane.
             float insetY = step(0.22, fract(storey)) * (1.0 - step(0.78, fract(storey)));
             float insetX = step(0.25, fract(column)) * (1.0 - step(0.75, fract(column)));
             float pane = isWindow * insetY * insetX;

             totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * pane * 0.55;
           }
         }`,
      );
  };

  // Two materials with identical parameters but different injected shaders would otherwise
  // share a compiled program, and the second would silently get the first one's code.
  material.customProgramCacheKey = () => `software-city-building:${windows ? "lit" : "plain"}`;

  return material;
}
