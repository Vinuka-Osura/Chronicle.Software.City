import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityItem } from "../frame";
import { hashId } from "./city-geometry";

/**
 * What shape a building is, and why it is that shape.
 *
 * The rule this file exists to keep: **every visual difference comes from data.** A dome
 * rather than a tower has to mean something, or the city is decoration pretending to be
 * information - and a career visualiser that decorates is worse than useless, because it
 * looks like it is telling you something.
 *
 * So form is chosen from the district a building belongs to and from how big it is. A
 * district ends up with a character of its own, which is what makes a skyline legible from
 * a distance: you can tell the backend quarter from the frontend one before you can read a
 * single label.
 */

export const BuildingForms = ["block", "stepped", "round", "domed", "spire"] as const;

export type BuildingForm = (typeof BuildingForms)[number];

/**
 * Which family a district builds in.
 *
 * Derived from the district's position in the sorted list rather than its id, for the same
 * reason the colours are: two adjacent districts should not land on the same family, and a
 * hash gives no such guarantee.
 */
export function districtFamily(position: number): BuildingForm {
  const family = BuildingForms[position % BuildingForms.length];
  return family ?? "block";
}

/**
 * The form for one building.
 *
 * The district sets the family; size decides whether this particular building is the one
 * that expresses it. A district of six identical domes is as monotonous as a district of
 * six identical boxes, so only the substantial buildings take the district's form and the
 * rest are blocks - which is also how real districts look. One landmark tower, and
 * ordinary buildings around it.
 */
export function buildingForm(item: CityItem, family: BuildingForm): BuildingForm {
  if (item.speculative) return "block";

  // A quarter of the smallest buildings stay plain whatever their district, so the family
  // reads as an accent rather than as a uniform.
  const expressive = item.magnitude > 0.45 || hashId(`${item.id}:form`) > 0.62;
  return expressive ? family : "block";
}

/**
 * Unit geometry for each form: one world unit tall, centred on the origin, one unit across.
 *
 * The convention matters. The building shader works out how many storeys tall something is
 * from `position.y + 0.5` times the instance's Y scale, so every form has to agree that
 * local Y runs -0.5 to 0.5. Break that and the window rows go somewhere else.
 */
export function createFormGeometry(form: BuildingForm): BufferGeometry {
  switch (form) {
    case "block":
      return new BoxGeometry(1, 1, 1);

    case "round":
      // Twelve sides: reads as round at city scale and costs a fraction of a real cylinder.
      return new CylinderGeometry(0.5, 0.5, 1, 12);

    case "spire": {
      // Tapered, and topped with a mast. A skyline needs something that comes to a point,
      // or every silhouette ends in a horizontal line.
      const shaft = new CylinderGeometry(0.22, 0.5, 0.86, 8);
      shaft.translate(0, -0.07, 0);
      const mast = new CylinderGeometry(0.03, 0.09, 0.28, 6);
      mast.translate(0, 0.36, 0);
      return BufferGeometryUtils.mergeGeometries([shaft, mast]);
    }

    case "domed": {
      const drum = new CylinderGeometry(0.5, 0.5, 0.78, 14);
      drum.translate(0, -0.11, 0);
      // A hemisphere, scaled down vertically so it sits as a cap rather than a ball.
      const cap = new SphereGeometry(0.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 0.44, 1);
      cap.translate(0, 0.28, 0);
      return BufferGeometryUtils.mergeGeometries([drum, cap]);
    }

    case "stepped": {
      // Setbacks. The classic thing that makes a tall building read as tall rather than as
      // a long box: each stage steps in, so the eye gets three silhouettes instead of one.
      const base = new BoxGeometry(1, 0.46, 1);
      base.translate(0, -0.27, 0);
      const middle = new BoxGeometry(0.74, 0.34, 0.74);
      middle.translate(0, 0.13, 0);
      const top = new BoxGeometry(0.48, 0.2, 0.48);
      top.translate(0, 0.4, 0);
      return BufferGeometryUtils.mergeGeometries([base, middle, top]);
    }
  }
}
