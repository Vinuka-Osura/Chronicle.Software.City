import type { CareerSpan } from "./compile";
import type { Instant } from "./time";

/**
 * Two clocks, which is what makes dragging *play* the construction instead of teleporting.
 *
 * The concept doc's rule is easy to state and easy to implement wrongly, because a pointer
 * can move six years in 200ms. So:
 *
 * - **target** follows the pointer exactly, with no lag. Input that lags feels broken, and
 *   no amount of smoothing elsewhere makes up for it.
 * - **rendered** is what the city is drawn at, and eases toward the target.
 *
 * Drag hard and the pointer arrives at 2030 immediately while the city spends the next
 * second building its way there. No scroll-hijacking, no animation queue, no interpolating
 * between snapshots - a first-order follow on a single scalar. Playback falls out for
 * free: it moves the target at a constant rate and the same follow does the rest.
 */
export interface ClockOptions {
  readonly span: CareerSpan;
  /** Where the timeline opens. Defaults to the end, which is "today" for most careers. */
  readonly at?: Instant;
  /**
   * Stop the follow entirely, so the city cuts to the target. Set from
   * `prefers-reduced-motion`: the rule is stop, not merely shorten.
   */
  readonly reducedMotion?: boolean;
  /** Real seconds to cross the whole career at playback speed. */
  readonly playbackSeconds?: number;
  /** Time constant of the follow, in real seconds. Larger is heavier. */
  readonly followSeconds?: number;
}

const DefaultPlaybackSeconds = 20;
const DefaultFollowSeconds = 0.28;

/** Below a day apart, snap. Otherwise the follow chases an asymptote for ever. */
const SettleThreshold = 86_400_000 / 24;

export interface TimelineClock {
  readonly span: CareerSpan;
  /** Where the pointer is. */
  readonly target: Instant;
  /** What the city is drawn at. */
  readonly rendered: Instant;
  readonly playing: boolean;
  /** True while the city is still catching up. */
  readonly settled: boolean;

  /** Drag or scrub: move the target and let the city follow. */
  seek: (at: Instant) => void;
  /** Move both at once, with no construction played. For a first load. */
  jump: (at: Instant) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 0 to 1 across the span, for a scrubber's thumb. */
  progress: () => number;
  seekProgress: (fraction: number) => void;

  /**
   * Advance by a real-time delta. Returns whether anything actually moved, so a caller can
   * skip a redraw - and, in three dimensions, skip writing to the GPU.
   */
  advance: (deltaSeconds: number) => boolean;
}

function clampToSpan(at: Instant, span: CareerSpan): Instant {
  if (at < span.from) return span.from;
  if (at > span.to) return span.to;
  return at;
}

export function createClock(options: ClockOptions): TimelineClock {
  const { span } = options;
  const playbackSeconds = options.playbackSeconds ?? DefaultPlaybackSeconds;
  const followSeconds = options.followSeconds ?? DefaultFollowSeconds;
  const reducedMotion = options.reducedMotion ?? false;

  let target = clampToSpan(options.at ?? span.to, span);
  let rendered = target;
  let playing = false;

  const clock: TimelineClock = {
    span,
    get target() {
      return target;
    },
    get rendered() {
      return rendered;
    },
    get playing() {
      return playing;
    },
    get settled() {
      return rendered === target;
    },

    seek(at) {
      target = clampToSpan(at, span);
      if (reducedMotion) rendered = target;
    },

    jump(at) {
      target = clampToSpan(at, span);
      rendered = target;
    },

    play() {
      // Replaying from the end would look broken: the city is already finished, so
      // pressing play would do nothing at all.
      if (target >= span.to) {
        target = span.from;
        rendered = span.from;
      }
      playing = true;
    },

    pause() {
      playing = false;
    },

    toggle() {
      if (playing) clock.pause();
      else clock.play();
    },

    progress() {
      const width = span.to - span.from;
      return width <= 0 ? 0 : (rendered - span.from) / width;
    },

    seekProgress(fraction) {
      clock.seek(span.from + (span.to - span.from) * fraction);
    },

    advance(deltaSeconds) {
      const before = rendered;

      if (playing && playbackSeconds > 0) {
        target = clampToSpan(
          target + ((span.to - span.from) / playbackSeconds) * deltaSeconds,
          span,
        );
        if (target >= span.to) playing = false;
      }

      if (reducedMotion || followSeconds <= 0) {
        rendered = target;
        return rendered !== before;
      }

      const gap = target - rendered;
      if (Math.abs(gap) <= SettleThreshold) {
        rendered = target;
        return rendered !== before;
      }

      // Exponential, not `rendered += gap * 0.1`. The naive lerp moves further per frame
      // on a slow machine than a fast one, so the same drag feels different at 30fps and
      // 120fps. This depends on elapsed time, not on how often it is called. First order,
      // so it never overshoots and never oscillates.
      rendered += gap * (1 - Math.exp(-deltaSeconds / followSeconds));
      return rendered !== before;
    },
  };

  return clock;
}
