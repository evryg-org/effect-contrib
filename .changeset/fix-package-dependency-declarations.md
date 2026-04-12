---
"@evryg/effect-testcontainers-neo4j": patch
"@evryg/effect-cypher-codegen": patch
"@evryg/effect-testcontainers": patch
"@evryg/effect-neo4j-schema": patch
"@evryg/effect-vitest-neo4j": patch
---

Fix package dependency declarations

- Use workspace:^ instead of workspace:* for internal cross-package references
- Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
- Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
- Inline ComposeExecutableOptions type to remove internal testcontainers import path
