# Software City — Product Concept

> **The pivot:** this isn't a personal portfolio website — it's a product. The prototype, and the first thing ever built on it, is my own career.

The idea: a career-visualization engine — a living, explorable city that rebuilds itself as you drag a timeline through someone's career, the way a stock chart's timeline changes a price except here it changes an entire skyline. The engine itself doesn't know whose career it's rendering — it just reads timestamped data and decides what should exist, what's under construction, and what's been upgraded at any point on the timeline. That means the first career it ever renders can be mine. My portfolio isn't a separate thing I build alongside this — it *is* the proof of concept.

## 1. The Experience

Drag the slider — say, from 2022 to 2035 — and the city grows in real time. No loading screens, no page refresh, everything animates. Instead of a "skills" list, the city itself *is* the skill set, exactly as it stood at whatever point the slider lands on.

A compressed example of what that looks like across one career:

| Year | Stage | What's visible |
|---|---|---|
| 2022 | Student | A small village — one road, one house |
| 2023 | Village | A small database building goes up near a university |
| 2024 | Town | A .NET factory, a SQL tower, a React office appear |
| 2026 | Small city | Office blocks, an Azure district, a banking HQ, roads linking them |
| 2030 | Metropolitan city | Metro system, airport, AI research park, cloud district, cybersecurity HQ, multiple companies |
| 2040 | Mega city | International airport, skyscrapers, a technology park, a conference center, speaking events |

## 2. Everything Has a Birth Date

Nothing is hardcoded to "be visible." Every building, road, or district carries its own lifecycle metadata:

```json
{
  "id": "azure",
  "built": "2026-04",
  "upgraded": ["2027", "2029", "2032"]
}
```

The timeline doesn't jump between pre-built scenes — it moves a date, and the engine decides what exists at that date. Land on 2025 and Azure doesn't exist yet. Land on 2026 and construction begins. Land on 2029 and the district has expanded. Buildings are never replaced when a skill deepens — they're upgraded in place, the same way a React building might go from a bare foundation to a full tower as the years pass.

## 3. What the City Encodes

Every visual layer maps to something real:

- **Skyline height = seniority.** A single low building for an associate, a dense cluster of towers for an architect — the skyline tells the story before anyone clicks anything.
- **Roads = projects**, and road quality itself reflects experience — a rough path early on becomes a proper highway later. A road physically connects the districts a project touched (React → NestJS → PostgreSQL → Azure), so it's visually obvious how the pieces worked together, instead of just listing them.
- **Traffic = activity**, and it gets denser and more varied as the career grows:

| Vehicle | Represents |
|---|---|
| Walking people | Daily commits and coding sessions |
| Bicycles | Small personal projects |
| Cars | Medium-sized applications |
| Buses | Team projects |
| Trains | Enterprise systems with many modules |
| Cargo trains | Banking and large-scale data processing |
| Ships | Major product releases |
| Airplanes | Cloud deployments, international users |
| Helicopters | Hotfixes and emergency production support |
| Drones | AI agents, automation, background jobs |

- **Weather = current focus.** Sunny is normal development, rain is a heavy learning phase, lightning is a hackathon, snow is a career break, northern lights mark a major achievement.
- **Underground = foundations.** Most visitors never look below street level — a layer toggle lets them cut away the terrain and see why the city works at all:

| Layer | Represents |
|---|---|
| Sewers | Legacy systems maintained or modernized |
| Water pipes | Core programming fundamentals and CS knowledge |
| Power grid | Languages and frameworks (.NET, C#, TypeScript, JavaScript) |
| Fiber / internet | APIs, REST, GraphQL, gRPC, messaging |
| Utility tunnels | CI/CD, DevOps automation, GitHub Actions, Azure DevOps |
| Metro | Shared architecture, reusable libraries, internal frameworks |
| Bedrock | Education, certifications, problem-solving fundamentals |

## 4. Time Animates, It Never Teleports

Dragging from 2024 to 2030 doesn't jump straight there — it plays the construction. Cranes appear, scaffolding surrounds new buildings, roads extend, bridges assemble, trains start running, airport terminals open, districts light up at night as they come online. The city feels alive because it remembers how it was built, not just what it currently looks like.

## 5. The Engine: Entity-Component-System

Rather than wiring this logic directly into UI components, every object in the city — building, road, tree, vehicle, cloud, sewer pipe — is an entity with its own metadata and event history:

```json
{
  "id": "backend-factory",
  "type": "building",
  "category": "backend",
  "created": "2024-08",
  "upgrades": ["2025-06", "2026-11"],
  "events": [
    "Started Associate Software Engineer",
    "Built Banking Platform",
    "Migrated to PostgreSQL"
  ]
}
```

The timeline just changes the simulation date; the engine decides what should exist, what's mid-construction, and what's been upgraded. Adding a new project or certification years from now means adding data, not touching rendering logic — that's what makes it an engine rather than a hand-built scene.

## 6. Future Blueprint Mode

Past the present-day point on the timeline, the city can switch into a clearly separate mode: not a record of what happened, but a map of what's planned. Districts like an AI Innovation Campus, a Cybersecurity Operations Center, or a Global Cloud Region appear as blueprints, holograms, or construction sites — visually unmistakable from the built city around them.

This matters because it lets the city be ambitious without being dishonest. Nothing in Future Blueprint mode claims to be finished — it reads as a stated direction, closer to a roadmap than a résumé.

## 7. Why This Is a Product, Not a Website

Everything above — the timeline engine, the lifecycle data model, the ECS architecture, the city-rendering rules — never references *my* career specifically. It reads timestamped JSON and renders a city. That JSON happens to be populated with my own history first, because I'm the only dataset available on day one, and because it means the prototype and the portfolio are the same build — there's nothing to maintain twice.

But the engine doesn't care whose data it's given. Once it can turn one developer's career into a living city, it can do that for any developer's career — same rendering rules, same lifecycle logic, a different JSON file. The "personal portfolio" I originally set out to build stops being the end product and becomes the flagship case study: proof the engine works, built on the one dataset I can vouch for completely.

## 8. Open Questions

Things worth deciding deliberately rather than defaulting into:

- **MVP scope** — timeline + skyline + roads is probably enough to prove the concept; weather, traffic, and underground layers can come after.
- **Rendering approach** — 2D isometric vs. a true 3D scene changes the engineering effort substantially, and is worth picking early rather than drifting into.
- **Schema genericity from day one** — even with only one dataset (mine), designing the JSON schema as if a second dataset will exist eventually avoids a rewrite later when it's time to open this up.
- **Where it sits in the wider portfolio plan** — whether Software City becomes the entire site, or one section alongside Mission Control, Architecture Bay, and the rest of the nav already sketched out.

---

## Implementation note (added during the Chronicle build)

Software City is built as a **fully separate repository**. Its only dependency on the Chronicle portfolio solution is a versioned data contract:

- `contracts/career-graph.v1.schema.json` in the Chronicle repo is the source of truth for the lifecycle model described in §2 and §5 above.
- `GET /api/career-graph` on the Chronicle server projects Skills → buildings, Projects → roads/districts, Experience → skyline height, and RoadmapItems → Future Blueprint entities, each stamped with `built` / `upgraded` dates.
- The Software City repo vendors that schema, generates its own TypeScript types from it, and never references .NET code.

This keeps the engine genuinely generic, as §7 requires, while letting the portfolio be its first dataset.
