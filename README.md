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

**Phase 2.** The engine is finished and tested. It knows what exists at any instant, and
where everything stands. Nothing renders yet — that is phase 3, and it is the first phase
with a picture.

Build order and what "done" means for each step: [docs/phases.md](docs/phases.md).
Architecture and the reasoning behind it: [docs/design.md](docs/design.md).

| Phase | | |
|---|---|---|
| 0 | Foundations | **done** |
| 1 | The contract — generated types, validator, fixtures | **done** |
| 2 | The engine — `worldAt`, `layout`, no graphics at all | **done** |
| 3 | Flat renderer and the timeline scrubber | next |
| 4 | The city in three dimensions | |
| 5 | Time made visible — construction, playback | |
| 6 | The package and the demo | |
| 7 | Into the portfolio | |

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
npm run verify        # typecheck, lint and test - all three
```

`npm run build` does not exist yet; there is nothing to build until phase 6.

Working conventions, and the rules that are expensive to break: [CLAUDE.md](CLAUDE.md).
