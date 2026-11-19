# @evryg/effect-op-graph

## 0.2.0

### Minor Changes

- [#303](https://github.com/evryg-org/effect-contrib/pull/303) [`bd95528`](https://github.com/evryg-org/effect-contrib/commit/bd955284e62c22a20336fefd62ccdf475c37baf9) Thanks @jbmusso! - GraphOp strings must be well-formed Unicode

  A label, a property name and every string property value (including the strings in a list) must hold no lone UTF-16 surrogate, so constructing or decoding a `GraphOp`, `VertexRef` or `PropertyMap` with one now fails. A UTF-8 transport such as Bolt carries every lone surrogate as U+FFFD, so `"\uD800"` and `"\uDC00"` reached the store as the same value, and two distinct identities merged silently. The new `WellFormedString` and `PropertyValue` schemas state the rule.

  The `@evryg/effect-op-graph/contract/laws` suite draws its strings from `WellFormedString`, so a materializer that stores strings as UTF-8 no longer fails P10 on a draw whose two ids differ only in their lone surrogates. Each law now runs through `it.effect.prop`: a failure reports its shrunk draw and a replay token, which carries the seed. The `samples` argument is the number of runs per law.

## 0.1.0

### Minor Changes

- [#294](https://github.com/evryg-org/effect-contrib/pull/294) [`25aa9e4`](https://github.com/evryg-org/effect-contrib/commit/25aa9e4361b963ef15c09f01c618802720bafbb8) Thanks @NathanEvryg! - Move to Effect 4.1

  All packages now target Effect 4.1 (`4.1.4`). The `effect`, `@effect/platform-node` and `@effect/vitest` peer ranges are `^4.1.4`, so consumers must upgrade from the 4.0 betas. `@effect/vitest` 4.1 requires vitest 5.

  In `@evryg/effect-op-graph`, a `DeclaredFields` value is a `Schema.Constraint` instead of a `Schema.Top`, matching the fields of an Effect 4.1 `Schema.Struct`, so any struct's fields can be declared as they are. Code that reads a declared field and calls `Schema.Top` methods on it must narrow it first. The `@evryg/effect-op-graph/contract/laws` suite draws its samples with `effect/Arbitrary`, which replaces the fast-check that Effect 4.0 bundled.

## 0.0.1

### Patch Changes

- [#247](https://github.com/evryg-org/effect-contrib/pull/247) [`7c58867`](https://github.com/evryg-org/effect-contrib/commit/7c588674a03db33247a91d9cb8e11090fcd94843) Thanks @jbmusso! - Add `@evryg/effect-op-graph`, graph mutations as data for Effect.

  A `GraphOp` is a vertex or edge upsert keyed by its MERGE identity, so an op stream is append-only and idempotent by construction. The package checks ops against vertex and edge declarations (including the own-versus-referenced write check), keys vertex identities by a per-label partition policy, stamps attribution properties, and tallies edge outcomes with `SetMap` and `EdgeTally`, whose `Reducer` instances are lawful. It defines the `GraphOpMaterializer` port with declaration-checking and refine-then-materialize combinators, and ships the contract every materializer implementation must pass: `@evryg/effect-op-graph/contract` (deterministic) and `@evryg/effect-op-graph/contract/laws` (property-based). Both contract entry points need `@effect/vitest`, an optional peer dependency.
