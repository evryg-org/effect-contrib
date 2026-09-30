# @evryg/effect-testcontainers-neo4j

## 0.4.0

### Patch Changes

- Updated dependencies [[`eb4bf42`](https://github.com/evryg-org/effect-contrib/commit/eb4bf4204a9886777e9c255c124f14a9458d9955)]:
  - @evryg/effect-neo4j@0.3.0

## 0.3.0

### Minor Changes

- [#234](https://github.com/evryg-org/effect-contrib/pull/234) [`5af96b2`](https://github.com/evryg-org/effect-contrib/commit/5af96b2415d2e0c999b8b42b537680a7735532c7) Thanks @jbmusso! - Wait for Neo4j's ports instead of its startup log line.

  `makeNeo4jTestContainer` inherited the default readiness check, which follows the container log for `Started.`. Some container runtimes' log drivers (for example podman with journald) can close the log-follow stream early, so startup failed with `Log stream ended and message "Started." was not received` even though Neo4j came up. Readiness now waits for the exposed ports to listen and for the HTTP endpoint on 7474 to answer `200`.

  `testcontainers` is now a direct peer and dev dependency.

## 0.2.0

### Patch Changes

- Updated dependencies [[`f9d052d`](https://github.com/evryg-org/effect-contrib/commit/f9d052ddfc2d5a5960af79f6eb5fbf7aea0c083c)]:
  - @evryg/effect-neo4j@0.2.0

## 0.1.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.

### Patch Changes

- Updated dependencies [[`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524)]:
  - @evryg/effect-neo4j@0.1.0
  - @evryg/effect-testcontainers@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`beeab1d`](https://github.com/evryg-org/effect-contrib/commit/beeab1d3c13779333208725fd4bdec35f8eb4fda)]:
  - @evryg/effect-testcontainers@0.0.3

## 0.0.2

### Patch Changes

- [#14](https://github.com/evryg-org/effect-contrib/pull/14) [`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2) Thanks @jbmusso! - Fix package dependency declarations
  - Use workspace:^ instead of workspace:\* for internal cross-package references
  - Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
  - Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
  - Inline ComposeExecutableOptions type to remove internal testcontainers import path

- Updated dependencies [[`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2)]:
  - @evryg/effect-testcontainers@0.0.2
