import { useEffect, useMemo, type JSX } from "react";
import { OrbitControls, Sky } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CityBounds } from "../frame";
import { boundsCircle, cameraFrame, maxPolarAngle } from "./city-geometry";
import { StreetExitDistance } from "./navigation";
import type { QualitySettings } from "./quality";

/**
 * Light, sky and camera.
 *
 * This is most of the difference between "some boxes on a plane" and something a viewer
 * reacts to, and almost none of it is geometry. A directional sun gives every building a
 * lit face, a shaded face and a shadow, which is what the eye reads as form; hemisphere
 * fill keeps the shaded side from going black; fog gives distance.
 *
 * All of it generated. No textures, no HDRIs, nothing fetched - partly because a strict
 * content security policy would block it, and partly because an asset that fails to load
 * is a city that renders wrong for reasons nobody can see.
 */

/**
 * Reflections, from a room that is built rather than downloaded.
 *
 * Glossy surfaces need something to reflect. The usual answer is an HDRI, which means an
 * asset to fetch - blocked by a strict content security policy, and a city that renders
 * flat grey for one viewer and glossy for everyone else is worse than one that is always
 * flat.
 *
 * `RoomEnvironment` constructs a lit box out of geometry and lights, and PMREM turns it
 * into an environment map. Nothing is loaded, nothing can fail, and the buildings pick up
 * highlights that make them read as surfaces rather than as coloured shapes.
 */
function ProceduralEnvironment(): null {
  const { gl, scene } = useThree();

  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04).texture;

    scene.environment = environment;
    // Enough for highlights and edges, not enough to wash out the sun's own shading.
    scene.environmentIntensity = 0.65;

    return () => {
      scene.environment = null;
      environment.dispose();
      generator.dispose();
      room.dispose();
    };
  }, [gl, scene]);

  return null;
}

export function SceneLighting({
  bounds,
  settings,
}: {
  readonly bounds: CityBounds;
  readonly settings: QualitySettings;
}): JSX.Element {
  const { centreX, centreZ, radius } = useMemo(() => boundsCircle(bounds), [bounds]);

  // The shadow camera is orthographic and has to contain the city. Too small and shadows
  // stop at an invisible line; too large and the same texture is spread thin until they
  // turn to mush.
  const extent = Math.max(radius * 1.4, 60);

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[0.6, 0.32, 0.28]}
        turbidity={5}
        rayleigh={1.4}
        mieCoefficient={0.005}
        mieDirectionalG={0.82}
      />

      {/* Low-ish sun: long shadows read as depth, and a midday sun flattens everything. */}
      <directionalLight
        position={[centreX + extent * 0.7, extent * 1.1, centreZ + extent * 0.5]}
        intensity={2.6}
        castShadow={settings.shadows}
        shadow-mapSize={[settings.shadowMapSize, settings.shadowMapSize]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-extent, extent, extent, -extent, 1, extent * 4]}
        />
      </directionalLight>

      {/* Sky above, ground bounce below: what stops the unlit face being a black hole. */}
      <hemisphereLight args={["#cfe2f7", "#6b7360", 0.95]} />
      <ambientLight intensity={0.18} />

      <ProceduralEnvironment />
    </>
  );
}

export interface CameraRigProps {
  readonly bounds: CityBounds;
}

export function CameraRig({ bounds }: CameraRigProps): JSX.Element {
  const frame = useMemo(() => cameraFrame(bounds), [bounds]);
  const { camera } = useThree();

  // Coming back from street mode, the camera is standing on the pavement - which is nearer
  // the target than the distance that dropped it into street mode in the first place, so
  // without this it would fall straight back in and the exit would look broken.
  useEffect(() => {
    const target = new Vector3(frame.target[0], frame.target[1], frame.target[2]);
    const away = camera.position.clone().sub(target);
    const distance = away.length();

    if (distance >= StreetExitDistance) return;

    // Kept in whatever direction the viewer was facing, and lifted, so the city rises back
    // into view rather than cutting to a different place entirely.
    away.setLength(StreetExitDistance);
    away.y = Math.max(away.y, StreetExitDistance * 0.45);
    camera.position.copy(target).add(away);
    camera.lookAt(target);
  }, [camera, frame]);

  return (
    <OrbitControls
      makeDefault
      target={[frame.target[0], frame.target[1], frame.target[2]]}
      enableDamping
      dampingFactor={0.08}
      // Zoom, on wheel and on pinch. Clamped to the layout bounds at the far end so the
      // city cannot be lost in the distance, and to street level at the near end.
      enableZoom
      zoomSpeed={0.9}
      minDistance={frame.minDistance}
      maxDistance={frame.maxDistance}
      // The camera does not go below ground while there is nothing down there to see.
      maxPolarAngle={maxPolarAngle()}
      minPolarAngle={0.05}
      // Panning the target off into empty space is the fastest way to get lost in a scene
      // with no landmarks on the horizon.
      enablePan
      screenSpacePanning={false}
    />
  );
}
