# @evryg/effect-testcontainers

## 0.0.3

### Patch Changes

- [#17](https://github.com/evryg-org/effect-contrib/pull/17) [`beeab1d`](https://github.com/evryg-org/effect-contrib/commit/beeab1d3c13779333208725fd4bdec35f8eb4fda) Thanks @jbmusso! - Replace global Error with tagged errors and export them as top-level API
  - cypher-codegen: Add `CypherCodegenError` and `DuplicateCypherFilenamesError` tagged errors, combine multiple `Effect.provide` calls into single array provide
  - testcontainers: Add `ComposeContainerError` and `TestContainerError` tagged errors

## 0.0.2

### Patch Changes

- [#14](https://github.com/evryg-org/effect-contrib/pull/14) [`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2) Thanks @jbmusso! - Fix package dependency declarations
  - Use workspace:^ instead of workspace:\* for internal cross-package references
  - Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
  - Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
  - Inline ComposeExecutableOptions type to remove internal testcontainers import path
