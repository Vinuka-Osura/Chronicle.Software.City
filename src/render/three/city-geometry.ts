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
const BaseStorey = 3.2;
/** How much more a high-magnitude capability adds per storey. */
const MagnitudeStorey = 7.5;

const LandmarkBase = 3;
const LandmarkMagnitude = 9;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Radians about Y. Small, and never zero for every building at once. */
  readonly rotation: number;
}

/**
 * A stable arbitrary number for an id.
 *
 * This is **not** reading meaning out of an id, which the engine must never do. It does not
 * care what the id says - only that the same string always yields the same number, so that
 * a building has the same proportions on every reload and for every viewer. FNV-1a because
 * it is four lines and has no collisions worth worrying about at this size.
 */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned, then to 0..1.
  return ((hash >>> 0) % 100000) / 100000;
}

export function buildingHeight(magnitude: number, storeys: number): number {
  return (BaseStorey + MagnitudeStorey * magnitude) * Math.max(storeys, 0);
}

/**
 * Footprint and orientation, varied per building.
 *
 * Identical boxes on a regular grid read as dominoes rather than as a city, and the fix is
 * not more objects - a career has a few dozen things in it and never will have more. The
 * fix is that no two of them are the same shape.
 *
 * Three cheap variations, all derived from the id so they never change between reloads:
 * the footprint is rectangular rather than square, the two sides differ from each other,
 * and the whole thing is turned a few degrees off the grid. Real streets are not perfectly
 * aligned either, and the eye notices the imperfection long before it notices the geometry.
 */
export function buildingShape(item: CityItem, plot: CityPlot): {
  width: number;
  depth: number;
  rotation: number;
} {
  const seed = hashId(item.id);
  const second = hashId(`${item.id}:d`);

  // Bigger capabilities get bigger plots, but never the whole cell - the gap between
  // buildings is what makes them read as separate buildings.
  const base = plot.footprint * (0.52 + 0.26 * item.magnitude);

  return {
    width: base * (0.78 + seed * 0.5),
    depth: base * (0.78 + second * 0.5),
    // A few degrees only. Any more and it stops reading as a grid that has settled and
    // starts reading as a mistake.
    rotation: (seed - 0.5) * 0.14,
  };
}

export function buildingBox(item: CityItem, plot: CityPlot, storeys: number): Box {
  const height = buildingHeight(item.magnitude, storeys);
  const shape = buildingShape(item, plot);

  return {
    x: plot.x,
    // Boxes are centred on their origin, so half the height puts the base on the ground.
    // A building sunk into the ground is the cheapest way to look broken.
    y: height / 2,
    z: plot.z,
    width: shape.width,
    height,
    depth: shape.depth,
    rotation: shape.rotation,
  };
}

/**
 * The wider, shorter base a tall building stands on.
 *
 * A podium is the single cheapest thing that turns a stack of boxes into a skyline: it
 * gives the tower a shoulder, breaks the vertical line, and puts something at street level
 * that is the size of a street-level thing. Only tall buildings get one, because a
 * two-storey building with a podium is just a wider two-storey building.
 */
export const PodiumThreshold = 16;
export const PodiumHeight = 4.5;

export function hasPodium(height: number): boolean {
  return height > PodiumThreshold;
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
 *
 * It starts **close**. The first version framed the whole plane from high up and far back,
 * which is the correct way to show a map and the wrong way to show a city: at that
 * distance a career's worth of buildings is a scattering of specks. Low and near, with the
 * skyline against the sky, is what a city looks like.
 */
export function cameraFrame(bounds: CityBounds): CameraFrame {
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreZ = (bounds.minZ + bounds.maxZ) / 2;

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1);
  const radius = Math.max(Math.hypot(width, depth) / 2, 18);

  return {
    target: [centreX, 0, centreZ],
    // Low and off to one side. A high angle flattens a skyline into a floor plan.
    position: [centreX + radius * 0.75, radius * 0.45, centreZ + radius * 0.95],
    // Close enough to stand among the buildings, which is where street mode takes over.
    minDistance: 6,
    maxDistance: radius * 3,
  };
}

/** Just short of the horizon: at exactly a right angle the ground plane z-fights. */
const HorizonLimit = Math.PI / 2 - 0.035;

/**
 * How far down the camera may swing.
 *
 * Clamped above the horizon, always. There is nothing beneath the map and there is not
 * going to be: an underground layer was considered and dropped, because a career is a
 * surface thing and the layer would have been a second world to build, populate and
 * explain for no gain the viewer asked for.
 *
 * So a camera below the ground would show the backs of polygons, which reads as a bug
 * because it is one.
 */
export function maxPolarAngle(): number {
  return HorizonLimit;
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
