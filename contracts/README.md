# contracts/

`career-graph.v1.schema.json` is the input format for this renderer, and the only file
this repository shares with any producer.

## Where it came from, and why copying it is allowed

It originates in **Chronicle.Portfolio.App**, which released the `contracts/` directory
under **CC0 1.0** — see [LICENSE](LICENSE) — precisely so that a renderer such as this one
could copy it, generate types from it, embed it, and ship commercially without asking.

The copy here is **byte-identical to the producer's**. It is a copy rather than a
reference because a contract that has to be fetched at build time is a dependency, and the
whole point of the arrangement is that this repository does not depend on that one.

## Rules

1. **Never edit `v1` in place.** A shipped consumer is entitled to assume v1 means what it
   meant when they built against it. A change is `v2` — a new file — and both are served.
2. **Types are generated from it, never hand-written.** `npm run gen:contract` writes
   `src/contract/types.ts`. CI regenerates and fails on any diff, because a hand-written
   mirror drifts and the drift is silent.
3. **Chronicle has no special status.** It is one producer of this shape. Anything that
   can emit the format drives the same renderer, and the engine must never read meaning
   out of a producer's id conventions.

## The consumer is deliberately more liberal than the schema

`additionalProperties: false` binds the **producer** — it is what the producer's own
contract test asserts about its output. This renderer ignores unknown fields instead of
rejecting them, because a consumer that enforces that constraint too is the reason nobody
could ever add an optional field.

The full list of deliberate divergences, each with its reason, is in
[`tests/contract-schema.test.ts`](../tests/contract-schema.test.ts), which compiles this
schema with a real JSON Schema validator and holds the two against each other. A
disagreement that is not on that list is a bug.
