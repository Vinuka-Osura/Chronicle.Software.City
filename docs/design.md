# Software City — architecture & design

The design decisions, and why each one is what it is. `software-city-concept.md` says what
the thing is; `software-city-start.md` says how to begin; this says how it is built.

Written before the first line of code, because three of the decisions below cannot be
changed later without a rewrite.

---

## 0. The decisions that were taken

| Question | Decision | Why not the alternative |
|---|---|---|
| What ships? | **An npm package. A thin demo site consumes it.** | A hosted service means servers, customer data and a monthly bill. A component that assumed it owned the page could never become a package. Starting as a package and *adding* hosting later works; the reverse does not. |
| Where does data come from? | **A `graph` prop. Always. The package never fetches.** | Fetching drags in opinions about auth, CORS, retries and caching that belong to whoever is embedding it. JSON in, city out. |
| Where does the data live? | **Nowhere, for the engine.** Chronicle's Postgres holds *your* career; a JSON file holds everyone else's. | A product whose data model is "you must run a .NET CMS and a Postgres instance" has no buyers. The database is a producer's problem, and there are many producers. |
| How is it hosted? | **A second Vercel Hobby project on `city.<domain>`.** | Free, same account, same domain, no new bill. Subdomains cost nothing. |
| How is it drawn? | **Full 3D, perspective camera, orbit controls.** Chosen deliberately over isometric. | Isometric is cheaper and safer. It is also not the thing. If this is the showpiece it has to survive being looked at properly. |
| How is it *shipped* into the portfolio? | **Chronicle installs the package** and renders it at `/city`, fed by its own `/api/career-graph`. | It proves the package works inside somebody else's application rather than only inside its own demo. That is the difference between a product and a page. |

Two consequences worth stating plainly:

- **Full 3D was chosen knowing it is the expensive option.** It buys the product its reason
  to exist and costs a mobile frame budget, camera work, LOD and occlusion. §6 is
  therefore not an optimisation pass; it is part of the definition of done.
- **The flat SVG renderer still gets built** (§5), and it will not look like the 3D view.
  That is fine. It is a shipping fallback for devices without WebGL, and it is the
  debugging view that makes the engine arguable about.

### Naming

