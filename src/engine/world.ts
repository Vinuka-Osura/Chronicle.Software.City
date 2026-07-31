import type { CompiledEntity, CompiledGraph } from "./compile";
import { ramp } from "./time";
import type { Instant } from "./time";

/**
 * Derived from the numbers below, not the source of truth for them.
 *
 * It exists because a test asserting "this was under construction that day" should not
 * have to compare floats, and because the flat renderer wants to pick a shape. Anything
 * that animates reads the continuous fields instead.
 */
export const Phase = {
  /** Not yet built, or - for a goal - not yet stated. Draw nothing. */
  Absent: 0,
  UnderConstruction: 1,
  Built: 2,
  /** Still standing, and past its retirement date. Never removed. */
  Retired: 3,
  /** Speculative. Never becomes any of the others, at any date. */
  Blueprint: 4,
} as const;

export type PhaseValue = (typeof Phase)[keyof typeof Phase];

/**
 * The city at one instant, as parallel arrays indexed by `CompiledEntity.index`.
 *
 * Struct-of-arrays rather than an array of objects because this is read sixty times a
 * second and copied straight into instance attributes. At that rate allocation is the
 * enemy, and an array of two hundred small objects is two hundred allocations per frame
 * plus the garbage collector's opinion about them.
 *
 * `stateOf` gives an object view for tests and for the flat renderer, where clarity is
 * worth more than the copy.
 */
export interface WorldState {
  at: Instant;
  readonly count: number;
  readonly phase: Uint8Array;
  /** 0 is bare ground, 1 is finished. */
  readonly construction: Float32Array;
  /** Grows continuously as upgrade dates are crossed. Never resets, never shrinks. */
  readonly storeys: Float32Array;
  /** Rises after retirement. Weathering and unlighting - not removal. */
  readonly decay: Float32Array;
  /** 1 for speculative entities, 0 for everything else. */
  readonly blueprint: Float32Array;
  /** For a goal whose target date has passed: how long ago, from 0 to 1. */
  readonly overdue: Float32Array;
}

export interface EntityState {
  readonly phase: PhaseValue;
  readonly construction: number;
  readonly storeys: number;
  readonly decay: number;
  readonly blueprint: number;
  readonly overdue: number;
}

export function createWorldState(count: number): WorldState {
  return {
    at: Number.NaN,
    count,
    phase: new Uint8Array(count),
    construction: new Float32Array(count),
    storeys: new Float32Array(count),
    decay: new Float32Array(count),
    blueprint: new Float32Array(count),
    overdue: new Float32Array(count),
  };
}

function writeAbsent(world: WorldState, index: number): void {
  world.phase[index] = Phase.Absent;
  world.construction[index] = 0;
  world.storeys[index] = 0;
  world.decay[index] = 0;
  world.blueprint[index] = 0;
  world.overdue[index] = 0;
}

/**
 * A goal, at an instant.
 *
 * Anchored to when the document was generated rather than to its own `built` date, which
 * for a speculative entity is a *target*. Read the other way, a goal aimed at 2028 would
 * be invisible until the scrub reached 2028 and then appear - rendering it as an
 * achievement at the moment it is least certain, and putting it in a 2019 city where it
 * had not yet been thought of.
 *
 * It never converts. A goal whose target has passed and which nobody marked done is still
 * a goal; the honest picture is a blueprint that has been standing a while, not a tower.
 */
function writeSpeculative(
  world: WorldState,
  entity: CompiledEntity,
  at: Instant,
  graph: CompiledGraph,
): void {
  if (at < graph.generatedAt) {
    writeAbsent(world, entity.index);
    return;
  }

  world.phase[entity.index] = Phase.Blueprint;
  world.construction[entity.index] = 1;
  world.storeys[entity.index] = 1;
  world.decay[entity.index] = 0;
  world.blueprint[entity.index] = 1;
  world.overdue[entity.index] = ramp(at - entity.built, graph.constructionWindow);
}

function writeBuilt(
  world: WorldState,
  entity: CompiledEntity,
  at: Instant,
  graph: CompiledGraph,
): void {
  const { index } = entity;

  if (at < entity.built) {
    writeAbsent(world, index);
    return;
  }

  const construction = ramp(at - entity.built, graph.constructionWindow);

  // Each upgrade adds a storey over its own window, so a building that was used three
  // times has three storeys arriving at three moments rather than one step of three.
  let storeys = construction;
  for (const upgrade of entity.upgraded) {
    if (at < upgrade) break;
    storeys += ramp(at - upgrade, graph.constructionWindow);
  }

  const retiredAt = entity.retired;
  const isRetired = retiredAt !== null && at >= retiredAt;

  world.phase[index] = isRetired
    ? Phase.Retired
    : construction < 1
      ? Phase.UnderConstruction
      : Phase.Built;
  world.construction[index] = construction;
  world.storeys[index] = storeys;
  world.decay[index] = isRetired ? ramp(at - retiredAt, graph.decayWindow) : 0;
  world.blueprint[index] = 0;
  world.overdue[index] = 0;
}

/**
 * The city at an instant.
 *
 * A pure function: the same graph and the same instant give the same answer, in any order,
 * with nothing accumulated between calls. That is what makes scrubbing *backwards* work as
 * well as forwards - most timeline animations quietly cannot, because they advance state
 * rather than evaluate it.
 *
 * Pass `into` on the hot path to write into an existing buffer rather than allocating one.
 */
export function worldAt(graph: CompiledGraph, at: Instant, into?: WorldState): WorldState {
  const world =
    into?.count === graph.entities.length ? into : createWorldState(graph.entities.length);

  world.at = at;

  for (const entity of graph.entities) {
    if (entity.speculative) {
      writeSpeculative(world, entity, at, graph);
    } else {
      writeBuilt(world, entity, at, graph);
    }
  }

  return world;
}

/** An object view of one entity, for tests and the flat renderer. */
export function stateOf(world: WorldState, index: number): EntityState {
  return {
    phase: (world.phase[index] ?? Phase.Absent) as PhaseValue,
    construction: world.construction[index] ?? 0,
    storeys: world.storeys[index] ?? 0,
    decay: world.decay[index] ?? 0,
    blueprint: world.blueprint[index] ?? 0,
    overdue: world.overdue[index] ?? 0,
  };
}

/** Convenience for tests and tooling; the hot path uses indices. */
export function stateById(
  graph: CompiledGraph,
  world: WorldState,
  id: string,
): EntityState | undefined {
  const entity = graph.byId.get(id);
  return entity === undefined ? undefined : stateOf(world, entity.index);
}
