# @evryg/effect-neo4j-schema

## 0.4.0

### Minor Changes

- [#198](https://github.com/evryg-org/effect-contrib/pull/198) [`c4279eb`](https://github.com/evryg-org/effect-contrib/commit/c4279eb695a93b09c6120cc60a33ee2e7f28ecb4) Thanks @jbmusso! - `compileToGraphSchema` emits `fullTextIndexes`

  `GraphSchema` gains a `FullTextIndex` model (`{ name, labels, fields }`) and a `fullTextIndexes` field, templated on `edgeConnectivity`'s decoding default and constructor default so existing constructor calls and cached schema JSON keep decoding unchanged. `compileToGraphSchema` previously dropped the `fullTextIndexes` annotation entirely, leaving consumers with no way to learn which labels a fulltext index covers; it now merges same-named entries across labels the same way `compileToCypherDDL` already does in `Neo4jSchemaDDL.ts`, including the conflicting-field-list error. `LiveDbGraphSchemaResolver` gets this field for free via the constructor default (`[]`) — live-DB introspection of `SHOW FULLTEXT INDEXES` is left for a follow-up.

## 0.3.0

### Minor Changes

- [#193](https://github.com/evryg-org/effect-contrib/pull/193) [`46929ec`](https://github.com/evryg-org/effect-contrib/commit/46929ec5e566d295e5d59b4e0ebbd99855deab6e) Thanks @jbmusso! - `neo4jVertex`'s `fullTextIndex` option becomes `fullTextIndexes`, an array

  A label was previously limited to one fulltext index because `neo4jVertex(label, { fullTextIndex })` took a single `{ name, fields }` object, but Neo4j imposes no such limit: a label may be covered by any number of fulltext indexes, e.g. a narrow index for a single field alongside a broader one spanning several. `fullTextIndex` is replaced by `fullTextIndexes: Array<{ name: string; fields: Array<string> }>`, with no singular alias kept. `compileToCypherDDL` now emits one `CREATE FULLTEXT INDEX` statement per array entry, and the #189 merge-by-name and conflicting-field-list checks apply per entry exactly as before. Migrate `fullTextIndex: { name, fields }` to `fullTextIndexes: [{ name, fields }]`.

## 0.2.1

### Patch Changes

- [#189](https://github.com/evryg-org/effect-contrib/pull/189) [`4a42317`](https://github.com/evryg-org/effect-contrib/commit/4a42317429f483755f226fa996c5692364d332ff) Thanks @jbmusso! - Merge same-named `fullTextIndex` annotations, and reject conflicting field lists

  Index names are store-global in Neo4j, so two schemas declaring `fullTextIndex` with the same `name` used to compile to two conflicting `CREATE FULLTEXT INDEX` statements, the second of which Neo4j rejects (`IF NOT EXISTS` keys on the name, not the label set). Same-named annotations now compile to a single `FOR (n:Label1|Label2)` statement, labels in first-seen order; a name declared by one schema still compiles to byte-identical DDL. Because `ON EACH` has no per-label scoping (a node is indexed once it carries at least one of the labels and at least one of the properties), a per-schema field list cannot survive a label merge, so `compileToCypherDDL` now throws when same-named annotations declare different field lists rather than silently widening every participating index. Give them identical field lists, or distinct names.

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

## 0.0.2

### Patch Changes

- [#14](https://github.com/evryg-org/effect-contrib/pull/14) [`b44a11d`](https://github.com/evryg-org/effect-contrib/commit/b44a11d002ed6f5129ef9697a1567ba02d0510e2) Thanks @jbmusso! - Fix package dependency declarations
  - Use workspace:^ instead of workspace:\* for internal cross-package references
  - Add missing vitest peer dependency to @evryg/effect-vitest-neo4j
  - Remove unused neo4j-driver-core peer dependency from @evryg/effect-vitest-neo4j
  - Inline ComposeExecutableOptions type to remove internal testcontainers import path
