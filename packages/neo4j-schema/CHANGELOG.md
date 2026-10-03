# @evryg/effect-neo4j-schema

## 0.7.0

### Minor Changes

- [#245](https://github.com/evryg-org/effect-contrib/pull/245) [`78949d3`](https://github.com/evryg-org/effect-contrib/commit/78949d36b6e55772cd47650a2ce70750a364a930) Thanks @jbmusso! - Key a vertex by a reusable group of its own key fields, and export the option types of `neo4jVertexStruct`.

  `neo4jKeyGroup(fields)` declares an ordered group of a vertex's own key fields once, so every schema that keys the vertex by them shares one declaration. Like `neo4jPartition`, it rejects optional and nullable members at the type level, and the key order is the fields' declaration order. `neo4jVertexStruct` takes it as a new optional `key` option. The group's fields are merged right after the partition's, and the composite key is `[...partition fields, ...key group fields, ...ownKey]`. A `key` group alone also keys the vertex, and `mode` still defaults to `"unique"`. `KeyGroup` is branded, so only `neo4jKeyGroup` builds one and its members are always checked. That check travels with the value: a constructor generic over a vertex's fields can key the vertex by a group it receives, where it could not prove an `ownKey` over its type parameters.

  `VertexStructOptions<OwnFields, PartitionFields, PropertiesFields, KeyFields>` is now the exported name of the options. It replaces re-deriving them as `Parameters<typeof neo4jVertexStruct<...>>[1]`. `KeyEligibleFieldName<Fields>` is the exported element type of `ownKey`: the required, non-nullable field names of `Fields`. The new `KeyFields` type parameter defaults to `{}`, so calls with one to three explicit type arguments are unchanged.

  `partition`, `key` and `properties` must now declare disjoint fields, and an own field may shadow none of them. Before, a `properties` field could silently replace a partition field of the same name in the merged struct, while the key still named it. That collision is now rejected at the type level, like an own field shadowing a group. The check is carried by the type of `fields`, so a constructor that forwards `fields` unchanged forwards it too. Every other type-level guarantee in `Neo4jSchemaVertex.test-d.ts` still holds, and vertices built without `key` emit the same DDL as before.

## 0.6.0

### Patch Changes

- Updated dependencies [[`eb4bf42`](https://github.com/evryg-org/effect-contrib/commit/eb4bf4204a9886777e9c255c124f14a9458d9955)]:
  - @evryg/effect-neo4j@0.3.0

## 0.5.0

### Minor Changes

- [#206](https://github.com/evryg-org/effect-contrib/pull/206) [`e565c55`](https://github.com/evryg-org/effect-contrib/commit/e565c55de4af2650a9bba40b6b2ce69f5b890728) Thanks @jbmusso! - Add `neo4jPartition`, `neo4jProperties`, and `neo4jVertexStruct` to derive a vertex's composite key from its partition instead of hand-typing it

  `neo4jVertex(label, { compositeKey, compositeIndexes })` takes bare `string[]`, with no `keyof` constraint and no validation against the struct's real fields, so `Neo4jSchemaDDL.ts` casts them and interpolates directly into `CREATE CONSTRAINT ... REQUIRE (n.x, n.y) IS UNIQUE` / `CREATE INDEX ... ON (n.x)`. A typo compiles to syntactically valid, semantically wrong DDL — a silent graph-identity defect.

  `neo4jPartition(fields)` declares an ordered, reusable group of properties that partitions the vertex set and prefixes a vertex's composite key — no `order` option, since the key order IS `fields`' declaration order, so there is no second statement of order that could disagree with the first. `neo4jProperties(fields)` declares a reusable, unordered group that never contributes to a key. `neo4jVertexStruct(label, opts)` builds the `Schema.Struct` from an optional singular `partition`, an optional `properties` group, and the vertex's own `fields`, then delegates to `neo4jVertex` for the annotation itself, so the compiled DDL is identical to hand-writing the equivalent `neo4jVertex` call by construction.

  Once a key exists (a `partition` and/or a non-empty `ownKey`), it defaults to `mode: "unique"` when `mode` is omitted; `mode: "index"` is the explicit opt-out into a plain composite index. Unique is the default on purpose: 34 of the 36 real vertices this module was built for use a unique composite key, only 2 use a plain index, so a migrator who forgets `mode` lands on the stronger guarantee rather than silently weakening a graph-identity constraint into a non-unique index.

  Illegal states are closed at the type level, each with a `@ts-expect-error` proof in `Neo4jSchemaVertex.test-d.ts`, not a runtime check:
  - A key naming a property that doesn't exist, or a `properties`-only field: `ownKey` is typed against `keyof` the vertex's own `fields` alone, so a `properties` field isn't even nameable there.
  - A partition's fields hand-typed again at the call site: there is no such option — the key is read off the `Partition` value itself.
  - Two partitions on one vertex: `partition` is singular.
  - A vertex's own field shadowing a partition/properties field: the colliding field's required type becomes an unsatisfiable branded error type.
  - A unique key with nothing to be unique on: `opts` is a union of concrete shapes, so a default or explicit `mode: "unique"` without a partition and without a non-empty `ownKey` cannot be constructed — not even by omitting the key entirely, since the no-key shape only accepts an absent `mode`.
  - An index naming a property that doesn't exist: `compositeIndexes` entries are typed against the merged fields' keys.
  - A `Properties` group passed where a partition belongs: `Partition` and `Properties` are distinct types.
  - A key naming an optional or nullable field: partition fields and `ownKey` members are constrained to required, non-nullable fields. Neo4j's composite `IS UNIQUE` constraint binds only nodes that possess all constrained properties, and a Cypher `MERGE` on a key with a null member is a runtime error, so an optional key member would silently exempt vertices from the identity constraint — and break the partition's covering property — instead of participating in it. Optional and nullable fields remain fine everywhere outside the key (`properties`, non-key `fields`, `compositeIndexes`, `fullTextIndexes`).

  `Neo4jSchemaAnnotations.ts` and `Neo4jSchemaDDL.ts` are unchanged — every existing `neo4jVertex(label, { compositeKey: [...] })` caller keeps compiling and emitting identical DDL.

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
