---
"@evryg/effect-neo4j-schema": minor
---

Add `neo4jPartition`, `neo4jProperties`, and `neo4jVertexStruct` to derive a vertex's composite key from its partition instead of hand-typing it

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
