import type { CompiledGraph, Layout, WorldState } from "@engine";
import type { CityFrame, CityItem, CityModel } from "@render";

/**
 * The composition layer: the one place allowed to see the engine and the renderers at
 * once, and therefore the one place that can join them.
 *
 * The renderers declare their own input shapes rather than importing the engine's, which
 * is what keeps them ignorant of careers. The cost of that is the risk of silent drift, so
 * it is paid here, at compile time.
 */

/**
 * If the engine's `WorldState` ever stops being a legal `CityFrame`, this stops compiling.
 *
 * That is the entire safety mechanism behind passing engine objects to a renderer that has
 * never heard of the engine. Without it the two definitions would wander apart and the
 * first sign would be a renderer reading a field that is no longer written.
 */
type FrameStaysCompatible = WorldState extends CityFrame ? true : never;
const _frameCompatibility: FrameStaysCompatible = true;
void _frameCompatibility;

/**
 * Builds the unchanging half of what a renderer needs.
 *
 * Called once per graph, never per frame - it depends only on the compiled graph and the
 * layout, and neither depends on the date.
 */
export function toCityModel(graph: CompiledGraph, city: Layout): CityModel {
  const items: CityItem[] = graph.entities.map((entity) => ({
    id: entity.id,
    index: entity.index,
    kind: entity.kind,
    label: entity.label,
    magnitude: entity.magnitude,
  }));

  return {
    items,
    plots: city.plots,
    roads: city.roads,
    districts: city.districts,
    bounds: city.bounds,
  };
}

/**
 * Handed straight through, with no copy.
 *
 * Sixty times a second, converting an array of two hundred entities into a second array of
 * two hundred entities is the difference between a smooth scrub and a stuttering one. The
 * shapes are identical by construction, and the assertion above is what keeps them so.
 */
export function toCityFrame(world: WorldState): CityFrame {
  return world;
}
