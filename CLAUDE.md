# Software City — working conventions

`~/.claude/CLAUDE.md` carries the cross-project rules — commit format, branching, the
zero-cost constraint, secrets, the quality bar. This file holds only what is true of
*this* product.

Concept and reasoning: `docs/software-city-concept.md`
Architecture and decisions: `docs/design.md`
Build order: `docs/phases.md`

---

## What this is

A career-visualisation engine. It reads a **career graph** — timestamped entities with
lifecycles — and renders an explorable 3D city that rebuilds itself as a timeline is
dragged.

**It has never heard of any particular person's career.** That is what makes it a product
rather than a page, and it is the single property most worth protecting.

## The decisions already taken

Do not re-open these without a reason; each is argued in `docs/design.md` §0.

1. **It ships as an npm package.** A thin demo site consumes it. Not a hosted service, not
   a page inside a portfolio.
2. **The package never fetches.** It takes a validated `graph` prop. Getting the JSON is
   the application's job.
3. **JSON is the default and only required input.** Chronicle's Postgres is one producer's
   storage; a buyer has a file. A product that requires a .NET CMS has no buyers.
4. **Full 3D, perspective camera, orbit controls** — chosen knowing it is the expensive
   option, because it is the reason the product exists.
5. **The demo deploys to Vercel Hobby on a subdomain** of the portfolio's domain. £0, same
   account. Nothing here may cost money.

## It is sold separately, and that has consequences

1. **Never import code from Chronicle.** Only read the contract. Chronicle is one producer
   of that shape and has no special status.
2. **This repository starts at commit 1 and stays independent.**
3. **`LICENSE` here is commercial**, and is *not* Chronicle's. The only shared file is the
   schema, which is CC0 precisely so this is allowed.
4. **If the renderer cannot be driven by a JSON file alone, it is not a product.**

## The contract is the boundary

`contracts/career-graph.v1.schema.json` — copied from Chronicle, CC0.

- **Types are generated from it**, never hand-written. A hand-written mirror drifts, and
  the drift is silent.
- **Never edit `v1` in place.** A change is `v2`, a new file, and both are served.
- **Ignore unknown fields.** `meta` exists so a producer can add detail without breaking
  every renderer.
- **Refuse an unrecognised `version`, loudly.**
- **Validate at the boundary.** The useful failure is "entity 4 has no `built` date", not a
  crash inside a shader.

**Read the real output, not just the schema.** Chronicle emits `district: null` on roads,
landmarks and roadmap buildings. Any layout assuming district membership breaks on the
first real document.

**Ids are opaque.** They are equal or not equal, and nothing else. Never parse `skill:`,
`project:` or `roadmap:` prefixes, never assume a `district:Backend` naming pattern —
those are one producer's convention, and the next will use a UUID or a URL. Chronicle is a
series name shared with the portfolio; that is branding, and the code must not turn it
into a dependency. The moment the engine reads meaning out of an id, it has a producer.

## Layering, and it is enforced

```
react/   →  render/  →  (nothing)
         ↘  engine/  →  contract/
```

- **`engine/` decides what exists at a date. It must not import `render/`.**
- **`render/` draws what it is handed. It must not import `contract/`.**

Enforced by an ESLint rule, on day one, over path aliases (`@engine/*`, `@render/*`,
`@contract/*`) rather than relative paths. A boundary you only intend is a boundary that
has already been crossed.

The engine is the product; everything else is drawing.

## Time is the product

- **`worldAt(graph, at)` is a pure function of an instant.** Same input, same output, any
  order. Scrubbing backwards works because of this.
- **`Instant` is epoch milliseconds, never a `Date`.** A `Date` cannot be interpolated.
- **Lifecycle is continuous, not a state machine** — `construction`, `storeys`, `decay` are
  floats that tween. Discrete states pop.
- **`layout(graph)` does not take a date.** The whole career is laid out once, so buildings
  rise out of ground that was always theirs instead of the city reshuffling as it grows.
- **Target date and rendered date are separate.** Input follows the pointer exactly;
  the rendered date eases toward it with critical damping. That is what makes a fast drag
  play the construction instead of teleporting.
- **Speculative entities are anchored to `generatedAt`, not their own `built` date**, and
  never convert to built. A goal whose target has passed is still a goal.

## Honesty rules the renderer must keep

Product promises, not preferences:

- **Speculative entities must be unmistakably not built.** A renderer that ignores the
  `speculative` flag is misrepresenting a person.
- **Nothing appears before its `built` date.** That is the entire premise of the timeline.
- **Upgrades happen in place.** A capability deepening is not a demolition.
- **Retired is not deleted.** It happened. Weather it, unlight it, do not remove it.

## Performance is a design constraint, not a later pass

Full 3D was chosen deliberately, so the budget is part of the definition of done.

- **One `InstancedMesh` for all buildings.** Storeys and colour are per-instance
  attributes, not separate meshes.
- **`WorldState` is struct-of-arrays** — parallel `Float32Array`s on a stable entity index.
  At 60fps, allocation is the enemy.
- **Write to the GPU only when something changed.**
- **Budget frames against a mid-range phone**, not a development machine. That is the
  device a recruiter is holding.
- **`prefers-reduced-motion` stops the construction animation** and lands on the finished
  city. Stop, do not merely shorten.
- **The 2D renderer is a shipping fallback**, not a diagnostic. WebGL fails on plenty of
  real devices.

## Development

Develop against `fixtures/*.json`, not a running Chronicle. Faster, works offline, and it
stops you accidentally building a renderer that only works with one producer's output.

```bash
npm run typecheck && npm run lint && npm test   # all three; a build passing proves neither
npm run dev                                     # the demo site

# refresh the real fixture, with Chronicle running
curl http://localhost:5002/api/career-graph > fixtures/full.json
```

**Do not skip the flat SVG renderer.** It is where the timeline is proven while the
renderer is still disposable, and it is the WebGL fallback that ships.
