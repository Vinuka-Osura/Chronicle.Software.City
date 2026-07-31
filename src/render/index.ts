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
