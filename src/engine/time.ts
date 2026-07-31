/**
 * Epoch milliseconds.
 *
 * Never a `Date`. A `Date` cannot be interpolated, and interpolation is the entire
 * mechanic: the timeline evaluates the city at ten thousand instants between two years,
 * not at six pre-built scenes.
 */
export type Instant = number;

export const Day = 86_400_000;
export const Year = 365.2425 * Day;

/** The contract has already established this is a real `YYYY-MM-DD`; this only converts. */
export function instantFromDate(date: string): Instant {
  return Date.parse(`${date}T00:00:00Z`);
}

export function instantFromTimestamp(timestamp: string): Instant {
  return Date.parse(timestamp);
}

/** For messages and labels. The inverse of `instantFromDate`, to the day. */
export function dateFromInstant(instant: Instant): string {
  return new Date(instant).toISOString().slice(0, 10);
}

/**
 * How far through a window an elapsed duration is, from 0 to 1.
 *
 * Linear on purpose. Easing is a rendering decision - a renderer may want the last third
 * of a building to slow down - and baking a curve in here would mean two layers disagreed
 * about what "half built" meant.
 */
export function ramp(elapsed: number, window: number): number {
  if (elapsed <= 0) return 0;
  if (window <= 0) return 1;
  if (elapsed >= window) return 1;
  return elapsed / window;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
