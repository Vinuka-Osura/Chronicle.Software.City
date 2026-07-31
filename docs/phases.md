# Software City — phases

Eight phases. **Every one of them ends in something you can look at**, and none of them is
scaffolding whose payoff arrives two phases later. If a phase cannot be demonstrated, it
has been specified wrongly.

Read `design.md` first — this is the order, not the reasoning.

---

## Phase 0 — Foundations

The repository, and the rules that are cheaper to install than to retrofit.

- `git init`, branch `development`, **commit 1 in this repository** — never a folder in
  Chronicle, never extracted later. Provenance is a question a buyer's lawyer asks.
- `LICENSE` — commercial, reserving rights. **Not Chronicle's licence.**
- Vite + TypeScript (strict) + Vitest + ESLint 9 flat config.
- Path aliases `@contract/*`, `@engine/*`, `@render/*` and the **layering lint rule from
  design.md §3, working on day one.** A boundary you only intend has already been crossed.
- `CLAUDE.md` at the root.
- CI: build, typecheck, lint, test on every push.

**Done when:** a deliberately illegal import — `engine/` reaching into `render/` — fails
lint, and CI is green without it.

---

## Phase 1 — The contract

The boundary, before anything can be drawn wrongly against it.

- Copy `career-graph.v1.schema.json` from Chronicle. It is CC0; this is what that licence
  is for.
- **Generate** `src/contract/types.ts` from the schema. Never hand-written.
- A runtime validator that reports *"entity 4 has no built date"*, not a stack trace.
  Beyond JSON Schema it also checks unique ids, district references that resolve, and road
  connections that resolve.
- **Refuse an unrecognised `version` loudly.**
- Fixtures in `fixtures/`:
  - `empty.json` — no entities. Must render empty ground, not throw.
  - `small.json` — one district, three buildings, one road. A student.
  - `full.json` — Chronicle's real output, `curl localhost:5002/api/career-graph`.
  - `awkward.json` — hand-written: a retired building, a road connecting nothing, a
    speculative goal whose target has already passed, a district with one building.

**Done when:** all four fixtures validate, a `version: 2` document is refused with a
readable message, and an unknown field in `meta` is ignored rather than rejected.

---

## Phase 2 — The engine, with no graphics at all

The product. Everything after this is drawing.

- `careerSpan(graph)` — the timeline's ends, including speculative dates.
- `layout(graph) → Layout` — **time-invariant and deterministic**, with the placement rules
  for `district: null` entities from design.md §2. Same graph in, same city out.
- `worldAt(graph, at) → WorldState` — continuous `construction`, `storeys`, `decay`,
  `blueprint`, struct-of-arrays.

**Tested hard**, because being wrong here is invisible until it is embarrassing:

| Case | Expectation |
|---|---|
| The day before `built` | Absent. Nothing, not a foundation. |
| The day of `built` | Construction begins, `construction` ≈ 0 |
| Mid-construction window | 0 < `construction` < 1 |
| The day of an `upgraded` date | `storeys` starts growing, position unchanged |
| After `retired` | Still present, `decay` rising |
| Speculative, target date in the past | **Still a blueprint.** Never built. |
| Speculative, scrubbed to before `generatedAt` | Absent — it had not been stated yet |
| Empty graph | A valid empty world, no throw |
| Same instant, called twice | Identical output |

**Done when:** those pass, and `layout()` called twice on the same graph is byte-identical.

---

## Phase 3 — Flat renderer and the timeline

**The first phase with a picture, and the phase that proves the product.** Time is the
fourth dimension, so it gets proven while the renderer is still disposable.

- Top-down SVG: districts as outlines, buildings as rectangles scaled by `storeys`, roads
  as polylines, blueprints as dashed outlines outside the city edge. Ugly on purpose.
- **The timeline scrubber.** Drag the full career span, a distinct "today" marker,
  keyboard-operable.
- **Target date vs rendered date** (design.md §1) — the critically-damped follow, so a fast
  drag plays the construction instead of teleporting.
- Play/pause at a constant rate.
- `prefers-reduced-motion` disables the follow entirely.

This deviates from `software-city-start.md`, which puts the scrubber after the 3D work.
Deliberate: the 3D phase should inherit a time model that already works, rather than
debugging camera and chronology at once.

**Done when:** dragging `full.json` from career start to end plays the city being built,
and every honesty rule in design.md §7 is already visibly true — in SVG.

---

## Phase 4 — The city in three dimensions

R3F, static at a given date. Construction animation is Phase 6.

The brief is not "boxes on a plane". A viewer's first reaction is the thing being sold, so
looking good is a requirement of this phase rather than a later polish pass — see
design.md §7.

