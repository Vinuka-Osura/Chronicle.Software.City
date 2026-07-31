/**
 * Whether this device can draw the three-dimensional city.
 *
 * **Feature detection, not error catching.** Waiting for WebGL to throw means the viewer
 * sees a blank canvas, or a crash, before anything decides to fall back - and on the
 * devices where this actually matters, that is the whole first impression.
 *
 * The flat renderer is the answer when this returns false, and it is a shipping renderer
 * rather than an apology: it was built first, in phase 3, and the timeline was proved on it.
 */
export function supportsWebGl(): boolean {
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");

    if (context === null) return false;

    // A context can exist and still be software-rendered at two frames a second. There is
    // no reliable way to detect that, so it is not attempted here - a lie dressed as a
    // check is worse than no check.
    return true;
  } catch {
    return false;
  }
}
