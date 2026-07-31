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

**Phase 4.** The city is in three dimensions — sun, shadows, sky, an orbit camera you can
zoom, and the flat renderer still there for anything without WebGL. `npm run dev`.

Build order and what "done" means for each step: [docs/phases.md](docs/phases.md).
Architecture and the reasoning behind it: [docs/design.md](docs/design.md).

| Phase | | |
|---|---|---|
| 0 | Foundations | **done** |
| 1 | The contract — generated types, validator, fixtures | **done** |
| 2 | The engine — `worldAt`, `layout`, no graphics at all | **done** |
| 3 | Flat renderer and the timeline scrubber | **done** |
| 4 | The city in three dimensions | **done** |
| 5 | Moving through it — street mode, tooltips | next |
| 6 | Time made visible — construction, playback, quality tiers | |
| 7 | The package and the demo | |
| 8 | Into the portfolio | |

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

Pick a fixture, or drop in your own career graph. Drag to orbit, scroll or pinch to zoom,
and drag the timeline — the city builds itself as you go rather than cutting to the result.
The "flat renderer" checkbox shows what a device without WebGL gets.

There is no `npm run build` yet — the package build arrives in phase 7. `npm run
build:demo` builds the demo site.

Working conventions, and the rules that are expensive to break: [CLAUDE.md](CLAUDE.md).
