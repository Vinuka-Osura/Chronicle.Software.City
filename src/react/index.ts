/**
 * The composition layer, and the package's public surface.
 *
 * The only layer allowed to see the engine and the renderers at once, which is what lets
 * it join them - and why the joining lives here rather than leaking into either side.
 */

export { SoftwareCity } from "./SoftwareCity";
export type { CityControls, SoftwareCityProps } from "./SoftwareCity";

export { toCityFrame, toCityModel } from "./model";
