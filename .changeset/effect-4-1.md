---
"@evryg/effect-bdd": minor
"@evryg/effect-cypher-codegen": minor
"@evryg/effect-integresql": minor
"@evryg/effect-neo4j": minor
"@evryg/effect-neo4j-schema": minor
"@evryg/effect-op-graph": minor
"@evryg/effect-testcontainers": minor
"@evryg/effect-testcontainers-neo4j": minor
"@evryg/effect-vitest-neo4j": minor
---

Move to Effect 4.1

All packages now target Effect 4.1 (`4.1.4`). The `effect`, `@effect/platform-node` and `@effect/vitest` peer ranges are `^4.1.4`, so consumers must upgrade from the 4.0 betas. `@effect/vitest` 4.1 requires vitest 5.

In `@evryg/effect-op-graph`, a `DeclaredFields` value is a `Schema.Constraint` instead of a `Schema.Top`, matching the fields of an Effect 4.1 `Schema.Struct`, so any struct's fields can be declared as they are. Code that reads a declared field and calls `Schema.Top` methods on it must narrow it first. The `@evryg/effect-op-graph/contract/laws` suite draws its samples with `effect/Arbitrary`, which replaces the fast-check that Effect 4.0 bundled.
