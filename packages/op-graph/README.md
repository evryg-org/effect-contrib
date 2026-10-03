# @evryg/effect-op-graph

Graph mutations as data for Effect. A `GraphOp` is a vertex or edge upsert keyed by a MERGE identity, so every op stream is append-only and idempotent. The package checks ops against vertex and edge declarations, keys vertices by partition, tallies edge outcomes, and defines the `GraphOpMaterializer` port that writes an op stream to a store.

## Entry points

- `@evryg/effect-op-graph`: the `GraphOp` terms, declaration checks, partition and attribution enrichers, `SetMap`, `EdgeTally`, the `GraphOpMaterializer` port and its combinators.
- `@evryg/effect-op-graph/contract`: the deterministic contract every `GraphOpMaterializer` implementation must pass, as an `@effect/vitest` suite.
- `@evryg/effect-op-graph/contract/laws`: the property-based laws of the same contract.

The two contract entry points need `@effect/vitest`, an optional peer dependency.
