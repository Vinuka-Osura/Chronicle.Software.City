import { describe, expect, it } from "vitest";
import { chooseQuality, settingsFor } from "./quality";
import type { DeviceHints, QualityTier } from "./quality";

function device(overrides: Partial<DeviceHints> = {}): DeviceHints {
  return { cores: 8, memory: 8, touch: false, pixelRatio: 1, width: 1440, ...overrides };
}

describe("choosing what a device can afford", () => {
  it("gives a desktop with real hardware everything", () => {
    expect(chooseQuality(device())).toBe("high");
  });

  it("never gives a phone the top tier, however many cores it claims", () => {
    // High-core-count phones are exactly the ones with the most pixels to push, so the
    // core count is the least useful number on the page.
    expect(chooseQuality(device({ touch: true, width: 390, cores: 8, memory: 8 }))).toBe(
      "medium",
    );
  });

  it("gives a modest phone the plainest city", () => {
    expect(chooseQuality(device({ touch: true, width: 360, cores: 4, memory: 3 }))).toBe("low");
  });

  it("treats a touch laptop as a laptop, because it is one", () => {
    expect(chooseQuality(device({ touch: true, width: 1512 }))).toBe("high");
  });

  it("steps down for a weak machine whatever its screen", () => {
    expect(chooseQuality(device({ cores: 2 }))).toBe("low");
    expect(chooseQuality(device({ memory: 2 }))).toBe("low");
    expect(chooseQuality(device({ cores: 4 }))).toBe("medium");
  });

  it("steps down for an enormous high-density display", () => {
    // A lot of fragments even on a good machine.
    expect(chooseQuality(device({ pixelRatio: 3, width: 2560 }))).toBe("medium");
  });

  it("assumes the middle when the browser refuses to say", () => {
    // Safari reports neither. Guessing "low" would punish every Mac; guessing "high"
    // would punish every iPhone.
    expect(chooseQuality(device({ cores: undefined, memory: undefined }))).toBe("medium");
  });

  it("errs downward rather than upward", () => {
    // A device that could have handled more loses some window lights. A device that could
    // not loses the whole product.
    const borderline = chooseQuality(device({ cores: 4, memory: 4 }));

    expect(borderline).not.toBe("high");
  });
});

describe("what each tier actually turns off", () => {
  it("drops shadows first, because they cost a whole extra pass", () => {
    expect(settingsFor("low").shadows).toBe(false);
    expect(settingsFor("medium").shadows).toBe(true);
  });

  it("never renders more than twice the pixels, even at the top", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      expect(settingsFor(tier).maxPixelRatio).toBeLessThanOrEqual(2);
    }
  });

  it("gets cheaper monotonically", () => {
    const order: QualityTier[] = ["low", "medium", "high"];
    const settings = order.map(settingsFor);

    for (const [index, current] of settings.entries()) {
      if (index === 0) continue;
      const previous = settings[index - 1];
      if (previous === undefined) continue;

      expect(current.shadowMapSize).toBeGreaterThanOrEqual(previous.shadowMapSize);
      expect(current.maxPixelRatio).toBeGreaterThanOrEqual(previous.maxPixelRatio);
    }
  });

  it("still draws a city at the bottom tier, just a plainer one", () => {
    // The point of a tier is a plainer city, never a broken one. Nothing here removes a
    // building, a road or a goal.
    const low = settingsFor("low");

    expect(low.tier).toBe("low");
    expect(low.windows).toBe(false);
    expect(low.construction).toBe(false);
  });
});
