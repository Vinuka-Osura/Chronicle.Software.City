/**
 * What the pointer is over.
 *
 * Deliberately just an id and a screen position. The renderer knows a box was hit and
 * which item it belongs to; it does not know what a skill is, when it was learnt, or that
 * a tooltip should say so. That is the composition layer's job, and keeping the split here
 * is what lets the tooltip be styled by whoever is embedding this rather than by us.
 */
export interface CityPick {
  readonly id: string;
  /** Index into the frame arrays, so a caller can read lifecycle without a lookup. */
  readonly index: number;
  readonly clientX: number;
  readonly clientY: number;
}
