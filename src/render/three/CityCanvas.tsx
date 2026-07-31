import { useCallback, useMemo, useState, type JSX, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import type { CityFrame, CityModel } from "../frame";
import { Buildings } from "./Buildings";
import { Districts, Ground } from "./Ground";
import { Landmarks } from "./Landmarks";
import { Roads } from "./Roads";
import { CameraRig, SceneLighting } from "./Scene";
import { Construction } from "./Construction";
import { StreetControls } from "./StreetControls";
import { detectQuality } from "./quality";
import type { QualitySettings } from "./quality";
import { StreetEntryDistance } from "./navigation";
import { boundsCircle, cameraFrame } from "./city-geometry";
import type { CityPick } from "./picking";

export type CameraMode = "orbit" | "street";

export interface CityCanvasProps {
  readonly model: CityModel;
  /** Mutated in place by whoever owns the clock; read every frame, never through props. */
  readonly frame: RefObject<CityFrame>;
  readonly hasUnderground?: boolean;
  /** Overrides the auto-detected tier. A host that knows its audience knows better. */
  readonly quality?: QualitySettings | undefined;
  readonly onPick?: ((pick: CityPick | null) => void) | undefined;
  readonly mode: CameraMode;
  readonly onModeChange: (mode: CameraMode) => void;
  /** Anything that needs to run inside the render loop - a clock driver, for instance. */
  readonly children?: ReactNode;
}

export function CityCanvas({
  model,
  frame,
  hasUnderground = false,
  quality,
  onPick,
  mode,
  onModeChange,
  children,
}: CityCanvasProps): JSX.Element {
  const camera = useMemo(() => cameraFrame(model.bounds), [model.bounds]);
  const { radius } = useMemo(() => boundsCircle(model.bounds), [model.bounds]);

  // Detected once. Re-deciding on every resize would mean a viewer who narrows a window
  // watches the shadows switch off, which looks like a fault rather than a kindness.
  const [detected] = useState(detectQuality);
  const settings = quality ?? detected;

  const enterStreet = useCallback(() => {
    onModeChange("street");
  }, [onModeChange]);

  const leaveStreet = useCallback(() => {
    onModeChange("orbit");
  }, [onModeChange]);

  return (
    <Canvas
      // Soft shadows: the hard-edged default is the thing that makes a WebGL scene look
      // like a WebGL scene.
      shadows={settings.shadows ? "soft" : false}
      // The single easiest way to lose the frame budget is to render four times the pixels
      // for a difference nobody can see.
      dpr={[1, settings.maxPixelRatio]}
      camera={{
        position: [camera.position[0], camera.position[1], camera.position[2]],
        fov: 48,
        near: 0.35,
        far: Math.max(radius * 12, 2000),
      }}
      gl={{
        antialias: settings.antialias,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 0.9,
      }}
    >
      {/* Distance haze, tinted to the sky so the horizon dissolves rather than ending. */}
      <fogExp2 attach="fog" args={["#c3d3e4", Math.max(0.0016, 1 / Math.max(radius * 26, 1))]} />

      <SceneLighting bounds={model.bounds} settings={settings} />
      <Ground bounds={model.bounds} />
      <Districts model={model} />
      <Roads model={model} frame={frame} />
      <Buildings model={model} frame={frame} windows={settings.windows} onPick={onPick} />
      <Buildings model={model} frame={frame} speculative onPick={onPick} />
      <Landmarks model={model} frame={frame} onPick={onPick} />
      {settings.construction && <Construction model={model} frame={frame} />}

      {mode === "orbit" ? (
        <>
          <CameraRig bounds={model.bounds} hasUnderground={hasUnderground} />
          {/* Zooming all the way in is a request to stand in the street, so it is treated
              as one rather than as a camera that has run out of room. */}
          <EnterStreetWhenClose onEnter={enterStreet} />
        </>
      ) : (
        <StreetControls model={model} frame={frame} onExit={leaveStreet} />
      )}

      {children}
    </Canvas>
  );
}

/**
 * Watches how close the orbit camera has come to its target.
 *
 * Entry and exit deliberately use different distances. On one threshold, a single wheel
 * notch at the boundary flips the mode back and forth, which is genuinely unpleasant -
 * leaving street mode puts the camera further out than the distance that entered it.
 */
function EnterStreetWhenClose({ onEnter }: { readonly onEnter: () => void }): null {
  const { camera, controls } = useThree();

  useFrame(() => {
    const target = (controls as { target?: { x: number; y: number; z: number } } | null)?.target;
    if (target === undefined) return;

    const distance = Math.hypot(
      camera.position.x - target.x,
      camera.position.y - target.y,
      camera.position.z - target.z,
    );

    if (distance <= StreetEntryDistance) onEnter();
  });

  return null;
}
