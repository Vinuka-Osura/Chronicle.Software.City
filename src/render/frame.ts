/**
 * What a renderer needs in order to draw, declared here rather than imported.
 *
 * This layer imports nothing. Not the contract, not the engine - it has never heard of a
 * career, a skill or a JSON schema, and that is the property that lets the drawing code be
 * reasoned about, replaced, or sold on its own.
 *
 * These are structurally identical to what the engine produces, so the composition layer
 * hands the very same objects straight through with no copy and no conversion. TypeScript's
 * structural typing makes the boundary free at runtime. The risk is that the two drift
 * apart silently, so `src/react/model.ts` asserts assignability at compile time - the one
 * place allowed to see both sides.
 */

/** Epoch milliseconds. */
export type FrameInstant = number;

export const ItemPhase = {
  Absent: 0,
  UnderConstruction: 1,
  Built: 2,
  Retired: 3,
  Blueprint: 4,
} as const;

export type ItemPhaseValue = (typeof ItemPhase)[keyof typeof ItemPhase];

/** Parallel arrays indexed by `CityItem.index`. */
export interface CityFrame {
  readonly at: FrameInstant;
  readonly count: number;
  readonly phase: Uint8Array;
  readonly construction: Float32Array;
  readonly storeys: Float32Array;
  readonly decay: Float32Array;
  readonly blueprint: Float32Array;
  readonly overdue: Float32Array;
}

export type CityItemKind = "building" | "road" | "district" | "landmark";

export interface CityItem {
  readonly id: string;
  /** Index into the frame arrays. Stable for the session. */
  readonly index: number;
  readonly kind: CityItemKind;
  readonly label: string;
  /** 0 to 1. Height for a building, width for a road. */
  readonly magnitude: number;
}

export interface CityPoint {
  readonly x: number;
  readonly z: number;
}

export interface CityPlot extends CityPoint {
  readonly footprint: number;
}

export interface CityArea extends CityPoint {
  readonly radius: number;
}

export interface CityBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * The unchanging half: where everything stands, for the whole career at once. Handed in
 * once and reused for every frame, because it does not depend on the date.
 */
export interface CityModel {
  readonly items: readonly CityItem[];
  readonly plots: ReadonlyMap<string, CityPlot>;
  readonly roads: ReadonlyMap<string, readonly CityPoint[]>;
  readonly districts: ReadonlyMap<string, CityArea>;
  readonly bounds: CityBounds;
}