**Chronicle is a series name, not the portfolio's name.** It means a record of events in
time — which is a better fit here than it is on the portfolio, since a chronicle is
precisely what this renders. `Chronicle.Software.City` is therefore the deliberate name,
and the repository is
[`Vinuka-Osura/Chronicle.Software.City`](https://github.com/Vinuka-Osura/Chronicle.Software.City).

The independence that matters is **in the code, not in the name**. A shared brand across a
series is ordinary; what would sink the product is the engine knowing anything about one
producer. Concretely, the engine must never:

- parse id prefixes — `skill:`, `project:`, `roadmap:` are Chronicle's convention, and
  another producer will use `s1`, a UUID, or a URL
- assume a district naming pattern such as `district:Backend`
- special-case any field Chronicle happens always to send, or always to omit

Ids are opaque strings that are equal or not equal. The moment the engine reads meaning out
of one, it has a producer.

The npm package name is lowercase by convention — `chronicle-software-city`, or
`@<scope>/software-city` under an npm organisation. Decided at Phase 6, when it is first
published; nothing before then depends on it.

---

## 1. Time is the fourth dimension, not a slider

This is the product. Everything in §3–§6 exists to serve it.

A conventional 3D portfolio renders a scene. This renders **a scene at a date**, and the
date is continuous and user-controlled. Dragging the timeline from 2022 to 2035 is not
navigation between six pre-built scenes; it is one scene evaluated at ten thousand
intermediate instants.

### The engine is a pure function of time

```ts
worldAt(graph: CareerGraph, at: Instant): WorldState
```

`Instant` is epoch milliseconds, not a `Date`. A `Date` cannot be interpolated, and
interpolation is the entire mechanic.

Everything the renderer needs at a given moment comes out of this one call, and calling it
twice with the same arguments gives the same answer. No hidden state, no accumulation, no
"and then the crane finished". **The city can be evaluated at any instant in any order**,
which is what makes scrubbing backwards work as well as scrubbing forwards — a property
almost every timeline animation quietly lacks.

### Lifecycle is continuous, not a state machine

The obvious model is five discrete states — `absent | under-construction | built |
upgraded | retired`. It is also wrong, because a discrete state cannot be tweened and a
renderer that switches states pops.

So each entity yields **continuous quantities**:

| Field | Range | Meaning |
|---|---|---|
| `construction` | 0 → 1 | Ramps across the construction window that opens on `built`. 0 is bare ground, 1 is finished. |
| `storeys` | 1 → n | Grows continuously as each `upgraded` date is crossed. Never resets. |
| `decay` | 0 → 1 | Ramps after `retired`. Weathering and unlighting, **never removal.** |
| `blueprint` | 0 or 1 | Speculative. Never becomes built, at any date. |

`phase` is still derived and exposed, because tests and the SVG renderer want to assert
"this was under construction on that day" without comparing floats. It is a view over the
numbers, not the source of truth.

### Construction takes time, and how much is a decision

The contract gives a single `built` date, not a duration. A building that appears
instantly is a state machine wearing a costume, so construction needs a window — and its
length is a real choice:

| Option | Problem |
|---|---|
| Fixed calendar duration (say 60 days) | Invisible when the timeline spans twenty years. |
| A fraction of the *visible* span | The city changes appearance when you zoom the timeline. Zoom is not a time machine. |
| **A fraction of the whole career span, clamped** | **Chosen.** Deterministic, visible at every zoom, independent of the viewport. |

Default: **2% of the career span, clamped to [30 days, 1 year]**, configurable. A
twelve-year career therefore builds each building over about three months of career-time.

### Target date and rendered date are two different numbers

The concept doc's rule — *"dragging from 2024 to 2030 plays the construction, it never
teleports"* — is easy to state and easy to implement wrongly, because the pointer can move
six years in 200ms.

So there are two clocks:

- **Target date** — where the pointer is. Follows the drag exactly, with no lag, because
  input that lags feels broken.
- **Rendered date** — what `worldAt` is called with. Eases toward the target with critical
  damping, and it is what the city is drawn at.

Drag fast and the pointer arrives at 2030 immediately while the city spends the next
second building its way there. Release, and it settles. **No scroll-hijacking, no
animation queue, no interpolation between snapshots** — just a second-order follow on a
scalar. The same mechanism gives play/pause for free: playback moves the target at a
constant rate and the rendered date follows.

Under `prefers-reduced-motion` the follow is disabled — rendered date equals target date,
the city cuts. Per the concept doc: **stop the motion, do not merely shorten it.**

### Speculative entities are anchored to now, not to their own date

The subtlest rule here, and it is not in the concept doc.

Chronicle emits a roadmap goal as a building with `built` = its *target* date and
`speculative: true`. Read naively, a goal targeting 2028 would be invisible until the
scrub reaches 2028 and then appear — which is exactly backwards, because it would render a
goal as an achievement at the moment it was supposed to be least certain.

The rule instead:

> A speculative entity becomes visible when the scrub date reaches the document's
> `generatedAt`, and stays visible for ever after, always as a blueprint. Its `built` date
> is a **target**, used for its label and its placement — never for its visibility.

This falls out of what a goal actually is. In 2019 you had not stated it, so it must not be
in the 2019 city. You state it today, so it exists from today onward. And it never
converts, because a goal that its own target date has passed is still a goal — someone
missed it, and the honest picture is a blueprint that has been standing there a while, not
a finished tower. `software-city-start.md` names precisely this case as one to test.

---

## 2. Layout is computed once, from the whole career

`layout(graph) → Layout`, and **it does not take a date.**

If plots were assigned from whatever exists at the current instant, every building would
shuffle as the timeline moved, because adding a building would repack the district. The
city would boil. Instead the full career is laid out once, up front, and `worldAt` only
decides how much of each plot is currently occupied. Buildings rise out of ground that was
always theirs.

Three things fall out of this for free, and each would otherwise be a fight:

1. **The camera target never lurches**, because the city's centre and bounds are known
   before anything is drawn.
2. **Instance slots are stable** — entity *n* owns instance *n* in the mesh for the whole
   session, so scrubbing writes matrices rather than reallocating buffers.
3. **Layout is testable without a renderer**, and cacheable across a reload.

Layout must be **deterministic**: same graph in, same city out, every time. Any jitter
comes from a seeded PRNG keyed on entity id, never `Math.random()`.

### Placing things the contract does not place

The schema has a `district` field, and reading only the schema you would assume everything
has one. **Chronicle's actual output says otherwise** — roads, landmarks and roadmap
buildings all emit `district: null`. Any layout that assumes district membership breaks on
the first real document, so the rules are explicit:

| Entity | Where it goes |
|---|---|
| **District** | Rings outward from the origin in founding order — oldest at the centre. A city grows from its old town, and the founding date is already in the data. |
| **Building** with a district | A plot inside that district, ordered by `built`, older nearer the district centre. |
| **Road** (`connects` ≥ 2) | Routed through the plots of the buildings it connects, ordered by a greedy nearest-neighbour tour so roads bend around the city instead of crossing it. |
| **Road** (`connects` ≤ 1) | A short spur off the nearest arterial. Projects with no recorded tech stack are common and must not vanish. |
| **Landmark** | The civic boulevard through the city centre, ordered by date. Roles and milestones are moments, not capabilities — they do not belong in a skills district. |
| **Speculative** | The survey ground beyond the built edge. Physically outside the city, so that even at a glance nobody mistakes planned for built. |

---

## 3. Layering, and it is enforced from commit 1

```
react/  →  render/  →  (nothing)
        ↘  engine/  →  contract/
```

- **`engine/` must not import `render/`.** It decides what exists at a date; it does not
  know what a mesh is.
- **`render/` must not import `contract/`.** It draws a `WorldState` and a `Layout`. It has
  never heard of a career, a skill, or a JSON schema.

Enforced by an ESLint rule on day one, not by intention. Imports go through path aliases
(`@contract/*`, `@engine/*`, `@render/*`) rather than relative paths, so the rule can be
exact rather than a fragile glob — and so a crossed boundary is visible in the import line
itself while you are typing it.

The engine is the product. Everything else is drawing.

---

## 4. The contract boundary

`contracts/career-graph.v1.schema.json`, copied from Chronicle under CC0.

- **Types are generated from the schema**, never hand-written. A hand-written mirror
  drifts and the drift is silent.
- **Validate at the boundary.** A consumer will hand you a malformed document, and the
  useful failure is *"entity 4 has no built date"*, not a crash inside a shader.
- **Refuse an unknown `version`, loudly.** A renderer guessing at v2 is worse than one that
  says it cannot read it.
- **Ignore unknown fields.** `meta` exists so a producer can add detail without breaking
  every renderer.
- **Never edit v1 in place.** A change is `v2`, a new file, both served.

Beyond what JSON Schema can express, the validator also checks what Chronicle's own
contract test checks — unique ids, district references that resolve, road connections that
resolve — because a consumer that trusts these and is wrong fails deep inside layout with
an unreadable error.

### How data actually arrives

The package takes a prop. Getting the JSON is the application's job, and the demo ships
three ways of doing it so the pattern is obvious to a buyer:

| Source | For |
|---|---|
| **Static JSON import** | The default. Bundled fixture, works offline, no network at all. |
| **File drop** | A visitor drags in their own career graph and sees their own city. |
| **HTTP fetch** | Any URL producing the shape — including Chronicle's `/api/career-graph`. |

All three end at the same place: a validated `CareerGraph` object passed as a prop.

---

## 5. The flat renderer is a product, not a diagnostic

Step 4 in the build order and the step it is tempting to skip.

It draws `WorldState` × `Layout` as flat SVG, top-down, deliberately ugly. It exists
because if the timeline, the layout or the lifecycle logic are wrong, that is discoverable
in an afternoon rather than after three days of camera and lighting work.

**The timeline scrubber is built here, against SVG, before any Three.js.** This deviates
from `software-city-start.md`, which puts the scrubber at step 6 after the 3D work. The
reason for moving it: time is the product, so it should be provably right while the
renderer is still throwaway. It also means the 3D step inherits a working, tested time
model instead of debugging both at once.

It then ships, permanently, as the WebGL fallback. WebGL fails on plenty of real devices,
and a fallback that was built as a debug view is a fallback that is not an apology.

---

## 6. Performance is the design, because 3D was chosen

Full 3D with a free camera was chosen deliberately. The budget is therefore not a later
pass, and every item below is much harder to retrofit than to build in.

**The device that matters is a mid-range phone**, because that is what a recruiter is
holding. Target 60fps, hard floor 30fps.

- **One InstancedMesh for all buildings**, not one mesh per building. Colour, storey count
  and construction progress are per-instance attributes. A forty-skill career is one draw
  call, and so is a four-hundred-skill one.
- **Roads merge into a single geometry**, rebuilt only when the road *set* changes — which
  is never, since layout is time-invariant. Roads under construction are drawn by
  advancing a length attribute, not by rebuilding.
- **The GPU is written to only when something changed.** Scrubbing between two instants
  where nothing crosses a lifecycle boundary must upload nothing.
- **`WorldState` is struct-of-arrays** — parallel `Float32Array`s indexed by a stable
  entity index, not an array of objects. Sixty times a second, allocation is the enemy;
  this also copies into instance attributes without a transform. A small accessor gives
  tests and the SVG renderer an object view.
- **LOD and frustum culling** on landmarks and detail props. Buildings are boxes and do not
  need it; scenery does.
- **Camera constraints, not freedom.** Orbit with damping, polar angle clamped above the
  ground plane, distance clamped to the layout bounds. A free camera that can end up inside
  a building or two miles above the map is not a feature.
- **`prefers-reduced-motion` lands on the finished city** with construction animation off.
- **The SVG renderer is the WebGL fallback**, feature-detected, not error-caught.

---

## 7. What honesty requires of the renderer

Product promises, not preferences. Each is testable.

1. **Nothing appears before its `built` date.** The entire premise of the timeline.
2. **Speculative entities are unmistakably not built** — beyond the city edge, drawn as
   blueprints, never converting to built at any date. A renderer that ignores the
   `speculative` flag is misrepresenting a person.
3. **Upgrades happen in place.** A building gains storeys. It is never demolished and
   rebuilt, because that is not what learning something more deeply feels like.
4. **Retired is not deleted.** Weather it, unlight it, leave it standing. It happened.

---

## 8. Stack

| | | Why |
|---|---|---|
| Language | TypeScript, strict | The contract is generated into it; strict is what makes that worth doing. |
| Build | Vite library mode | Produces an npm package rather than a site. |
| 3D | Three.js + React Three Fiber + drei | R3F because the package's public surface is a React component either way; drei for camera controls and instancing helpers that are otherwise a week. |
| Tests | Vitest | The engine is the product and is tested hard. |
| Lint | ESLint 9 flat config | Carries the layering rule from §3. |
| Demo | Vite React SPA | Deliberately **not** Next.js — a demo in Next proves nothing about whether the package works outside Next. A non-deployed Next smoke app covers the Chronicle embed. |
| Peers | React 19 | Matches Chronicle's client (React 19.2.4 / Next 16.2.12), so the embed needs no bridging. |

React and react-dom are **peer dependencies**, never bundled. Two copies of React in one
page is a class of bug nobody should have to debug in someone else's application.

---

## 9. What "done" means for v1

- Loads any valid career graph, including the empty one, without throwing
- Refuses an unrecognised `version` with a message a human can act on
- Scrubs 2019 → 2035 at 60fps on a mid-range phone
- Dragging plays the construction rather than teleporting
- Speculative entities are unmistakably not built
- A flat 2D renderer when WebGL is unavailable
- One demo, on a real career — mine
- Installed and rendering inside Chronicle at `/city`, fed by `/api/career-graph`

Weather, traffic, night lighting, the metro and the underground layer are v2. None of them
makes a wrong timeline right.
