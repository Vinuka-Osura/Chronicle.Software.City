/**
 * The three-dimensional renderer, behind its own entry point.
 *
 * Split from `@render` deliberately. Three.js and react-three-fiber are around 300KB
 * gzipped, and a host embedding this should not pay for them before anything has even
 * checked whether the device has WebGL - nor at all, on a device that turns out not to.
 *
 * Everything importable from `@render` is free of that weight: the flat renderer, the
 * frame shapes, the feature detection, and the pure geometry. Only this entry pulls in the
 * engine of a 3D library, and it is only ever reached through a dynamic import.
 */

export { CityCanvas } from "./CityCanvas";
export type { CameraMode, CityCanvasProps } from "./CityCanvas";
export { createBuildingMaterial } from "./buildingMaterial";
export type { BuildingMaterialOptions } from "./buildingMaterial";
