import { describe, expect, it } from "vitest";
import type { CityItem } from "../frame";
import { BuildingForms, buildingForm, createFormGeometry, districtFamily } from "./forms";

function item(overrides: Partial<CityItem> = {}): CityItem {
  return {
    id: "a",
    index: 0,
    kind: "building",
    label: "A",
    magnitude: 0.8,
    speculative: false,
    ...overrides,
  };
}

describe("shape comes from data, never from decoration", () => {
  it("gives the same building the same shape every time", () => {
    // A city that rearranged its own silhouettes between reloads would be telling the
    // viewer something different each visit, which is the opposite of the point.
    expect(buildingForm(item({ id: "x" }), "domed")).toBe(
      buildingForm(item({ id: "x" }), "domed"),
    );
  });

  it("gives a district its own character, so a skyline is legible before any label is", () => {
    const families = [0, 1, 2, 3, 4].map(districtFamily);

    expect(new Set(families).size).toBe(5);
  });

  it("lets a substantial building express its district", () => {
    expect(buildingForm(item({ magnitude: 0.9 }), "spire")).toBe("spire");
  });

  it("keeps a district from becoming a row of identical domes", () => {
    // Six identical domes is as monotonous as six identical boxes. Only the substantial
    // buildings take the family, which is also how real districts look: one landmark
    // tower and ordinary buildings around it.
    const smalls = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
      buildingForm(item({ id, magnitude: 0.1 }), "domed"),
    );

    expect(smalls).toContain("block");
    expect(new Set(smalls).size).toBeGreaterThan(1);
  });

  it("never gives a goal anything but the plainest shape", () => {
    // A goal is drawn as a wireframe and must not compete with the built city for the
    // eye. An ornate silhouette would be exactly that competition.
    for (const family of BuildingForms) {
      expect(buildingForm(item({ magnitude: 1, speculative: true }), family)).toBe("block");
    }
  });
});

describe("every form agrees about its own dimensions", () => {
  it.each(BuildingForms)("%s is one unit tall and centred on the origin", (form) => {
    // The building shader works out how many storeys tall something is from
    // `position.y + 0.5` times the instance's Y scale. Break this convention on one form
    // and its window rows land somewhere else entirely.
    const geometry = createFormGeometry(form);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null) throw new Error(`${form} has no bounding box`);

    expect(box.min.y).toBeCloseTo(-0.5, 2);
    expect(box.max.y).toBeCloseTo(0.5, 2);
  });

  it.each(BuildingForms)("%s fits inside a unit footprint", (form) => {
    // Scaling assumes a unit cross-section. A form wider than one unit would overhang its
    // plot and lean into the street.
    const geometry = createFormGeometry(form);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null) throw new Error(`${form} has no bounding box`);

    expect(box.max.x - box.min.x).toBeLessThanOrEqual(1.001);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(1.001);
  });

  it.each(BuildingForms)("%s has geometry to draw", (form) => {
    expect(createFormGeometry(form).getAttribute("position").count).toBeGreaterThan(0);
  });
});
