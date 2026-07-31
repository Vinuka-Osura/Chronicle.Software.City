/**
 * The renderers. They draw what they are handed.
 *
 * Nothing here imports the contract or the engine - the layering rule refuses it, and
 * `tests/architecture.test.ts` proves the rule still refuses it. The input shapes are
 * declared in `frame.ts` and are structurally what the engine produces, so the composition
 * layer passes the same objects through untouched.
 */

export { renderCitySvg } from "./svg";
export type { SvgOptions } from "./svg";

export { supportsWebGl } from "./webgl";

export { CityCanvas } from "./three/CityCanvas";
export type { CameraMode, CityCanvasProps } from "./three/CityCanvas";

export type { CityPick } from "./three/picking";
export {
  EyeHeight,
  StreetEntryDistance,
  StreetExitDistance,
  WalkerRadius,
  clampPitch,
  resolveWalk,
  walkStep,
} from "./three/navigation";
export type { Ground2D, Obstacle } from "./three/navigation";
export { createBuildingMaterial } from "./three/buildingMaterial";
export { chooseQuality, detectQuality, readDeviceHints, settingsFor } from "./three/quality";
export type { DeviceHints, QualitySettings, QualityTier } from "./three/quality";
export {
  boundsCircle,
  buildingBox,
  buildingHeight,
  cameraFrame,
  districtHue,
  landmarkHeight,
  maxPolarAngle,
} from "./three/city-geometry";
export type { Box, CameraFrame } from "./three/city-geometry";

export { ItemPhase } from "./frame";
export type {
  CityArea,
  CityBounds,
  CityFrame,
  CityItem,
  CityItemKind,
  CityModel,
  CityPlot,
  CityPoint,
  FrameInstant,
  ItemPhaseValue,
} from "./frame";
