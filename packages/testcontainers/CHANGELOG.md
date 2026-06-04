# @evryg/effect-testcontainers

## 0.1.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.

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
