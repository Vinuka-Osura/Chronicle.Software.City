import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type JSX,
} from "react";
import { formatProblems, parseCareerGraph } from "@contract";
import type { GraphProblem } from "@contract";
import {
  compileGraph,
  createClock,
  createWorldState,
  dateFromInstant,
  layout,
  worldAt,
} from "@engine";
import type { CareerSpan, CompileOptions, TimelineClock } from "@engine";
import { renderCitySvg, supportsWebGl } from "@render";
import type { CameraMode, CityFrame, CityPick } from "@render";
import { toCityFrame, toCityModel } from "./model";

/**
 * The three-dimensional renderer, loaded only when it is going to be used.
 *
 * Three.js and react-three-fiber are around 300KB gzipped. A host embedding this - a
 * portfolio, say - should not pay that on first paint before anything has checked for
 * WebGL, and should never pay it on a device that has none. The flat renderer stands in
 * while it arrives, which means the city is on screen either way.
 */
const CityCanvas = lazy(async () => ({
  default: (await import("@render/three")).CityCanvas,
}));

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

  return <SolidCity className={className} state={state} onDateChange={onDateChange} />;
}

function SolidCity({
  className,
  state,
  onDateChange,
}: {
  readonly className: string | undefined;
  readonly state: Ready;
  readonly onDateChange: ((at: number) => void) | undefined;
}): JSX.Element {
  const [mode, setMode] = useState<CameraMode>("orbit");
  const [pick, setPick] = useState<CityPick | null>(null);

  const advance = useCallback(
    (delta: number) => {
      if (!state.clock.advance(delta)) return;
      worldAt(state.graph, state.clock.rendered, state.frame.current);
      onDateChange?.(state.clock.rendered);
    },
    [state, onDateChange],
  );

  const details = useMemo(
    () => (pick === null ? null : describe(state, pick)),
    [pick, state],
  );

  return (
    <div className={className} style={{ position: "relative" }}>
      <Suspense fallback={<FlatCity className={undefined} state={state} onDateChange={onDateChange} />}>
        <CityCanvas
          model={state.model}
          frame={state.frame}
          mode={mode}
          onModeChange={setMode}
          onPick={setPick}
          onFrame={advance}
        />
      </Suspense>

      {details !== null && <Tooltip details={details} />}

      {mode === "street" && (
        <div className="software-city-hint" role="status">
          WASD or arrows to walk · shift to run · drag to look · scroll out or Esc to leave
        </div>
      )}
    </div>
  );
}

interface PickDetails {
  readonly label: string;
  readonly kind: string;
  readonly built: string;
  readonly upgraded: string | null;
  readonly retired: string | null;
  readonly speculative: boolean;
  readonly href: string | null;
  readonly x: number;
  readonly y: number;
}

/**
 * What a tooltip says.
 *
 * The renderer handed back an id and a screen position, because that is all a renderer
 * knows. Turning that into "a capability, first used in 2024, deepened three times" needs
 * the career, and the career lives here.
 */
function describe(state: Ready, pick: CityPick): PickDetails | null {
  const entity = state.graph.byId.get(pick.id);
  if (entity === undefined) return null;

  const lastUpgrade = entity.upgraded.at(-1);

  return {
    label: entity.label,
    kind: entity.speculative
      ? "Planned"
      : entity.kind === "building"
        ? "Capability"
        : entity.kind === "road"
          ? "Project"
          : entity.kind === "landmark"
            ? "Milestone"
            : "District",
    built: dateFromInstant(entity.built),
    upgraded: lastUpgrade === undefined ? null : dateFromInstant(lastUpgrade),
    retired: entity.retired === null ? null : dateFromInstant(entity.retired),
    speculative: entity.speculative,
    href: entity.href,
    x: pick.clientX,
    y: pick.clientY,
  };
}

function Tooltip({ details }: { readonly details: PickDetails }): JSX.Element {
  return (
    <div
      className="software-city-tooltip"
      role="tooltip"
      style={{
        position: "fixed",
        // Offset from the pointer rather than under it, or the tooltip is the thing being
        // hovered and it flickers as the pointer chases it.
        left: details.x + 16,
        top: details.y + 16,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <strong>{details.label}</strong>
      <span>{details.kind}</span>
      {details.speculative ? (
        // Said in words as well as drawn as a wireframe. Somebody reading a tooltip is
        // exactly the person who wants to know this is a plan rather than a fact.
        <span>Target {details.built} — not built</span>
      ) : (
        <>
          <span>Built {details.built}</span>
          {details.upgraded !== null && <span>Last deepened {details.upgraded}</span>}
          {details.retired !== null && <span>Retired {details.retired}</span>}
        </>
      )}
    </div>
  );
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
