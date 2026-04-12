---
"@evryg/effect-cypher-codegen": patch
"@evryg/effect-testcontainers": patch
---

Replace global Error with tagged errors and export them as top-level API

- cypher-codegen: Add `CypherCodegenError` and `DuplicateCypherFilenamesError` tagged errors, combine multiple `Effect.provide` calls into single array provide
- testcontainers: Add `ComposeContainerError` and `TestContainerError` tagged errors
