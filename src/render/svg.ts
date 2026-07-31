import { ItemPhase } from "./frame";
import type { CityFrame, CityItem, CityModel, CityPoint } from "./frame";

/**
 * The flat renderer. Top-down, deliberately ugly.
 *
 * This is the step that is tempting to skip and the one that saves the week: if the
 * timeline, the layout or the lifecycle logic are wrong, that is discoverable in an
 * afternoon rather than after three days of camera and lighting work.
 *
 * It then ships, permanently, as the WebGL fallback. WebGL fails on plenty of real
 * devices, and a fallback that was built as a debugging view is a fallback that is not an
 * apology.
 *
 * Height cannot be shown from directly above, so the two things height would have carried
 * are shown another way: construction grows a building's footprint out of the ground, and
 * storeys deepen its fill. Both are legible in a still frame, which matters because a
 * still frame is what somebody screenshots.
 */

export interface SvgOptions {
  readonly padding?: number;
  /** Label districts and landmarks. Buildings stay unlabelled; 40 of them is a fog. */
  readonly labels?: boolean;
}

const DefaultPadding = 40;

/** Anything drawn from a producer's data is untrusted text. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function polyline(points: readonly CityPoint[]): string {
  return points.map((point) => `${round(point.x)},${round(point.z)}`).join(" ");
}

interface Drawn {
  readonly phase: number;
  readonly construction: number;
  readonly storeys: number;
  readonly decay: number;
  readonly blueprint: number;
}

function read(frame: CityFrame, index: number): Drawn {
  return {
    phase: frame.phase[index] ?? ItemPhase.Absent,
    construction: frame.construction[index] ?? 0,
    storeys: frame.storeys[index] ?? 0,
    decay: frame.decay[index] ?? 0,
    blueprint: frame.blueprint[index] ?? 0,
  };
}

function buildingMarkup(item: CityItem, drawn: Drawn, model: CityModel): string {
  const plot = model.plots.get(item.id);
  if (plot === undefined) return "";

  const full = plot.footprint * (0.45 + 0.55 * item.magnitude);

  if (drawn.blueprint > 0) {
    // Never filled, always dashed. A goal must not be mistakable for an achievement in a
    // glance, in a screenshot, or by somebody who cannot distinguish the two colours.
    const half = full / 2;
    return (
      `<rect class="blueprint" x="${round(plot.x - half)}" y="${round(plot.z - half)}" ` +
      `width="${round(full)}" height="${round(full)}" />`
    );
  }

  // Grows out of the ground rather than appearing at full size. From above, this is the
  // only cue that construction is a duration rather than an event.
  const side = full * drawn.construction;
  if (side <= 0) return "";

  const half = side / 2;
  const density = Math.min(1, drawn.storeys / 4);
  const opacity = 0.35 + 0.55 * density;

  return (
    `<rect class="${drawn.decay > 0 ? "building retired" : "building"}" ` +
    `x="${round(plot.x - half)}" y="${round(plot.z - half)}" ` +
    `width="${round(side)}" height="${round(side)}" ` +
    `fill-opacity="${round(opacity * (1 - 0.6 * drawn.decay))}" />`
  );
}

function landmarkMarkup(item: CityItem, drawn: Drawn, model: CityModel, labels: boolean): string {
  const plot = model.plots.get(item.id);
  if (plot === undefined) return "";

  const radius = (plot.footprint / 2) * (0.5 + 0.5 * item.magnitude) * drawn.construction;
  if (radius <= 0) return "";

  const marker =
    `<circle class="${drawn.decay > 0 ? "landmark retired" : "landmark"}" ` +
    `cx="${round(plot.x)}" cy="${round(plot.z)}" r="${round(radius)}" />`;

  if (!labels) return marker;

  // Landmarks sit shoulder to shoulder along one axis, so full labels at this scale
  // overlap into an unreadable band - which would cost this view the only thing it is
  // for. Alternated above and below, and clipped.
  const above = item.index % 2 === 0;
  const offset = radius + 4;

  return (
    marker +
    `<text class="label" x="${round(plot.x)}" y="${round(above ? plot.z - offset : plot.z + offset + 3)}">` +
    `${escapeXml(truncate(item.label, 22))}</text>`
  );
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function roadMarkup(item: CityItem, drawn: Drawn, model: CityModel): string {
  const path = model.roads.get(item.id);
  if (path === undefined || path.length < 2) return "";

  // Roads extend rather than appear, so a partly-built project is a road part of the way
  // across the city rather than a whole one at low opacity.
  const drawnPoints = extend(path, drawn.construction);
  if (drawnPoints.length < 2) return "";

  return (
    `<polyline class="${drawn.decay > 0 ? "road retired" : "road"}" ` +
    `points="${polyline(drawnPoints)}" ` +
    `stroke-width="${round(1 + 2.5 * item.magnitude)}" ` +
    `stroke-opacity="${round(1 - 0.65 * drawn.decay)}" />`
  );
}

/** The first `fraction` of a polyline by length, so a road grows end to end. */
function extend(path: readonly CityPoint[], fraction: number): readonly CityPoint[] {
  if (fraction >= 1) return path;
  if (fraction <= 0) return [];

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (previous === undefined || current === undefined) continue;
    const segment = Math.hypot(current.x - previous.x, current.z - previous.z);
    lengths.push(segment);
    total += segment;
  }

  if (total === 0) return path;

  const wanted = total * fraction;
  const result: CityPoint[] = [];
  const first = path[0];
  if (first !== undefined) result.push(first);

  let travelled = 0;
  for (const [index, segment] of lengths.entries()) {
    const previous = path[index];
    const current = path[index + 1];
    if (previous === undefined || current === undefined) break;

    if (travelled + segment <= wanted) {
      result.push(current);
      travelled += segment;
      continue;
    }

    const along = segment === 0 ? 0 : (wanted - travelled) / segment;
    result.push({
      x: previous.x + (current.x - previous.x) * along,
      z: previous.z + (current.z - previous.z) * along,
    });
    break;
  }

  return result;
}

