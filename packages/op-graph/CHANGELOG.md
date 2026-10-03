# @evryg/effect-op-graph

## 0.0.1

### Patch Changes

- [#247](https://github.com/evryg-org/effect-contrib/pull/247) [`7c58867`](https://github.com/evryg-org/effect-contrib/commit/7c588674a03db33247a91d9cb8e11090fcd94843) Thanks @jbmusso! - Add `@evryg/effect-op-graph`, graph mutations as data for Effect.

  A `GraphOp` is a vertex or edge upsert keyed by its MERGE identity, so an op stream is append-only and idempotent by construction. The package checks ops against vertex and edge declarations (including the own-versus-referenced write check), keys vertex identities by a per-label partition policy, stamps attribution properties, and tallies edge outcomes with `SetMap` and `EdgeTally`, whose `Reducer` instances are lawful. It defines the `GraphOpMaterializer` port with declaration-checking and refine-then-materialize combinators, and ships the contract every materializer implementation must pass: `@evryg/effect-op-graph/contract` (deterministic) and `@evryg/effect-op-graph/contract/laws` (property-based). Both contract entry points need `@effect/vitest`, an optional peer dependency.
