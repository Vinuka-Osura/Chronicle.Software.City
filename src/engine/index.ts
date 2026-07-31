/**
 * The engine: what exists at a date.
 *
 * This is the product. Everything downstream is drawing, and nothing in here knows what a
 * mesh is - which is enforced by lint rather than intention (see CLAUDE.md).
 */

export { compileGraph } from "./compile";
export type {
  CareerSpan,
  CompileOptions,
  CompiledEntity,
  CompiledGraph,
  EntityKind,
} from "./compile";

export { createClock } from "./clock";
export type { ClockOptions, TimelineClock } from "./clock";

export { layout } from "./layout";
export type { Bounds, DistrictArea, Layout, Plot, Point } from "./layout";

export { Phase, createWorldState, stateById, stateOf, worldAt } from "./world";
export type { EntityState, PhaseValue, WorldState } from "./world";

export { Day, Year, clamp01, dateFromInstant, instantFromDate, ramp } from "./time";
export type { Instant } from "./time";
