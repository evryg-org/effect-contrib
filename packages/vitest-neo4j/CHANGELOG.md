# @evryg/effect-vitest-neo4j

## 0.6.0

### Minor Changes

- [#294](https://github.com/evryg-org/effect-contrib/pull/294) [`25aa9e4`](https://github.com/evryg-org/effect-contrib/commit/25aa9e4361b963ef15c09f01c618802720bafbb8) Thanks @NathanEvryg! - Move to Effect 4.1

  All packages now target Effect 4.1 (`4.1.4`). The `effect`, `@effect/platform-node` and `@effect/vitest` peer ranges are `^4.1.4`, so consumers must upgrade from the 4.0 betas. `@effect/vitest` 4.1 requires vitest 5.

  In `@evryg/effect-op-graph`, a `DeclaredFields` value is a `Schema.Constraint` instead of a `Schema.Top`, matching the fields of an Effect 4.1 `Schema.Struct`, so any struct's fields can be declared as they are. Code that reads a declared field and calls `Schema.Top` methods on it must narrow it first. The `@evryg/effect-op-graph/contract/laws` suite draws its samples with `effect/Arbitrary`, which replaces the fast-check that Effect 4.0 bundled.

- [#292](https://github.com/evryg-org/effect-contrib/pull/292) [`2bc9842`](https://github.com/evryg-org/effect-contrib/commit/2bc9842b809127d9d0940bce37acb2e91da9b118) Thanks @NathanEvryg! - Require vitest 5. The `vitest` peer range is now `^5.1.0`, so consumers must upgrade from vitest 3.

  The Neo4j global setup's `setup` takes vitest's `TestProject`, replacing `GlobalSetupContext`, which vitest 5 no longer exports from `vitest/node`. It still provides `neo4j` (`{ uri, password }`) to the tests.

### Patch Changes

- Updated dependencies [[`25aa9e4`](https://github.com/evryg-org/effect-contrib/commit/25aa9e4361b963ef15c09f01c618802720bafbb8)]:
  - @evryg/effect-neo4j@0.4.0
  - @evryg/effect-testcontainers-neo4j@0.5.0

## 0.5.0

### Minor Changes

- [#242](https://github.com/evryg-org/effect-contrib/pull/242) [`addf695`](https://github.com/evryg-org/effect-contrib/commit/addf6950a006192f9f6df04b969f55b9985ed30c) Thanks @jbmusso! - Add `CleanNeo4jSchema`, a scoped test resource that leaves a Neo4j database with no constraints and no indexes.

  It drops every constraint and every non-LOOKUP index on acquire and again on release, so schema objects created by a test do not leak into the next one. `CleanNeo4jGraph` only deletes nodes and relationships and leaves the schema in place.

## 0.4.0

### Patch Changes

- Updated dependencies [[`eb4bf42`](https://github.com/evryg-org/effect-contrib/commit/eb4bf4204a9886777e9c255c124f14a9458d9955)]:
  - @evryg/effect-neo4j@0.3.0
  - @evryg/effect-testcontainers-neo4j@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`5af96b2`](https://github.com/evryg-org/effect-contrib/commit/5af96b2415d2e0c999b8b42b537680a7735532c7)]:
  - @evryg/effect-testcontainers-neo4j@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`f9d052d`](https://github.com/evryg-org/effect-contrib/commit/f9d052ddfc2d5a5960af79f6eb5fbf7aea0c083c)]:
  - @evryg/effect-neo4j@0.2.0
  - @evryg/effect-testcontainers-neo4j@0.2.0

## 0.1.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.

### Patch Changes

- Updated dependencies [[`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524)]:
  - @evryg/effect-neo4j@0.1.0
  - @evryg/effect-testcontainers-neo4j@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @evryg/effect-testcontainers-neo4j@0.0.3

## 0.0.2

### Patch Changes

- [#14](https://github.com/evryg-org/effect-contrib/pull/14) [`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2) Thanks @jbmusso! - Fix package dependency declarations
  - Use workspace:^ instead of workspace:\* for internal cross-package references
  - Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
  - Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
  - Inline ComposeExecutableOptions type to remove internal testcontainers import path

- Updated dependencies [[`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2)]:
  - @evryg/effect-testcontainers-neo4j@0.0.2
