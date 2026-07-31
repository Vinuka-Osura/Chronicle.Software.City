import { StrictMode, useCallback, useEffect, useRef, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { SoftwareCity } from "@react";
import type { CityControls } from "@react";
import { dateFromInstant } from "@engine";
import type { GraphProblem } from "@contract";
import { formatProblems } from "@contract";

/**
 * The demo, which is a consumer of the package rather than part of it.
 *
 * It does exactly what a buyer's application does: get the JSON from somewhere, hand it
 * over as a prop, and draw its own timeline chrome around the result. Nothing here reaches
 * inside the component, because nothing a buyer writes could.
 */

const ScrubResolution = 1000;

const fixtures: Record<string, () => Promise<{ default: unknown }>> = {
  full: () => import("../fixtures/full.json"),
  small: () => import("../fixtures/small.json"),
  awkward: () => import("../fixtures/awkward.json"),
  empty: () => import("../fixtures/empty.json"),
};

function Demo(): JSX.Element {
  const [graph, setGraph] = useState<unknown>(undefined);
  const [fixture, setFixture] = useState("full");
  const [problems, setProblems] = useState<readonly GraphProblem[]>([]);
  const [flat, setFlat] = useState(false);
  const [date, setDate] = useState("");

  const controls = useRef<CityControls>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [meta, setMeta] = useState<{ subject: string; count: number; today: number } | null>(
    null,
  );

  useEffect(() => {
    const load = fixtures[fixture];
    if (load === undefined) return;
    void load().then((module) => {
      setProblems([]);
      setGraph(module.default);
    });
  }, [fixture]);

  const onReady = useCallback((next: CityControls) => {
    controls.current = next;
    setMeta({
      subject: next.subject.headline
        ? `${next.subject.name} — ${next.subject.headline}`
        : next.subject.name,
      count: next.entityCount,
      today:
        next.span.to > next.span.from
          ? (next.generatedAt - next.span.from) / (next.span.to - next.span.from)
          : -1,
    });
  }, []);

  const onDateChange = useCallback((at: number) => {
    setDate(dateFromInstant(at));

    const input = scrub.current;
    const clock = controls.current?.clock;
    if (clock === undefined) return;

    // While dragging, the input owns its own value; writing to it would fight the pointer.
    if (input !== null && !dragging.current) {
      input.value = String(Math.round(clock.progress() * ScrubResolution));
    }
    setPlaying(clock.playing);
  }, []);

  return (
    <>
      <header>
        <h1>Software City</h1>
        <p className="note">
          Phase 4. Drag to orbit, scroll or pinch to zoom, and drag the timeline to build the
          city. The camera will not go below the ground, because there is nothing down there
          yet.
        </p>
      </header>

      <section className="controls">
        <label>
          Career graph
          <select
            value={fixture}
            onChange={(event) => {
              setFixture(event.target.value);
            }}
          >
            <option value="full">full.json — a whole career</option>
            <option value="small">small.json — a student</option>
            <option value="awkward">awkward.json — every legal edge case</option>
            <option value="empty">empty.json — nothing at all</option>
          </select>
        </label>

        <label>
          …or your own
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file === undefined) return;
              void file.text().then((text) => {
                try {
                  setGraph(JSON.parse(text));
                } catch {
                  setProblems([{ path: "", message: "That file is not JSON." }]);
                }
              });
            }}
          />
        </label>

        <label className="inline">
          <input
            type="checkbox"
            checked={flat}
            onChange={(event) => {
              setFlat(event.target.checked);
            }}
          />
          Flat renderer (the no-WebGL fallback)
        </label>

        <span className="subject">{meta?.subject}</span>
      </section>

      {problems.length > 0 && <p className="problems">{formatProblems(problems)}</p>}

      <main className="stage">
        {graph !== undefined && (
          <SoftwareCity
            graph={graph}
            flat={flat}
            onReady={onReady}
            onDateChange={onDateChange}
            onProblems={setProblems}
          />
        )}
      </main>

      <section className="timeline">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play the career"}
          onClick={() => {
            const clock = controls.current?.clock;
            if (clock === undefined) return;
            clock.toggle();
            setPlaying(clock.playing);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <div className="track">
          <input
            ref={scrub}
            type="range"
            min="0"
            max={ScrubResolution}
            step="1"
            defaultValue={ScrubResolution}
            aria-label="Scrub through the career"
            onPointerDown={() => {
              dragging.current = true;
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onInput={(event) => {
              const clock = controls.current?.clock;
              if (clock === undefined) return;
              clock.pause();
              clock.seekProgress(Number(event.currentTarget.value) / ScrubResolution);
            }}
          />
          {meta !== null && meta.today >= 0 && meta.today <= 1 && (
            <div className="today" style={{ left: `${String(meta.today * 100)}%` }}>
              <span>today</span>
            </div>
          )}
        </div>

        <output className="readout">{date}</output>
      </section>

      <footer>
        <span>{meta === null ? "" : `${String(meta.count)} entities`}</span>
        <span>drag · scroll to zoom · space to play</span>
      </footer>
    </>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("the page is missing #root");

createRoot(root).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
