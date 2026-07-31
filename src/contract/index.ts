/**
 * The boundary with the outside world.
 *
 * Everything here describes the document format and how to refuse a bad one. It knows
 * nothing about cities, dates as instants, or rendering - those are the engine's problem,
 * and keeping them out is what lets a second producer of this format drive the same code.
 */

// Renamed at the barrel rather than in the generated file, which is never hand-edited.
// `Entity` alone is too broad a name to export from a package.
export type { CareerGraphV1 as CareerGraph, Entity as CareerEntity } from "./types";

export { parseCareerGraph, formatProblems, SupportedVersion } from "./validate";
export type { GraphProblem, ParseResult } from "./validate";
