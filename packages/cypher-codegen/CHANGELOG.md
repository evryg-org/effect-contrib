# @evryg/effect-cypher-codegen

## 0.1.1

### Patch Changes

- [#17](https://github.com/evryg-org/effect-contrib/pull/17) [`beeab1d`](https://github.com/evryg-org/effect-contrib/commit/beeab1d3c13779333208725fd4bdec35f8eb4fda) Thanks @jbmusso! - Replace global Error with tagged errors and export them as top-level API
  - cypher-codegen: Add `CypherCodegenError` and `DuplicateCypherFilenamesError` tagged errors, combine multiple `Effect.provide` calls into single array provide
  - testcontainers: Add `ComposeContainerError` and `TestContainerError` tagged errors

- Updated dependencies []:
  - @evryg/effect-neo4j-schema@0.0.2

## 0.1.0

### Minor Changes

- [#18](https://github.com/evryg-org/effect-contrib/pull/18) [`b8d9c8c`](https://github.com/evryg-org/effect-contrib/commit/b8d9c8cc214725e024dd9db423eadc08fc3e96be) Thanks @jbmusso! - Promote integration modules to top-level exports following Effect ecosystem conventions.
  - `./integration/codegen` → `./Codegen`
  - `./integration/Register` → `./Register`
  - `./integration/VitePlugin` → `./VitePlugin`

## 0.0.2

### Patch Changes

- [#14](https://github.com/evryg-org/effect-contrib/pull/14) [`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2) Thanks @jbmusso! - Fix package dependency declarations
  - Use workspace:^ instead of workspace:\* for internal cross-package references
  - Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
  - Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
  - Inline ComposeExecutableOptions type to remove internal testcontainers import path

- Updated dependencies [[`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2)]:
  - @evryg/effect-neo4j-schema@0.0.2
