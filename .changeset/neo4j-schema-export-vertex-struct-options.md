---
"@evryg/effect-neo4j-schema": minor
---

Export `VertexStructOptions` and `KeyEligibleFieldName` from `Neo4jSchemaVertex`.

A constructor built on `neo4jVertexStruct` that is generic over a vertex's fields had to re-derive the options type as `Parameters<typeof neo4jVertexStruct<...>>[1]`, and could not name the type of `ownKey` at all. `VertexStructOptions<OwnFields, PartitionFields, PropertiesFields>` is now the exported name of those options, with the key-shape union and the shadowing guard on `fields` unchanged. `KeyEligibleFieldName<Fields>` is the element type of `ownKey`: the required, non-nullable field names of `Fields`. A generic constructor can now take an own key typed against its own fields and forward it. Both are type-only exports, and every existing type-level guarantee in `Neo4jSchemaVertex.test-d.ts` still holds.
