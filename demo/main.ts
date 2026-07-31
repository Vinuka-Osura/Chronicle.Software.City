import { formatProblems, parseCareerGraph } from "@contract";
import {
  compileGraph,
  createClock,
  createWorldState,
  dateFromInstant,
  layout,
  worldAt,
} from "@engine";
import type { CompiledGraph, TimelineClock, WorldState } from "@engine";
import { renderCitySvg } from "@render";
import type { CityModel } from "@render";
import { toCityFrame, toCityModel } from "@react/model";

/**
 * The phase 3 harness.
 *
 * Plain DOM on purpose. React is the package's public surface and arrives in phase 6;
 * keeping it out until then means the renderer and the clock are demonstrably not coupled
 * to a framework, which is a claim the package will have to make to a buyer anyway.
 */

const ScrubResolution = 1000;

/** Checks the element is what the caller thinks it is, rather than asserting it. */
function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`the page is missing #${id}, or it is not a ${type.name}`);
  return found;
}

const stage = element("stage", HTMLElement);
const problemsBox = element("problems", HTMLParagraphElement);
const subjectLabel = element("subject", HTMLElement);
const countsLabel = element("counts", HTMLElement);
const motionLabel = element("motion", HTMLElement);
const readout = element("readout", HTMLOutputElement);
const scrub = element("scrub", HTMLInputElement);
const playButton = element("play", HTMLButtonElement);
const todayMarker = element("today", HTMLElement);
const fixturePicker = element("fixture", HTMLSelectElement);
const filePicker = element("file", HTMLInputElement);

// Stop, do not merely shorten. The city cuts to the target date instead of playing the
// construction, and playback still works - it simply does not ease.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
motionLabel.textContent = reducedMotion
  ? "reduced motion: construction animation off"
  : "reduced motion: off";

interface Loaded {
  readonly graph: CompiledGraph;
  readonly model: CityModel;
  readonly clock: TimelineClock;
  readonly buffer: WorldState;
}

let loaded: Loaded | undefined;
let dragging = false;

function showProblems(message: string | undefined): void {
  if (message === undefined || message === "") {
    problemsBox.hidden = true;
    problemsBox.textContent = "";
    return;
  }
  problemsBox.hidden = false;
  problemsBox.textContent = message;
}

function load(document_: unknown): void {
  const result = parseCareerGraph(document_);

  if (!result.ok) {
    // The useful failure, and the reason the validator exists: a reader is told which
    // entity and which field, not handed a stack trace from inside the renderer.
    showProblems(
      result.reason === "unsupported-version"
        ? formatProblems(result.problems)
        : `This document could not be read:\n${formatProblems(result.problems)}`,
    );
    stage.innerHTML = "";
    loaded = undefined;
    return;
  }

  showProblems(
    result.warnings.length === 0
      ? undefined
      : `Loaded, with ${String(result.warnings.length)} thing(s) ignored:\n${formatProblems(result.warnings)}`,
  );

  const graph = compileGraph(result.graph);
  const city = layout(graph);

  loaded = {
    graph,
    model: toCityModel(graph, city),
    clock: createClock({ span: graph.span, reducedMotion }),
    buffer: createWorldState(graph.entities.length),
  };

  subjectLabel.textContent = graph.subject.headline
    ? `${graph.subject.name} — ${graph.subject.headline}`
    : graph.subject.name;

  countsLabel.textContent =
    `${String(graph.entities.length)} entities · ` +
    `${dateFromInstant(graph.span.from)} → ${dateFromInstant(graph.span.to)}`;

  positionTodayMarker(loaded);
  draw(loaded, true);
}

function positionTodayMarker(current: Loaded): void {
  const { span, generatedAt } = current.graph;
  const width = span.to - span.from;

  if (width <= 0 || generatedAt < span.from || generatedAt > span.to) {
    todayMarker.hidden = true;
    return;
  }

  todayMarker.hidden = false;
  todayMarker.style.left = `${String(((generatedAt - span.from) / width) * 100)}%`;
}

function draw(current: Loaded, force = false): void {
  const world = worldAt(current.graph, current.clock.rendered, current.buffer);
  stage.innerHTML = renderCitySvg(current.model, toCityFrame(world));

  readout.textContent = dateFromInstant(current.clock.rendered);

  // While dragging, the input owns its own value; writing to it would fight the pointer.
  if (!dragging || force) {
    scrub.value = String(Math.round(current.clock.progress() * ScrubResolution));
  }
}

let lastFrame = performance.now();

function tick(now: number): void {
  const delta = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (loaded !== undefined) {
    // Redraw only when the rendered date actually moved. In three dimensions this same
    // check is what stops the GPU being written to for a frame in which nothing changed.
    if (loaded.clock.advance(delta)) draw(loaded);
    playButton.textContent = loaded.clock.playing ? "❚❚" : "▶";
  }

  requestAnimationFrame(tick);
}

scrub.addEventListener("pointerdown", () => {
  dragging = true;
});
scrub.addEventListener("pointerup", () => {
  dragging = false;
});

scrub.addEventListener("input", () => {
  if (loaded === undefined) return;
  loaded.clock.pause();
  // The target follows the pointer exactly; the city takes its own time catching up.
  loaded.clock.seekProgress(Number(scrub.value) / ScrubResolution);
});

playButton.addEventListener("click", () => {
  loaded?.clock.toggle();
});

fixturePicker.addEventListener("change", () => {
  void loadFixture(fixturePicker.value);
});

filePicker.addEventListener("change", () => {
  const file = filePicker.files?.[0];
  if (file === undefined) return;

  void file.text().then(
    (text) => {
      try {
        load(JSON.parse(text));
      } catch {
        showProblems("That file is not JSON.");
      }
    },
    () => {
      showProblems("That file could not be read.");
    },
  );
});

const fixtures: Record<string, () => Promise<{ default: unknown }>> = {
  full: () => import("../fixtures/full.json"),
  small: () => import("../fixtures/small.json"),
  awkward: () => import("../fixtures/awkward.json"),
  empty: () => import("../fixtures/empty.json"),
};

async function loadFixture(name: string): Promise<void> {
  const importer = fixtures[name];
  if (importer === undefined) return;

  const module = await importer();
  load(module.default);
}

document.addEventListener("keydown", (event) => {
  if (event.key === " " && event.target === document.body) {
    event.preventDefault();
    loaded?.clock.toggle();
  }
});

void loadFixture("full");
requestAnimationFrame(tick);
