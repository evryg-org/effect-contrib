---
"@evryg/effect-vitest-neo4j": minor
---

Require vitest 5. The `vitest` peer range is now `^5.1.0`, so consumers must upgrade from vitest 3.

The Neo4j global setup's `setup` takes vitest's `TestProject`, replacing `GlobalSetupContext`, which vitest 5 no longer exports from `vitest/node`. It still provides `neo4j` (`{ uri, password }`) to the tests.
