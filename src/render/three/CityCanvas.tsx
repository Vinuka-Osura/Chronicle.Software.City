import { useMemo, type JSX, type ReactNode, type RefObject  } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import type { CityFrame, CityModel } from "../frame";
import { Buildings } from "./Buildings";
import { Districts, Ground } from "./Ground";
import { Landmarks } from "./Landmarks";
import { Roads } from "./Roads";
import { CameraRig, SceneLighting } from "./Scene";
import { boundsCircle, cameraFrame } from "./city-geometry";

export interface CityCanvasProps {
  readonly model: CityModel;
  /** Mutated in place by whoever owns the clock; read every frame, never through props. */
  readonly frame: RefObject<CityFrame>;
  readonly hasUnderground?: boolean;
  /** Anything that needs to run inside the render loop - a clock driver, for instance. */
  readonly children?: ReactNode;
}

export function CityCanvas({
  model,
  frame,
  hasUnderground = false,
  children,
}: CityCanvasProps): JSX.Element {
  const camera = useMemo(() => cameraFrame(model.bounds), [model.bounds]);
  const { radius } = useMemo(() => boundsCircle(model.bounds), [model.bounds]);

  return (
    <Canvas
      // Soft shadows: the hard-edged default is the thing that makes a WebGL scene look
      // like a WebGL scene.
      shadows="soft"
      // Capped at 2: past that a phone renders four times the pixels for a difference
      // nobody can see, and it is the single easiest way to lose the frame budget.
      dpr={[1, 2]}
      camera={{
        position: [camera.position[0], camera.position[1], camera.position[2]],
        fov: 45,
        near: 0.5,
        far: Math.max(radius * 12, 2000),
      }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.85 }}
    >
      {/* Distance haze, tinted to the sky so the horizon dissolves rather than ending. */}
      <fogExp2 attach="fog" args={["#c3d3e4", Math.max(0.0016, 1 / Math.max(radius * 26, 1))]} />

      <SceneLighting bounds={model.bounds} />
      <Ground bounds={model.bounds} />
      <Districts model={model} />
      <Roads model={model} frame={frame} />
      <Buildings model={model} frame={frame} />
      <Buildings model={model} frame={frame} speculative />
      <Landmarks model={model} frame={frame} />

      <CameraRig bounds={model.bounds} hasUnderground={hasUnderground} />
      {children}
    </Canvas>
  );
}
