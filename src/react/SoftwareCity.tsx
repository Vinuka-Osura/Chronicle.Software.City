import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { formatProblems, parseCareerGraph } from "@contract";
import type { GraphProblem } from "@contract";
import {
  compileGraph,
  createClock,
  createWorldState,
  layout,
  worldAt,
} from "@engine";
import type { CareerSpan, CompileOptions, TimelineClock } from "@engine";
import { CityCanvas, renderCitySvg, supportsWebGl } from "@render";
import type { CityFrame } from "@render";
import { toCityFrame, toCityModel } from "./model";

/**
 * The package's public surface: a career graph in, a city out.
 *
 * **It takes a prop and never fetches.** Getting the JSON is the application's job -
 * fetching drags in opinions about auth, CORS, retries and caching that belong to whoever
 * is embedding this, not to a renderer.
 */
export interface SoftwareCityProps {
  /** Any document conforming to career-graph v1. Validated here, at the boundary. */
  readonly graph: unknown;
  readonly className?: string;
  readonly compile?: CompileOptions;
  /** Force the flat renderer. Useful for tests, print, and seeing what the fallback does. */
  readonly flat?: boolean;
  readonly onProblems?: (problems: readonly GraphProblem[]) => void;
  /** Called on every change of the rendered date, for a host's own timeline UI. */
  readonly onDateChange?: (at: number) => void;
  /**
   * Handed the timeline once a graph has been accepted.
   *
   * The component owns the clock because the clock has to run inside the render loop, but
   * the *scrubber* belongs to whoever is embedding this - their design system, their
   * layout, their idea of what a timeline looks like. A renderer that shipped its own
   * chrome would be a renderer nobody could fit into a page.
   */
  readonly onReady?: (controls: CityControls) => void;
}

export interface CityControls {
  readonly clock: TimelineClock;
  readonly span: CareerSpan;
  /** When the document was produced - the "today" mark on a scrubber. */
  readonly generatedAt: number;
  readonly subject: {
    readonly name: string;
    readonly headline: string | null;
    readonly url: string | null;
  };
  readonly entityCount: number;
}

interface Ready {
  readonly kind: "ready";
  readonly graph: ReturnType<typeof compileGraph>;
  readonly model: ReturnType<typeof toCityModel>;
  readonly clock: TimelineClock;
  readonly frame: { current: CityFrame };
}

interface Refused {
  readonly kind: "refused";
  readonly message: string;
}

function prepare(
  input: unknown,
  options: CompileOptions,
  reducedMotion: boolean,
  onProblems: ((problems: readonly GraphProblem[]) => void) | undefined,
): Ready | Refused {
  const result = parseCareerGraph(input);

  if (!result.ok) {
    onProblems?.(result.problems);
    return {
      kind: "refused",
      message:
        result.reason === "unsupported-version"
          ? formatProblems(result.problems)
          : `This career graph could not be read.\n${formatProblems(result.problems)}`,
    };
  }

  if (result.warnings.length > 0) onProblems?.(result.warnings);

  const compiled = compileGraph(result.graph, options);
  const world = createWorldState(compiled.entities.length);
  const clock = createClock({ span: compiled.span, reducedMotion });

  worldAt(compiled, clock.rendered, world);

  return {
    kind: "ready",
    graph: compiled,
    model: toCityModel(compiled, layout(compiled)),
    clock,
    frame: { current: toCityFrame(world) },
  };
}

export function SoftwareCity({
  graph,
  className,
  compile = {},
  flat = false,
  onProblems,
  onDateChange,
  onReady,
}: SoftwareCityProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();

  // Feature detection rather than catching a failure: by the time WebGL throws, the viewer
  // has already seen a blank rectangle.
  const [webgl] = useState(() => supportsWebGl());

  const state = useMemo(
    () => prepare(graph, compile, reducedMotion, onProblems),
    // onProblems is deliberately not a dependency: a caller passing an inline arrow would
    // otherwise recompile the whole career on every render of their component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, compile, reducedMotion],
  );

  useEffect(() => {
    if (state.kind !== "ready" || onReady === undefined) return;

    onReady({
      clock: state.clock,
      span: state.graph.span,
      generatedAt: state.graph.generatedAt,
      subject: state.graph.subject,
      entityCount: state.graph.entities.length,
    });
  }, [state, onReady]);

  if (state.kind === "refused") {
    return (
      <div className={className} role="alert">
        <pre>{state.message}</pre>
      </div>
    );
  }

  if (flat || !webgl) {
    return <FlatCity className={className} state={state} onDateChange={onDateChange} />;
  }

  return (
    <div className={className}>
      <CityCanvas model={state.model} frame={state.frame}>
        <ClockDriver state={state} onDateChange={onDateChange} />
      </CityCanvas>
    </div>
  );
}

/**
 * Advances the clock and recomputes the world, inside the render loop.
 *
 * It writes into the same buffer every frame and never sets React state, because
 * re-rendering a component tree sixty times a second to move some numbers is the slow way
 * of doing exactly the same work.
 */
function ClockDriver({
  state,
  onDateChange,
}: {
  readonly state: Ready;
  readonly onDateChange: ((at: number) => void) | undefined;
}): null {
  useFrame((_, delta) => {
    if (!state.clock.advance(Math.min(delta, 0.1))) return;

    worldAt(state.graph, state.clock.rendered, state.frame.current);
    onDateChange?.(state.clock.rendered);
  });

  return null;
}

/** The flat renderer, for no WebGL - and it was built first, so it is not an apology. */
function FlatCity({
  className,
  state,
  onDateChange,
}: {
  readonly className: string | undefined;
  readonly state: Ready;
  readonly onDateChange: ((at: number) => void) | undefined;
}): JSX.Element {
  const [markup, setMarkup] = useState(() =>
    renderCitySvg(state.model, state.frame.current),
  );

  useEffect(() => {
    let running = true;
    let previous = performance.now();

    const step = (now: number): void => {
      if (!running) return;
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;

      if (state.clock.advance(delta)) {
        worldAt(state.graph, state.clock.rendered, state.frame.current);
        setMarkup(renderCitySvg(state.model, state.frame.current));
        onDateChange?.(state.clock.rendered);
      }
      requestAnimationFrame(step);
    };

    const handle = requestAnimationFrame(step);
    return () => {
      running = false;
      cancelAnimationFrame(handle);
    };
  }, [state, onDateChange]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

const ReducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const media = window.matchMedia(ReducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function readMotionPreference(): boolean {
  return typeof window === "undefined" ? false : window.matchMedia(ReducedMotionQuery).matches;
}

/**
 * Read as an external store rather than mirrored into state by an effect.
 *
 * The effect version renders once with the wrong answer and then corrects itself, which
 * for this particular preference means a visitor who asked for no animation gets one frame
 * of it. It also needs a server snapshot, and this has one - false, because a server has
 * no preference to report and guessing "reduce" would strip the animation for everybody
 * on the first paint of a server-rendered page.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToMotionPreference, readMotionPreference, () => false);
}
