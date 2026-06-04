---
"@evryg/effect-cypher-codegen": minor
"@evryg/effect-integresql": minor
"@evryg/effect-neo4j": minor
"@evryg/effect-neo4j-schema": minor
"@evryg/effect-testcontainers": minor
"@evryg/effect-testcontainers-neo4j": minor
"@evryg/effect-vitest-neo4j": minor
---

Migrate to Effect v4

All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.