- One `InstancedMesh` for every building, storeys and colour as per-instance attributes.
- Roads as one merged geometry. District ground. Landmarks on the civic boulevard.
  Blueprints on the survey ground, unmistakably not built.
- **Light that gives things form** — directional sun with soft shadows, hemisphere fill,
  sky and fog. Bevelled edges, because that is the difference between a box and a building.
  All generated: no external textures, nothing that fails on a strict CSP.
- **Orbit camera** — damping, distance clamped to the layout bounds, target fixed to the
  time-invariant city centre, continuous wheel and pinch zoom.
- **The polar angle is clamped above the horizon**, unconditionally. There is nothing under
  the map, and a camera below it shows the backs of polygons.
- WebGL feature detection → the Phase 3 renderer as fallback.

**Done when:** the scene rebuilds correctly when the date changes, the draw-call count is
in single digits on `full.json`, the camera cannot get under the ground or inside a
building, and somebody who has never seen it says something.

---

## Phase 5 — Moving through it

A skyline is a picture. Walking a street is an experience, and it is where the scale of a
district stops being abstract.

- **Street mode** — eye height, on the ground plane, cannot pass through buildings. A
  camera clipping inside a tower is the moment the illusion dies.
- **Zooming past a threshold drops into it**, rather than hiding it behind a button nobody
  presses. The button exists as well, because discovering a mode by accident is not the
  same as being able to get back to it.
- **Tooltips on everything** — label, what it is, built date, last upgrade, whether it is a
  goal rather than an achievement, and the producer's link when there is one.
- Picking survives instancing: a raycast returns an `instanceId`, and instance slots are
  already equal to the stable entity index, so the lookup is an array read.
- **An entity absent at the current instant is not pickable**, or the city has invisible
  walls made of buildings that do not exist yet.
- Touch: tap to pick, drag to look, pinch to zoom.

**Done when:** you can walk from one district to another along a road that a real project
put there, every visible thing answers when pointed at, and nothing that has not been built
yet responds.

---

## Phase 6 — Time made visible

The phase that makes it feel alive rather than correct.

- Cranes and scaffolding across the construction window; roads extending by length rather
  than being rebuilt; storeys rising in place.
- Retired buildings weathered and unlit — **standing, never removed.**
- Blueprints legible as intention: wireframe, survey pegs, whatever reads as unfinished.
- The GPU written to only when something actually changed.
- **Quality tiers, auto-selected.** A weak device gets a plainer city, never a broken one
  and never a slideshow.
- `prefers-reduced-motion` lands on the finished city with construction off.

**Done when:** it holds 60fps on a mid-range phone scrubbing 2019 → 2035, and a still frame
mid-drag is obviously a city under construction.

---

## Phase 7 — The package and the demo

The point at which it stops being a project and becomes a product.

- Vite library build. React and react-dom as **peer dependencies**, never bundled.
- Public surface: one component taking a `graph` prop, plus the engine exported for anyone
  who wants the data without the pixels.
- Demo site (Vite React SPA — deliberately not Next.js): bundled fixture by default, drag a
  file in, or fetch a URL. All three end at the same validated prop.
- `README.md` a buyer can install from.
- **Deploy the demo to Vercel Hobby on `city.<domain>`** — same account, same domain, £0.

**Done when:** `npm pack`, install the tarball into an empty Vite app, render a city.
Nothing from this repository is imported except the package.

---

## Phase 8 — Into the portfolio

**This work happens in Chronicle's repository, not this one.**

- Chronicle installs the package and renders it at `/city`, fed by `/api/career-graph`,
  replacing the Coming Soon teaser.
- A non-deployed Next.js smoke app lives here to catch SSR and `"use client"` problems
  before they surface in Chronicle.
- Dynamic import so the 3D bundle never lands in Chronicle's first paint.

**Done when:** editing a skill in Chronicle's admin changes the city on the next load, with
no code change in either repository. That is the whole thesis demonstrated in one action.

---

## v2 — everything the concept doc promises and v1 does not

Weather, traffic, day/night, the airport.

Deferred on purpose. Each makes a good city better and a wrong one no less wrong, and none
of them is worth a day before the timeline is right.

**The underground layer is not deferred, it is dropped.** A career is a surface thing, and
the layer would have been a second world to build, populate and explain in service of a
metaphor nobody asked to see the inside of. Anything it would have carried is said better
by a building or a road on the surface, which a viewer already understands. See design.md
§7.

---

## Order, and what it protects

Phases 1–3 are the product; 4–6 are what makes anyone look at it; 7–8 are what make it
sellable. If time runs short, **the flat renderer with a correct timeline is a shippable
thing** and a beautiful city with a wrong chronology is not.
