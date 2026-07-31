import type { CareerEntity, CareerGraph } from "@contract";
import { Day, Year, clamp01, instantFromDate, instantFromTimestamp } from "./time";
import type { Instant } from "./time";

export type EntityKind = "building" | "road" | "district" | "landmark";

/**
 * An entity with every optional field resolved and every date turned into an instant.
 *
 * The validator *reports* survivable defects; this is where they are *applied*. A dangling
 * district becomes null, an upgrade dated before construction is dropped, an unresolvable
 * link becomes no link. Doing it once here means the hot path never asks "was this field
 * present?" sixty times a second.
 */
export interface CompiledEntity {
  readonly id: string;
  /** Its slot for the whole session. Instance *n* in a mesh belongs to entity *n*. */
  readonly index: number;
  readonly kind: EntityKind;
  readonly label: string;
  /** Null when absent, or when it named a district that is not in the document. */
  readonly districtId: string | null;
  readonly built: Instant;
  /** Sorted, de-duplicated, and never earlier than `built`. */
  readonly upgraded: readonly Instant[];
  readonly retired: Instant | null;
  readonly magnitude: number;
  /** Only ids that exist in the document. */
  readonly connects: readonly string[];
  readonly speculative: boolean;
  readonly href: string | null;
}

export interface CareerSpan {
  readonly from: Instant;
  readonly to: Instant;
}

export interface CompiledGraph {
  readonly entities: readonly CompiledEntity[];
  readonly byId: ReadonlyMap<string, CompiledEntity>;
  readonly span: CareerSpan;
  /**
   * When the document was produced - and therefore when everything speculative in it was
   * stated. Speculative entities are anchored to this, not to their own dates.
   */
  readonly generatedAt: Instant;
  readonly constructionWindow: number;
  readonly decayWindow: number;
  readonly subject: {
    readonly name: string;
    readonly headline: string | null;
    readonly url: string | null;
  };
}

export interface CompileOptions {
  /** Defaults to 2% of the career span, clamped to [30 days, 1 year]. */
  readonly constructionWindow?: number;
  /** Defaults to three construction windows. Weathering is slower than building. */
  readonly decayWindow?: number;
}

/**
 * Magnitude is optional in the contract, and Chronicle always sends it - which is exactly
 * why a renderer developed only against Chronicle would assume it is there.
 *
 * The default is mid-height rather than zero. Absent is not the same as zero: zero is a
 * producer saying "no size", and a building drawn at zero height is a building nobody can
 * see, which breaks the promise that nothing silently disappears.
 */
const DefaultMagnitude = 0.5;

const MinimumConstructionWindow = 30 * Day;
const MaximumConstructionWindow = Year;
const ConstructionFractionOfCareer = 0.02;

/** A career with nothing in it still needs a scrubber that can be dragged. */
const DegenerateSpanPadding = 0.5 * Year;

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function compileEntity(
  entity: CareerEntity,
  index: number,
  districtIds: ReadonlySet<string>,
  allIds: ReadonlySet<string>,
): CompiledEntity {
  const built = instantFromDate(entity.built);

  // Dropped rather than clamped to `built`. An upgrade dated before construction is a
  // producer bug, and inventing a date for it would put a storey on the building that
  // nobody asked for - quieter than the bug, and wrong in the same direction.
  const upgraded = [...new Set((entity.upgraded ?? []).map(instantFromDate))]
    .filter((instant) => instant >= built)
    .sort((a, b) => a - b);

  const retiredRaw = entity.retired == null ? null : instantFromDate(entity.retired);
  const retired = retiredRaw !== null && retiredRaw >= built ? retiredRaw : null;

  const district =
    entity.district != null && districtIds.has(entity.district) ? entity.district : null;

  return {
    id: entity.id,
    index,
    kind: entity.kind,
    label: entity.label,
    districtId: district,
    built,
    upgraded,
    retired,
    magnitude: clamp01(entity.magnitude ?? DefaultMagnitude),
    connects: (entity.connects ?? []).filter((target) => allIds.has(target)),
    speculative: entity.speculative ?? false,
    href: entity.href != null && isAbsoluteUrl(entity.href) ? entity.href : null,
  };
}

/**
 * The ends of the timeline.
 *
 * The start is the earliest thing actually built. A speculative entity never drags it
 * earlier, even when its target date is in the past: a goal is not the beginning of a
 * career, and a scrubber that opened years before anything happened would be mostly empty
 * for no reason.
 *
 * The end includes speculative targets, because a stated intention is part of the arc the
 * timeline is for.
 */
function computeSpan(entities: readonly CompiledEntity[], generatedAt: Instant): CareerSpan {
  let from = Number.POSITIVE_INFINITY;
  let to = generatedAt;

  for (const entity of entities) {
    if (!entity.speculative && entity.built < from) from = entity.built;

    if (entity.built > to) to = entity.built;
    for (const upgrade of entity.upgraded) if (upgrade > to) to = upgrade;
    if (entity.retired !== null && entity.retired > to) to = entity.retired;
  }

  if (!Number.isFinite(from)) from = generatedAt;

  if (to <= from) {
    return { from: from - DegenerateSpanPadding, to: from + DegenerateSpanPadding };
  }
  return { from, to };
}

/**
 * Turn a validated document into the form everything downstream reads.
 *
 * Called once when a graph arrives, never per frame. Every date is parsed here, every
 * optional resolved here, and every entity given the index it keeps for the session.
 */
export function compileGraph(graph: CareerGraph, options: CompileOptions = {}): CompiledGraph {
  const districtIds = new Set(
    graph.entities.filter((entity) => entity.kind === "district").map((entity) => entity.id),
  );
  const allIds = new Set(graph.entities.map((entity) => entity.id));

  const entities = graph.entities.map((entity, index) =>
    compileEntity(entity, index, districtIds, allIds),
  );

  const generatedAt = instantFromTimestamp(graph.generatedAt);
  const span = computeSpan(entities, generatedAt);

  // A fraction of the whole career rather than of the visible span: a fixed number of days
  // is invisible across twenty years, and a fraction of what is on screen would mean the
  // city changed appearance when the timeline was zoomed. Zoom is not a time machine.
  const constructionWindow =
    options.constructionWindow ??
    Math.min(
      MaximumConstructionWindow,
      Math.max(MinimumConstructionWindow, (span.to - span.from) * ConstructionFractionOfCareer),
    );

  return {
    entities,
    byId: new Map(entities.map((entity) => [entity.id, entity])),
    span,
    generatedAt,
    constructionWindow,
    decayWindow: options.decayWindow ?? constructionWindow * 3,
    subject: {
      name: graph.subject.name,
      headline: graph.subject.headline ?? null,
      url: graph.subject.url ?? null,
    },
  };
}
