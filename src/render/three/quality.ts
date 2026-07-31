/**
 * How much city this device can afford.
 *
 * The frame budget is measured against a mid-range phone, because that is the device a
 * recruiter is holding - not the machine this was built on. A weak device should get a
 * plainer city, never a broken one and never a slideshow.
 *
 * The choice is a pure function of hints so it can be tested, and so a host can override
 * it outright. Guessing wrong and being unable to say so is worse than guessing at all.
 */

export type QualityTier = "high" | "medium" | "low";

export interface DeviceHints {
  /** `navigator.hardwareConcurrency`, when the browser admits to it. */
  readonly cores?: number | undefined;
  /** `navigator.deviceMemory` in GB. Chromium only, and coarse. */
  readonly memory?: number | undefined;
  /** A touch primary input is the strongest signal available that this is a phone. */
  readonly touch: boolean;
  readonly pixelRatio: number;
  /** Viewport width in CSS pixels. */
  readonly width: number;
}

export interface QualitySettings {
  readonly tier: QualityTier;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Upper bound on device pixel ratio. */
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  /** Lit windows in the building shader. */
  readonly windows: boolean;
  /** Scaffolding and cranes on anything under construction. */
  readonly construction: boolean;
}

/**
 * There is no reliable way to ask a browser how fast its GPU is - the extension that used
 * to tell you was removed for fingerprinting, and it lied about mobile chips anyway. So
 * this reads the things that *are* honest and correlates them, and stays deliberately
 * conservative: a phone that could have handled "high" and gets "medium" loses some window
 * lights, while a phone that gets "high" and cannot handle it loses the whole product.
 */
export function chooseQuality(hints: DeviceHints): QualityTier {
  const cores = hints.cores ?? 4;
  const memory = hints.memory ?? 4;

  // A narrow viewport with touch is a phone, whatever it claims about its cores - and the
  // high-core-count phones are exactly the ones with the most pixels to push.
  if (hints.touch && hints.width < 820) {
    return cores >= 8 && memory >= 6 ? "medium" : "low";
  }

  if (cores <= 2 || memory <= 2) return "low";
  if (cores <= 4 || memory <= 4) return "medium";

  // A high pixel ratio on a large display is a lot of fragments even on a good machine.
  if (hints.pixelRatio >= 3 && hints.width >= 1600) return "medium";

  return "high";
}

export function settingsFor(tier: QualityTier): QualitySettings {
  switch (tier) {
    case "low":
      return {
        tier,
        // The first thing to go. Shadow maps cost a whole extra pass over the scene, and
        // the hemisphere light still gives shape without them.
        shadows: false,
        shadowMapSize: 512,
        maxPixelRatio: 1,
        antialias: false,
        windows: false,
        construction: false,
      };
    case "medium":
      return {
        tier,
        shadows: true,
        shadowMapSize: 1024,
        maxPixelRatio: 1.5,
        antialias: true,
        windows: true,
        construction: true,
      };
    case "high":
      return {
        tier,
        shadows: true,
        shadowMapSize: 2048,
        // Capped at 2 even here: past that a display renders four times the pixels for a
        // difference nobody can see.
        maxPixelRatio: 2,
        antialias: true,
        windows: true,
        construction: true,
      };
  }
}

/** Reads the hints this browser is willing to give. */
export function readDeviceHints(): DeviceHints {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { touch: false, pixelRatio: 1, width: 1280 };
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  return {
    cores: navigator.hardwareConcurrency,
    memory,
    touch: window.matchMedia("(pointer: coarse)").matches,
    pixelRatio: window.devicePixelRatio,
    width: window.innerWidth,
  };
}

export function detectQuality(): QualitySettings {
  return settingsFor(chooseQuality(readDeviceHints()));
}