export function renderCitySvg(
  model: CityModel,
  frame: CityFrame,
  options: SvgOptions = {},
): string {
  const padding = options.padding ?? DefaultPadding;
  const labels = options.labels ?? true;

  const { minX, maxX, minZ, maxZ } = model.bounds;
  const width = Math.max(maxX - minX, 1) + padding * 2;
  const height = Math.max(maxZ - minZ, 1) + padding * 2;

  // Computed from the time-invariant layout, so the view never jumps as the city grows.
  const viewBox = `${round(minX - padding)} ${round(minZ - padding)} ${round(width)} ${round(height)}`;

  const districts: string[] = [];
  const roads: string[] = [];
  const structures: string[] = [];

  for (const item of model.items) {
    const drawn = read(frame, item.index);
    if (drawn.phase === ItemPhase.Absent) continue;

    switch (item.kind) {
      case "district": {
        const area = model.districts.get(item.id);
        if (area === undefined) break;
        districts.push(
          `<circle class="district" cx="${round(area.x)}" cy="${round(area.z)}" r="${round(area.radius)}" />` +
            (labels
              ? `<text class="label district-label" x="${round(area.x)}" y="${round(area.z - area.radius - 5)}">${escapeXml(item.label)}</text>`
              : ""),
        );
        break;
      }
      case "road":
        roads.push(roadMarkup(item, drawn, model));
        break;
      case "landmark":
        structures.push(landmarkMarkup(item, drawn, model, labels));
        break;
      case "building":
        structures.push(buildingMarkup(item, drawn, model));
        break;
    }
  }

  // Districts under roads under structures, so a building is never hidden by the ground it
  // stands on.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="city">` +
    `<g class="districts">${districts.join("")}</g>` +
    `<g class="roads">${roads.join("")}</g>` +
    `<g class="structures">${structures.join("")}</g>` +
    `</svg>`
  );
}
