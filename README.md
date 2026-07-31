# Software City

A career-visualisation engine. It reads a **career graph** — timestamped entities with
lifecycles — and renders an explorable 3D city that rebuilds itself as a timeline is
dragged.

**It has never heard of any particular person's career.** It reads dates and works out
what exists, what is under construction and what has been upgraded at any instant. That
is what makes it a product rather than a page.

> Proprietary and confidential. See [LICENSE](LICENSE). The one exception is
> `contracts/`, which is CC0 and deliberately free to copy.

---

## Where this is

**Paused after phase 9, first two visual passes.** Everything builds, 263 tests pass, and
the whole thing is pushed. It is a working npm package: `npm pack`, install it into any
React app, and a career graph renders as an explorable city with a timeline.

Pick up at **phase 8**, which is the only thing left before it can be shown to anyone.

Build order and what "done" means for each step: [docs/phases.md](docs/phases.md).
Architecture and the reasoning behind it: [docs/design.md](docs/design.md).

| Phase | | |
|---|---|---|
| 0 | Foundations | **done** |
| 1 | The contract — generated types, validator, fixtures | **done** |
| 2 | The engine — `worldAt`, `layout`, no graphics at all | **done** |
| 3 | Flat renderer and the timeline scrubber | **done** |
| 4 | The city in three dimensions | **done** |
| 5 | Moving through it — street mode, tooltips | **done** |
| 6 | Time made visible — construction, weathering, quality tiers | **done** |
| 7 | The package and the demo | **done** |
| 8 | Into the portfolio | **next — needs a decision, see below** |
| 9 | The city takes its final form — the diorama look | **two passes done**, more when it earns it |

### What is waiting on a decision

Neither is a code problem; both need something only the owner can give.

1. **Phase 8 happens in Chronicle's repository, not this one.** It installs this package at
   `/city` and feeds it `/api/career-graph`, replacing the Coming Soon teaser. Small — a
   dependency, a route, and a fetch — but it is a change to a repository this work has so
   far been forbidden to touch.
2. **Deploying the demo needs a Vercel account.** `vercel.json` is written and ready: a
   second Hobby project on a subdomain of the portfolio's domain, which costs nothing.

### Where the look got to

Forms, layout and materials have had two passes. The city is blocks and streets on a round
plate with a ring road, five building shapes chosen by district and size, glossy surfaces
lit by a procedurally-built environment, and crown trim whose brightness is the
capability's own magnitude.

It has been verified as *correct* far more than it has been judged as *good*. The next
visual increment should start from someone looking at it rather than from this list.

## The shape

```
contracts/   the career-graph schema. CC0, copied from the producer, never edited in place
src/
  contract/  types generated from the schema, plus a validator. Depends on nothing internal
  engine/    what exists at a date. No rendering. This is the product
  render/    draws what it is handed. Has never heard of a career
  react/     the component wrapper. The only layer allowed to see both sides
fixtures/    career graphs to develop against
demo/        a site that feeds it one
```

The arrows only point one way:

```
react/  →  render/  →  (nothing)
        ↘  engine/  →  contract/
```

This is enforced by a lint rule, and the lint rule is itself tested — see
[tests/architecture.test.ts](tests/architecture.test.ts). A misconfigured rule does not
fail loudly, it passes everything for ever, so the test tries to break the boundary and
asserts it is refused.

## Running it

```bash
npm install
npm run dev           # the demo, on http://localhost:5173
npm run verify        # typecheck, lint and test - all three
```

Pick a fixture, or drop in your own career graph. Drag to orbit, scroll to zoom — keep
zooming and you drop into street level, where WASD walks and Esc takes you back up. Point
at anything for its details. Drag the timeline and the city builds itself as you go rather
than cutting to the result. The "flat renderer" checkbox shows what a device without WebGL
gets.

`npm run build` builds the package; `npm run build:demo` builds the demo site.

## Using it

```bash
npm install chronicle-software-city react react-dom three
```

```tsx
import { SoftwareCity } from "chronicle-software-city";

export function Career({ graph }: { graph: unknown }) {
  return <SoftwareCity graph={graph} className="h-[70vh]" />;
}
```

**It never fetches.** Getting the JSON is your application's job — from a file, an import,
or your own API. Anything conforming to `career-graph.v1` works; the document is validated
at the boundary and an unrecognised version is refused with a message you can show a user.

React, react-dom and three are **peer dependencies**, so there is only ever one copy of
each in your page. The three-dimensional renderer is behind a dynamic import: a host pays
for it only on a device that has WebGL, and never on one that does not — where the flat
renderer takes over on its own.

The engine is exported too, for anything that needs to know what existed on a date without
drawing it:

```ts
import { parseCareerGraph, compileGraph, worldAt } from "chronicle-software-city";

const parsed = parseCareerGraph(document);
if (parsed.ok) {
  const world = worldAt(compileGraph(parsed.graph), Date.now());
}
```

Working conventions, and the rules that are expensive to break: [CLAUDE.md](CLAUDE.md).
