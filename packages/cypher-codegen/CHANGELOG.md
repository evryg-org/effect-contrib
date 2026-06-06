# @evryg/effect-cypher-codegen

## 0.4.2

### Patch Changes

- [#86](https://github.com/evryg-org/effect-contrib/pull/86) [`5c1c286`](https://github.com/evryg-org/effect-contrib/commit/5c1c2864d01f6f4c975c4cd1b2cd917bd207adae) Thanks @jbmusso! - coalesce now accounts for fallback argument types when the leading argument is nullable. Previously the result type was the leading argument's type stripped of nullable, ignoring the fallbacks. When a nullable Double property is coalesced with an integer literal (`coalesce(n.score, 0)`), the runtime yields that integer literal as a database Integer when the property is null — which the Double decoder rejects. The result now widens to Long (the integer-tolerant numeric superset, which also passes floats through), so the emitted column decodes correctly. Same-type and non-nullable leading arguments are unaffected.

## 0.4.1

### Patch Changes

- [#83](https://github.com/evryg-org/effect-contrib/pull/83) [`6b43ff8`](https://github.com/evryg-org/effect-contrib/commit/6b43ff8d2be40b029971aeda5e4eaae93bdaf678) Thanks @jbmusso! - Make generated query code type-check under Effect v4.
  - Row decoding no longer emits an untyped `Neo4jRecordToObject` schema transform.
    `record.toObject()` is called in the Effect pipeline and each row is validated
    directly with `Schema.Array(Row)`, so the row struct fully type-checks the
    decoded shape.
  - The generated `TemporalString` transform now carries explicit
    `SchemaTransformation.transform<string, unknown>` type parameters, matching its
    `Schema.Unknown` source so it satisfies `decodeTo`'s getter signature.
  - Single-file modules now annotate query parameters with their types instead of
    relying on an implicit `any`, the same way the barrel output already did.

## 0.4.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.

### Patch Changes

- Updated dependencies [[`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524)]:
  - @evryg/effect-neo4j@0.1.0
  - @evryg/effect-neo4j-schema@0.1.0

## 0.3.0

### Minor Changes

- [#78](https://github.com/evryg-org/effect-contrib/pull/78) [`27d7647`](https://github.com/evryg-org/effect-contrib/commit/27d7647c4569d0091a062daef2fed431e97860f4) Thanks @jbmusso! - Infer parameter nullability for `SET` clauses

  `QueryAnalyzer` now types parameters bound via a `SET` clause (`MATCH (n:Label {...}) SET n.prop = $param`), in addition to node-pattern property maps and `IN` list expressions. A param assigned to an optional vertex property is typed `T | null` (so callers can pass `null` to clear it), while one assigned to a mandatory property stays non-nullable. Map-merge assignments (`SET n += $map`) are unaffected, and params whose left-hand side cannot be resolved to a schema property keep the previous non-nullable `String` fallback.

## 0.2.0

### Minor Changes

- [#76](https://github.com/evryg-org/effect-contrib/pull/76) [`6f0c9ae`](https://github.com/evryg-org/effect-contrib/commit/6f0c9aea9dc46402bc06f611f7989ac6f84e2001) Thanks @jbmusso! - Support type inference for `CREATE`/`MERGE` mutations and nullable parameters
  - Bind `CREATE`/`MERGE` pattern variables into the type environment, so a `RETURN` referencing a created or merged node (e.g. `CREATE (n:Node {...}) RETURN n.id AS id`) resolves its column types from the schema instead of throwing `Unbound variable`. Created/merged nodes are non-nullable.
  - Emit `T | null` for parameters bound to optional vertex properties, matching the `NullOr` treatment those properties already get on the `RETURN` side (so callers can pass `null` to clear a property). `IN`-clause params stay non-nullable.
  - Infer bare parameter atoms in projections (`RETURN $id AS id`) as a `String` scalar instead of throwing `Unhandled atom expression`.

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
