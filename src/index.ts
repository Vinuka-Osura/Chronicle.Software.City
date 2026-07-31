/**
 * The package.
 *
 * A career graph in, an explorable city out. The component takes a `graph` prop and never
 * fetches - getting the JSON is the application's job, because fetching carries opinions
 * about auth, CORS, retries and caching that belong to whoever is embedding this.
 *
 * The engine is exported alongside the component, deliberately. Somebody who wants to know
 * what existed on a date without drawing anything - a résumé generator, a report, a test -
 * should not have to run a renderer to find out.
 */

export { SoftwareCity, toCityFrame, toCityModel } from "./react/index";
export type { CityControls, SoftwareCityProps } from "./react/index";

export {
  compileGraph,
  createClock,
  createWorldState,
  dateFromInstant,
  instantFromDate,
  layout,
  Phase,
  stateById,
  stateOf,
  worldAt,
} from "./engine/index";
export type {
  CareerSpan,
  CompiledEntity,
  CompiledGraph,
  CompileOptions,
  EntityState,
  Instant,
  Layout,
  Plot,
  TimelineClock,
  WorldState,
} from "./engine/index";

export { formatProblems, parseCareerGraph, SupportedVersion } from "./contract/index";
export type { CareerEntity, CareerGraph, GraphProblem, ParseResult } from "./contract/index";

export { renderCitySvg, supportsWebGl } from "./render/index";
export type { CityFrame, CityModel, CityPick, QualitySettings } from "./render/index";
