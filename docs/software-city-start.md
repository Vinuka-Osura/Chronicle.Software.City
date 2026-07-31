# Starting Software City

How to begin the second product, written from Chronicle rather than for it. Chronicle's
side is finished — the contract, the endpoint and the test that guards it all exist — so
nothing here is blocked.

> **Read `software-city-concept.md` first** for what it is. This is only how to start
> building it.

---

## 0. Before any code

Three decisions shape the architecture, so they want answering first rather than
discovered later.

### What is a buyer actually buying?

| Model | What ships | Consequence for the code |
|---|---|---|
| **Hosted service** | a URL; they upload a career graph | you run servers, store customer data, and it stops being £0.00 |
| **npm package** | a React component | must work inside *their* app — no global styles, no assumptions about routing |
| **Licensed source** | the repository | needs to build cleanly on a machine you have never seen |

These are not equally easy to change later. A component that assumed it owned the whole
page cannot become an npm package without a rewrite.

**My suggestion: build it as an npm package that a thin demo site consumes.** The demo
proves it, the package is the product, and the hosted option stays open because a hosted
service is just your own demo site with uploads. Starting hosted and extracting a package
later is the direction that does not work.

### How does their data get in?

The contract answers the format. It does not answer whether the renderer fetches a URL,
takes a prop, or reads a file. **Take a prop.** Fetching is the consumer's job; a renderer
that fetches has opinions about auth, CORS and retries that belong to whoever is embedding
it.

### What is the smallest thing worth showing?

Not the metro system. **Timeline + buildings + roads**, on real data. Weather, traffic,
day/night and the underground layer are all things that make a good demo better and a bad
one no less bad.

---

## 1. The repository

**A new one, from commit 1.** Not a folder here, not a branch, not "extract it later".

Provenance is a question a buyer's lawyer asks, and "it used to live inside a proprietary
repo" is an answer you do not want to give. It also keeps the boundary honest: code that
cannot see Chronicle cannot accidentally depend on it.

```
software-city/
├── LICENSE                       ← commercial. NOT Chronicle's
├── README.md
├── contracts/
│   └── career-graph.v1.schema.json   ← copied from Chronicle. CC0, so this is allowed
├── src/
│   ├── contract/                 ← types generated from the schema, plus a validator
│   ├── engine/                   ← ECS: entities, components, systems. NO rendering
│   ├── render/                   ← Three.js. NO knowledge of careers
│   └── react/                    ← the component wrapper
├── demo/                         ← a site that feeds it a career graph
└── fixtures/
    └── *.json                    ← career graphs to develop against
```

**The engine must not import from `render/`, and `render/` must not import from
`contract/`.** The engine decides *what exists at a date*; the renderer draws whatever it
is handed. Enforce it with a dependency-boundary lint rule on day one, the same way
Chronicle's architecture test guards its domain — a boundary you only intend is a boundary
that has already been crossed.

---

## 2. First week, in order

Each step ends with something you can look at. Nothing is scaffolding for later.

### 1. Types from the schema, and a validator

```bash
npx json-schema-to-typescript contracts/career-graph.v1.schema.json > src/contract/types.ts
```

Generated, never hand-written — a hand-written mirror of a schema drifts, and the drift is
silent. Add a runtime validator too: a consumer will hand you a malformed document, and
the useful failure is "entity 4 has no `built` date", not a crash inside a shader.

**Refuse a `version` you do not recognise.** Loudly. A renderer that guesses at v2 is worse
than one that says it cannot read it.

### 2. Fixtures before graphics

Save three career graphs into `fixtures/`:

- **`empty.json`** — no entities. Must render an empty plot of land, not throw.
- **`small.json`** — one district, three buildings, one road. A student.
- **`full.json`** — Chronicle's own output. `curl localhost:5002/api/career-graph`.

Develop against files, not a running Chronicle. It is faster, it works offline, and it
stops you accidentally building a renderer that only works with Chronicle's particular
output.

### 3. The engine, with no graphics at all

```ts
// Given a graph and a date: what exists, and in what state?
worldAt(graph: CareerGraph, date: Date): WorldState
```

Where each entity is `absent | under-construction | built | upgraded(n) | retired` and
speculative entities get their own state. **Unit-test this hard.** It is the whole product
— everything else is drawing.

The cases that matter: the day something is built, the day before, an upgrade date, a
retirement, and a speculative entity dated in the past (a goal whose target has passed and
which nobody marked done — it must still read as intention).

### 4. Two dimensions before three

Draw `WorldState` as flat SVG rectangles. Ugly on purpose.

This is the step people skip and it is the one that saves the week. If the timeline,
layout and lifecycle logic are wrong, you will find out in an afternoon rather than after
three days of camera and lighting work — and you will have a debugging view you keep for
ever.

### 5. Three.js, one building type

One box per building, height from `magnitude`, positioned by district. No materials, no
shadows, no sky. Prove the scene graph rebuilds correctly when the date changes.

### 6. The timeline scrubber

The thing that makes it *the* product rather than a 3D chart. Dragging replays
construction rather than teleporting — the concept doc is right that this is the whole
feeling.

Interpolate between world states rather than rebuilding the scene per frame. Rebuilding is
the obvious implementation and it is why most of these things stutter.

---

## 3. Rules that come from Chronicle's side

Non-negotiable, because they are what make the two things separable:

1. **Never import Chronicle code.** Only read the contract.
2. **Never edit `career-graph.v1.schema.json` in place.** A shipped consumer is entitled
   to assume v1 means what it meant. A change is `v2`, a new file, and both are served.
3. **Ignore unknown fields.** `meta` exists so a producer can add detail without breaking
   every renderer. A consumer that rejects unknown keys makes the contract unextendable.
4. **Never require Chronicle.** If the renderer cannot be driven by a JSON file, it is
   not a product.

---

## 4. Performance, decided up front

The city is the one place on either product where this can genuinely go wrong, and every
mitigation is much harder to retrofit.

- **Instanced meshes.** One draw call per building type, not per building. A career with
  forty skills is forty buildings before any scenery.
- **A frame budget, measured on a mid-range phone**, not a development machine. This is
  the device a recruiter holds.
- **A 2D fallback that is not an apology.** WebGL fails on plenty of real devices, and
  step 4 has already given you a flat renderer worth shipping.
- **`prefers-reduced-motion` stops the construction animation** and lands on the finished
  city. Same rule as Chronicle: stop, do not merely shorten.

---

## 5. What "done" means for a first release

- Loads any valid career graph, including the empty one
- Scrubs 2019 → 2030 without stuttering on a mid-range phone
- Speculative entities are unmistakably not built
- Refuses an unknown version with a clear message
- A 2D fallback when WebGL is unavailable
- One demo, on a real career — Chronicle's

Everything else — weather, traffic, night lighting, the metro, the airport — is version
two, and none of it makes a wrong timeline right.

---

## 6. Chronicle's side, for reference

Already done. Nothing to build here.

| | |
|---|---|
| Contract | `contracts/career-graph.v1.schema.json`, CC0 — copy it freely |
| Endpoint | `GET /api/career-graph` |
| Guard | `CareerGraphContractTests` — Chronicle cannot silently break the format |
| Mapping | skill → building, project → road, category → district, role/milestone → landmark, roadmap → speculative |

Fetch a live sample:

```bash
curl http://localhost:5002/api/career-graph > fixtures/full.json
```
