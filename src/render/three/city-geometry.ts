import type { CityBounds, CityItem, CityPlot } from "../frame";

/**
 * The arithmetic behind the scene, kept out of the components.
 *
 * Everything here is a pure function of numbers, so it is testable without a GPU, a canvas
 * or a browser - which matters because these are the values that are wrong when a building
 * is the wrong height or the camera ends up inside one, and none of that is diagnosable by
 * looking at a picture.
 */

/** World units of height a single storey adds, before magnitude. */
const BaseStorey = 4;
/** How much more a high-magnitude capability adds per storey. */
const MagnitudeStorey = 8;

const LandmarkBase = 3;
const LandmarkMagnitude = 9;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/**
 * Height is magnitude times storeys, so seniority and repeated use compound rather than
 * competing. `storeys` already carries construction progress - it ramps from 0 - so a
 * building grows out of the ground rather than appearing at full height.
 */
export function buildingHeight(magnitude: number, storeys: number): number {
  return (BaseStorey + MagnitudeStorey * magnitude) * Math.max(storeys, 0);
}

export function buildingBox(item: CityItem, plot: CityPlot, storeys: number): Box {
  const height = buildingHeight(item.magnitude, storeys);
  const side = plot.footprint * (0.55 + 0.45 * item.magnitude);

  return {
    x: plot.x,
    // Boxes are centred on their origin, so half the height puts the base on the ground.
    // A building sunk into the ground is the cheapest way to look broken.
    y: height / 2,
    z: plot.z,
    width: side,
    height,
    depth: side,
  };
}

export function landmarkHeight(magnitude: number, construction: number): number {
  return (LandmarkBase + LandmarkMagnitude * magnitude) * Math.max(construction, 0);
}

export interface CameraFrame {
  readonly target: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly minDistance: number;
  readonly maxDistance: number;
}

/**
 * Where the camera starts and how far it may travel.
 *
 * Derived from the layout bounds, which do not depend on the date - so the camera has
 * nothing to lurch toward as the city grows, and the opening shot of a career is framed
 * the same whether the timeline opens in 2019 or 2035.
 */
export function cameraFrame(bounds: CityBounds): CameraFrame {
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreZ = (bounds.minZ + bounds.maxZ) / 2;

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1);
  const radius = Math.max(Math.hypot(width, depth) / 2, 20);

  return {
    target: [centreX, 0, centreZ],
    // Off to one side and above rather than straight down: a plan view hides the one thing
    // three dimensions were chosen for.
    position: [centreX + radius * 0.9, radius * 0.75, centreZ + radius * 1.1],
    // Close enough to stand among the buildings, which is where phase 5 takes over.
    minDistance: 6,
    maxDistance: radius * 4,
  };
}

/** Just short of the horizon: at exactly a right angle the ground plane z-fights. */
const HorizonLimit = Math.PI / 2 - 0.035;

/**
 * How far down the camera may swing.
 *
 * Clamped above the horizon while there is nothing underground, because a camera below an
 * empty map shows the viewer the backs of polygons - which reads as a bug, being one.
 *
 * Gated on the data rather than hard-coded. When the underground layer arrives - sewers,
 * water, power, fibre, the metro - the constraint lifts because there is finally something
 * down there, rather than because somebody remembered to come back and find this line.
 */
export function maxPolarAngle(hasUnderground: boolean): number {
  return hasUnderground ? Math.PI - 0.05 : HorizonLimit;
}

/**
 * A hue per district, spread around the wheel and stable for the session.
 *
 * Keyed on the district's position in a sorted list rather than on a hash of its id: a hash
 * gives two adjacent districts near-identical colours often enough to matter, and the
 * producer's ids are not ours to read meaning from anyway.
 */
export function districtHue(position: number, total: number): number {
  const spread = Math.max(total, 1);
  // Offset so the first district is a blue rather than a red: the eye reads the first
  // colour as the default, and a city of red buildings reads as alarming.
  return (0.58 + position / spread) % 1;
}

export interface Bounds2 {
  readonly centreX: number;
  readonly centreZ: number;
  readonly radius: number;
}

export function boundsCircle(bounds: CityBounds): Bounds2 {
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreZ = (bounds.minZ + bounds.maxZ) / 2;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1);

  return { centreX, centreZ, radius: Math.hypot(width, depth) / 2 };
}
